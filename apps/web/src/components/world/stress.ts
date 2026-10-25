/**
 * Stress presets for the 3D walk, for development and the benchmark build only (`PERF_HOOKS`):
 * `?stress=density:2,distance:1.5,sheep:4,scale:1.5,pieces:all` on the page URL. They scale
 * decorative detail to find how much more scene the browser can carry. Placement still comes
 * from the world's own seeded RNG (never the game's), and nothing is saved: drop the parameter
 * to reset.
 */
export interface Stress {
  /** Vegetation density: wheat, grass, flowers, forest trees and shrubs (1-3). */
  density: number;
  /** Vegetation detail and draw distances (1-3). */
  distance: number;
  /** Sheep per flock (1-8). */
  sheep: number;
  /** Render resolution, on top of the usual pixel ratio (0.5-2). */
  scale: number;
  /** Every corner holds a settlement or city and every edge a road (drawing only). */
  pieces: boolean;
}

export const NO_STRESS: Stress = { density: 1, distance: 1, sheep: 1, scale: 1, pieces: false };

const CAPS: Record<'density' | 'distance' | 'sheep' | 'scale', [number, number]> = {
  density: [1, 3],
  distance: [1, 3],
  sheep: [1, 8],
  scale: [0.5, 2],
};

export function parseStress(spec: string | null): Stress {
  const s = { ...NO_STRESS };
  for (const part of (spec ?? '').split(',')) {
    const [k, v] = part.split(':');
    if (k === 'pieces') s.pieces = v === 'all';
    else if (k in CAPS) {
      const [lo, hi] = CAPS[k as keyof typeof CAPS];
      const n = Number(v);
      if (Number.isFinite(n)) s[k as keyof typeof CAPS] = Math.min(hi, Math.max(lo, n));
    }
  }
  return s;
}

export const describeStress = (s: Stress) =>
  `density ${s.density}, distance ${s.distance}, sheep ${s.sheep}, scale ${s.scale}, pieces ${s.pieces ? 'all' : 'game'}`;
