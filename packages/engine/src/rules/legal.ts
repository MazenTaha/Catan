import { RESOURCES, hasAtLeast, totalCards, type Resource, type ResourceCounts } from '../lexicon-keys';
import type { Rng } from '../rng';
import {
  activeActor,
  bestBankRate,
  canAfford,
  legalCausewaySpots,
  legalCitadelSpots,
  legalOutpostSpots,
  playableOmens,
} from '../state/selectors';
import type { Action, GameState } from '../state/types';

/** Discard choice: random when an rng is given, otherwise sheds the largest piles first. */
export function chooseDiscard(hand: ResourceCounts, count: number, rng?: Rng): Partial<ResourceCounts> {
  const left = { ...hand };
  const out: Partial<ResourceCounts> = {};
  for (let i = 0; i < count; i++) {
    let r: Resource;
    if (rng) {
      const pool = RESOURCES.flatMap((x) => Array<Resource>(left[x]).fill(x));
      r = rng.pick(pool);
    } else {
      r = RESOURCES.reduce((a, b) => (left[b] > left[a] ? b : a));
    }
    left[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

function omenActions(s: GameState, p: number): Action[] {
  if (s.omenPlayedThisTurn) return [];
  const out: Action[] = [];
  const types = new Set(playableOmens(s, p).map((o) => o.type));
  if (types.has('warden')) out.push({ type: 'PlayWarden', player: p });
  if (types.has('decree') && s.players[p].supply.causeways > 0 && legalCausewaySpots(s, p).length > 0) {
    out.push({ type: 'PlayDecree', player: p });
  }
  if (types.has('harvest')) {
    const bankTotal = totalCards(s.bank);
    if (bankTotal >= 2) {
      for (const a of RESOURCES) {
        for (const b of RESOURCES) {
          if (b < a) continue;
          const need = a === b ? 2 : 1;
          if (s.bank[a] >= need && s.bank[b] >= 1) {
            out.push({ type: 'PlayHarvestPact', player: p, resources: [a, b] });
          }
        }
      }
    } else if (bankTotal === 1) {
      const r = RESOURCES.find((x) => s.bank[x] > 0)!;
      out.push({ type: 'PlayHarvestPact', player: p, resources: [r] });
    }
  }
  if (types.has('tithe')) {
    for (const r of RESOURCES) out.push({ type: 'PlayBloodTithe', player: p, resource: r });
  }
  return out;
}

/**
 * Enumerates legal actions for the seat that must act now. Domestic trade proposals are
 * not enumerated (their space is unbounded); bots construct those deliberately.
 */
export function legalActions(s: GameState, rng?: Rng): Action[] {
  const ph = s.phase;
  if (ph.kind === 'ended') return [];
  if (s.handoff !== null) return [{ type: 'AckPassDevice', player: s.handoff }];
  const p = activeActor(s);
  const me = s.players[p];
  switch (ph.kind) {
    case 'setup':
      return ph.step === 'outpost'
        ? legalOutpostSpots(s, p).map((vertex) => ({ type: 'PlaceSetupOutpost', player: p, vertex }))
        : legalCausewaySpots(s, p).map((edge) => ({ type: 'PlaceSetupCauseway', player: p, edge }));
    case 'roll':
      return [{ type: 'RollDice', player: p }, ...omenActions(s, p)];
    case 'discard':
      return [{ type: 'Discard', player: p, cards: chooseDiscard(me.hand, ph.pending[p], rng) }];
    case 'move-wraith':
      return s.board.hexes
        .filter((h) => h.id !== s.wraithHex)
        .map((h) => ({ type: 'MoveWraith', player: p, hex: h.id }));
    case 'steal':
      return ph.candidates.map((victim) => ({ type: 'StealFrom', player: p, victim }));
    case 'decree':
      return legalCausewaySpots(s, p).map((edge) => ({ type: 'BuildCauseway', player: p, edge }));
    case 'trade': {
      const out: Action[] = [{ type: 'RespondTrade', player: p, response: 'decline' }];
      if (hasAtLeast(me.hand, ph.offer.want) && hasAtLeast(s.players[ph.offer.proposer].hand, ph.offer.give)) {
        out.push({ type: 'RespondTrade', player: p, response: 'accept' });
      }
      return out;
    }
    case 'main': {
      const out: Action[] = [{ type: 'EndTurn', player: p }];
      if (canAfford(me.hand, 'causeway') && me.supply.causeways > 0) {
        for (const edge of legalCausewaySpots(s, p)) out.push({ type: 'BuildCauseway', player: p, edge });
      }
      if (canAfford(me.hand, 'outpost') && me.supply.outposts > 0) {
        for (const vertex of legalOutpostSpots(s, p)) out.push({ type: 'BuildOutpost', player: p, vertex });
      }
      if (canAfford(me.hand, 'citadel') && me.supply.citadels > 0) {
        for (const vertex of legalCitadelSpots(s, p)) out.push({ type: 'BuildCitadel', player: p, vertex });
      }
      if (canAfford(me.hand, 'omen') && s.omenDeck.length > 0) out.push({ type: 'BuyOmen', player: p });
      for (const give of RESOURCES) {
        if (me.hand[give] < bestBankRate(s, p, give)) continue;
        for (const receive of RESOURCES) {
          if (receive !== give && s.bank[receive] > 0) {
            out.push({ type: 'BankTrade', player: p, give, receive });
          }
        }
      }
      out.push(...omenActions(s, p));
      return out;
    }
  }
}
