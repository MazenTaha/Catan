import { NUMBER_TOKENS, TERRAIN_COUNTS, TERRAINS } from '../lexicon-keys';
import { getTopology } from './topology';
import type { Board, HexTile } from './types';

const isRed = (n: number | null) => n === 6 || n === 8;

/** True if any two adjacent hexes both carry a 6 or 8. */
export function hasRedAdjacency(hexes: HexTile[]): boolean {
  const t = getTopology();
  return hexes.some((h) =>
    isRed(h.token) ? t.hexNeighbors[h.id].some((n) => n > h.id && isRed(hexes[n].token)) : false,
  );
}

/** True if any two adjacent hexes carry the same number. */
export function hasIdenticalAdjacency(hexes: HexTile[]): boolean {
  const t = getTopology();
  return hexes.some((h) =>
    h.token === null
      ? false
      : t.hexNeighbors[h.id].some((n) => n > h.id && hexes[n].token === h.token),
  );
}

export interface ValidationReport {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

export function validateBoard(board: Board): ValidationReport {
  const issues: string[] = [];
  const warnings: string[] = [];
  const t = getTopology(board.layoutId);
  if (board.hexes.length !== t.hexes.length) issues.push('wrong hex count');

  for (const terrain of TERRAINS) {
    const n = board.hexes.filter((h) => h.terrain === terrain).length;
    if (n !== TERRAIN_COUNTS[terrain]) issues.push(`terrain ${terrain}: ${n}`);
  }
  const tokens = board.hexes
    .map((h) => h.token)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (tokens.join() !== [...NUMBER_TOKENS].join()) issues.push('wrong number tokens');
  for (const h of board.hexes) {
    if ((h.terrain === 'waste') !== (h.token === null)) issues.push(`hex ${h.id} token mismatch`);
  }
  if (board.harbors.length !== 9) issues.push('wrong harbor count');
  const generic = board.harbors.filter((h) => h.kind === 'any').length;
  if (generic !== 4) issues.push('wrong generic harbor count');
  const used = new Set<string>();
  for (const hb of board.harbors) {
    if (!t.coastalEdges.includes(hb.edge)) issues.push(`harbor ${hb.id} not coastal`);
    for (const v of hb.vertices) {
      if (used.has(v)) issues.push(`harbor vertex ${v} shared`);
      used.add(v);
    }
  }
  if (board.mode !== 'random' && hasRedAdjacency(board.hexes)) issues.push('adjacent 6/8');
  if (hasIdenticalAdjacency(board.hexes)) warnings.push('identical adjacent numbers');
  return { ok: issues.length === 0, issues, warnings };
}
