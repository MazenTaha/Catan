import { getTopology, type Board, type EdgeId, type Harbor, type VertexId } from '@hexfall/engine';

/** Hex circumradius in SVG units. */
export const S = 100;

const topo = getTopology();

export const VIEWBOX = { x: -575, y: -545, w: 1150, h: 1090 };
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

/** The island outline (coastal vertices in clockwise order) as an SVG path. */
export const ISLAND_PATH = (() => {
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
  return (
    verts
      .map((v, i) => {
        const p = vertexXY(v);
        return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join('') + 'Z'
  );
})();

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
