import type { EdgeId, VertexId } from '../board/coords';
import { getTopology } from '../board/topology';
import { LONGEST_MIN } from '../lexicon-keys';
import type { GameEvent, GameState } from '../state/types';

/**
 * Length of the longest continuous trail of `player`'s causeways. Each edge is used at
 * most once (vertices may repeat, so cycles count fully). A vertex holding an opponent's
 * Outpost/Citadel breaks the trail: it can end there but not pass through.
 */
export function longestCausewayLength(
  state: Pick<GameState, 'causeways' | 'buildings' | 'board'>,
  player: number,
): number {
  const t = getTopology(state.board.layoutId);
  const own: EdgeId[] = [];
  for (const e in state.causeways) if (state.causeways[e] === player) own.push(e);
  if (own.length === 0) return 0;

  const ownSet = new Set(own);
  const blocked = (v: VertexId) => {
    const b = state.buildings[v];
    return b !== undefined && b.owner !== player;
  };

  let best = 0;
  const used = new Set<EdgeId>();

  const dfs = (v: VertexId, len: number) => {
    if (len > best) best = len;
    if (len > 0 && blocked(v)) return;
    for (const e of t.vertexEdges[v]) {
      if (!ownSet.has(e) || used.has(e)) continue;
      const [a, b] = t.edgeVertices[e];
      used.add(e);
      dfs(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };

  const starts = new Set<VertexId>();
  for (const e of own) for (const v of t.edgeVertices[e]) starts.add(v);
  for (const v of starts) {
    dfs(v, 0);
    if (best === own.length) break;
  }
  return best;
}

/**
 * Re-evaluates who holds Longest Causeway after any change that could affect it.
 * - Holder keeps it while at least tied for the lead (and ≥ 5).
 * - If the holder falls behind, it passes to a single strict leader (≥ 5), else nobody.
 * - With no holder, a single strict leader (≥ 5) claims it.
 */
export function updateLongestCauseway(s: GameState, events: GameEvent[]): void {
  const lengths = s.players.map((p) => longestCausewayLength(s, p.id));
  const prev = s.longestCauseway.holder;
  const max = Math.max(...lengths);
  const leaders = lengths.flatMap((l, i) => (l === max ? [i] : []));
  let holder: number | null;
  if (prev !== null && lengths[prev] >= LONGEST_MIN && lengths[prev] === max) {
    holder = prev;
  } else if (max >= LONGEST_MIN && leaders.length === 1) {
    holder = leaders[0];
  } else {
    holder = null;
  }
  s.longestCauseway = { holder, lengths };
  if (holder !== prev) {
    events.push({
      type: 'LongestCausewayChanged',
      holder,
      previous: prev,
      length: holder === null ? max : lengths[holder],
    });
  }
}
