import type { EdgeId, VertexId } from '../board/coords';
import { getTopology } from '../board/topology';
import {
  COSTS,
  RESOURCES,
  TERRAIN_RESOURCE,
  emptyCounts,
  pips,
  totalCards,
  type CostKey,
  type Resource,
  type ResourceCounts,
} from '../lexicon-keys';
import { longestCausewayLength } from '../rules/longest-road';
import {
  bankRates,
  canAfford,
  expectedYield,
  handTotal,
  isDistanceLegal,
  legalCausewaySpots,
  legalCitadelSpots,
  legalOutpostSpots,
  missingResources,
  victoryPoints,
} from '../state/selectors';
import type { GameState } from '../state/types';

const t = () => getTopology();

/** Total pips per resource on the board: scarce resources are worth more. */
export function scarcity(s: GameState): ResourceCounts {
  const total = emptyCounts();
  for (const h of s.board.hexes) {
    const r = TERRAIN_RESOURCE[h.terrain];
    if (r) total[r] += pips(h.token);
  }
  const out = emptyCounts();
  for (const r of RESOURCES) out[r] = total[r] > 0 ? 1 + (12 - Math.min(12, total[r])) / 12 : 1.5;
  return out;
}

/**
 * Value of founding at vertex `v` for `player`: weighted pips, a diversity bonus,
 * complementarity with the player's existing income, and harbor synergy.
 */
export function vertexValue(s: GameState, v: VertexId, player: number, sc = scarcity(s)): number {
  const topo = t();
  const have = expectedYield(s, player);
  let score = 0;
  const kinds = new Set<Resource>();
  for (const h of topo.vertexHexes[v]) {
    const hex = s.board.hexes[h];
    const r = TERRAIN_RESOURCE[hex.terrain];
    if (!r) continue;
    const p = pips(hex.token) * (h === s.wraithHex ? 0.4 : 1);
    const novelty = have[r] < 0.05 ? 1.35 : have[r] < 0.15 ? 1.1 : 0.9;
    score += p * sc[r] * novelty;
    kinds.add(r);
  }
  score += kinds.size * 1.2;
  const harbor = s.board.harbors.find((hb) => hb.vertices.includes(v));
  if (harbor) {
    if (harbor.kind === 'any') score += 1.5;
    else {
      const prod = have[harbor.kind] * 36 + topo.vertexHexes[v].reduce((n, h) => {
        const hex = s.board.hexes[h];
        return n + (TERRAIN_RESOURCE[hex.terrain] === harbor.kind ? pips(hex.token) : 0);
      }, 0);
      score += Math.min(4, prod * 0.45);
    }
  }
  return score;
}

/** Free, distance-legal vertices (ignores connection). */
export function openVertices(s: GameState): VertexId[] {
  return t().vertices.filter((v) => isDistanceLegal(s, v));
}

/** How promising a causeway edge is: best open vertex within reach beyond it. */
export function edgeValue(s: GameState, e: EdgeId, player: number, sc = scarcity(s)): number {
  const topo = t();
  const [a, b] = topo.edgeVertices[e];
  // Far end = the endpoint not already connected to the player's network.
  const owns = (v: VertexId) =>
    s.buildings[v]?.owner === player || topo.vertexEdges[v].some((x) => s.causeways[x] === player);
  const far = owns(a) && !owns(b) ? b : owns(b) && !owns(a) ? a : b;
  let best = 0;
  const seen = new Set<VertexId>([far]);
  let frontier: VertexId[] = [far];
  for (let depth = 0; depth < 3; depth++) {
    const next: VertexId[] = [];
    for (const v of frontier) {
      if (!s.buildings[v] && isDistanceLegal(s, v)) {
        best = Math.max(best, vertexValue(s, v, player, sc) * (1 - depth * 0.28));
      }
      const blocked = s.buildings[v] && s.buildings[v].owner !== player;
      if (blocked) continue;
      for (const n of topo.vertexNeighbors[v]) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return best;
}

export type Goal = 'outpost' | 'citadel' | 'causeway' | 'omen';

/** Picks what the player should be saving for. */
export function chooseGoal(s: GameState, player: number): Goal {
  const me = s.players[player];
  const options: { g: Goal; missing: number; prio: number }[] = [];
  const outSpots = me.supply.outposts > 0 ? legalOutpostSpots(s, player).length : 0;
  if (outSpots > 0) options.push({ g: 'outpost', missing: totalCards(missingResources(me.hand, 'outpost')), prio: 0 });
  if (me.supply.citadels > 0 && legalCitadelSpots(s, player).length > 0) {
    options.push({ g: 'citadel', missing: totalCards(missingResources(me.hand, 'citadel')), prio: 0.5 });
  }
  if (outSpots === 0 && me.supply.causeways > 0 && legalCausewaySpots(s, player).length > 0) {
    options.push({ g: 'causeway', missing: totalCards(missingResources(me.hand, 'causeway')), prio: 0.2 });
  }
  if (s.omenDeck.length > 0) options.push({ g: 'omen', missing: totalCards(missingResources(me.hand, 'omen')), prio: 2.5 });
  if (!options.length) return 'omen';
  options.sort((a, b) => a.missing + a.prio - (b.missing + b.prio));
  return options[0].g;
}

/** Per-resource desirability given the goal (higher = keep / want). */
export function resourceWeights(s: GameState, player: number, goal: Goal): ResourceCounts {
  const me = s.players[player];
  const cost = COSTS[goal];
  const w = emptyCounts();
  const sc = scarcity(s);
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    const missing = Math.max(0, need - me.hand[r]);
    w[r] = 0.6 * sc[r] + (missing > 0 ? 1.6 : need > 0 ? 0.9 : 0) - Math.max(0, me.hand[r] - need - 1) * 0.25;
  }
  return w;
}

export function valueOf(c: Partial<ResourceCounts>, w: ResourceCounts): number {
  let v = 0;
  for (const r of RESOURCES) v += (c[r] ?? 0) * w[r];
  return v;
}

/** Best bank trade that reduces the gap to `cost` without eating into it; null if none. */
export function bankTradeToward(
  s: GameState,
  player: number,
  cost: CostKey | Partial<ResourceCounts>,
): { give: Resource; receive: Resource } | null {
  const me = s.players[player];
  const c = typeof cost === 'string' ? COSTS[cost] : cost;
  const missing = missingResources(me.hand, c);
  const need = RESOURCES.filter((r) => (missing[r] ?? 0) > 0 && s.bank[r] > 0);
  if (!need.length) return null;
  const rates = bankRates(s, player);
  // Can the surplus cover every missing card? Only then is trading worthwhile.
  let coverable = 0;
  for (const r of RESOURCES) {
    const surplus = me.hand[r] - (c[r] ?? 0);
    if (surplus > 0) coverable += Math.floor(surplus / rates[r]);
  }
  if (coverable < totalCards(missing)) return null;
  let bestGive: Resource | null = null;
  let bestSurplus = -1;
  for (const r of RESOURCES) {
    const surplus = me.hand[r] - (c[r] ?? 0);
    if (surplus >= rates[r] && surplus - rates[r] > bestSurplus) {
      bestSurplus = surplus - rates[r];
      bestGive = r;
    }
  }
  if (!bestGive) return null;
  return { give: bestGive, receive: need[0] };
}

/** The opponent closest to winning (public VP plus a nudge for hidden cards). */
export function leader(s: GameState, except: number): number | null {
  let best: number | null = null;
  let bestVp = -1;
  for (const p of s.players) {
    if (p.id === except) continue;
    const vp = victoryPoints(s, p.id, false) + p.omens.length * 0.2 + handTotal(p) * 0.05;
    if (vp > bestVp) {
      bestVp = vp;
      best = p.id;
    }
  }
  return best;
}

/** Score for placing the Wraith on `hex` as `player`. */
export function wraithValue(s: GameState, hex: number, player: number, punish: number | null): number {
  const topo = t();
  const h = s.board.hexes[hex];
  const p = pips(h.token);
  let score = 0;
  for (const v of topo.hexVertices[hex]) {
    const b = s.buildings[v];
    if (!b) continue;
    const weight = b.kind === 'citadel' ? 2 : 1;
    if (b.owner === player) score -= 6 * weight * Math.max(1, p);
    else {
      const vp = victoryPoints(s, b.owner, false);
      score += weight * p * (1 + vp / 6) * (b.owner === punish ? 1.6 : 1);
      if (handTotal(s.players[b.owner]) > 0) score += 1.5;
    }
  }
  return score;
}

/** Best road edge for longest-causeway ambitions: increases own trail length. */
export function longestGain(s: GameState, e: EdgeId, player: number): number {
  const before = longestCausewayLength(s, player);
  const after = longestCausewayLength({ ...s, causeways: { ...s.causeways, [e]: player } }, player);
  return after - before;
}

export function affordable(s: GameState, player: number, k: CostKey): boolean {
  return canAfford(s.players[player].hand, k);
}
