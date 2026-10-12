import { deepClone } from '../clone';
import { RESOURCES, hasAtLeast, isResource, toCounts, totalCards, type Resource, type ResourceCounts } from '../lexicon-keys';
import { activeActor, bestBankRate } from '../state/selectors';
import type { TradeOffer } from '../state/types';
import type { Ctx } from './context';
import { grant, requireCurrent, requirePhase, transfer } from './context';
import { check } from './errors';
import { validCounts } from './robber';

function validateTerms(give: Partial<ResourceCounts>, want: Partial<ResourceCounts>) {
  check(validCounts(give) && validCounts(want), 'INVALID', 'Invalid trade terms');
  const g = toCounts(give);
  const w = toCounts(want);
  check(totalCards(g) > 0 && totalCards(w) > 0, 'INVALID', 'A trade needs cards on both sides');
  check(
    RESOURCES.every((r) => g[r] === 0 || w[r] === 0),
    'INVALID',
    'You cannot give and ask for the same resource',
  );
  return { g, w };
}

export function proposeTrade(
  ctx: Ctx,
  player: number,
  give: Partial<ResourceCounts>,
  want: Partial<ResourceCounts>,
  to: number[] | 'all',
): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main');
  const { g, w } = validateTerms(give, want);
  check(hasAtLeast(s.players[player].hand, g), 'CANNOT_AFFORD', 'You do not hold the cards you offer');
  const n = s.players.length;
  const everyone = Array.from({ length: n - 1 }, (_, k) => (player + 1 + k) % n);
  let targets: number[];
  if (to === 'all') {
    targets = everyone;
  } else {
    check(Array.isArray(to) && to.length > 0, 'INVALID', 'Choose someone to trade with');
    check(
      to.every((t) => everyone.includes(t)) && new Set(to).size === to.length,
      'INVALID',
      'Invalid trade partner',
    );
    targets = everyone.filter((t) => to.includes(t));
  }
  const offer: TradeOffer = {
    id: s.nextTradeId++,
    proposer: player,
    targets,
    give: g,
    want: w,
    declined: [],
    counterOf: null,
  };
  s.phase = { kind: 'trade', offer };
  ctx.ev.push({ type: 'TradeProposed', offer: deepClone(offer) });
}

export function respondTrade(
  ctx: Ctx,
  player: number,
  response: 'accept' | 'decline' | 'counter',
  give?: Partial<ResourceCounts>,
  want?: Partial<ResourceCounts>,
): void {
  const { s } = ctx;
  requirePhase(ctx, 'trade');
  if (s.phase.kind !== 'trade') return;
  const offer = s.phase.offer;
  check(activeActor(s) === player, 'NOT_YOUR_TURN', 'This offer is not addressed to you');

  if (response === 'decline') {
    offer.declined.push(player);
    ctx.ev.push({ type: 'TradeDeclined', player, offerId: offer.id });
    if (offer.targets.every((t) => offer.declined.includes(t))) {
      s.phase = { kind: 'main' };
      ctx.ev.push({ type: 'TradeClosed', reason: 'all-declined' });
    }
    return;
  }

  if (response === 'accept') {
    check(hasAtLeast(s.players[player].hand, offer.want), 'CANNOT_AFFORD', 'You lack the requested cards');
    check(
      hasAtLeast(s.players[offer.proposer].hand, offer.give),
      'CANNOT_AFFORD',
      'The offering player no longer holds those cards',
    );
    transfer(ctx, offer.proposer, player, offer.give);
    transfer(ctx, player, offer.proposer, offer.want);
    s.stats.trades[offer.proposer]++;
    s.stats.trades[player]++;
    s.phase = { kind: 'main' };
    ctx.ev.push({
      type: 'TradeCompleted',
      proposer: offer.proposer,
      accepter: player,
      gave: { ...offer.give },
      got: { ...offer.want },
    });
    return;
  }

  // Counter-offer: goes back to the other party of this offer.
  const { g, w } = validateTerms(give ?? {}, want ?? {});
  check(hasAtLeast(s.players[player].hand, g), 'CANNOT_AFFORD', 'You do not hold the cards you offer');
  const counter: TradeOffer = {
    id: s.nextTradeId++,
    proposer: player,
    targets: [offer.proposer],
    give: g,
    want: w,
    declined: [],
    counterOf: offer.id,
  };
  s.phase = { kind: 'trade', offer: counter };
  ctx.ev.push({ type: 'TradeCountered', player, offer: deepClone(counter) });
}

export function cancelTrade(ctx: Ctx, player: number): void {
  requireCurrent(ctx, player);
  requirePhase(ctx, 'trade');
  ctx.s.phase = { kind: 'main' };
  ctx.ev.push({ type: 'TradeClosed', reason: 'cancelled' });
}

export function bankTrade(ctx: Ctx, player: number, give: Resource, receive: Resource, count = 1): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main');
  check(isResource(give) && isResource(receive), 'INVALID', 'Unknown resource');
  check(give !== receive, 'INVALID', 'Pick a different resource to receive');
  check(Number.isInteger(count) && count >= 1, 'INVALID', 'Invalid amount');
  const rate = bestBankRate(s, player, give);
  const giveCount = rate * count;
  check(s.players[player].hand[give] >= giveCount, 'CANNOT_AFFORD', `You need ${giveCount} to trade at ${rate}:1`);
  check(s.bank[receive] >= count, 'BANK_EMPTY', 'The bank has run dry of that resource');
  const p = s.players[player];
  p.hand = { ...p.hand, [give]: p.hand[give] - giveCount };
  s.bank = { ...s.bank, [give]: s.bank[give] + giveCount };
  grant(ctx, player, { [receive]: count }, false);
  s.stats.bankTrades[player]++;
  ctx.ev.push({ type: 'BankTraded', player, give, giveCount, receive, receiveCount: count, rate });
}
