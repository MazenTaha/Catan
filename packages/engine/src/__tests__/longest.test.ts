import { describe, expect, it } from 'vitest';
import type { EdgeId, VertexId } from '../board/coords';
import { getTopology } from '../board/topology';
import { longestCausewayLength, updateLongestCauseway } from '../rules/longest-road';
import type { GameEvent, GameState } from '../state/types';
import { act, actEv, blankMain, edit, setHand } from './helpers';

const t = getTopology();

/** A simple (non-self-intersecting) path of `n` edges starting at vertex `start`. */
function path(start: VertexId, n: number, avoid: Set<VertexId> = new Set()): { edges: EdgeId[]; verts: VertexId[] } {
  const verts = [start];
  const edges: EdgeId[] = [];
  const seen = new Set([start, ...avoid]);
  const walk = (v: VertexId): boolean => {
    if (edges.length === n) return true;
    for (const e of t.vertexEdges[v]) {
      const [a, b] = t.edgeVertices[e];
      const w = a === v ? b : a;
      if (seen.has(w)) continue;
      seen.add(w);
      edges.push(e);
      verts.push(w);
      if (walk(w)) return true;
      edges.pop();
      verts.pop();
      seen.delete(w);
    }
    return false;
  };
  if (!walk(start)) throw new Error('no path');
  return { edges, verts };
}

const center = t.vertices.find((v) => t.vertexHexes[v].length === 3 && t.vertexNeighbors[v].length === 3)!;
const centerHex = t.hexIndex['0,0'];

function withRoads(s: GameState, owner: number, edges: EdgeId[]) {
  return edit(s, (d) => {
    for (const e of edges) d.causeways[e] = owner;
  });
}

describe('longestCausewayLength', () => {
  it('counts a straight trail', () => {
    const { edges } = path(center, 5);
    expect(longestCausewayLength(withRoads(blankMain(), 0, edges), 0)).toBe(5);
    expect(longestCausewayLength(withRoads(blankMain(), 0, edges), 1)).toBe(0);
  });

  it('counts a full cycle (hex ring) as 6, and ring + tail as 7', () => {
    const ring = t.hexEdges[centerHex];
    let s = withRoads(blankMain(), 0, ring);
    expect(longestCausewayLength(s, 0)).toBe(6);
    const v = t.hexVertices[centerHex][0];
    const tail = t.vertexEdges[v].find((e) => !ring.includes(e))!;
    s = withRoads(s, 0, [tail]);
    expect(longestCausewayLength(s, 0)).toBe(7);
  });

  it('takes the longest route through a branch', () => {
    // Y shape: arms of 3, 2 and 1 from a degree-3 vertex → longest = 3 + 2 = 5.
    const arms = t.vertexEdges[center];
    const lens = [3, 2, 1];
    const all: EdgeId[] = [];
    const used = new Set<VertexId>([center]);
    arms.forEach((e, i) => {
      const [a, b] = t.edgeVertices[e];
      const w = a === center ? b : a;
      used.add(w);
      const rest = lens[i] > 1 ? path(w, lens[i] - 1, used) : { edges: [], verts: [] };
      rest.verts.forEach((x) => used.add(x));
      all.push(e, ...rest.edges);
    });
    expect(longestCausewayLength(withRoads(blankMain(), 0, all), 0)).toBe(5);
  });

  it("is broken by an opponent's building but not by your own", () => {
    const { edges, verts } = path(center, 6);
    let s = withRoads(blankMain(), 0, edges);
    expect(longestCausewayLength(s, 0)).toBe(6);
    const own = edit(s, (d) => (d.buildings[verts[3]] = { owner: 0, kind: 'outpost' }));
    expect(longestCausewayLength(own, 0)).toBe(6);
    s = edit(s, (d) => (d.buildings[verts[2]] = { owner: 1, kind: 'outpost' }));
    expect(longestCausewayLength(s, 0)).toBe(4);
  });
});

describe('Longest Causeway award', () => {
  const update = (s: GameState) => {
    const ev: GameEvent[] = [];
    const d = edit(s, (x) => updateLongestCauseway(x, ev));
    return { s: d, ev };
  };
  const p0 = path(center, 7);
  const blocked = new Set(p0.verts.flatMap((v) => [v, ...t.vertexNeighbors[v]]));
  const otherStart = t.vertices.find((v) => !blocked.has(v) && t.vertexNeighbors[v].every((n) => !blocked.has(n)))!;
  const p1 = path(otherStart, 7, blocked);

  it('needs at least 5', () => {
    const r = update(withRoads(blankMain(), 0, p0.edges.slice(0, 4)));
    expect(r.s.longestCauseway.holder).toBeNull();
    const r5 = update(withRoads(blankMain(), 0, p0.edges.slice(0, 5)));
    expect(r5.s.longestCauseway.holder).toBe(0);
    expect(r5.ev).toEqual([{ type: 'LongestCausewayChanged', holder: 0, previous: null, length: 5 }]);
  });

  it('holder keeps it on a tie; strictly longer takes it', () => {
    let s = update(withRoads(blankMain(), 0, p0.edges.slice(0, 5))).s;
    s = update(withRoads(s, 1, p1.edges.slice(0, 5))).s;
    expect(s.longestCauseway.holder).toBe(0);
    s = update(withRoads(s, 1, p1.edges.slice(0, 6))).s;
    expect(s.longestCauseway.holder).toBe(1);
    expect(s.longestCauseway.lengths.slice(0, 2)).toEqual([5, 6]);
  });

  it('a tie with no holder awards nobody', () => {
    let s = withRoads(blankMain(), 0, p0.edges.slice(0, 5));
    s = withRoads(s, 1, p1.edges.slice(0, 5));
    expect(update(s).s.longestCauseway.holder).toBeNull();
  });

  it('when a broken holder drops behind, a single leader takes it, a tie leaves it unclaimed', () => {
    // Holder 0 with 7, broken down to 3; player 1 has 5 → player 1 takes it.
    let s = update(withRoads(withRoads(blankMain(), 0, p0.edges), 1, p1.edges.slice(0, 5))).s;
    expect(s.longestCauseway.holder).toBe(0);
    const broken = update(edit(s, (d) => (d.buildings[p0.verts[3]] = { owner: 2, kind: 'outpost' }))).s;
    expect(broken.longestCauseway.holder).toBe(1);

    // Same, but player 0's remainder (4 after a break at vertex 4) is below 5 and nobody else qualifies.
    s = update(withRoads(blankMain(), 0, p0.edges.slice(0, 6))).s;
    const lost = update(edit(s, (d) => (d.buildings[p0.verts[3]] = { owner: 2, kind: 'outpost' })));
    expect(lost.s.longestCauseway.holder).toBeNull();
    expect(lost.ev[0]).toMatchObject({ holder: null, previous: 0 });
  });

  it('is updated by real build actions (outposts can break trails)', () => {
    let s = withRoads(blankMain(), 1, p0.edges.slice(0, 5));
    s = edit(s, (d) => (d.buildings[p0.verts[0]] = { owner: 1, kind: 'outpost' }));
    s = update(s).s;
    expect(s.longestCauseway.holder).toBe(1);
    // Player 0 builds an outpost in the middle of player 1's trail via own causeway.
    const mid = [2, 3, 4].map((i) => p0.verts[i]).find((v) => t.vertexEdges[v].length === 3)!;
    const side = t.vertexEdges[mid].find((e) => !p0.edges.includes(e))!;
    s = edit(s, (d) => (d.causeways[side] = 0));
    s = setHand(s, 0, { wood: 1, clay: 1, wool: 1, grain: 1 });
    const out = actEv(s, { type: 'BuildOutpost', player: 0, vertex: mid });
    expect(out.state.longestCauseway.holder).toBeNull();
    expect(out.events.map((e) => e.type)).toContain('LongestCausewayChanged');
    // And causeway building claims it.
    let s2 = withRoads(blankMain(), 0, p0.edges.slice(0, 4));
    s2 = setHand(s2, 0, { wood: 1, clay: 1 });
    s2 = act(s2, { type: 'BuildCauseway', player: 0, edge: p0.edges[4] });
    expect(s2.longestCauseway.holder).toBe(0);
  });
});
