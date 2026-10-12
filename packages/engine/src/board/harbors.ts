import type { Rng } from '../rng';
import { RESOURCES } from '../lexicon-keys';
import { getTopology } from './topology';
import type { Harbor, HarborKind } from './types';

/** Gaps (in coastal edges) between consecutive harbors; sums to the 30 coastal edges. */
const SPACING = [3, 3, 4, 3, 3, 4, 3, 3, 4];

export function generateHarbors(rng: Rng): Harbor[] {
  const t = getTopology();
  const coast = t.coastalEdges;
  const kinds: HarborKind[] = rng.shuffle<HarborKind>(['any', 'any', 'any', 'any', ...RESOURCES]);
  const offset = rng.int(coast.length);
  const harbors: Harbor[] = [];
  let idx = offset;
  for (let i = 0; i < SPACING.length; i++) {
    const edge = coast[idx % coast.length];
    harbors.push({
      id: i,
      kind: kinds[i],
      edge,
      vertices: t.edgeVertices[edge],
      hex: t.edgeHexes[edge][0],
    });
    idx += SPACING[i];
  }
  return harbors;
}
