import type { EdgeId, VertexId } from '../board/coords';
import { getTopology } from '../board/topology';
import { COSTS, HAND_LIMIT, RESOURCES, hasAtLeast, pips, totalCards, type Resource, type ResourceCounts } from '../lexicon-keys';
import type { Rng } from '../rng';
import {
  activeActor,
  bankRates,
  canAfford,
  expectedYield,
  handTotal,
  legalCausewaySpots,
  legalCitadelSpots,
  legalOutpostSpots,
  missingResources,
  playableOmens,
  relicCount,
  victoryPoints,
} from '../state/selectors';
import type { Action, GameState } from '../state/types';
import {
  bankTradeToward,
  chooseGoal,
  edgeValue,
  leader,
  longestGain,
  resourceWeights,
  scarcity,
  valueOf,
  vertexValue,
  wraithValue,
} from './evaluate';

export interface Persona {
  /** Archdemon: lookahead for founding spots. */
  pickSetup?: (s: GameState, player: number) => VertexId;
  /** Archdemon: cut opponents' long trails and track likely hands. */
  cunning: boolean;
  /** Accept trades whose value ≥ cost × margin. */
  acceptMargin: number;
  offersPerTurn: number;
}

function argmax<T>(items: T[], score: (x: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const it of items) {
    const sc = score(it);
    if (sc > bestScore) {
      bestScore = sc;
      best = it;
    }
  }
  return best;
}

/** Estimated count of `r` across opponents' hands, from public information only. */
export function estimateHeld(s: GameState, player: number, r: Resource): number {
  let est = 0;
  for (const o of s.players) {
    if (o.id === player) continue;
    const y = expectedYield(s, o.id);
    const tot = RESOURCES.reduce((n, x) => n + y[x], 0);
    const share = tot > 0 ? y[r] / tot : 0.2;
    est += handTotal(o) * share;
  }
  return est;
}

function smartDiscard(s: GameState, p: number, count: number): Partial<ResourceCounts> {
  const goal = chooseGoal(s, p);
  const w = resourceWeights(s, p, goal);
  const hand = { ...s.players[p].hand };
  const out: Partial<ResourceCounts> = {};
  const cost = COSTS[goal];
  for (let i = 0; i < count; i++) {
    const r = argmax(
      RESOURCES.filter((x) => hand[x] > 0),
      (x) => (hand[x] - (cost[x] ?? 0)) * 2 - w[x],
    )!;
    hand[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

function bestSetupCauseway(s: GameState, p: number): EdgeId {
  const sc = scarcity(s);
  return argmax(legalCausewaySpots(s, p), (e) => edgeValue(s, e, p, sc))!;
}

function wraithHurtsMe(s: GameState, p: number): boolean {
  const topo = getTopology();
  const hex = s.board.hexes[s.wraithHex];
  if (!hex.token) return false;
  return topo.hexVertices[s.wraithHex].some((v) => s.buildings[v]?.owner === p);
}

function hostClaimable(s: GameState, p: number): boolean {
  const mine = s.players[p].playedWardens + 1;
  const others = Math.max(...s.players.filter((o) => o.id !== p).map((o) => o.playedWardens));
  return mine >= 3 && mine > others && s.greatestHost.holder !== p;
}

function omenPlay(s: GameState, p: number, persona: Persona, preRoll: boolean): Action | null {
  if (s.omenPlayedThisTurn) return null;
  const types = new Set(playableOmens(s, p).map((o) => o.type));
  if (!types.size) return null;
  if (types.has('warden') && (wraithHurtsMe(s, p) || hostClaimable(s, p))) return { type: 'PlayWarden', player: p };
  if (preRoll) return null;
  const me = s.players[p];
  const goal = chooseGoal(s, p);
  const missing = missingResources(me.hand, goal);
  const missCount = totalCards(missing);
  if (types.has('harvest') && missCount > 0 && missCount <= 2 && totalCards(s.bank) >= 2) {
    const picks: Resource[] = [];
    for (const r of RESOURCES) for (let i = 0; i < (missing[r] ?? 0); i++) picks.push(r);
    const w = resourceWeights(s, p, goal);
    while (picks.length < 2) picks.push(argmax([...RESOURCES], (r) => w[r])!);
    const take: Partial<ResourceCounts> = {};
    for (const r of picks) take[r] = (take[r] ?? 0) + 1;
    if (RESOURCES.every((r) => s.bank[r] >= (take[r] ?? 0))) {
      return { type: 'PlayHarvestPact', player: p, resources: picks.slice(0, 2) };
    }
  }
  if (types.has('tithe')) {
    const w = resourceWeights(s, p, goal);
    const best = argmax([...RESOURCES], (r) => (persona.cunning ? estimateHeld(s, p, r) : 0.2 * othersCards(s, p)) * w[r]);
    if (best) {
      const est = persona.cunning ? estimateHeld(s, p, best) : 0.2 * othersCards(s, p);
      if (est >= 2.5) return { type: 'PlayBloodTithe', player: p, resource: best };
    }
  }
  if (
    types.has('decree') &&
    me.supply.causeways > 0 &&
    legalCausewaySpots(s, p).length > 0 &&
    (goal === 'causeway' || legalOutpostSpots(s, p).length === 0)
  ) {
    return { type: 'PlayDecree', player: p };
  }
  if (types.has('warden') && persona.cunning && s.hasRolled) {
    // Archdemon also uses Wardens offensively on the leader late in the game.
    const lead = leader(s, p);
    if (lead !== null && victoryPoints(s, lead, false) >= s.config.targetVp - 3) return { type: 'PlayWarden', player: p };
  }
  return null;
}

function othersCards(s: GameState, p: number): number {
  return s.players.reduce((n, o) => (o.id === p ? n : n + handTotal(o)), 0);
}

function outpostScore(s: GameState, v: VertexId, p: number, persona: Persona, sc: ResourceCounts): number {
  let score = vertexValue(s, v, p, sc);
  if (persona.cunning) {
    // Block: sitting on an opponent's long trail breaks it.
    const topo = getTopology();
    const touching = topo.vertexEdges[v].filter((e) => {
      const o = s.causeways[e];
      return o !== undefined && o !== p && (s.longestCauseway.lengths[o] ?? 0) >= 4;
    });
    if (touching.length >= 2) score += 6;
  }
  return score;
}

function mainTurn(s: GameState, p: number, rng: Rng, persona: Persona): Action {
  const me = s.players[p];
  const sc = scarcity(s);
  const omen = omenPlay(s, p, persona, false);
  if (omen) return omen;

  // Citadel first: it doubles the best yields.
  if (canAfford(me.hand, 'citadel') && me.supply.citadels > 0) {
    const spots = legalCitadelSpots(s, p);
    const topo = getTopology();
    const v = argmax(spots, (x) => topo.vertexHexes[x].reduce((n, h) => n + pips(s.board.hexes[h].token), 0));
    if (v) return { type: 'BuildCitadel', player: p, vertex: v };
  }
  const outSpots = me.supply.outposts > 0 ? legalOutpostSpots(s, p) : [];
  if (canAfford(me.hand, 'outpost') && outSpots.length) {
    const v = argmax(outSpots, (x) => outpostScore(s, x, p, persona, sc))!;
    return { type: 'BuildOutpost', player: p, vertex: v };
  }
  if (canAfford(me.hand, 'causeway') && me.supply.causeways > 0) {
    const edges = legalCausewaySpots(s, p);
    if (edges.length) {
      const needRoad = outSpots.length === 0;
      const surplus =
        me.hand.wood >= (canAfford(me.hand, 'outpost') ? 2 : 1) + 1 && me.hand.clay >= 2 && outSpots.length > 0;
      const chaseLongest =
        s.longestCauseway.holder !== p && (s.longestCauseway.lengths[p] ?? 0) >= 3 && me.supply.causeways > 2;
      if (needRoad || surplus || chaseLongest) {
        const e = argmax(edges, (x) => edgeValue(s, x, p, sc) + longestGain(s, x, p) * (chaseLongest ? 4 : 1.5))!;
        if (needRoad || longestGain(s, e, p) > 0 || edgeValue(s, e, p, sc) > 6) {
          return { type: 'BuildCauseway', player: p, edge: e };
        }
      }
    }
  }
  const goal = chooseGoal(s, p);
  const vp = victoryPoints(s, p, true);
  const nearWin = vp >= s.config.targetVp - 2;
  if (canAfford(me.hand, 'omen') && s.omenDeck.length > 0) {
    const shouldBuy =
      goal === 'omen' ||
      handTotal(me) > HAND_LIMIT ||
      (persona.cunning && nearWin) ||
      (!canAfford(me.hand, 'outpost') && !canAfford(me.hand, 'citadel') && rng.next() < 0.25);
    if (shouldBuy) return { type: 'BuyOmen', player: p };
  }
  const bank = bankTradeToward(s, p, goal);
  if (bank) return { type: 'BankTrade', player: p, give: bank.give, receive: bank.receive };

  // Over the hand limit: shed surplus at a good harbor rate into something wanted.
  if (handTotal(me) > HAND_LIMIT) {
    const rates = bankRates(s, p);
    const w = resourceWeights(s, p, goal);
    const give = argmax(
      RESOURCES.filter((r) => me.hand[r] - (COSTS[goal][r] ?? 0) >= rates[r] && (persona.cunning || rates[r] <= 3)),
      (r) => me.hand[r] - rates[r] * 0.5,
    );
    const receive = argmax(
      RESOURCES.filter((r) => r !== give && s.bank[r] > 0),
      (r) => w[r],
    );
    if (give && receive) return { type: 'BankTrade', player: p, give, receive };
  }

  // Domestic offer: 1-for-1 for a missing card.
  if (s.offersThisTurn < persona.offersPerTurn) {
    const missing = missingResources(me.hand, goal);
    const want = RESOURCES.find((r) => (missing[r] ?? 0) > 0);
    const cost = COSTS[goal];
    const give = argmax(
      RESOURCES.filter((r) => r !== want && me.hand[r] - (cost[r] ?? 0) >= 1),
      (r) => me.hand[r] - (cost[r] ?? 0),
    );
    if (want && give && totalCards(missing) <= 2) {
      return { type: 'ProposeTrade', player: p, give: { [give]: 1 }, want: { [want]: 1 }, to: 'all' };
    }
  }
  return { type: 'EndTurn', player: p };
}

function respond(s: GameState, p: number, persona: Persona): Action {
  if (s.phase.kind !== 'trade') return { type: 'RespondTrade', player: p, response: 'decline' };
  const offer = s.phase.offer;
  const me = s.players[p];
  const decline: Action = { type: 'RespondTrade', player: p, response: 'decline' };
  if (!hasAtLeast(me.hand, offer.want)) return decline;
  if (!hasAtLeast(s.players[offer.proposer].hand, offer.give)) return decline;
  if (victoryPoints(s, offer.proposer, false) >= s.config.targetVp - 2) return decline;
  const goal = chooseGoal(s, p);
  const w = resourceWeights(s, p, goal);
  const gain = valueOf(offer.give, w);
  const loss = valueOf(offer.want, w);
  // Never give away cards needed for an affordable build right now.
  const after = { ...me.hand };
  for (const r of RESOURCES) after[r] += (offer.give[r] ?? 0) - (offer.want[r] ?? 0);
  const breaksBuild = canAfford(me.hand, goal) && !canAfford(after, goal);
  if (!breaksBuild && gain >= loss * persona.acceptMargin) {
    return { type: 'RespondTrade', player: p, response: 'accept' };
  }
  return decline;
}

/** Heuristic policy shared by Warlord and Archdemon. */
export function warlordAction(s: GameState, rng: Rng, persona: Persona): Action {
  if (s.handoff !== null) return { type: 'AckPassDevice', player: s.handoff };
  const p = activeActor(s);
  const ph = s.phase;
  const sc = scarcity(s);
  switch (ph.kind) {
    case 'setup':
      if (ph.step === 'outpost') {
        const v = persona.pickSetup
          ? persona.pickSetup(s, p)
          : argmax(legalOutpostSpots(s, p), (x) => vertexValue(s, x, p, sc))!;
        return { type: 'PlaceSetupOutpost', player: p, vertex: v };
      }
      return { type: 'PlaceSetupCauseway', player: p, edge: bestSetupCauseway(s, p) };
    case 'roll':
      return omenPlay(s, p, persona, true) ?? { type: 'RollDice', player: p };
    case 'discard':
      return { type: 'Discard', player: p, cards: smartDiscard(s, p, ph.pending[p]) };
    case 'move-wraith': {
      const punish = leader(s, p);
      const hexes = s.board.hexes.map((h) => h.id).filter((h) => h !== s.wraithHex);
      const hex = argmax(hexes, (h) => wraithValue(s, h, p, punish) + rng.next() * 0.01)!;
      return { type: 'MoveWraith', player: p, hex };
    }
    case 'steal': {
      const goal = chooseGoal(s, p);
      const w = resourceWeights(s, p, goal);
      const victim = argmax(ph.candidates, (c) => {
        const o = s.players[c];
        let score = victoryPoints(s, c, false) * 2 + handTotal(o);
        if (persona.cunning) {
          const y = expectedYield(s, c);
          score += RESOURCES.reduce((n, r) => n + y[r] * w[r] * 10, 0);
        }
        return score;
      })!;
      return { type: 'StealFrom', player: p, victim };
    }
    case 'decree': {
      const edges = legalCausewaySpots(s, p);
      const e = argmax(edges, (x) => edgeValue(s, x, p, sc) + longestGain(s, x, p) * 2)!;
      return { type: 'BuildCauseway', player: p, edge: e };
    }
    case 'trade':
      return respond(s, p, persona);
    case 'main':
      return mainTurn(s, p, rng, persona);
    case 'duel':
      throw new Error('No moves during a duel');
    case 'ended':
      throw new Error('Game over');
  }
}

export const WARLORD: Persona = { cunning: false, acceptMargin: 1, offersPerTurn: 1 };

export { relicCount };
