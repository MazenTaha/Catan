import { memo, type ReactElement } from 'react';
import { hashSeed, type Terrain } from '@hexfall/engine';
import { ART_MANIFEST } from '../manifest';
import { Jit, Use, blob, blobPts, r1, smoothClosed, smoothOpen } from './flora';

/**
 * Painted terrain for each hex, drawn in a hex-local box (center 0,0, circumradius 100,
 * pointy-top) and clipped to the hex by the caller. The look is a sunlit miniature landscape:
 * a large, clear silhouette first (canopy masses, field plots, clay banks, crags, dunes),
 * material detail second, all lit from the upper left with warm highlights and cool shade.
 * Small repeated things (trees, rocks, sheep, flowers) come from the shared kit in `flora.tsx`.
 * Each tile is composed from its own seed (`board seed : hex id`), never from the game's RNG,
 * and keeps the middle (under the number token) and its edges calm.
 * A raster override in `ART_MANIFEST.terrain[type]` replaces the procedural art.
 */

type Pt = [number, number];

const SQ3 = Math.sqrt(3);
/** Inside the hex, `m` units in from its edges. */
const inHex = (x: number, y: number, m = 0) =>
  Math.abs(x) <= 86.6 - m && Math.abs(y) <= 100 - m * 1.16 - Math.abs(x) / SQ3;
/** Clear of the number token in the middle of the tile. */
const offToken = (x: number, y: number, r = 34) => Math.hypot(x, y - 6) > r;

/** Seeded scatter with a minimum spacing; `ok` filters candidate spots. */
function scatter(J: Jit, n: number, minD: number, ok: (x: number, y: number) => boolean, near?: Pt[], spread = 30): Pt[] {
  const out: Pt[] = [];
  for (let t = 0; t < n * 40 && out.length < n; t++) {
    let x: number;
    let y: number;
    if (near && near.length && J.n() < 0.8) {
      const c = J.pick(near);
      x = c[0] + J.j(spread);
      y = c[1] + J.j(spread * 0.8);
    } else {
      x = J.j(86);
      y = J.j(98);
    }
    if (!ok(x, y)) continue;
    if (out.some(([px, py]) => Math.hypot(px - x, (py - y) * 1.25) < minD)) continue;
    out.push([x, y]);
  }
  return out;
}

/** A line across the tile through `y0`, gently waved. */
function band(J: Jit, y0: number, amp: number, step = 22): Pt[] {
  const ph = J.n() * 6;
  const pts: Pt[] = [];
  for (let x = -118; x <= 118; x += step) pts.push([x, y0 + Math.sin(x / 38 + ph) * amp + J.j(amp * 0.3)]);
  return pts;
}

const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;

const Base = ({ id }: { id: string }) => <rect x={-100} y={-110} width={200} height={220} fill={`url(#${id})`} />;

/** A soft, calm patch under the number token. */
const TokenBed = ({ J, fill, o }: { J: Jit; fill: string; o: number }) => (
  <path d={blob(J, 0, 8, 34, 26, 10, 0.12)} fill={fill} opacity={o} />
);

/** Landmarks the ambient layer animates (windmill sails, kiln smoke). They come from their own
 * seeded stream so the tile art and the animated overlay always agree on where they stand. */
export function windmillHub(seed: string): { x: number; y: number; side: number } {
  const J = new Jit(`${seed}:mill`);
  const side = J.pick([-1, 1]);
  return { x: side * 44, y: r1(-54 + J.j(4)), side };
}

export function kilnChimney(seed: string): { x: number; y: number; side: number } {
  const J = new Jit(`${seed}:kiln`);
  const side = J.pick([-1, 1]);
  const y = r1(52 + J.j(4));
  return { x: side * 44 + 8.5, y: y - 24, side };
}

/** Four timber-framed canvas sails around a hub at 0,0 (drawn by the ambient layer so they can turn). */
export function WindmillSails() {
  return (
    <g strokeLinejoin="round">
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a + 12})`}>
          <path d="M0 0V-25" stroke="#4a3a2a" strokeWidth={1.7} />
          <path d="M1 -24H7.5V-5H1Z" fill="#e9dfc6" stroke="rgba(40,32,22,0.55)" strokeWidth={0.7} />
          <path d="M4.2 -24V-5" stroke="#c8bb9c" strokeWidth={0.6} />
          <path d="M1 -18H7.5M1 -11.5H7.5" stroke="#8a7656" strokeWidth={0.5} opacity={0.7} />
        </g>
      ))}
      <circle r={2.6} fill="#3d3226" />
      <circle r={1} cx={-0.6} cy={-0.6} fill="#8a7656" />
    </g>
  );
}

// ------------------------------------------------------------------ forest (lumber)

function Forest({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const ca = J.n() * Math.PI * 2;
  const clearing: Pt = [Math.cos(ca) * 50, Math.sin(ca) * 46 + 6];
  const clusters: Pt[] = [0, 1, 2].map((i) => {
    const a = ca + Math.PI * (0.55 + i * 0.45) + J.j(0.3);
    return [Math.cos(a) * 54, Math.sin(a) * 52];
  });
  const firCluster = J.int(3);
  const trees = scatter(
    J,
    34,
    12.5,
    (x, y) => inHex(x, y - 12, 9) && offToken(x, y - 10, 40) && Math.hypot(x - clearing[0], y - clearing[1]) > 21,
    clusters,
    34,
  )
    .map(([x, y]) => {
      const near = clusters.reduce((b, c, i) => (Math.hypot(c[0] - x, c[1] - y) < Math.hypot(clusters[b][0] - x, clusters[b][1] - y) ? i : b), 0);
      const fir = J.n() < (near === firCluster ? 0.75 : 0.18);
      return { x, y, fir, k: J.int(fir ? 4 : 6), s: J.between(0.9, 1.12) + (y + 100) * 0.0012 };
    })
    .sort((a, b) => a.y - b.y);
  return (
    <g>
      <Base id="g-forest" />
      {/* forest floor: moss, fern and leaf litter */}
      {[...Array(6)].map((_, i) => (
        <path
          key={i}
          d={blob(J, J.j(70), J.j(80), J.between(16, 30), J.between(9, 16), 9, 0.25)}
          fill={i % 2 ? '#2a4324' : '#5d7b3c'}
          opacity={i % 2 ? 0.45 : 0.35}
        />
      ))}
      <TokenBed J={J} fill="#4f6d34" o={0.55} />
      {/* a sunlit clearing */}
      <path d={blob(J, clearing[0], clearing[1], 17, 11, 9, 0.2)} fill="#7f8f46" opacity={0.75} />
      <path d={blob(J, clearing[0] - 3, clearing[1] - 2, 10, 6, 8, 0.2)} fill="#c9bf74" opacity={0.3} />
      <Use id="fl-stump" x={clearing[0] + 3} y={clearing[1] + 3} />
      <Use id="fl-flw-daisy" x={clearing[0] - 8} y={clearing[1] - 1} s={0.8} />
      {trees.map((t, i) => (
        <Use key={i} id={t.fir ? `fl-fir-${t.k}` : `fl-oak-${t.k}`} x={t.x} y={t.y} s={t.s} />
      ))}
      {/* dappled light through the canopy */}
      {[...Array(5)].map((_, i) => {
        const [x, y] = J.pick(trees.length ? trees.map((t) => [t.x, t.y] as Pt) : [[0, 0] as Pt]);
        return <ellipse key={`sun${i}`} cx={r1(x - 5)} cy={r1(y - 21)} rx={5} ry={2.6} fill="#f2df92" opacity={0.18} />;
      })}
    </g>
  );
}

// ------------------------------------------------------------------ hills (brick)

function Hills({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const kiln = kilnChimney(seed);
  const side = kiln.side;
  const banks = [0, 1, 2].map((i) => {
    const y0 = -52 + i * 44 + J.j(5);
    const cx = J.j(50);
    const crest = band(J, y0, 5).map(([x, y]) => [x, y - 16 * Math.exp(-(((x - cx) / 46) ** 2))] as Pt);
    return { crest, cx };
  });
  const FILL = ['#b97a52', '#a9643f', '#985535'];
  const pit = { x: -side * 40, y: -34 + J.j(6) };
  const pitPts = blobPts(J, pit.x, pit.y, 19, 9, 10, 0.16);
  return (
    <g>
      <Base id="g-hills" />
      {banks.map(({ crest, cx }, i) => (
        <g key={i}>
          <path d={`${smoothOpen(crest)}L118 120L-118 120Z`} fill={FILL[i]} />
          {/* cool shade on the flank turned away from the sun */}
          <path
            d={`${smoothOpen(crest.filter(([x]) => x >= cx - 4))}L118 ${r1(crest[crest.length - 1][1] + 26)}Q${r1(cx + 40)} ${r1(crest[0][1] + 18)} ${r1(cx - 2)} ${r1(crest[0][1] + 10)}Z`}
            fill="#4a2a22"
            opacity={0.22}
          />
          {/* soil strata following the slope */}
          <path
            d={[9, 17, 26].map((dy) => smoothOpen(crest.map(([x, y]) => [x, y + dy + Math.sin(x / 20 + i) * 1.5] as Pt))).join('')}
            stroke={i % 2 ? '#c88a60' : '#7f4329'}
            strokeWidth={1}
            fill="none"
            opacity={0.3}
          />
          {/* sunlit crest */}
          <path d={smoothOpen(crest)} stroke="#e3aa7c" strokeWidth={2.4} fill="none" opacity={0.8} strokeLinecap="round" />
          <path d={smoothOpen(crest.map(([x, y]) => [x, y + 3] as Pt))} stroke="#6e3825" strokeWidth={1} fill="none" opacity={0.3} />
          {crest
            .filter((_, j) => j % 3 === i % 3)
            .map(([x, y], j) =>
              inHex(x, y, 10) && offToken(x, y, 34) ? <Use key={j} id={`fl-tuft-${j % 2}`} x={x} y={y + 1} o={0.75} /> : null,
            )}
        </g>
      ))}
      {/* a clay bank cut into the middle slope: a sunlit vertical face with strata */}
      {(() => {
        const [x0, y0] = banks[1].crest[side > 0 ? 2 : 8];
        if (!inHex(x0, y0, 14) || !offToken(x0, y0, 40)) return null;
        return (
          <g transform={`translate(${r1(x0)} ${r1(y0 + 2)})`}>
            <path d="M-12 0Q0 -3 12 -1L13 8Q0 6 -11 9Z" fill="#7a3e27" />
            <path d="M-12 0Q0 -3 12 -1L12.4 2Q0 0 -11.6 3Z" fill="#c9845a" />
            <path d="M-11 5Q0 3 12.6 4.4" stroke="#a65f3d" strokeWidth={0.8} fill="none" />
            <path d="M-12 0Q0 -3 12 -1" stroke="#e7b48a" strokeWidth={1.1} fill="none" />
          </g>
        );
      })()}
      <TokenBed J={J} fill="#c58a62" o={0.4} />
      {/* clay cut: a dug pit, its lower-right wall in sun, the far wall in shade */}
      <g>
        <path d={smoothClosed(pitPts)} fill="#5c3022" />
        <path d={blob(J, pit.x + 3, pit.y + 2.5, 15, 6, 9, 0.14)} fill="#b56d48" />
        <path d={blob(J, pit.x - 1.5, pit.y - 1.2, 14, 5.2, 9, 0.14)} fill="#6b3826" />
        <path d={blob(J, pit.x - 2, pit.y + 0.5, 7, 2.4, 7, 0.2)} fill="#7f4a36" />
        <path d={smoothOpen(pitPts.slice(3, 9))} stroke="#dba27c" strokeWidth={1.3} fill="none" opacity={0.85} />
        <path d={`M${r1(pit.x + 6)} ${r1(pit.y + 5)}h9M${r1(pit.x + 4)} ${r1(pit.y + 7)}h8`} stroke="#8f4f33" strokeWidth={0.8} />
      </g>
      {/* exposed rock along the crests */}
      {scatter(J, 5, 16, (x, y) => inHex(x, y, 12) && offToken(x, y, 38) && Math.hypot(x - pit.x, y - pit.y) > 26 && Math.hypot(x - (kiln.x - 8), y - (kiln.y + 30)) > 26).map(
        ([x, y], i) => (
          <Use key={`r${i}`} id={`fl-rock-${i % 2 ? 'clay' : 'ochre'}-${i % 3}`} x={x} y={y} s={J.between(0.9, 1.3)} />
        ),
      )}
      {scatter(J, 5, 14, (x, y) => inHex(x, y, 10) && offToken(x, y, 36) && Math.hypot(x - pit.x, y - pit.y) > 24).map(([x, y], i) => (
        <Use key={`s${i}`} id={`fl-scrub-${i % 3}`} x={x} y={y} s={J.between(0.75, 1)} />
      ))}
      {/* brick kiln, its chimney top exactly where the ambient layer puffs smoke */}
      <g transform={`translate(${r1(kiln.x - 8.5)} ${r1(kiln.y + 24)})`} strokeLinejoin="round">
        <ellipse cx={5} cy={10.5} rx={17} ry={4} fill="#2a160f" opacity={0.3} />
        <rect x={6} y={-24} width={5} height={11} fill="#7d4430" />
        <rect x={6} y={-24} width={2} height={11} fill="#a7634a" />
        <path d="M-13 10V0Q-13 -14 0 -14Q13 -14 13 0V10Z" fill="#8a4c35" stroke="rgba(30,16,10,0.5)" strokeWidth={0.8} />
        <path d="M-13 10V0Q-13 -14 0 -14Q-6 -10 -6 0V10Z" fill="#b06d4c" />
        <path d="M-10 -3H10M-12 3H12M-6 -9H8" stroke="#6b3726" strokeWidth={0.6} opacity={0.6} />
        <path d="M-4.5 10V4Q-4.5 0 0 0Q4.5 0 4.5 4V10Z" fill="#2b1912" />
        <path d="M-2.6 10V5.4Q-2.6 3 0 3Q2.6 3 2.6 5.4V10Z" fill="#d7793e" opacity={0.8} />
      </g>
      {/* one neat stack of drying bricks beside the kiln */}
      <g transform={`translate(${r1(kiln.x - 8.5 - side * 24)} ${r1(kiln.y + 34)})`}>
        <ellipse cx={3} cy={1} rx={10} ry={2.4} fill="#2a160f" opacity={0.28} />
        {[
          [-6, 0],
          [0, 0],
          [6, 0],
          [-3, -3.4],
          [3, -3.4],
        ].map(([x, y], i) => (
          <g key={i}>
            <rect x={x - 3} y={y - 3.2} width={6} height={3.2} fill="#a65a3c" />
            <rect x={x - 3} y={y - 3.2} width={6} height={1} fill="#cf8a64" />
          </g>
        ))}
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ pasture (wool)

function Pasture({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const tilt = J.j(18);
  const wallSide = J.pick([-1, 1]);
  const hasPond = J.n() < 0.55;
  const pond: Pt = [-wallSide * J.between(40, 50), J.j(14)];
  const hasTree = J.n() < 0.65;
  const tree: Pt = [J.pick([-1, 1]) * J.between(44, 56), wallSide * -J.between(34, 50)];
  const fa = J.n() * Math.PI * 2;
  const flock: Pt = [Math.cos(fa) * 50, Math.sin(fa) * 50 + 4];
  const wall = band(J, wallSide * 66, 6, 24);
  const clear = (x: number, y: number) =>
    (!hasPond || Math.hypot(x - pond[0], y - pond[1]) > 22) && (!hasTree || Math.hypot(x - tree[0], y - tree[1] + 8) > 18);
  const sheep = scatter(J, 3 + J.int(3), 9, (x, y) => inHex(x, y, 12) && offToken(x, y, 34) && clear(x, y) && Math.abs(y - wallSide * 66) > 10, [flock], 16);
  const flowerKinds = ['daisy', 'daisy', 'buttercup', 'poppy'] as const;
  return (
    <g>
      <Base id="g-pasture" />
      {/* the meadow's gentle contours */}
      <g transform={`rotate(${r1(tilt)})`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={smoothOpen(band(J, -84 + i * 42 + J.j(6), 7))}
            stroke={i % 2 ? '#456f2e' : '#a3bd66'}
            strokeWidth={22}
            opacity={i % 2 ? 0.22 : 0.26}
            fill="none"
          />
        ))}
      </g>
      {[...Array(5)].map((_, i) => (
        <path key={i} d={blob(J, J.j(70), J.j(80), J.between(10, 20), J.between(6, 10), 8, 0.25)} fill={i % 2 ? '#3f662b' : '#b2c878'} opacity={0.22} />
      ))}
      <TokenBed J={J} fill="#9dbb62" o={0.3} />
      {/* a dry-stone wall across one side */}
      <g fill="none" strokeLinecap="round">
        <path d={smoothOpen(wall)} transform="translate(1.4 2)" stroke="#23331d" strokeWidth={4.6} opacity={0.35} />
        <path d={smoothOpen(wall)} stroke="#9f9886" strokeWidth={3.8} />
        <path d={smoothOpen(wall)} stroke="#d6cfbd" strokeWidth={1.4} transform="translate(-0.3 -0.9)" strokeDasharray="3 1.5" />
        <path d={smoothOpen(wall)} stroke="#6c6759" strokeWidth={3.8} strokeDasharray="0.6 3.6" />
      </g>
      {hasPond && (
        <g>
          <path d={blob(J, pond[0], pond[1], 17, 9.5, 10, 0.12)} fill="#4a6b2e" />
          <path d={blob(J, pond[0], pond[1] + 0.5, 14.5, 7.6, 10, 0.12)} fill="#56807e" />
          <path d={blob(J, pond[0] + 2.5, pond[1] + 1.8, 9, 4.2, 8, 0.15)} fill="#3f6669" />
          <path d={`M${r1(pond[0] - 9)} ${r1(pond[1] - 2.5)}q5 -2.6 11 -1.6`} stroke="#d8e6d6" strokeWidth={1.1} fill="none" opacity={0.6} strokeLinecap="round" />
          <Use id="fl-reeds" x={pond[0] - 13} y={pond[1] + 3} />
          <Use id="fl-reeds" x={pond[0] + 12} y={pond[1] - 3} s={0.8} />
        </g>
      )}
      {scatter(J, 9, 14, (x, y) => inHex(x, y, 6) && offToken(x, y, 30) && clear(x, y)).map(([x, y], i) => (
        <Use key={`t${i}`} id={`fl-tuft-${i % 2}`} x={x} y={y} s={J.between(0.9, 1.2)} />
      ))}
      {scatter(J, 2 + J.int(2), 26, (x, y) => inHex(x, y, 12) && offToken(x, y, 36) && clear(x, y)).map(([x, y], i) => (
        <Use key={`f${i}`} id={`fl-flw-${J.n() < 0.22 ? 'lavender' : J.pick(flowerKinds)}`} x={x} y={y} s={J.between(0.9, 1.15)} />
      ))}
      {hasTree && <Use id={`fl-oak-${J.int(6)}`} x={tree[0]} y={tree[1]} s={1.3} />}
      {sheep.map(([x, y], i) => (
        <Use key={`s${i}`} id={J.n() < 0.5 ? 'fl-sheep-l' : 'fl-sheep-r'} x={x} y={y} s={1.15} />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ fields (grain)

const PLOTS = [
  { fill: '#d2a84c', furrow: '#9d7429', crop: '#efd690', ripe: true }, // ripe wheat
  { fill: '#c18e3a', furrow: '#8a6224', crop: '#e3bd6c', ripe: true }, // deep gold
  { fill: '#d9c58b', furrow: '#ae955a', crop: '#f0e3ba', ripe: false }, // harvested stubble
  { fill: '#9a9c4c', furrow: '#6c7234', crop: '#b9bb72', ripe: false }, // young barley
];

function Fields({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const uid = hashSeed(seed).toString(36);
  const px = J.pick([-1, 1]) * J.between(14, 30);
  const k1 = J.j(0.22);
  const ph = J.n() * 6;
  const L1: Pt[] = [];
  for (let y = -118; y <= 118; y += 14) L1.push([px + y * k1 + Math.sin(y / 34 + ph) * 5, y]);
  // the larger side of L1 is split again by a second, roughly horizontal boundary
  const big = px > 0 ? -1 : 1;
  const L2 = band(J, J.pick([-1, 1]) * J.between(18, 34), 4, 20);
  const sideA = `M${L1.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}L${-big * 130} 118L${-big * 130} -118Z`;
  const sideB = `M${L1.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}L${big * 130} 118L${big * 130} -118Z`;
  const above = `${smoothOpen(L2)}L118 -130L-118 -130Z`;
  const below = `${smoothOpen(L2)}L118 130L-118 130Z`;
  const order = PLOTS.slice(0, 3);
  for (let i = order.length - 1; i > 0; i--) {
    const j = J.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (J.n() < 0.3) order[J.int(3)] = PLOTS[3];
  const angles = [J.between(-30, 30), J.between(60, 120), J.between(-20, 20)];
  // Furrows are one path per plot (and one for the sunlit crop ridges), not one per line.
  const furrows = (p: (typeof PLOTS)[number], angle: number) => {
    const lines = [...Array(40)].map((_, i) => {
      const y = -130 + i * 6.6;
      return `M-140 ${r1(y)}Q0 ${r1(y - 7)} 140 ${r1(y)}`;
    });
    return (
      <g transform={`rotate(${r1(angle)})`}>
        <rect x={-140} y={-140} width={280} height={280} fill={p.fill} />
        <path d={lines.join('')} stroke={p.furrow} strokeWidth={1.1} opacity={0.42} fill="none" />
        {p.ripe && (
          <path d={lines.filter((_, i) => i % 2 === 0).join('')} transform="translate(0 -2.4)" stroke={p.crop} strokeWidth={1.6} opacity={0.4} fill="none" />
        )}
      </g>
    );
  };
  const stubble = order.findIndex((p) => !p.ripe);
  const regions = [`fa${uid}`, `fb${uid}`, `fu${uid}`, `fd${uid}`];
  const stookArea = stubble === 0 ? 'a' : stubble === 1 ? 'u' : 'd';
  const mill = windmillHub(seed);
  const stooks = scatter(J, 4 + J.int(3), 10, (x, y) => {
    if (!inHex(x, y, 12) || !offToken(x, y, 36) || Math.hypot(x - mill.x, y - mill.y - 18) < 20) return false;
    const l1x = px + y * k1 + Math.sin(y / 34 + ph) * 5;
    const onA = Math.sign(x - l1x) === -big;
    if (stookArea === 'a') return onA;
    if (onA) return false;
    const l2y = L2.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b))[1];
    return stookArea === 'u' ? y < l2y - 6 : y > l2y + 6;
  });
  return (
    <g>
      <defs>
        <clipPath id={regions[0]}>
          <path d={sideA} />
        </clipPath>
        <clipPath id={regions[1]}>
          <path d={sideB} />
        </clipPath>
        <clipPath id={regions[2]}>
          <path d={above} />
        </clipPath>
        <clipPath id={regions[3]}>
          <path d={below} />
        </clipPath>
      </defs>
      <Base id="g-fields" />
      <g clipPath={`url(#${regions[0]})`}>{furrows(order[0], angles[0])}</g>
      <g clipPath={`url(#${regions[1]})`}>
        <g clipPath={`url(#${regions[2]})`}>{furrows(order[1], angles[1])}</g>
        <g clipPath={`url(#${regions[3]})`}>{furrows(order[2], angles[2])}</g>
      </g>
      {/* hedgerows between the plots */}
      <g fill="none" strokeLinecap="round">
        <path d={smoothOpen(L1)} stroke="#1f2c15" strokeWidth={6.5} opacity={0.3} transform="translate(1.5 2)" />
        <path d={smoothOpen(L1)} stroke="#3c5127" strokeWidth={5.5} strokeDasharray="0.1 4.4" />
        <path d={smoothOpen(L1)} stroke="#73903f" strokeWidth={3} strokeDasharray="0.1 4.4" transform="translate(-0.7 -0.9)" />
        <g clipPath={`url(#${regions[1]})`}>
          <path d={smoothOpen(L2)} stroke="#1f2c15" strokeWidth={6} opacity={0.3} transform="translate(1.5 2)" />
          <path d={smoothOpen(L2)} stroke="#3c5127" strokeWidth={5} strokeDasharray="0.1 4.4" />
          <path d={smoothOpen(L2)} stroke="#73903f" strokeWidth={2.8} strokeDasharray="0.1 4.4" transform="translate(-0.7 -0.9)" />
        </g>
      </g>
      {[0.2, 0.75].map((t, i) => {
        const [x, y] = L1[Math.floor(t * (L1.length - 1))];
        return inHex(x, y, 14) && offToken(x, y, 40) ? <Use key={`h${i}`} id={`fl-oak-${(i + J.int(6)) % 6}`} x={x} y={y + 4} s={0.85} /> : null;
      })}
      {stooks.map(([x, y], i) => (
        <Use key={`k${i}`} id="fl-stook" x={x} y={y} s={J.between(0.95, 1.15)} />
      ))}
      {(() => {
        const [x, y] = L1[Math.floor(L1.length * 0.62)];
        return inHex(x + 6, y, 14) && offToken(x + 6, y, 38) ? <Use id="fl-flw-poppy" x={x + 7} y={y} /> : null;
      })()}
      {/* stone tower mill (its sails turn in the ambient layer, centred on the hub) */}
      <g transform={`translate(${r1(mill.x)} ${r1(mill.y)})`} strokeLinejoin="round">
        <ellipse cx={6} cy={26.5} rx={13} ry={3.4} fill="#3a2a12" opacity={0.3} />
        <path d="M-8 26L-5.5 1H5.5L8 26Z" fill="#cfc4aa" stroke="rgba(40,32,20,0.45)" strokeWidth={0.8} />
        <path d="M-8 26L-5.5 1H-1L-2 26Z" fill="#ebe2cb" />
        <path d="M3 26L3.5 1H5.5L8 26Z" fill="#a39780" />
        <path d="M-7 13H7M-7.6 20H7.6" stroke="#9c9077" strokeWidth={0.6} opacity={0.7} />
        <path d="M-8 2.5Q-6 -8 0 -9.5Q6 -8 8 2.5Z" fill="#7d6b4a" stroke="rgba(40,32,20,0.5)" strokeWidth={0.8} />
        <path d="M-8 2.5Q-6 -8 0 -9.5Q-3 -6 -3.4 2.5Z" fill="#a8925f" />
        <path d="M-2.2 26V20.5Q-2.2 18.4 0 18.4Q2.2 18.4 2.2 20.5V26Z" fill="#3b2c1e" />
        <rect x={-1.4} y={8.5} width={2.8} height={3.4} rx={1.2} fill="#3b2c1e" />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ mountains (ore)

interface Peak {
  x: number;
  top: number;
  base: number;
  w: number;
}

function peak(p: Peak, J: Jit, k: number) {
  const h = p.base - p.top;
  // jagged flanks: shoulders and notches alternate down each side
  const N = 6;
  const left: Pt[] = [...Array(N)].map((_, i) => {
    const t = (i + 1) / N;
    const notch = i % 2 ? 0.9 : 1.05;
    return i === N - 1 ? ([p.x - p.w, p.base] as Pt) : ([p.x - p.w * t * notch + J.j(1.5), p.top + h * t ** 1.1 + J.j(2)] as Pt);
  });
  const right: Pt[] = [...Array(N)]
    .map((_, i) => {
      const t = (i + 1) / N;
      const notch = i % 2 ? 1.06 : 0.9;
      return i === N - 1 ? ([p.x + p.w * 0.95, p.base + 3] as Pt) : ([p.x + p.w * 0.95 * t * notch + J.j(1.5), p.top + h * t ** 0.95 + J.j(2)] as Pt);
    })
    .reverse();
  const apex: Pt = [p.x, p.top];
  const ridge: Pt[] = [apex, [p.x + p.w * 0.06 + J.j(2), p.top + h * 0.35], [p.x + p.w * 0.16 + J.j(3), p.top + h * 0.7], [p.x + p.w * 0.2, p.base + 1]];
  const silhouette = [apex, ...right.slice().reverse(), ...left.slice().reverse()];
  // lit face: left of the ridge
  const litFace = [...ridge, ...left.slice().reverse()];
  const snowLine = p.top + h * (0.2 + J.j(0.04));
  const snow: Pt[] = [apex, [p.x + p.w * 0.17, p.top + h * 0.14], [p.x + p.w * 0.08, snowLine - 2], [p.x - p.w * 0.06, snowLine + 3], [p.x - p.w * 0.2, snowLine - 1], [p.x - p.w * 0.3, p.top + h * 0.28]];
  const snowLit = [apex, [p.x + p.w * 0.04, snowLine - 1] as Pt, ...snow.slice(3)];
  const crevices = [...Array(4)].map((_, i) => {
    const t = 0.3 + i * 0.16;
    const sx = p.x + p.w * 0.06 + p.w * 0.1 * t;
    const sy = p.top + h * t;
    return `M${r1(sx)} ${r1(sy)}l${r1(-p.w * (0.2 + J.n() * 0.15))} ${r1(h * (0.1 + J.n() * 0.08))}l${r1(-4 - J.n() * 5)} ${r1(6 + J.n() * 4)}`;
  });
  return (
    <g key={k} strokeLinejoin="round">
      <path d={poly(silhouette)} fill="#4f5659" stroke="rgba(18,22,22,0.5)" strokeWidth={1} />
      <path d={poly(litFace)} fill="#aea891" />
      <path d={poly([ridge[0], ridge[1], [p.x - p.w * 0.42, p.top + h * 0.55], [p.x - p.w * 0.22, p.top + h * 0.26]])} fill="#c9c2aa" opacity={0.8} />
      <path d={poly([ridge[1], ridge[2], [p.x - p.w * 0.2, p.top + h * 0.8], [p.x - p.w * 0.12, p.top + h * 0.5]])} fill="#8f8a76" opacity={0.45} />
      {crevices.map((d, i) => (
        <path key={i} d={d} stroke="#6b6655" strokeWidth={1} fill="none" opacity={0.85} />
      ))}
      <path d={`M${r1(p.x + p.w * 0.35)} ${r1(p.top + h * 0.5)}l${r1(p.w * 0.2)} ${r1(h * 0.18)}M${r1(p.x + p.w * 0.3)} ${r1(p.top + h * 0.75)}l${r1(p.w * 0.25)} ${r1(h * 0.1)}`} stroke="#3a4144" strokeWidth={1} opacity={0.7} />
      <path d={poly(snow)} fill="#bcc3c6" />
      <path d={poly(snowLit)} fill="#efebe0" />
      {/* alpine grass creeping up the foot */}
      <path
        d={`M${r1(p.x - p.w - 4)} ${r1(p.base + 4)}Q${r1(p.x - p.w * 0.5)} ${r1(p.base - h * 0.22)} ${r1(p.x)} ${r1(p.base - h * 0.12)}Q${r1(p.x + p.w * 0.5)} ${r1(p.base - h * 0.2)} ${r1(p.x + p.w + 4)} ${r1(p.base + 6)}Z`}
        fill="#5f6b45"
        opacity={0.7}
      />
    </g>
  );
}

function Mountains({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const flip = J.pick([-1, 1]);
  const peaks: Peak[] = [
    { x: flip * (6 + J.j(6)), top: -92 + J.j(4), base: -28, w: 32 },
    { x: -flip * (40 + J.j(5)), top: -76 + J.j(6), base: 20, w: 44 },
    { x: flip * (40 + J.j(5)), top: -62 + J.j(6), base: 30, w: 42 },
  ];
  const mine = { x: -flip * 50, y: 62 };
  return (
    <g>
      <Base id="g-mountains" />
      {/* a far range in the haze */}
      <path d={`${smoothOpen(band(J, -70, 10, 18).map(([x, y], i) => [x, y - (i % 2 ? 14 : 0)] as Pt))}L118 -20L-118 -20Z`} fill="#a2a9a8" opacity={0.6} />
      {peaks.map((p, i) => peak(p, J, i))}
      {/* scree apron under the token, and foothills */}
      <path d={blob(J, 0, 30, 70, 34, 12, 0.14)} fill="#68704f" opacity={0.85} />
      <TokenBed J={J} fill="#7f8471" o={0.3} />
      {scatter(J, 6, 14, (x, y) => y > 16 && inHex(x, y, 8) && offToken(x, y, 32)).map(([x, y], i) => (
        <Use key={`g${i}`} id={`fl-tuft-${i % 2}`} x={x} y={y} o={0.8} />
      ))}
      {scatter(J, 5, 14, (x, y) => y > 18 && inHex(x, y, 10) && offToken(x, y, 36) && Math.hypot(x - mine.x, y - mine.y) > 20).map(([x, y], i) => (
        <Use key={`r${i}`} id={`fl-rock-${i % 2 ? 'char' : 'lime'}-${i % 3}`} x={x} y={y} s={J.between(0.9, 1.3)} />
      ))}
      {scatter(J, 5, 11, (x, y) => y > 30 && inHex(x, y - 12, 8) && offToken(x, y - 10, 38) && Math.hypot(x - mine.x, y - mine.y) > 18).map(([x, y], i) => (
        <Use key={`f${i}`} id={`fl-fir-${i % 4}`} x={x} y={y} s={J.between(0.7, 0.85)} />
      ))}
      {/* small glints of ore in the rock */}
      {scatter(J, 3, 18, (x, y) => y > -10 && y < 40 && inHex(x, y, 14) && offToken(x, y, 36)).map(([x, y], i) => (
        <g key={`o${i}`} transform={`translate(${r1(x)} ${r1(y)})`}>
          <path d="M-2.4 0L0-2L2.4 0L0 1.6Z" fill="#454b50" />
          <path d="M-1.4-0.3L0-1.4L1.2-0.2Z" fill="#e2ded0" />
        </g>
      ))}
      {/* a timbered mine entrance at the foot */}
      <g transform={`translate(${r1(mine.x)} ${r1(mine.y)})`} strokeLinejoin="round">
        <ellipse cx={4} cy={9} rx={15} ry={3} fill="#121614" opacity={0.3} />
        <path d="M-13 9Q-14 -10 0 -12Q14 -10 13 9Z" fill="#6f6f68" />
        <path d="M-13 9Q-14 -10 0 -12Q-6 -6 -6 9Z" fill="#9a978a" />
        <path d="M-6.5 9V-2Q-6.5 -6.5 0 -6.5Q6.5 -6.5 6.5 -2V9Z" fill="#1b1c1b" />
        <path d="M-7.5 9V-3.5M7.5 9V-3.5M-9 -4.5H9" stroke="#5a4330" strokeWidth={2.2} />
        <path d="M-8 9V-3.5M-9 -5.2H9" stroke="#8d6d48" strokeWidth={0.8} />
        <Use id="fl-rock-char-1" x={11} y={9} s={0.7} />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ desert

function Desert({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const side = J.pick([-1, 1]);
  const dunes: Pt[] = [
    [side * 34 + J.j(6), -64 + J.j(5)],
    [-side * 46 + J.j(6), -14 + J.j(6)],
    [side * 46 + J.j(6), 22 + J.j(6)],
    [-side * 20 + J.j(6), 66 + J.j(6)],
  ];
  const ruin = { x: -side * 44, y: -40 + J.j(5) };
  return (
    <g>
      <Base id="g-desert" />
      {dunes.map(([cx, cy], i) => {
        const w = (i === 2 ? 34 : 44) + J.j(6);
        const crest: Pt[] = [
          [cx - w, cy + 14],
          [cx - w * 0.5, cy + 2],
          [cx, cy - 6],
          [cx + w * 0.45, cy - 1],
          [cx + w, cy + 12],
        ];
        const lee: Pt[] = [...crest.slice(2), [cx + w * 0.7, cy + 22], [cx + w * 0.1, cy + 16]];
        const windward: Pt[] = [...crest, [cx + w * 0.5, cy - 12], [cx - w * 0.4, cy - 8]];
        return (
          <g key={i}>
            <path d={smoothClosed(windward)} fill="#f6e7bf" opacity={0.75} />
            <path d={smoothClosed(lee)} fill="#987549" opacity={0.55} />
            <path d={smoothOpen(crest)} stroke="#fdf3d6" strokeWidth={1.4} fill="none" strokeLinecap="round" />
            <path
              d={[1, 2, 3, 4].map((r) => smoothOpen(crest.map(([x, y]) => [x - r * 2, y - 4 - r * 4] as Pt).slice(0, 3))).join('')}
              stroke="#b8935e"
              strokeWidth={0.7}
              fill="none"
              opacity={0.4}
            />
          </g>
        );
      })}
      {/* a weathered limestone ruin: a broken column, a lintel fallen beside it */}
      <g transform={`translate(${r1(ruin.x)} ${r1(ruin.y)})`} strokeLinejoin="round">
        <ellipse cx={8} cy={2} rx={17} ry={3.4} fill="#4a3a20" opacity={0.25} />
        <path d="M-6 1V-22L-3-25H4V1Z" fill="#c9bfa6" stroke="rgba(40,34,24,0.45)" strokeWidth={0.7} />
        <path d="M-6 1V-22L-3-25H-1V1Z" fill="#ece3cc" />
        <path d="M2 1V-24H4V1Z" fill="#a39880" />
        <path d="M-6-8H4M-6-16H4" stroke="#9e937a" strokeWidth={0.6} />
        <path d="M-8-25H6V-28H-8Z" fill="#ddd3ba" />
        <path d="M6 1L18-1.5L19.5 2L7 4.5Z" fill="#d6ccb3" stroke="rgba(40,34,24,0.4)" strokeWidth={0.6} />
        <path d="M7 4.5L19.5 2L19.8 3.4L7.4 6Z" fill="#a1957c" />
        <path d="M-6-24q2 1 4-0.5" stroke="#7f8b4c" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      </g>
      {scatter(J, 5, 16, (x, y) => inHex(x, y, 10) && offToken(x, y, 26) && Math.hypot(x - ruin.x, y - ruin.y + 10) > 22 && Math.hypot(x - 34, y + 18) > 26).map(([x, y], i) => (
        <Use key={`r${i}`} id={`fl-rock-${i % 2 ? 'ochre' : 'lime'}-${i % 3}`} x={x} y={y} s={J.between(0.7, 1.1)} />
      ))}
      {scatter(J, 4, 18, (x, y) => inHex(x, y, 10) && offToken(x, y, 26) && Math.hypot(x - 34, y + 18) > 24).map(([x, y], i) => (
        <Use key={`d${i}`} id={`fl-dry-${i % 3}`} x={x} y={y} />
      ))}
    </g>
  );
}

const ART: Record<Terrain, (p: { seed: string }) => ReactElement> = {
  witchwood: Forest,
  ashen: Hills,
  moors: Pasture,
  fields: Fields,
  peaks: Mountains,
  waste: Desert,
};

export const TerrainArt = memo(function TerrainArt({ type, seed }: { type: Terrain; seed: string }) {
  const raster = ART_MANIFEST.terrain[type];
  if (raster) {
    return <image href={raster} x={-87} y={-100} width={174} height={200} preserveAspectRatio="xMidYMid slice" />;
  }
  const Comp = ART[type];
  return <Comp seed={seed} />;
});
