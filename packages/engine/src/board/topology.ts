import type { Axial, EdgeId, VertexId } from './coords';
import {
  AXIAL_DIRECTIONS,
  CORNER_OFFSETS,
  edgeId,
  hexCenterLattice,
  hexesInRadius,
  hexKey,
  latticeToPixel,
  vertexId,
} from './coords';

/**
 * Static adjacency for a board shape. Derived, never serialized: `GameState` stores only
 * the layout id, and `getTopology(layoutId)` returns this memoized structure.
 */
export interface Topology {
  layoutId: string;
  hexes: Axial[];
  hexIndex: Record<string, number>;
  vertices: VertexId[];
  edges: EdgeId[];
  hexVertices: VertexId[][];
  hexEdges: EdgeId[][];
  hexNeighbors: number[][];
  vertexHexes: Record<VertexId, number[]>;
  vertexNeighbors: Record<VertexId, VertexId[]>;
  vertexEdges: Record<VertexId, EdgeId[]>;
  edgeVertices: Record<EdgeId, [VertexId, VertexId]>;
  edgeHexes: Record<EdgeId, number[]>;
  /** Coastal edges (touching exactly one land hex), ordered clockwise from the top. */
  coastalEdges: EdgeId[];
  /** Unit-size pixel positions (size = 1). */
  vertexPos: Record<VertexId, { x: number; y: number }>;
  hexPos: { x: number; y: number }[];
}

export type LayoutId = 'standard';

function build(layoutId: string, hexes: Axial[]): Topology {
  const hexIndex: Record<string, number> = {};
  hexes.forEach((h, i) => (hexIndex[hexKey(h)] = i));

  const hexVertices: VertexId[][] = [];
  const hexEdges: EdgeId[][] = [];
  const vertexHexes: Record<VertexId, number[]> = {};
  const edgeVertices: Record<EdgeId, [VertexId, VertexId]> = {};
  const edgeHexes: Record<EdgeId, number[]> = {};
  const vertexPos: Record<VertexId, { x: number; y: number }> = {};
  const vertexSet = new Set<VertexId>();
  const edgeSet = new Set<EdgeId>();

  hexes.forEach((h, i) => {
    const [cx, cy] = hexCenterLattice(h);
    const vs = CORNER_OFFSETS.map(([dx, dy]) => {
      const id = vertexId(cx + dx, cy + dy);
      vertexPos[id] = latticeToPixel(cx + dx, cy + dy);
      return id;
    });
    hexVertices.push(vs);
    const es: EdgeId[] = [];
    for (let k = 0; k < 6; k++) {
      const a = vs[k];
      const b = vs[(k + 1) % 6];
      const e = edgeId(a, b);
      es.push(e);
      if (!edgeSet.has(e)) {
        edgeSet.add(e);
        edgeVertices[e] = a < b ? [a, b] : [b, a];
        edgeHexes[e] = [];
      }
      edgeHexes[e].push(i);
    }
    hexEdges.push(es);
    for (const v of vs) {
      vertexSet.add(v);
      (vertexHexes[v] ??= []).push(i);
    }
  });

  const vertices = [...vertexSet].sort(compareVertex);
  const edges = [...edgeSet].sort();

  const vertexEdges: Record<VertexId, EdgeId[]> = {};
  const vertexNeighbors: Record<VertexId, VertexId[]> = {};
  for (const v of vertices) {
    vertexEdges[v] = [];
    vertexNeighbors[v] = [];
  }
  for (const e of edges) {
    const [a, b] = edgeVertices[e];
    vertexEdges[a].push(e);
    vertexEdges[b].push(e);
    vertexNeighbors[a].push(b);
    vertexNeighbors[b].push(a);
  }
  for (const v of vertices) {
    vertexNeighbors[v].sort(compareVertex);
    vertexEdges[v].sort();
  }

  const hexNeighbors = hexes.map((h) =>
    AXIAL_DIRECTIONS.map((d) => hexIndex[hexKey({ q: h.q + d.q, r: h.r + d.r })]).filter(
      (n): n is number => n !== undefined,
    ),
  );

  const hexPos = hexes.map((h) => {
    const [x, y] = hexCenterLattice(h);
    return latticeToPixel(x, y);
  });

  const coastalEdges = edges
    .filter((e) => edgeHexes[e].length === 1)
    .map((e) => {
      const [a, b] = edgeVertices[e];
      const mx = (vertexPos[a].x + vertexPos[b].x) / 2;
      const my = (vertexPos[a].y + vertexPos[b].y) / 2;
      // Clockwise from the top (screen coords: y grows downward).
      let ang = Math.atan2(mx, -my);
      if (ang < 0) ang += Math.PI * 2;
      return { e, ang };
    })
    .sort((x, y) => x.ang - y.ang)
    .map((x) => x.e);

  return {
    layoutId,
    hexes,
    hexIndex,
    vertices,
    edges,
    hexVertices,
    hexEdges,
    hexNeighbors,
    vertexHexes,
    vertexNeighbors,
    vertexEdges,
    edgeVertices,
    edgeHexes,
    coastalEdges,
    vertexPos,
    hexPos,
  };
}

function compareVertex(a: VertexId, b: VertexId): number {
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  return ay - by || ax - bx;
}

const cache = new Map<string, Topology>();

export function getTopology(layoutId: LayoutId | string = 'standard'): Topology {
  let t = cache.get(layoutId);
  if (!t) {
    if (layoutId !== 'standard') throw new Error(`Unknown layout ${layoutId}`);
    t = build(layoutId, hexesInRadius(2));
    cache.set(layoutId, t);
  }
  return t;
}

// Convenience adjacency helpers (standard layout by default).
export const hexVertices = (hex: number, t = getTopology()) => t.hexVertices[hex];
export const vertexNeighbors = (v: VertexId, t = getTopology()) => t.vertexNeighbors[v] ?? [];
export const vertexEdges = (v: VertexId, t = getTopology()) => t.vertexEdges[v] ?? [];
export const edgeVertices = (e: EdgeId, t = getTopology()) => t.edgeVertices[e];
export const vertexHexes = (v: VertexId, t = getTopology()) => t.vertexHexes[v] ?? [];
export const hexNeighbors = (hex: number, t = getTopology()) => t.hexNeighbors[hex];
