import { describe, expect, it } from 'vitest';
import {
  axialDistance,
  edgeId,
  edgeVertices,
  generateBoard,
  getTopology,
  hasIdenticalAdjacency,
  hasRedAdjacency,
  hexNeighbors,
  hexToPixel,
  hexVertices,
  parseEdge,
  validateBoard,
  vertexEdges,
  vertexHexes,
  vertexNeighbors,
  vertexToPixel,
} from '../board';
import { NUMBER_TOKENS, TERRAIN_COUNTS } from '../lexicon-keys';

describe('topology', () => {
  const t = getTopology();

  it('has 19 hexes, 54 vertices, 72 edges, 30 coastal edges', () => {
    expect(t.hexes).toHaveLength(19);
    expect(t.vertices).toHaveLength(54);
    expect(t.edges).toHaveLength(72);
    expect(t.coastalEdges).toHaveLength(30);
  });

  it('rows are 3-4-5-4-3', () => {
    const rows = new Map<number, number>();
    for (const h of t.hexes) rows.set(h.r, (rows.get(h.r) ?? 0) + 1);
    const sizes = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    expect(sizes).toEqual([3, 4, 5, 4, 3]);
  });

  it('every hex has 6 distinct vertices and edges', () => {
    for (let i = 0; i < 19; i++) {
      expect(new Set(hexVertices(i)).size).toBe(6);
      expect(new Set(t.hexEdges[i]).size).toBe(6);
    }
  });

  it('vertex degree is 2 or 3 and neighbors are symmetric', () => {
    for (const v of t.vertices) {
      const n = vertexNeighbors(v);
      expect(n.length === 2 || n.length === 3).toBe(true);
      expect(vertexEdges(v)).toHaveLength(n.length);
      for (const w of n) expect(vertexNeighbors(w)).toContain(v);
    }
    expect(vertexNeighbors('999,999')).toEqual([]);
    expect(vertexEdges('999,999')).toEqual([]);
    expect(vertexHexes('999,999')).toEqual([]);
  });

  it('vertex hexes are 1..3 and consistent with hexVertices', () => {
    for (const v of t.vertices) {
      const hs = vertexHexes(v);
      expect(hs.length).toBeGreaterThanOrEqual(1);
      expect(hs.length).toBeLessThanOrEqual(3);
      for (const h of hs) expect(hexVertices(h)).toContain(v);
    }
    expect(t.vertices.filter((v) => vertexHexes(v).length === 3)).toHaveLength(24);
  });

  it('edges connect neighboring vertices with canonical ids', () => {
    for (const e of t.edges) {
      const [a, b] = edgeVertices(e);
      expect(edgeId(b, a)).toBe(e);
      expect(parseEdge(e)).toEqual([a, b]);
      const pa = vertexToPixel(a);
      const pb = vertexToPixel(b);
      expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeCloseTo(1, 6);
    }
  });

  it('hex neighbors are at distance 1 and the center has 6', () => {
    for (let i = 0; i < 19; i++) {
      for (const n of hexNeighbors(i)) expect(axialDistance(t.hexes[i], t.hexes[n])).toBe(1);
    }
    const center = t.hexIndex['0,0'];
    expect(hexNeighbors(center)).toHaveLength(6);
    expect(hexToPixel({ q: 0, r: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('coastal edges belong to one hex and form a closed ring', () => {
    for (const e of t.coastalEdges) expect(t.edgeHexes[e]).toHaveLength(1);
    for (let i = 0; i < 30; i++) {
      const a = edgeVertices(t.coastalEdges[i]);
      const b = edgeVertices(t.coastalEdges[(i + 1) % 30]);
      expect(a.some((v) => b.includes(v))).toBe(true);
    }
  });

  it('rejects unknown layouts', () => {
    expect(() => getTopology('hexagon-9')).toThrow();
  });
});

describe('generator', () => {
  it('is deterministic for a seed', () => {
    expect(generateBoard('ash-moth-101')).toEqual(generateBoard('ash-moth-101'));
    expect(generateBoard('ash-moth-101')).not.toEqual(generateBoard('ash-moth-102'));
  });

  it.each(['balanced', 'random', 'beginner'] as const)('%s boards have correct counts', (mode) => {
    for (let i = 0; i < 25; i++) {
      const b = generateBoard(`seed-${i}`, mode);
      const counts: Record<string, number> = {};
      for (const h of b.hexes) counts[h.terrain] = (counts[h.terrain] ?? 0) + 1;
      expect(counts).toEqual(TERRAIN_COUNTS);
      const tokens = b.hexes.map((h) => h.token).filter((x): x is number => x !== null);
      expect(tokens.sort((x, y) => x - y)).toEqual([...NUMBER_TOKENS]);
      expect(b.hexes.find((h) => h.terrain === 'waste')!.token).toBeNull();
      expect(validateBoard(b).issues).toEqual([]);
    }
  });

  it('balanced boards never place 6/8 adjacent and avoid identical neighbors', () => {
    for (let i = 0; i < 100; i++) {
      const b = generateBoard(`bal-${i}`, 'balanced');
      expect(hasRedAdjacency(b.hexes)).toBe(false);
      expect(hasIdenticalAdjacency(b.hexes)).toBe(false);
    }
  });

  it('beginner layout is fixed regardless of seed', () => {
    expect(generateBoard('a', 'beginner').hexes).toEqual(generateBoard('b', 'beginner').hexes);
    expect(generateBoard('a', 'beginner').hexes[9].terrain).toBe('waste');
  });

  it('random mode is unconstrained (can produce red adjacency)', () => {
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      found = hasRedAdjacency(generateBoard(`r${i}`, 'random').hexes);
    }
    expect(found).toBe(true);
  });
});

describe('harbors', () => {
  it('9 harbors: 4 generic, one per resource, coastal, no shared vertices', () => {
    const t = getTopology();
    for (let i = 0; i < 30; i++) {
      const b = generateBoard(`h-${i}`);
      expect(b.harbors).toHaveLength(9);
      expect(b.harbors.filter((h) => h.kind === 'any')).toHaveLength(4);
      expect(new Set(b.harbors.filter((h) => h.kind !== 'any').map((h) => h.kind)).size).toBe(5);
      const vs = new Set<string>();
      for (const h of b.harbors) {
        expect(t.coastalEdges).toContain(h.edge);
        expect(h.vertices).toEqual(edgeVertices(h.edge));
        expect(t.hexEdges[h.hex]).toContain(h.edge);
        for (const v of h.vertices) {
          expect(vs.has(v)).toBe(false);
          vs.add(v);
        }
      }
    }
  });

  it('validator reports broken boards', () => {
    const b = generateBoard('v');
    const broken = {
      ...b,
      harbors: b.harbors.slice(0, 3),
      hexes: b.hexes.map((h) => ({ ...h, terrain: 'peaks' as const })),
    };
    const r = validateBoard(broken);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(2);
  });
});
