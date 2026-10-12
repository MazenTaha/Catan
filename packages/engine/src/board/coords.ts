/**
 * Coordinates for a pointy-top hex grid.
 *
 * Hexes use axial coordinates (q, r). Vertices live on an integer lattice (X, Y) where
 *   x = X * (√3 / 2) * size,  y = Y * 0.5 * size
 * so a hex center is (2q + r, 3r) and its corners are fixed integer offsets from it.
 * This gives every vertex a canonical, float-free ID like "3,-5", and every edge the
 * sorted pair of its vertex IDs, e.g. "1,-1|2,-2".
 */

export interface Axial {
  q: number;
  r: number;
}

export type VertexId = string;
export type EdgeId = string;

/** Corner offsets in lattice units, clockwise from the top corner. */
export const CORNER_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -2], // top
  [1, -1], // top-right
  [1, 1], // bottom-right
  [0, 2], // bottom
  [-1, 1], // bottom-left
  [-1, -1], // top-left
];

export const AXIAL_DIRECTIONS: ReadonlyArray<Axial> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const SQRT3 = Math.sqrt(3);

export function hexKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

export function hexCenterLattice(h: Axial): [number, number] {
  return [2 * h.q + h.r, 3 * h.r];
}

export function vertexId(X: number, Y: number): VertexId {
  return `${X},${Y}`;
}

export function parseVertex(id: VertexId): [number, number] {
  const [x, y] = id.split(',');
  return [Number(x), Number(y)];
}

export function edgeId(a: VertexId, b: VertexId): EdgeId {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function parseEdge(id: EdgeId): [VertexId, VertexId] {
  const [a, b] = id.split('|');
  return [a, b];
}

/** Pixel position of a lattice point for hex `size` (circumradius). */
export function latticeToPixel(X: number, Y: number, size = 1): { x: number; y: number } {
  return { x: (X * SQRT3 * size) / 2, y: (Y * size) / 2 };
}

export function hexToPixel(h: Axial, size = 1): { x: number; y: number } {
  const [X, Y] = hexCenterLattice(h);
  return latticeToPixel(X, Y, size);
}

export function vertexToPixel(id: VertexId, size = 1): { x: number; y: number } {
  const [X, Y] = parseVertex(id);
  return latticeToPixel(X, Y, size);
}

export function axialDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

/** All hexes within `radius` of the origin, row-major (r ascending, then q ascending). */
export function hexesInRadius(radius: number): Axial[] {
  const out: Axial[] = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.abs(q + r) <= radius) out.push({ q, r });
    }
  }
  return out;
}
