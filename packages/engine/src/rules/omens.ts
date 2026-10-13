import { emptyCounts, isResource, totalCards, type OmenType, type Resource } from '../lexicon-keys';
import { legalCausewaySpots } from '../state/selectors';
import type { Ctx } from './context';
import { grant, payCost, requireCurrent, requirePhase, transfer } from './context';
import { check, fail } from './errors';
import { updateGreatestHost } from './scoring';

export function buyOmen(ctx: Ctx, player: number): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main');
  check(s.omenDeck.length > 0, 'DECK_EMPTY', 'No development cards left');
  payCost(ctx, player, 'omen');
  const omen = s.omenDeck.pop()!;
  s.players[player].omens.push({ type: omen, boughtTurn: s.turn });
  s.stats.omensBought[player]++;
  ctx.ev.push({ type: 'OmenBought', player, omen });
}

/** Common checks for playing an Omen; removes the card from the hand. */
function spendOmen(ctx: Ctx, player: number, type: Exclude<OmenType, 'relic'>): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'roll', 'main');
  check(!s.omenPlayedThisTurn, 'OMEN_LIMIT', 'Only one development card may be played each turn');
  const p = s.players[player];
  const idx = p.omens.findIndex((o) => o.type === type && o.boughtTurn < s.turn);
  if (idx < 0) {
    if (p.omens.some((o) => o.type === type)) {
      fail('CARD_LOCKED', 'A development card cannot be played on the turn it was bought');
    }
    fail('NO_CARD', 'You do not hold that development card');
  }
  p.omens.splice(idx, 1);
  p.playedOmens.push(type);
  s.omenPlayedThisTurn = true;
  ctx.ev.push({ type: 'OmenPlayed', player, omen: type });
}

export function playWarden(ctx: Ctx, player: number): void {
  const { s } = ctx;
  spendOmen(ctx, player, 'warden');
  s.players[player].playedWardens++;
  updateGreatestHost(ctx);
  s.phase = { kind: 'move-wraith', reason: 'warden', resume: s.hasRolled ? 'main' : 'roll' };
}

export function playDecree(ctx: Ctx, player: number): void {
  const { s } = ctx;
  const p = s.players[player];
  check(p.supply.causeways > 0, 'NO_SUPPLY', 'No roads left in your supply');
  check(legalCausewaySpots(s, player).length > 0, 'ILLEGAL_SPOT', 'There is nowhere to build a road');
  spendOmen(ctx, player, 'decree');
  s.phase = {
    kind: 'decree',
    remaining: Math.min(2, p.supply.causeways),
    resume: s.hasRolled ? 'main' : 'roll',
  };
}

export function playHarvestPact(ctx: Ctx, player: number, resources: Resource[]): void {
  const { s } = ctx;
  const bankTotal = totalCards(s.bank);
  check(bankTotal > 0, 'BANK_EMPTY', 'The bank is empty');
  const need = Math.min(2, bankTotal);
  check(
    Array.isArray(resources) && resources.length === need && resources.every(isResource),
    'INVALID',
    `Choose ${need} resource${need === 1 ? '' : 's'}`,
  );
  const take = emptyCounts();
  for (const r of resources) take[r]++;
  for (const r of resources) {
    check(s.bank[r] >= take[r], 'BANK_EMPTY', 'The bank cannot supply that');
  }
  spendOmen(ctx, player, 'harvest');
  grant(ctx, player, take);
  ctx.ev.push({ type: 'HarvestTaken', player, resources: take });
}

export function playBloodTithe(ctx: Ctx, player: number, resource: Resource): void {
  const { s } = ctx;
  check(isResource(resource), 'INVALID', 'Name a resource');
  spendOmen(ctx, player, 'tithe');
  const from = s.players.map(() => 0);
  let total = 0;
  for (const other of s.players) {
    if (other.id === player) continue;
    const n = other.hand[resource];
    if (n > 0) {
      transfer(ctx, other.id, player, { [resource]: n });
      from[other.id] = n;
      total += n;
    }
  }
  ctx.ev.push({ type: 'TitheTaken', player, resource, total, from });
}
