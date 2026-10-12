import { NUMBER_TOKENS, TERRAIN_COUNTS, TERRAINS, type Terrain } from '../lexicon-keys';
import { Rng } from '../rng';
import { generateHarbors } from './harbors';
import { getTopology } from './topology';
import type { Board, HexTile, LayoutMode } from './types';
import { hasIdenticalAdjacency, hasRedAdjacency } from './validator';

const TERRAIN_BAG: Terrain[] = TERRAINS.flatMap((t) => Array<Terrain>(TERRAIN_COUNTS[t]).fill(t));

/** Hand-placed terrain for the beginner isle (row-major, Dead Waste in the middle). */
const BEGINNER_TERRAIN: Terrain[] = [
  'peaks', 'moors', 'witchwood',
  'fields', 'ashen', 'moors', 'ashen',
  'fields', 'witchwood', 'waste', 'witchwood', 'peaks',
  'witchwood', 'peaks', 'fields', 'moors',
  'ashen', 'fields', 'moors',
];

function assemble(terrains: Terrain[], tokens: number[]): HexTile[] {
  const t = getTopology();
  let k = 0;
  return t.hexes.map((h, i) => ({
    id: i,
    q: h.q,
    r: h.r,
    terrain: terrains[i],
    token: terrains[i] === 'waste' ? null : tokens[k++],
  }));
}

const MAX_TRIES = 20000;

function balancedHexes(rng: Rng, terrainsFixed?: Terrain[]): HexTile[] {
  let fallback: HexTile[] | null = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const terrains = terrainsFixed ?? rng.shuffle(TERRAIN_BAG);
    const hexes = assemble(terrains, rng.shuffle(NUMBER_TOKENS));
    if (hasRedAdjacency(hexes)) continue;
    if (!hasIdenticalAdjacency(hexes)) return hexes;
    fallback ??= hexes;
  }
  // Identical-number adjacency is avoided "where avoidable"; red adjacency never.
  if (fallback) return fallback;
  throw new Error('Could not generate a balanced isle');
}

export function generateBoard(seed: string, mode: LayoutMode = 'balanced'): Board {
  const t = getTopology();
  let hexes: HexTile[];
  let harborRng: Rng;
  if (mode === 'beginner') {
    const rng = Rng.fromSeed('hexfall:beginner');
    hexes = balancedHexes(rng, BEGINNER_TERRAIN);
    harborRng = rng;
  } else {
    const rng = Rng.fromSeed(`${seed}:isle`);
    hexes =
      mode === 'balanced'
        ? balancedHexes(rng)
        : assemble(rng.shuffle(TERRAIN_BAG), rng.shuffle(NUMBER_TOKENS));
    harborRng = rng;
  }
  if (hexes.length !== t.hexes.length) throw new Error('bad layout');
  return { layoutId: 'standard', seed, mode, hexes, harbors: generateHarbors(harborRng) };
}
