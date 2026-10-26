import { memo, type CSSProperties, type ReactElement } from 'react';
import { Rng, hashSeed, type Board, type Harbor, type HarborKind } from '@hexfall/engine';
import { WindmillSails, kilnChimney, windmillHub } from '../../art/terrain/TerrainArt';
import { ResGlyphSvg } from '../../art/pieces/Pieces';
import { RES_COLOR } from '../../art/icons/Icon';
import { mix } from '../../art/color';
import { HARBOR_NAME, RESOURCE_NAME } from '../../lexicon';
import {
  ISLAND_PATH,
  ISLAND_POINTS,
  VIEWBOX,
  VIEWBOX_STR,
  coastDistance,
  harborGeometry,
  hexCenter,
  onIsland,
  toPercent,
} from './geometry';

/**
 * Everything around and above the tiles: the sea, the board's edge and shore, the sunlight,
 * harbors with their boats, and the few small things that move. The sun stands low in the
 * upper left. Static parts are painted once. Moving parts animate only opacity/transform on
 * their own small layers, so they cost the compositor almost nothing and stop in Lite mode.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Faint silhouette line, used only where it helps a shape read at game size. */
const EDGE = 'rgba(20,16,10,0.5)';

// ------------------------------------------------------------------ sea

/**
 * Sparse wave crests on open water: a lit crest over a faint trough, never near the island,
 * the harbors (badges, docks, boats) or each other. `pad` keeps moving sets clear as they drift.
 */
function waveMarks(board: Board, key: string, count: number, pad: number) {
  const rng = new Rng(hashSeed(`${board.seed}:${key}`));
  const quiet = board.harbors.flatMap((hb) => {
    const d = dockLayout(hb);
    return [d.badge, { x: d.boat.x, y: d.boat.y - 18 }];
  });
  const out: { x: number; y: number; l: number; h: number; o: number }[] = [];
  for (let tries = 0; out.length < count && tries < 3000; tries++) {
    const x = VIEWBOX.x + 20 + rng.next() * (VIEWBOX.w - 40);
    const y = VIEWBOX.y + 20 + rng.next() * (VIEWBOX.h - 40);
    if (onIsland({ x, y }) || coastDistance({ x, y }) < 70) continue;
    if (quiet.some((q) => Math.hypot(q.x - x, q.y - y) < 80 + pad)) continue;
    if (out.some((w) => Math.hypot(w.x - x, (w.y - y) * 1.8) < 90)) continue;
    out.push({ x, y, l: 22 + rng.next() * 22, h: 2.6 + rng.next() * 1.6, o: 0.5 + rng.next() * 0.5 });
  }
  return out;
}

/** A set of crests as two paths (lit crest, shaded trough just below it). */
export function WaveCrests({ marks, strength = 1 }: { marks: ReturnType<typeof waveMarks>; strength?: number }) {
  const crest = marks
    .map((w) => `M${r1(w.x - w.l / 2)} ${r1(w.y)}c${r1(w.l * 0.3)} ${r1(-w.h)} ${r1(w.l * 0.7)} ${r1(-w.h)} ${r1(w.l)} 0`)
    .join('');
  const trough = marks
    .map((w) => `M${r1(w.x - w.l * 0.3)} ${r1(w.y + 2.6)}q${r1(w.l * 0.3)} ${r1(1.4)} ${r1(w.l * 0.6)} 0`)
    .join('');
  return (
    <g fill="none" strokeLinecap="round">
      <path d={trough} stroke="#0c4568" strokeOpacity={0.34 * strength} strokeWidth={1.3} />
      <path d={crest} stroke="#d9f1f4" strokeOpacity={0.42 * strength} strokeWidth={1.3} />
    </g>
  );
}

const sameSeed = (a: { board: Board }, b: { board: Board }) =>
  a.board.seed === b.board.seed && a.board.mode === b.board.mode;

/** Open water: clear blue, deepening away from the island, warmed a little under the sun. */
export const Sea = memo(function Sea({ board }: { board: Board }) {
  return (
    <g aria-hidden>
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sea)" />
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sunglow)" />
      <WaveCrests marks={waveMarks(board, 'sea-crests', 26, 0)} />
    </g>
  );
}, sameSeed);

/** Crests for one of the two drifting swell layers (moved by the wrapper's transform only). */
export const SwellCrests = memo(function SwellCrests({ board, set }: { board: Board; set: 0 | 1 }) {
  return (
    <svg viewBox={VIEWBOX_STR} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      <WaveCrests marks={waveMarks(board, `swell-${set}`, 9, 48)} strength={0.75} />
    </svg>
  );
}, (a, b) => sameSeed(a, b) && a.set === b.set);

// ------------------------------------------------------------------ shore and light

/** Short foam accents just off the beach, a couple per stretch of coast (not a glowing ring). */
const FOAM = (() => {
  const rng = new Rng(hashSeed('shore-foam'));
  const parts: string[] = [];
  const pts = ISLAND_POINTS;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    // outward: away from the island's centre
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const s = tx * my - ty * mx > 0 ? 1 : -1;
    const nx = -ty * s;
    const ny = tx * s;
    for (let k = 0; k < 2; k++) {
      const u = len * (0.18 + k * 0.42 + rng.next() * 0.22);
      const l = 8 + rng.next() * 12;
      const off = 18.5 + rng.next() * 3;
      const x0 = a.x + tx * (u - l / 2) + nx * off;
      const y0 = a.y + ty * (u - l / 2) + ny * off;
      parts.push(`M${r1(x0)} ${r1(y0)}q${r1(tx * l * 0.5 + nx * 1.4)} ${r1(ty * l * 0.5 + ny * 1.4)} ${r1(tx * l)} ${r1(ty * l)}`);
    }
  }
  return parts.join('');
})();

/**
 * Drawn under the tiles: a narrow shelf of shallows stepping from blue-green to clear
 * turquoise over the sand, the board's contact shadow in the water, foam accents, the raised
 * earthen edge and a slim beach. No blur: each step is a crisp, slightly narrower ring.
 */
export function Shore() {
  const ring = { d: ISLAND_PATH, fill: 'none', strokeLinejoin: 'round' as const };
  return (
    <g>
      {[
        { w: 68, c: '#1f7fa6', o: 0.45 },
        { w: 60, c: '#2590b0', o: 0.55 },
        { w: 52, c: '#35a5b6', o: 0.65 },
        { w: 45, c: '#55bbbb', o: 0.75 },
        { w: 39, c: '#86d0c2', o: 0.8 },
      ].map((r) => (
        <path key={r.w} {...ring} stroke={r.c} strokeWidth={r.w} opacity={r.o} />
      ))}
      {/* contact shadow: the board's edge sits in the water, light from the upper left */}
      <path {...ring} transform="translate(3 7)" stroke="#073047" strokeWidth={36} opacity={0.28} />
      <path {...ring} transform="translate(2 5)" stroke="#073047" strokeWidth={33} opacity={0.3} />
      <path d={FOAM} fill="none" stroke="#f2f8f2" strokeOpacity={0.6} strokeWidth={1.3} strokeLinecap="round" />
      {/* the board's edge: a band of earth showing under the beach, deepest at the bottom */}
      <path {...ring} transform="translate(0 6)" stroke="#2b2318" strokeWidth={31} />
      <path {...ring} stroke="#a8884f" strokeWidth={26} />
      <path {...ring} stroke="#dcc184" strokeWidth={21} />
      <path {...ring} stroke="#f0dca6" strokeWidth={13} />
      <path d={ISLAND_PATH} fill="#1a140b" />
    </g>
  );
}

/** Drawn over the tiles: one sunlight wash across the island, warm upper left, cool lower right. */
export function Sunlight() {
  return <path d={ISLAND_PATH} fill="url(#g-sunlight)" pointerEvents="none" />;
}

// ------------------------------------------------------------------ harbors

type P = { x: number; y: number };

/** The point `u` along the coast and `v` out to sea from `o`. */
const at = (o: P, t: P, n: P, u: number, v: number): P => ({ x: o.x + t.x * u + n.x * v, y: o.y + t.y * u + n.y * v });

/**
 * Deck sizes in board units (a tile side is 100): the stage's half length along the coast and
 * how far out its inner and outer edges lie, the ramps' width, where they start inland (under
 * the beach), and how far out the badge stands, clear of the timber.
 */
const STAGE = { half: 28, v0: 22, v1: 35 };
const RAMP_W = 10;
const SHORE_V = -5;
const BADGE_V = 68;

/** Clips the segment a→b to v0 ≤ v ≤ v1 (local coordinates); null when nothing is left. */
function clipV(a: P, b: P, v0: number, v1: number): [P, P] | null {
  let t0 = 0;
  let t1 = 1;
  const dv = b.y - a.y;
  for (const [lim, sign] of [
    [v0, 1],
    [v1, -1],
  ] as const) {
    // keep sign * (v - lim) >= 0
    const f0 = sign * (a.y - lim);
    const df = sign * dv;
    if (df === 0) {
      if (f0 < 0) return null;
    } else {
      const t = -f0 / df;
      if (df > 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t1 - t0 < 0.05) return null;
  const pt = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + dv * t });
  return [pt(t0), pt(t1)];
}

/** Whether `q` lies inside polygon `poly` or within `pad` of its edge. */
function nearPolygon(q: P, poly: P[], pad: number): boolean {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const c = poly[j];
    if (a.y > q.y !== c.y > q.y && q.x < ((c.x - a.x) * (q.y - a.y)) / (c.y - a.y) + a.x) inside = !inside;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const k = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(q.x - a.x - dx * k, q.y - a.y - dy * k));
  }
  return inside || best < pad;
}

/** Boat outline samples (bow right, waterline at 0), mirrored, for clearance tests. */
const BOAT_SAMPLES: P[] = [
  [24, -11],
  [16, 2],
  [0, 2.5],
  [21, -12],
  [14, -41],
  [2, -47],
  [20, -14],
].flatMap(([x, y]) => [
  { x, y },
  { x: -x, y },
]);

export interface DockLayout {
  /** The whole walkable deck, stage and both ramps, as one outline. */
  deck: P[];
  planks: string;
  seams: string;
  posts: P[];
  badge: P;
  cargo: P;
  boat: P & { flip: boolean; kind: number };
  line: [P, P];
}

/**
 * One timber dock per harbor, built from the edge's two coastal corners (the vertices the
 * harbor serves) and the coast's outward direction. Local coordinates: u along the coast from
 * the edge's midpoint, v out to sea. Two ramps run from just inside those corners out to a
 * stage parallel to the shore; each ramp's outer side ends exactly at a stage corner, so the
 * deck is a single outline (a Π with angled legs) with no overlapping boards. The badge
 * stands offshore, apart from the timber. The boat takes the nearest free berth beside an end
 * of the stage that clears the beach, badge, deck and board edge.
 */
export function dockLayout(hb: Harbor): DockLayout {
  const g = harborGeometry(hb);
  const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  const t = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L };
  const n = { x: g.nx, y: g.ny };
  const m = g.mid;
  const W = (u: number, v: number) => at(m, t, n, u, v);
  const { half: H, v0, v1 } = STAGE;

  // Each ramp leaves the shore 2 units inside its corner and meets the stage at its corner.
  // Its sides are parallel; measured along u they lie `du` either side of the centre line.
  const shoreU = L / 2 - 2;
  const rise = v0 - SHORE_V;
  const du = (RAMP_W / 2) * (Math.hypot(shoreU - H, rise) / rise);
  const outerShore = shoreU;
  const innerShore = shoreU - 2 * du;
  const innerJoin = H - 2 * du;
  const local: [number, number][] = [
    [-H, v1],
    [H, v1],
    [H, v0],
    [outerShore, SHORE_V],
    [innerShore, SHORE_V],
    [innerJoin, v0],
    [-innerJoin, v0],
    [-innerShore, SHORE_V],
    [-outerShore, SHORE_V],
    [-H, v0],
  ];
  const deck = local.map(([u, v]) => W(u, v));

  // Stage boards run out to sea; ramp boards run across each ramp, square to its direction,
  // and stop at the seam where the ramp meets the stage.
  const planks: string[] = [];
  const seg = (p: [P, P]) => {
    const [a, c] = p.map((q) => W(q.x, q.y));
    planks.push(`M${r1(a.x)} ${r1(a.y)}L${r1(c.x)} ${r1(c.y)}`);
  };
  for (let u = -H + 3.4; u < H - 1; u += 3.4) seg([{ x: u, y: v0 + 0.8 }, { x: u, y: v1 - 0.8 }]);
  const seams: string[] = [];
  for (const sd of [-1, 1]) {
    const from = { x: sd * (shoreU - du), y: SHORE_V };
    const to = { x: sd * (H - du), y: v0 };
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const dx = (to.x - from.x) / len;
    const dy = (to.y - from.y) / len;
    // square to the ramp, long enough to reach both sides, then clipped to the ramp's ends
    const half = RAMP_W / 2 - 0.7;
    for (let k = 1.5 - RAMP_W; k < len + RAMP_W; k += 3.2) {
      const cx = from.x + dx * k;
      const cy = from.y + dy * k;
      const c = clipV({ x: cx + dy * half, y: cy - dx * half }, { x: cx - dy * half, y: cy + dx * half }, SHORE_V + 0.6, v0 - 0.4);
      if (c) seg(c);
    }
    const a = W(sd * H, v0);
    const c = W(sd * innerJoin, v0);
    seams.push(`M${r1(a.x)} ${r1(a.y)}L${r1(c.x)} ${r1(c.y)}`);
  }

  // Posts at the stage's exposed corners and edges only: never in a ramp's opening.
  const posts = (
    [
      [-H - 1.3, v1 + 1.1],
      [H + 1.3, v1 + 1.1],
      [-H - 1.3, v0 - 0.2],
      [H + 1.3, v0 - 0.2],
      [0, v1 + 1.3],
      [0, v0 - 1.3],
    ] as [number, number][]
  ).map(([u, v]) => W(u, v));

  // The berth: the first spot (by distance from the stage end) where the whole boat is clear.
  const badge = W(0, BADGE_V);
  const prefer = hb.id % 2 ? 1 : -1;
  const ok = (c: P) =>
    BOAT_SAMPLES.every((sm) => {
      const q = { x: c.x + sm.x, y: c.y + sm.y };
      if (onIsland(q) || coastDistance(q) < 19) return false;
      if (Math.hypot(q.x - badge.x, q.y - badge.y) < 30) return false;
      if (nearPolygon(q, deck, 4)) return false;
      return q.x > VIEWBOX.x + 6 && q.x < VIEWBOX.x + VIEWBOX.w - 6 && q.y > VIEWBOX.y + 6 && q.y < VIEWBOX.y + VIEWBOX.h - 6;
    });
  let berth: { c: P; side: number } | null = null;
  let best = Infinity;
  for (const side of [prefer, -prefer])
    for (const u of [H + 24, H + 32, H + 40, H + 50, H + 60])
      for (const v of [30, 22, 40, 50, 60, 72]) {
        const c = W(side * u, v);
        const score = u - H + Math.abs(v - 30) * 0.8 + (side === prefer ? 0 : 12);
        if (score < best && ok(c)) {
          best = score;
          berth = { c, side };
        }
      }
  const side = berth?.side ?? prefer;
  const c = berth?.c ?? W(side * (H + 30), 70);
  const tie = W(side * (H + 1.3), v1 + 1.1);
  const flip = c.x < tie.x;
  return {
    deck,
    planks: planks.join(''),
    seams: seams.join(''),
    posts,
    badge,
    cargo: W(-side * (H - 7), (v0 + v1) / 2),
    // the bow points away from the stage; the line runs from the end post to the stern
    boat: { ...c, flip, kind: hb.id % 3 },
    line: [tie, { x: c.x + (flip ? 21 : -21), y: c.y - 7 }],
  };
}

const LIGHT = { x: -0.6, y: -0.8 };

/** The deck's outline as one edge beam, plus the stretches facing the sun as a highlight. */
function frame(poly: P[]) {
  // signed area gives the winding, so every edge's outward side is known (the deck is concave)
  let area = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  });
  const out = area > 0 ? 1 : -1;
  let lit = '';
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const nx = (b.y - a.y) * out;
    const ny = -(b.x - a.x) * out;
    if ((nx * LIGHT.x + ny * LIGHT.y) / Math.hypot(nx, ny) > 0.25) lit += `M${r1(a.x)} ${r1(a.y)}L${r1(b.x)} ${r1(b.y)}`;
  });
  return { all: `M${poly.map((p) => `${r1(p.x)} ${r1(p.y)}`).join('L')}Z`, lit };
}

const poly = (p: P[]) => p.map((q) => `${r1(q.x)},${r1(q.y)}`).join(' ');

/** Weathered timber: one deck over one soft contact shadow, planked by section, posted at its corners. */
function Dock({ d }: { d: DockLayout }) {
  const f = frame(d.deck);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <polygon points={poly(d.deck)} transform="translate(2 3.2)" fill="#05202c" opacity={0.36} />
      <polygon points={poly(d.deck)} fill="#9c774d" />
      <path d={d.planks} stroke="#5d4229" strokeOpacity={0.5} strokeWidth={0.7} />
      {/* where each ramp meets the stage: a faint joist line, not an outline */}
      <path d={d.seams} stroke="#5d4229" strokeOpacity={0.35} strokeWidth={0.9} />
      <path d={f.all} stroke="#45301d" strokeWidth={1.6} fill="none" />
      <path d={f.lit} stroke="#d9b583" strokeOpacity={0.75} strokeWidth={0.8} />
      {d.posts.map((p, i) => (
        <g key={i} transform={`translate(${r1(p.x)} ${r1(p.y)})`}>
          <circle r={2.3} fill="#3a281a" />
          <circle cx={-0.6} cy={-0.7} r={0.9} fill="#b89366" />
        </g>
      ))}
      {/* a barrel and a crate waiting on the stage */}
      <g transform={`translate(${r1(d.cargo.x)} ${r1(d.cargo.y)})`}>
        <rect x={-7.5} y={-3} width={6} height={6} rx={0.6} fill="#b0844f" stroke="#4a331e" strokeWidth={0.7} />
        <path d="M-7.2 -2.7L-1.8 2.7M-1.8 -2.7L-7.2 2.7" stroke="#6e4e2c" strokeWidth={0.6} />
        <circle cx={3} cy={0} r={3.2} fill="#7d5531" stroke="#3e2a18" strokeWidth={0.7} />
        <circle cx={3} cy={0} r={1.9} fill="none" stroke="#3e2a18" strokeWidth={0.5} opacity={0.7} />
        <circle cx={2.1} cy={-1} r={0.8} fill="#c39a6a" />
      </g>
    </g>
  );
}

/**
 * Medieval coastal traders, drawn bow to the right with the waterline at y = 0, seen a little
 * from above (the deck shows) and lit from the upper left. Three rigs: a cog with an
 * aftcastle and square sail, a fore-and-aft rig with boom and jib, a striped square sail.
 */
function Boat({ kind, flip }: { kind: number; flip: boolean }) {
  const square = kind !== 1;
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined} strokeLinejoin="round" strokeLinecap="round">
      {/* shadow on the water, a ripple at the bow and stern */}
      <ellipse cx={3} cy={2.6} rx={25} ry={3.6} fill="#05202c" opacity={0.3} />
      <path d="M22.5 1.2q3 -0.4 6.5 0.8M-23.5 1q-2.5 0.4 -5 -0.3" stroke="#eef7f4" strokeWidth={0.9} fill="none" opacity={0.6} />
      {/* hull: planked side, a darker lower strake, the deck seen from above, a lit gunwale */}
      <path d="M-22 -7Q-2 -4 23 -10Q21 -2 14 1.6L-14 1.6Q-21 -1 -22 -7Z" fill="#6e4b2d" stroke={EDGE} strokeWidth={0.7} />
      <path d="M-20.6 -2.6Q-2 0 19.6 -4.6Q17.5 -0.4 14 1.6L-14 1.6Q-19.2 0 -20.6 -2.6Z" fill="#4c321d" />
      <path d="M-21.4 -4.8Q-2 -2 21.6 -7.6" stroke="#3a2616" strokeWidth={0.6} fill="none" opacity={0.7} />
      <path d="M-22 -7Q-2 -11 23 -10Q-2 -4 -22 -7Z" fill="#b38c5d" />
      <path d="M-22 -7Q-2 -11 23 -10" stroke="#5a3d24" strokeWidth={0.8} fill="none" />
      <path d="M-22 -7Q-2 -4 23 -10" stroke="#d8b37f" strokeWidth={1} fill="none" />
      {kind === 0 && (
        <g>
          <path d="M-21.6 -7.1L-21.6 -13L-13 -12.3L-13 -6.4Z" fill="#7d5634" stroke={EDGE} strokeWidth={0.6} />
          <path d="M-21.6 -13L-19 -15L-10.4 -14.3L-13 -12.3Z" fill="#c29c6b" />
          <path d="M-21.6 -10.6L-13 -9.9" stroke="#4c321d" strokeWidth={0.5} />
        </g>
      )}
      {/* mast, stays and pennant */}
      <path d="M1 -8.5V-46" stroke="#3b2a1c" strokeWidth={1.5} />
      <path d="M1 -45L22.5 -10.2M1 -45L-21 -7.4" stroke="#3b2a1c" strokeWidth={0.45} opacity={0.55} fill="none" />
      <path d="M1 -46.4L9.5 -44.6L1 -42.8Z" fill={kind === 2 ? '#2f5f8a' : '#a8392a'} />
      {square ? (
        <g>
          <path d="M-11.5 -41Q-16 -27 -11 -15Q1 -12.6 13 -15Q17.4 -27 13.5 -40Q1 -42.4 -11.5 -41Z" fill="#efe6cf" stroke={EDGE} strokeWidth={0.6} />
          {kind === 2 && <path d="M-14 -31.6Q1 -29.6 15.9 -31.4L16 -26.6Q1 -24.6 -14.2 -26.8Z" fill="#a8392a" opacity={0.92} />}
          <path d="M5 -41.4Q11.4 -27 6.6 -13.7Q10 -14 13 -15Q17.4 -27 13.5 -40Q9 -41.2 5 -41.4Z" fill="#4a3a22" opacity={0.2} />
          <path d="M-8.8 -38Q-12.4 -27 -8.8 -17.4" stroke="#fffaf0" strokeWidth={1} opacity={0.7} fill="none" />
          <path d="M-12.6 -41.6L14.6 -40.4M-11 -15L13 -15" stroke="#3b2a1c" strokeWidth={1.1} />
        </g>
      ) : (
        <g>
          <path d="M1.8 -41Q12 -26 20.6 -11.6L2.2 -11.8Z" fill="#e4d9bd" stroke={EDGE} strokeWidth={0.55} />
          <path d="M0.2 -44.5Q-6 -28 -19.5 -14.6L0.2 -14.6Z" fill="#efe6cf" stroke={EDGE} strokeWidth={0.6} />
          <path d="M-19.5 -14.6L0.2 -14.6L0.2 -18Q-9 -17.6 -16.6 -17.4Z" fill="#4a3a22" opacity={0.16} />
          <path d="M-1.6 -40Q-5.6 -28 -14 -17.6" stroke="#fffaf0" strokeWidth={0.9} opacity={0.65} fill="none" />
          <path d="M1 -14.2L-21.5 -13.6" stroke="#3b2a1c" strokeWidth={1.3} />
        </g>
      )}
    </g>
  );
}

/** A harbor plaque: an ivory face in a timber ring, lettered in umber. */
function Plaque({ kind }: { kind: HarborKind }) {
  const any = kind === 'any';
  const umber = '#3b2f22';
  return (
    <g>
      <circle r={21} cx={2} cy={3} fill="#06120f" opacity={0.35} />
      <circle r={21} fill="url(#g-timber)" stroke={EDGE} strokeWidth={0.8} />
      <circle r={16.5} fill="url(#g-token)" />
      <circle r={16.5} fill="none" stroke="#8d7a55" strokeWidth={0.9} opacity={0.6} />
      <path d="M-10 -9Q-4 -14 4 -14" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <text y={any ? 2.5 : -1.5} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={any ? 12.5 : 11.5} fill={umber}>
        {any ? '3:1' : '2:1'}
      </text>
      {any ? (
        <text y={11.5} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={6} fill={umber} opacity={0.75} letterSpacing={0.6}>
          ANY
        </text>
      ) : (
        <g transform="translate(0 8.5)">
          <ResGlyphSvg res={kind} size={11} color={mix(RES_COLOR[kind], '#1a140c', 0.45)} />
        </g>
      )}
    </g>
  );
}

export const Harbors = memo(
  function Harbors({ board }: { board: Board }) {
    const docks = board.harbors.map((hb) => ({ hb, d: dockLayout(hb) }));
    return (
      <g>
        {docks.map(({ hb, d }) => (
          <Dock key={hb.id} d={d} />
        ))}
        {docks.map(({ hb, d }) => (
          <g key={hb.id}>
            <path
              d={`M${r1(d.line[0].x)} ${r1(d.line[0].y)}Q${r1((d.line[0].x + d.line[1].x) / 2)} ${r1((d.line[0].y + d.line[1].y) / 2 + 4)} ${r1(d.line[1].x)} ${r1(d.line[1].y)}`}
              stroke="#2e2014"
              strokeWidth={0.7}
              fill="none"
              opacity={0.75}
            />
            <g transform={`translate(${r1(d.boat.x)} ${r1(d.boat.y)})`}>
              <Boat kind={d.boat.kind} flip={d.boat.flip} />
            </g>
          </g>
        ))}
        {docks.map(({ hb, d }) => (
          <g key={hb.id} transform={`translate(${r1(d.badge.x)} ${r1(d.badge.y)}) scale(1.2)`}>
            <title>{`${HARBOR_NAME[hb.kind]} — ${hb.kind === 'any' ? '3:1 any resource' : `2:1 ${RESOURCE_NAME[hb.kind]}`}`}</title>
            <Plaque kind={hb.kind} />
          </g>
        ))}
      </g>
    );
  },
  (a, b) => a.board.seed === b.board.seed && a.board.mode === b.board.mode,
);

// ------------------------------------------------------------------ living details

const box = (x: number, y: number, w: number, h: number): CSSProperties => {
  const p = toPercent({ x: x - w / 2, y: y - h / 2 });
  return {
    left: p.left,
    top: p.top,
    width: `${(w / VIEWBOX.w) * 100}%`,
    height: `${(h / VIEWBOX.h) * 100}%`,
  };
};

const MOTE_GROUPS = 3;

/**
 * Turning windmill sails, kiln smoke, pollen drifting over woods and meadows, and cloud
 * shadows passing across the island. With `still`, only the sails are drawn (not moving).
 */
export const Ambient = memo(
  function Ambient({ board, still }: { board: Board; still: boolean }) {
    const mills: ReactElement[] = [];
    const smoke: ReactElement[] = [];
    const motes: { x: number; y: number }[][] = Array.from({ length: MOTE_GROUPS }, () => []);
    const rng = new Rng(hashSeed(`${board.seed}:ambient`));
    for (const h of board.hexes) {
      const c = hexCenter(h.id);
      const seed = `${board.seed}:${h.id}`;
      if (h.terrain === 'fields') {
        const hub = windmillHub(seed);
        mills.push(
          <div key={h.id} className="absolute" style={box(c.x + hub.x, c.y + hub.y, 56, 56)}>
            <svg
              viewBox="-28 -28 56 56"
              className={`h-full w-full overflow-visible ${still ? '' : 'anim-spin'}`}
              style={{ animationDelay: `${-rng.next() * 12}s` }}
            >
              <WindmillSails />
            </svg>
          </div>,
        );
      }
      if (!still && h.terrain === 'ashen') {
        const k = kilnChimney(seed);
        smoke.push(
          <div key={h.id} className="absolute" style={box(c.x + k.x, c.y + k.y - 22, 26, 48)}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="smoke-puff"
                style={{ animationDelay: `${i * 1.4 + rng.next() * 0.5}s` }}
              />
            ))}
          </div>,
        );
      }
      if (!still && (h.terrain === 'witchwood' || h.terrain === 'moors')) {
        for (let i = 0; i < 3; i++) {
          const a = rng.next() * Math.PI * 2;
          const r = 38 + rng.next() * 40;
          motes[i % MOTE_GROUPS].push({
            x: c.x + Math.cos(a) * r,
            y: c.y + Math.sin(a) * r * 0.9,
          });
        }
      }
    }
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {!still && (
          <div className="anim-clouds absolute inset-0">
            <svg viewBox={VIEWBOX_STR} className="h-full w-full overflow-visible">
              <ellipse cx={-300} cy={-150} rx={260} ry={120} fill="url(#g-cloudshadow)" />
              <ellipse cx={180} cy={220} rx={300} ry={130} fill="url(#g-cloudshadow)" />
              <ellipse cx={420} cy={-330} rx={200} ry={90} fill="url(#g-cloudshadow)" />
            </svg>
          </div>
        )}
        {mills}
        {smoke}
        {motes.map((group, gi) => (
          <svg
            key={gi}
            viewBox={VIEWBOX_STR}
            className={`absolute inset-0 h-full w-full anim-firefly-${gi}`}
          >
            {group.map((f, i) => (
              <g key={i} transform={`translate(${r1(f.x)} ${r1(f.y)})`}>
                <circle r={5} fill="url(#g-mote)" />
                <circle r={1.1} fill="#fff8e0" />
              </g>
            ))}
          </svg>
        ))}
      </div>
    );
  },
  (a, b) => a.board.seed === b.board.seed && a.board.mode === b.board.mode && a.still === b.still,
);
