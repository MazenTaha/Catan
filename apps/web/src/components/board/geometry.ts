import { getTopology, type Board, type EdgeId, type Harbor, type VertexId } from '@hexfall/engine';

/** Hex circumradius in SVG units. */
export const S = 100;

const topo = getTopology();

// A little sea round the harbors so badges and boats never touch the edge.
export const VIEWBOX = { x: -560, y: -505, w: 1120, h: 1010 };
export const VIEWBOX_STR = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;

export function hexCenter(hex: number): { x: number; y: number } {
  const p = topo.hexPos[hex];
  return { x: p.x * S, y: p.y * S };
}

export function vertexXY(v: VertexId): { x: number; y: number } {
  const p = topo.vertexPos[v];
  return { x: p.x * S, y: p.y * S };
}

export function edgeXY(e: EdgeId) {
  const [a, b] = topo.edgeVertices[e];
  const pa = vertexXY(a);
  const pb = vertexXY(b);
  return {
    a: pa,
    b: pb,
    mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
    angle: (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI,
  };
}

/** Pointy-top hexagon points relative to its center. */
export function hexPoints(r = S): string {
  const k = (Math.sqrt(3) / 2) * r;
  return `0,${-r} ${k},${-r / 2} ${k},${r / 2} 0,${r} ${-k},${r / 2} ${-k},${-r / 2}`;
}

export const HEX_PATH = (() => {
  const k = (Math.sqrt(3) / 2) * S;
  return `M0 ${-S}L${k} ${-S / 2}L${k} ${S / 2}L0 ${S}L${-k} ${S / 2}L${-k} ${-S / 2}Z`;
})();

/** The island outline: coastal vertices in clockwise order. */
export const ISLAND_POINTS: { x: number; y: number }[] = (() => {
  const ring = topo.coastalEdges.map((e) => topo.edgeVertices[e]);
  const verts: VertexId[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = ring[i];
    const next = ring[(i + 1) % ring.length];
    const shared = next.includes(a) ? a : b;
    const other = shared === a ? b : a;
    if (verts.length === 0) verts.push(other);
    verts.push(shared);
  }
  if (verts[0] === verts[verts.length - 1]) verts.pop();
  return verts.map(vertexXY);
})();

/** The island outline as an SVG path. */
export const ISLAND_PATH =
  ISLAND_POINTS.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z';

/** Whether a point lies on the island (inside the coastline). */
export function onIsland(p: { x: number; y: number }): boolean {
  let inside = false;
  const pts = ISLAND_POINTS;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the coastline. */
export function coastDistance(p: { x: number; y: number }): number {
  let best = Infinity;
  const pts = ISLAND_POINTS;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * k, p.y - a.y - dy * k));
  }
  return best;
}

export function harborGeometry(h: Harbor) {
  const e = edgeXY(h.edge);
  const c = hexCenter(h.hex);
  const dx = e.mid.x - c.x;
  const dy = e.mid.y - c.y;
  const len = Math.hypot(dx, dy);
  const nx = dx / len;
  const ny = dy / len;
  const badge = { x: e.mid.x + nx * 62, y: e.mid.y + ny * 62 };
  return { ...e, badge, nx, ny };
}

export function hexVerticesOf(hex: number): VertexId[] {
  return topo.hexVertices[hex];
}

export function vertexHexesOf(v: VertexId): number[] {
  return topo.vertexHexes[v];
}

export { topo };

export function playersAdjacentToHex(board: Board, buildings: Record<string, { owner: number }>, hex: number) {
  void board;
  const set = new Set<number>();
  for (const v of topo.hexVertices[hex]) {
    const b = buildings[v];
    if (b) set.add(b.owner);
  }
  return [...set];
}

/** Maps an SVG point to percentage offsets inside the board container. */
export function toPercent(p: { x: number; y: number }) {
  return {
    left: `${((p.x - VIEWBOX.x) / VIEWBOX.w) * 100}%`,
    top: `${((p.y - VIEWBOX.y) / VIEWBOX.h) * 100}%`,
  };
}
