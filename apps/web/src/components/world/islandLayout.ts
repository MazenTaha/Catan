import type { Path } from './terrain';

export interface IslandSite {
  x: number;
  z: number;
  angle: number;
  index: number;
}

/** Human-sized trails join matching edge midpoints on every seeded board. */
export function islandLayout(radius: number, entry: number, variation = entry) {
  const paths: Path[] = [];
  const point = (a: number, r: number) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });
  const loop = (a: number) =>
    point(
      a,
      radius * (0.72 + 0.025 * Math.sin(a * 3 + variation) + 0.012 * Math.sin(a * 5 - variation)),
    );
  const join = (a: { x: number; z: number }, b: { x: number; z: number }, w: number) =>
    paths.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, w });
  for (let i = 0; i < 36; i++) join(loop((i * Math.PI) / 18), loop(((i + 1) * Math.PI) / 18), 3.2);
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (i * Math.PI) / 3;
    join(loop(angle), point(angle, (radius * Math.sqrt(3)) / 2), 3.2);
  }
  // The centre sign stays beside the route, rather than blocking it.
  join(loop(entry), point(entry, 2.8), 2.8);
  const sites = [-1, 1].map((side, index) => {
    const angle = entry + (side * Math.PI) / 2;
    const site = { ...point(angle, radius * 0.47), angle, index };
    join(loop(angle), site, 2.6);
    return site;
  });
  return { paths, sites };
}
