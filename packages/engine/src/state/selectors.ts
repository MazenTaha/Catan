import type { EdgeId, VertexId } from '../board/coords';
import { getTopology } from '../board/topology';
import type { HarborKind } from '../board/types';
import {
  BONUS_VP,
  COSTS,
  HAND_LIMIT,
  RESOURCES,
  TERRAIN_RESOURCE,
  emptyCounts,
  hasAtLeast,
  pips,
  totalCards,
  type CostKey,
  type Resource,
  type ResourceCounts,
} from '../lexicon-keys';
import type { GameState, PlayerState, VpBreakdown } from './types';

export const topo = (s: GameState) => getTopology(s.board.layoutId);

export function handTotal(p: PlayerState): number {
  return totalCards(p.hand);
}

/** Free vertex with no building on it or on any neighbor. */
export function isDistanceLegal(s: GameState, v: VertexId): boolean {
  const t = topo(s);
  if (!(v in t.vertexEdges)) return false;
  if (s.buildings[v]) return false;
  return t.vertexNeighbors[v].every((n) => !s.buildings[n]);
}

export function touchesOwnCauseway(s: GameState, player: number, v: VertexId): boolean {
  return topo(s).vertexEdges[v].some((e) => s.causeways[e] === player);
}

/** Legal Outpost vertices (setup ignores the causeway connection requirement). */
export function legalOutpostSpots(s: GameState, player: number): VertexId[] {
  const setup = s.phase.kind === 'setup';
  return topo(s).vertices.filter(
    (v) => isDistanceLegal(s, v) && (setup || touchesOwnCauseway(s, player, v)),
  );
}

function causewayConnects(s: GameState, player: number, e: EdgeId): boolean {
  const t = topo(s);
  return t.edgeVertices[e].some((v) => {
    const b = s.buildings[v];
    if (b && b.owner === player) return true;
    if (b && b.owner !== player) return false; // cannot extend through an opponent
    return t.vertexEdges[v].some((x) => x !== e && s.causeways[x] === player);
  });
}

export function legalCausewaySpots(s: GameState, player: number): EdgeId[] {
  const t = topo(s);
  if (s.phase.kind === 'setup') {
    const anchor = s.phase.lastOutpost;
    if (!anchor) return [];
    return t.vertexEdges[anchor].filter((e) => s.causeways[e] === undefined);
  }
  return t.edges.filter((e) => s.causeways[e] === undefined && causewayConnects(s, player, e));
}

export function legalCitadelSpots(s: GameState, player: number): VertexId[] {
  return Object.keys(s.buildings).filter((v) => {
    const b = s.buildings[v];
    return b.owner === player && b.kind === 'outpost';
  });
}

export function canAfford(hand: ResourceCounts, cost: CostKey | Partial<ResourceCounts>): boolean {
  return hasAtLeast(hand, typeof cost === 'string' ? COSTS[cost] : cost);
}

/** Cards still missing to pay `cost` (zero entries omitted). */
export function missingResources(
  hand: ResourceCounts,
  cost: CostKey | Partial<ResourceCounts>,
): Partial<ResourceCounts> {
  const c = typeof cost === 'string' ? COSTS[cost] : cost;
  const out: Partial<ResourceCounts> = {};
  for (const r of RESOURCES) {
    const need = (c[r] ?? 0) - hand[r];
    if (need > 0) out[r] = need;
  }
  return out;
}

/** Harbor kinds a player can use (has an Outpost/Citadel on one of the harbor's vertices). */
export function playerHarbors(s: GameState, player: number): HarborKind[] {
  return s.board.harbors
    .filter((h) => h.vertices.some((v) => s.buildings[v]?.owner === player))
    .map((h) => h.kind);
}

/** Best maritime rate for giving `resource`: 2 (matching harbor), 3 (generic), or 4. */
export function bestBankRate(s: GameState, player: number, resource: Resource): 2 | 3 | 4 {
  const kinds = playerHarbors(s, player);
  if (kinds.includes(resource)) return 2;
  if (kinds.includes('any')) return 3;
  return 4;
}

export function bankRates(s: GameState, player: number): Record<Resource, 2 | 3 | 4> {
  const out = {} as Record<Resource, 2 | 3 | 4>;
  for (const r of RESOURCES) out[r] = bestBankRate(s, player, r);
  return out;
}

export function relicCount(p: PlayerState): number {
  return p.omens.filter((o) => o.type === 'relic').length;
}

export function vpBreakdown(s: GameState, player: number): VpBreakdown {
  let outposts = 0;
  let citadels = 0;
  for (const v in s.buildings) {
    const b = s.buildings[v];
    if (b.owner !== player) continue;
    if (b.kind === 'outpost') outposts++;
    else citadels++;
  }
  const longest = s.longestCauseway.holder === player ? BONUS_VP : 0;
  const host = s.greatestHost.holder === player ? BONUS_VP : 0;
  const relics = relicCount(s.players[player]);
  const publicTotal = outposts + citadels * 2 + longest + host;
  return { outposts, citadels, longest, host, relics, publicTotal, total: publicTotal + relics };
}

/** Victory points. `includeHidden` adds unrevealed Relics (only the owner may see these). */
export function victoryPoints(s: GameState, player: number, includeHidden = true): number {
  const b = vpBreakdown(s, player);
  return includeHidden ? b.total : b.publicTotal;
}

/** Expected resource income per roll for a player (pips / 36, Wraith-blocked hex excluded). */
export function expectedYield(s: GameState, player: number): ResourceCounts {
  const t = topo(s);
  const out = emptyCounts();
  for (const v in s.buildings) {
    const b = s.buildings[v];
    if (b.owner !== player) continue;
    for (const h of t.vertexHexes[v]) {
      if (h === s.wraithHex) continue;
      const hex = s.board.hexes[h];
      const res = TERRAIN_RESOURCE[hex.terrain];
      if (!res) continue;
      out[res] += (pips(hex.token) / 36) * (b.kind === 'citadel' ? 2 : 1);
    }
  }
  return out;
}

/** How many cards a 7 would cost this player right now (0 if safe). */
export function handLimitRisk(p: PlayerState): number {
  const n = handTotal(p);
  return n > HAND_LIMIT ? Math.floor(n / 2) : 0;
}

/** Players with a building adjacent to `hex` (excluding `except`) who hold at least one card. */
export function stealCandidates(s: GameState, hex: number, except: number): number[] {
  const t = topo(s);
  const set = new Set<number>();
  for (const v of t.hexVertices[hex]) {
    const b = s.buildings[v];
    if (b && b.owner !== except && handTotal(s.players[b.owner]) > 0) set.add(b.owner);
  }
  return [...set].sort((a, b) => a - b);
}

/** Omen cards the player could legally play now (ignoring phase). */
export function playableOmens(s: GameState, player: number) {
  const p = s.players[player];
  return p.omens.filter((o) => o.type !== 'relic' && o.boughtTurn < s.turn);
}

/**
 * The seat that must act next. For discards, the first pending player in turn order
 * from the current player; for trades, the first undecided target.
 */
export function activeActor(s: GameState): number {
  const ph = s.phase;
  const n = s.players.length;
  if (ph.kind === 'discard') {
    for (let k = 0; k < n; k++) {
      const p = (s.currentPlayer + k) % n;
      if (ph.pending[p] > 0) return p;
    }
  }
  if (ph.kind === 'trade') {
    const next = ph.offer.targets.find((t) => !ph.offer.declined.includes(t));
    if (next !== undefined) return next;
  }
  return s.currentPlayer;
}

export function isBotSeat(s: GameState, player: number): boolean {
  return s.players[player]?.kind === 'bot';
}

export function privacyEnabled(s: GameState): boolean {
  if (s.config.privacy !== undefined) return s.config.privacy;
  return s.players.filter((p) => p.kind === 'human').length >= 2;
}

export function supplyFor(p: PlayerState, kind: CostKey): number {
  if (kind === 'causeway') return p.supply.causeways;
  if (kind === 'outpost') return p.supply.outposts;
  if (kind === 'citadel') return p.supply.citadels;
  return Infinity;
}
