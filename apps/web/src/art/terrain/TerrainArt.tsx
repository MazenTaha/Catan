import { memo, type ReactElement } from 'react';
import { Rng, hashSeed, type Terrain } from '@hexfall/engine';
import { ART_MANIFEST } from '../manifest';

/**
 * Hand-built SVG terrain illustrations drawn in a hex-local box (center 0,0, circumradius 100,
 * pointy-top). The caller clips them to the hex. The look is a bright, painterly anime style:
 * saturated fills in two flat tones (lit and shade), ink outlines, a crisp highlight on the
 * upper left and a few sparkles. Each tile takes a seed so every board's tiles differ slightly.
 * The number token covers the middle, so features sit around it.
 * A raster override in `ART_MANIFEST.terrain[type]` replaces the procedural art.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The line-art ink: a deep plum rather than black, so lines stay warm. */
const INK = '#2b1a22';

class Jit {
  private rng: Rng;
  constructor(seed: string) {
    this.rng = new Rng(hashSeed(seed));
  }
  n(): number {
    return this.rng.next();
  }
  /** Uniform in [-a, a]. */
  j(a: number): number {
    return (this.rng.next() * 2 - 1) * a;
  }
  between(a: number, b: number): number {
    return a + this.rng.next() * (b - a);
  }
  pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rng.next() * xs.length)];
  }
}

/** True when (x, y) is clear of the number token in the middle of the tile. */
const offToken = (x: number, y: number, r = 34) => Math.hypot(x, y - 6) > r;

const Base = ({ id }: { id: string }) => (
  <rect x={-100} y={-110} width={200} height={220} fill={`url(#${id})`} />
);

/** Soft patches of lighter and darker ground so the base never reads as a flat fill. */
function Patches({ J, n, colors }: { J: Jit; n: number; colors: [string, number][] }) {
  return (
    <>
      {[...Array(n)].map((_, i) => {
        const [fill, opacity] = colors[i % colors.length];
        return (
          <ellipse
            key={i}
            cx={r1(J.j(80))}
            cy={r1(J.j(88))}
            rx={r1(J.between(18, 40))}
            ry={r1(J.between(7, 14))}
            fill={fill}
            opacity={opacity}
          />
        );
      })}
    </>
  );
}

/** Four-point twinkles, the signature glint of the style. */
function Sparkles({ J, n, color = '#fffbe6' }: { J: Jit; n: number; color?: string }) {
  const out: ReactElement[] = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const x = J.j(70);
    const y = J.j(80);
    if (!offToken(x, y, 36)) continue;
    const s = J.between(0.55, 1);
    out.push(
      <path
        key={i}
        transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(s * 10) / 10})`}
        d="M0-6L1.3-1.3L6 0L1.3 1.3L0 6L-1.3 1.3L-6 0L-1.3-1.3Z"
        fill={color}
        opacity={0.9}
      />,
    );
  }
  return <>{out}</>;
}

/** A grass tuft: three blades with an ink edge and a bright tip. */
function Tuft({
  x,
  y,
  s = 1,
  fill = '#3f9a2e',
  tip = '#b8f58a',
}: {
  x: number;
  y: number;
  s?: number;
  fill?: string;
  tip?: string;
}) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(s * 10) / 10})`}>
      <path
        d="M-5 3Q-4-5-1-8Q-2-2 0 3ZM0 3Q1-7 4-10Q2-3 3 3ZM3 3Q6-4 8-6Q5 0 6 3Z"
        fill={fill}
        stroke={INK}
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
      <path d="M-1-8Q-2-4-1-1M4-10Q2-6 2-2" stroke={tip} strokeWidth={1} fill="none" />
    </g>
  );
}

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

/** Four canvas sails around a hub at 0,0 (drawn by the ambient layer so they can turn). */
export function WindmillSails() {
  return (
    <g stroke={INK} strokeWidth={1.3} strokeLinejoin="round">
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 0V-25" strokeWidth={2} />
          <path d="M1 -24H8V-5H1Z" fill="#fff8ea" />
          <path d="M1 -17H8M1 -11H8" strokeWidth={0.6} opacity={0.6} />
        </g>
      ))}
      <circle r={3} fill="#e9b955" />
    </g>
  );
}

// ------------------------------------------------------------------ forest (lumber)

const LEAVES: [string, string, string][] = [
  ['#2f8a36', '#4cb043', '#c8f59a'],
  ['#2a7d3a', '#43a64a', '#b6ef8e'],
  ['#3a9435', '#5cc04a', '#d6fbaa'],
];

/** A round broadleaf: ink silhouette, shaded crown, lit crown offset up-left, a highlight. */
function broadleaf(x: number, y: number, s: number, k: number, J: Jit) {
  const [shade, lit, hi] = J.pick(LEAVES);
  const blobs = [
    [-5.5, -12, 7],
    [5.5, -13, 7.5],
    [0, -19.5, 8],
  ].map(([bx, by, r]) => [x + bx * s, y + by * s, r * s]);
  return (
    <g key={k}>
      <ellipse
        cx={r1(x + 3)}
        cy={r1(y + 1)}
        rx={r1(11 * s)}
        ry={r1(3.4 * s)}
        fill="#123c1c"
        opacity={0.4}
      />
      <path
        d={`M${r1(x - 2 * s)} ${r1(y)}L${r1(x - 1.4 * s)} ${r1(y - 9 * s)}H${r1(x + 1.4 * s)}L${r1(x + 2 * s)} ${r1(y)}Z`}
        fill="#8a5a32"
        stroke={INK}
        strokeWidth={1.1}
      />
      {blobs.map(([bx, by, r], i) => (
        <circle key={`o${i}`} cx={r1(bx)} cy={r1(by)} r={r1(r + 1.3)} fill={INK} />
      ))}
      {blobs.map(([bx, by, r], i) => (
        <circle key={`s${i}`} cx={r1(bx)} cy={r1(by)} r={r1(r)} fill={shade} />
      ))}
      {blobs.map(([bx, by, r], i) => (
        <circle
          key={`l${i}`}
          cx={r1(bx - 1.2 * s)}
          cy={r1(by - 1.6 * s)}
          r={r1(r * 0.8)}
          fill={lit}
        />
      ))}
      <path
        d={`M${r1(x - 5 * s)} ${r1(y - 24 * s)}Q${r1(x)} ${r1(y - 27.5 * s)} ${r1(x + 4.5 * s)} ${r1(y - 23.5 * s)}`}
        stroke={hi}
        strokeWidth={r1(1.8 * s)}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** A slim pine: three stacked tiers, shade on the right, lit on the left. */
function pine(x: number, y: number, h: number, k: number) {
  const w = h * 0.32;
  const tiers = [0, 1, 2].map((i) => {
    const by = y - h * 0.14 - i * h * 0.24;
    const tw = w * (1 - i * 0.24);
    return { by, tw, top: by - h * 0.42 };
  });
  return (
    <g key={k} strokeLinejoin="round">
      <ellipse
        cx={r1(x + 3)}
        cy={r1(y + 1)}
        rx={r1(w * 0.95)}
        ry={r1(w * 0.3)}
        fill="#123c1c"
        opacity={0.4}
      />
      <rect
        x={r1(x - 1.5)}
        y={r1(y - h * 0.18)}
        width={3}
        height={r1(h * 0.19)}
        fill="#7a4a28"
        stroke={INK}
        strokeWidth={0.9}
      />
      {tiers.map(({ by, tw, top }, i) => (
        <g key={i}>
          <path
            d={`M${r1(x - tw)} ${r1(by)}L${r1(x)} ${r1(top)}L${r1(x + tw)} ${r1(by)}Q${r1(x)} ${r1(by - 3)} ${r1(x - tw)} ${r1(by)}Z`}
            fill="#1f6a3c"
            stroke={INK}
            strokeWidth={1.2}
          />
          <path
            d={`M${r1(x - tw + 1)} ${r1(by - 0.6)}L${r1(x)} ${r1(top + 1.5)}L${r1(x - tw * 0.1)} ${r1(by - 2.4)}Z`}
            fill="#3a9a54"
          />
        </g>
      ))}
    </g>
  );
}

function Forest({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const trees: { x: number; y: number; s: number; pine: boolean }[] = [];
  for (let row = 0; row < 7; row++) {
    const y = -74 + row * 27 + J.j(4);
    const off = row % 2 ? 14 : 0;
    for (let col = -4; col <= 4; col++) {
      const x = col * 27 + off + J.j(6);
      if (!offToken(x, y - 12, 38)) continue;
      if (J.n() < 0.14) continue;
      trees.push({ x, y, s: 0.95 + J.j(0.12) + row * 0.03, pine: J.n() < 0.35 });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  const clearing = { x: J.pick([-44, 44]), y: 62 + J.j(6) };
  const cabin = { x: -clearing.x * 0.95, y: -50 + J.j(5) };
  return (
    <g>
      <Base id="g-forest" />
      <Patches
        J={J}
        n={7}
        colors={[
          ['#7fd468', 0.35],
          ['#1f5a2a', 0.35],
        ]}
      />
      {[...Array(8)].map((_, i) => (
        <Tuft key={i} x={J.j(80)} y={J.j(85)} s={0.8} fill="#2f8a2e" />
      ))}
      {trees
        .filter(
          (t) =>
            Math.hypot(t.x - clearing.x, t.y - clearing.y) > 26 &&
            Math.hypot(t.x - cabin.x, t.y - cabin.y - 6) > 25,
        )
        .map((t, i) => (t.pine ? pine(t.x, t.y, 34 * t.s, i) : broadleaf(t.x, t.y, t.s, i, J)))}
      {/* woodcutter's cottage */}
      <g
        transform={`translate(${r1(cabin.x)} ${r1(cabin.y)})`}
        stroke={INK}
        strokeWidth={1.3}
        strokeLinejoin="round"
      >
        <ellipse cx={3} cy={11} rx={17} ry={4} fill="#123c1c" opacity={0.4} stroke="none" />
        <path d="M-11 10V-1H11V10Z" fill="#f6e3c0" />
        <path d="M3 10V-1H11V10Z" fill="#dcc29a" stroke="none" />
        <path d="M-11 10V-1H11V10Z" fill="none" />
        <path d="M-15 0L0 -13L15 0Z" fill="#d9503a" />
        <path d="M0 -13L15 0H5Z" fill="#a83a2c" stroke="none" />
        <path d="M-10 -2L0 -11" stroke="#ff9c80" strokeWidth={1.2} />
        <rect x={6} y={-13} width={3.5} height={7} fill="#8a5a32" />
        <rect x={-7.5} y={1.5} width={5} height={4.5} rx={1} fill="#ffd56b" />
        <rect x={2} y={3} width={4.2} height={7} rx={1.5} fill="#7a4a2a" />
      </g>
      {/* log pile in a small clearing */}
      <g transform={`translate(${r1(clearing.x)} ${r1(clearing.y)})`}>
        <ellipse cx={2} cy={7} rx={18} ry={4.5} fill="#123c1c" opacity={0.4} />
        {[
          [-8, 2],
          [0, 2],
          [8, 2],
          [-4, -4.5],
          [4, -4.5],
          [0, -11],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={4} fill="#b0763e" stroke={INK} strokeWidth={1.2} />
            <circle cx={x} cy={y} r={1.8} fill="none" stroke="#f2c98e" strokeWidth={0.8} />
          </g>
        ))}
      </g>
      <Sparkles J={J} n={2} />
    </g>
  );
}

// ------------------------------------------------------------------ hills (brick)

function BrickStack({ x, y, rows }: { x: number; y: number; rows: number }) {
  const out: ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    const n = rows - r + 1;
    for (let i = 0; i < n; i++) {
      const bx = x + (i - (n - 1) / 2) * 9;
      const by = y - r * 5;
      out.push(
        <g key={`${r}-${i}`}>
          <rect
            x={r1(bx - 4.2)}
            y={r1(by - 2.4)}
            width={8.4}
            height={4.8}
            rx={0.8}
            fill="#e0673a"
            stroke={INK}
            strokeWidth={0.9}
          />
          <rect x={r1(bx - 3.4)} y={r1(by - 1.8)} width={6.8} height={1.1} fill="#ffb48a" />
        </g>,
      );
    }
  }
  return (
    <g>
      <ellipse cx={x + 3} cy={y + 4} rx={rows * 6 + 6} ry={3.6} fill="#5a2210" opacity={0.4} />
      {out}
    </g>
  );
}

function Bush({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(s * 10) / 10})`}>
      <ellipse cx={2} cy={4} rx={9} ry={2.6} fill="#5a2210" opacity={0.35} />
      <path
        d="M-8 3Q-10-4-4-5Q-3-10 2-8Q8-9 8-2Q10 3 6 4H-6Q-8 4-8 3Z"
        fill="#3e9a35"
        stroke={INK}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path
        d="M-5-3Q-3-7 1-6"
        stroke="#b8f58a"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function Hills({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const ridges = [-62, -22, 20, 62];
  const kiln = kilnChimney(seed);
  const side = kiln.side;
  return (
    <g>
      <Base id="g-hills" />
      {ridges.map((y0, i) => {
        const y = y0 + J.j(5);
        const peak = J.j(40);
        const lift = 22 + J.j(6);
        const crest = `M-110 ${r1(y + 18)}Q${r1(peak)} ${r1(y - lift)} 110 ${r1(y + 14)}`;
        return (
          <g key={i}>
            <path
              d={`${crest}V120H-110Z`}
              fill={['#d4683c', '#e07a48', '#cc5f36', '#e58450'][i]}
              stroke={INK}
              strokeWidth={1.4}
            />
            {/* the shaded flank below each crest */}
            <path
              d={`M${r1(peak + 10)} ${r1(y - lift / 2 + 6)}Q${r1(peak + 50)} ${r1(y + 2)} 110 ${r1(y + 22)}V${r1(y + 30)}Q${r1(peak + 40)} ${r1(y + 14)} ${r1(peak + 10)} ${r1(y - lift / 2 + 12)}Z`}
              fill="#a8462a"
              opacity={0.55}
            />
            <path
              d={`M-110 ${r1(y + 20)}Q${r1(peak)} ${r1(y - lift + 2.5)} ${r1(peak + 40)} ${r1(y - 2)}`}
              stroke="#ffc49a"
              strokeWidth={2}
              fill="none"
              opacity={0.8}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {[...Array(5)].map((_, i) => {
        const x = J.j(78);
        const y = J.j(80);
        return offToken(x, y, 38) ? <Bush key={i} x={x} y={y} s={J.between(0.7, 1)} /> : null;
      })}
      {/* clay pit */}
      <g transform={`translate(${r1(-side * 42)} -46)`}>
        <ellipse rx={22} ry={8} fill="#7a2e16" stroke={INK} strokeWidth={1.3} />
        <ellipse cx={-2} cy={1.5} rx={16} ry={5} fill="#5a2010" />
        <ellipse cx={-5} cy={-2.5} rx={9} ry={1.6} fill="#f2a27a" opacity={0.7} />
      </g>
      <BrickStack x={r1(-side * 40)} y={58} rows={3} />
      <BrickStack x={r1(side * 50)} y={-30} rows={2} />
      {/* brick kiln with a warm glow */}
      <g transform={`translate(${r1(kiln.x - 8.5)} ${r1(kiln.y + 24)})`} strokeLinejoin="round">
        <ellipse cx={3} cy={10} rx={20} ry={4.5} fill="#5a2210" opacity={0.45} />
        <circle cx={0} cy={4} r={16} fill="url(#g-ember)" opacity={0.6} />
        <rect x={6} y={-24} width={5} height={11} fill="#b4532d" stroke={INK} strokeWidth={1.1} />
        <path
          d="M-14 10V-2Q-14 -16 0 -16Q14 -16 14 -2V10Z"
          fill="#c85a32"
          stroke={INK}
          strokeWidth={1.4}
        />
        <path d="M2 -16Q14 -16 14 -2V10H4Q8 -4 2 -16Z" fill="#9a3e22" />
        <path
          d="M-10 -6Q-8 -12 -2 -13"
          stroke="#ffb48a"
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
        <path d="M-5 10V3Q-5 -2 0 -2Q5 -2 5 3V10Z" fill="#ffb05a" stroke={INK} strokeWidth={1.1} />
        <path d="M-2.6 10V4.4Q-2.6 1.6 0 1.6Q2.6 1.6 2.6 4.4V10Z" fill="#fff0b8" />
      </g>
      <Sparkles J={J} n={2} />
    </g>
  );
}

// ------------------------------------------------------------------ pasture (wool)

function Sheep({ x, y, flip, s = 0.62 }: { x: number; y: number; flip: boolean; s?: number }) {
  return (
    <g
      transform={`translate(${r1(x)} ${r1(y)}) scale(${flip ? -s : s} ${s})`}
      strokeLinejoin="round"
    >
      <ellipse cx={0} cy={14} rx={16} ry={4} fill="#1f5a17" opacity={0.4} />
      <rect
        x={-8}
        y={6}
        width={3.5}
        height={8}
        rx={1.5}
        fill="#2e2420"
        stroke={INK}
        strokeWidth={1.6}
      />
      <rect
        x={5}
        y={6}
        width={3.5}
        height={8}
        rx={1.5}
        fill="#2e2420"
        stroke={INK}
        strokeWidth={1.6}
      />
      <path
        d="M-14 4q-4-6 2-10q0-7 8-6q4-6 11-1q7-1 7 6q5 4 1 10q-2 6-10 4q-6 4-12 0q-8 2-7-3Z"
        fill="#fffaf0"
        stroke={INK}
        strokeWidth={2}
      />
      <path d="M-8 6q6 3 14 0q-6 1-14 0Z" fill="#e3ddcc" />
      <path
        d="M-6-8q4-3 8-1"
        stroke="#ffffff"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx={-17} cy={-1} rx={6} ry={7} fill="#2e2420" stroke={INK} strokeWidth={1.5} />
      <path d="M-21-6l-4-2M-13-6l3-2" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <circle cx={-19} cy={-3} r={1.4} fill="#fff" />
    </g>
  );
}

function Pasture({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const spots = [
    { x: -46, y: -38 },
    { x: 44, y: -46 },
    { x: -48, y: 46 },
    { x: 46, y: 40 },
    { x: 0, y: -70 },
    { x: -6, y: 74 },
  ];
  const sheep = spots
    .map((p) => ({ x: p.x + J.j(8), y: p.y + J.j(6), flip: J.n() < 0.5 }))
    .filter(() => J.n() < 0.8)
    .slice(0, 4);
  const fenceY = J.pick([-1, 1]);
  const tree = { x: fenceY * 52, y: J.j(10) };
  return (
    <g>
      <Base id="g-pasture" />
      <Patches
        J={J}
        n={6}
        colors={[
          ['#c4f58f', 0.35],
          ['#4fa833', 0.45],
        ]}
      />
      {[...Array(16)].map((_, i) => {
        const x = J.j(82);
        const y = J.j(90);
        return offToken(x, y, 30) ? <Tuft key={i} x={x} y={y} s={J.between(0.7, 1.05)} /> : null;
      })}
      {[...Array(12)].map((_, i) => (
        <circle
          key={i}
          cx={r1(J.j(80))}
          cy={r1(J.j(88))}
          r={1.5}
          fill={['#fff6d0', '#ff9fc0', '#ffe066'][i % 3]}
          stroke={INK}
          strokeWidth={0.5}
        />
      ))}
      {/* small pond holding the sky */}
      <g transform={`translate(${r1(-fenceY * 56)} ${r1(J.j(6))})`}>
        <ellipse rx={18} ry={8} fill="#4fa833" stroke={INK} strokeWidth={1.3} />
        <ellipse cy={0.5} rx={15} ry={6} fill="#3ec4d4" />
        <ellipse cx={3} cy={2} rx={10} ry={3} fill="#2aa0b8" />
        <ellipse cx={-5} cy={-1.5} rx={6} ry={1.3} fill="#e8fdff" opacity={0.9} />
      </g>
      {/* a round shade tree */}
      {broadleaf(tree.x, tree.y + 10, 1.05, 999, J)}
      {/* split-rail fence */}
      <g
        transform={`translate(0 ${fenceY * 70}) rotate(${fenceY * -4})`}
        stroke={INK}
        strokeLinejoin="round"
      >
        <path d="M-64 -6H64M-64 -1H64" strokeWidth={4} />
        <path d="M-64 -6H64M-64 -1H64" stroke="#c48a52" strokeWidth={2} />
        {[-60, -36, -12, 12, 36, 60].map((x) => (
          <rect
            key={x}
            x={x - 1.8}
            y={-10}
            width={3.6}
            height={14}
            rx={1}
            fill="#9a643a"
            strokeWidth={1}
          />
        ))}
      </g>
      {sheep.map((s, i) => (
        <Sheep key={i} x={s.x} y={s.y} flip={s.flip} />
      ))}
      <Sparkles J={J} n={2} />
    </g>
  );
}

// ------------------------------------------------------------------ fields (grain)

function Fields({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const bend = 26 + J.j(6);
  const rows: ReactElement[] = [];
  for (let i = -6; i <= 6; i++) {
    const y = i * 18;
    const d = `M-110 ${r1(y + bend * 0.4)}Q0 ${r1(y - bend)} 110 ${r1(y + bend * 0.4)}`;
    rows.push(
      <g key={i}>
        <path d={d} stroke="#d4972f" strokeWidth={8} fill="none" strokeLinecap="round" />
        <path
          d={d}
          transform="translate(0 9)"
          stroke="#ffe7a3"
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />
      </g>,
    );
  }
  const ears: ReactElement[] = [];
  let k = 0;
  for (let i = 0; i < 40; i++) {
    const x = J.j(84);
    const y = J.j(90);
    if (!offToken(x, y, 32)) continue;
    const lean = J.j(2.5);
    ears.push(
      <g key={k++}>
        <path d={`M${r1(x)} ${r1(y)}l${r1(lean)} -8`} stroke="#9b6a24" strokeWidth={0.9} />
        <ellipse
          cx={r1(x + lean)}
          cy={r1(y - 10)}
          rx={1.8}
          ry={3.6}
          fill="#ffd56b"
          stroke="#9b6a24"
          strokeWidth={0.6}
          transform={`rotate(${r1(lean * 6)} ${r1(x + lean)} ${r1(y - 10)})`}
        />
      </g>,
    );
  }
  const mill = windmillHub(seed);
  const side = mill.side;
  return (
    <g>
      <Base id="g-fields" />
      {rows}
      {ears}
      {/* sheaves */}
      {[
        { x: side * -46, y: 52 },
        { x: side * 50, y: -8 },
      ].map((s, i) => (
        <g
          key={i}
          transform={`translate(${r1(s.x + J.j(5))} ${r1(s.y + J.j(5))})`}
          strokeLinejoin="round"
        >
          <ellipse cx={3} cy={11} rx={12} ry={3} fill="#8a5a1c" opacity={0.4} />
          <path d="M-9 11L-3 -9L0 -13L3 -9L9 11Z" fill="#e9b955" stroke={INK} strokeWidth={1.2} />
          <path d="M-9 11L-3 -9L0 -13L0 11Z" fill="#ffe08a" />
          <path
            d="M-6 -4L-9 -14M0 -13L0 -19M6 -4L9 -14"
            stroke="#ffd56b"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path d="M-5.5 1H5.5" stroke="#c4302b" strokeWidth={2.4} />
        </g>
      ))}
      {/* windmill tower (its sails turn in the ambient layer, centred on the hub) */}
      <g transform={`translate(${r1(mill.x)} ${r1(mill.y)})`} strokeLinejoin="round">
        <ellipse cx={3} cy={26} rx={14} ry={3.6} fill="#8a5a1c" opacity={0.4} />
        <path d="M-8 26L-5.5 1H5.5L8 26Z" fill="#fbf1dc" stroke={INK} strokeWidth={1.5} />
        <path d="M2.5 26L3 1H5.5L8 26Z" fill="#e3d2b2" />
        <path d="M-8.5 2L0 -9L8.5 2Z" fill="#e0543c" stroke={INK} strokeWidth={1.5} />
        <path d="M0 -9L8.5 2H4Z" fill="#b03c2a" />
        <rect
          x={-2.4}
          y={17}
          width={4.8}
          height={9}
          rx={2}
          fill="#8a5a32"
          stroke={INK}
          strokeWidth={1}
        />
        <rect
          x={-1.8}
          y={8}
          width={3.6}
          height={4}
          rx={0.8}
          fill="#ffd56b"
          stroke={INK}
          strokeWidth={0.8}
        />
      </g>
      <Sparkles J={J} n={2} />
    </g>
  );
}

// ------------------------------------------------------------------ mountains (ore)

/** A karst pillar: a tall stone column with a lit face, a shaded side, strata and a mossy crown. */
function pillar(x: number, base: number, h: number, w: number, k: number, J: Jit) {
  const top = base - h;
  const lean = J.j(3);
  const tw = w * 0.8;
  const body = `M${r1(x - w / 2)} ${r1(base)}L${r1(x - tw / 2 + lean)} ${r1(top + 4)}Q${r1(x + lean)} ${r1(top - 5)} ${r1(x + tw / 2 + lean)} ${r1(top + 4)}L${r1(x + w / 2)} ${r1(base)}Z`;
  const shade = `M${r1(x + w * 0.16)} ${r1(base)}L${r1(x + tw * 0.14 + lean)} ${r1(top + 2)}Q${r1(x + tw * 0.4 + lean)} ${r1(top)} ${r1(x + tw / 2 + lean)} ${r1(top + 4)}L${r1(x + w / 2)} ${r1(base)}Z`;
  const strata = [0.35, 0.58, 0.8].map((t) => {
    const y = top + h * t;
    const half = (tw + (w - tw) * t) / 2;
    return `M${r1(x - half + lean * (1 - t))} ${r1(y)}q${r1(half)} 3 ${r1(half * 2)} 0`;
  });
  return (
    <g key={k} strokeLinejoin="round">
      <ellipse
        cx={r1(x + 4)}
        cy={r1(base)}
        rx={r1(w * 0.75)}
        ry={r1(w * 0.18)}
        fill="#2c4a44"
        opacity={0.35}
      />
      <path d={body} fill="#e6dccb" stroke={INK} strokeWidth={1.8} />
      <path d={shade} fill="#b3a792" />
      {strata.map((d, i) => (
        <path key={i} d={d} stroke="#8e8370" strokeWidth={1} fill="none" />
      ))}
      <path
        d={`M${r1(x - w / 2 + 2)} ${r1(base - 4)}L${r1(x - tw / 2 + lean + 2)} ${r1(top + 8)}`}
        stroke="#fffaf0"
        strokeWidth={1.4}
        opacity={0.8}
      />
      {/* mossy crown */}
      <path
        d={`M${r1(x - tw / 2 + lean - 2)} ${r1(top + 5)}Q${r1(x + lean)} ${r1(top - 9)} ${r1(x + tw / 2 + lean + 2)} ${r1(top + 5)}Q${r1(x + tw * 0.2 + lean)} ${r1(top + 9)} ${r1(x + lean)} ${r1(top + 6)}Q${r1(x - tw * 0.25 + lean)} ${r1(top + 10)} ${r1(x - tw / 2 + lean - 2)} ${r1(top + 5)}Z`}
        fill="#5cbf45"
        stroke={INK}
        strokeWidth={1.5}
      />
      <path
        d={`M${r1(x - tw * 0.3 + lean)} ${r1(top + 1)}Q${r1(x + lean)} ${r1(top - 4)} ${r1(x + tw * 0.15 + lean)} ${r1(top - 2)}`}
        stroke="#c6f59a"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      {w > 18 && pine(x + lean + tw * 0.15, top + 1, 15, 0)}
    </g>
  );
}

function Mountains({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const mineSide = J.pick([-1, 1]);
  const mine = { x: mineSide * 46, y: 68 };
  const pillars = [
    { x: -6 + J.j(5), base: -26, h: 52 + J.j(6), w: 18 },
    { x: -44 + J.j(5), base: 34, h: 92 + J.j(8), w: 26 },
    { x: 38 + J.j(5), base: 26, h: 100 + J.j(8), w: 27 },
    { x: -mineSide * 56, base: 62, h: 42 + J.j(5), w: 15 },
  ].sort((a, b) => a.base - b.base);
  return (
    <g>
      <Base id="g-mountains" />
      <Patches
        J={J}
        n={5}
        colors={[
          ['#e8fff0', 0.3],
          ['#4f8f7a', 0.35],
        ]}
      />
      {/* far pillars, faded into the haze */}
      <g opacity={0.5}>
        {[-70, -22, 26, 70].map((x, i) => (
          <path key={i} d={`M${x - 8} -40V${r1(-80 - J.n() * 16)}q8 -8 16 0V-40Z`} fill="#a9c8ba" />
        ))}
      </g>
      <ellipse cx={0} cy={-38} rx={110} ry={9} fill="url(#g-mist)" />
      {pillars.map((p, i) => pillar(p.x, p.base, p.h, p.w, i, J))}
      {/* mist pooling between the pillars */}
      <ellipse cx={r1(J.j(10))} cy={36} rx={92} ry={11} fill="url(#g-mist)" />
      <ellipse cx={r1(30 + J.j(10))} cy={-6} rx={46} ry={7} fill="url(#g-mist)" opacity={0.7} />
      {/* ore crystals */}
      {[...Array(4)].map((_, i) => {
        const x = J.j(72);
        const y = J.between(-4, 80);
        if (!offToken(x, y, 34) || Math.hypot(x - mine.x, y - mine.y) < 24) return null;
        const s = J.between(0.55, 0.85);
        return (
          <g
            key={i}
            transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(s * 100) / 100})`}
            strokeLinejoin="round"
          >
            <circle r={14} fill="#7ee6ff" opacity={0.18} />
            <path d="M-8 6L-4-14L2-20L6-8L10 6Z" fill="#7ee6ff" stroke="#1d5a78" strokeWidth={2} />
            <path d="M-4-14L2-20L1-2Z" fill="#d8fbff" />
          </g>
        );
      })}
      {/* mine entrance */}
      <g transform={`translate(${r1(mine.x)} ${r1(mine.y)})`} strokeLinejoin="round">
        <ellipse cx={2} cy={12} rx={20} ry={4} fill="#2c4a44" opacity={0.4} />
        <path
          d="M-20 12Q-20 -16 0 -18Q20 -16 20 12Z"
          fill="#b3a792"
          stroke={INK}
          strokeWidth={1.5}
        />
        <path d="M-11 12V-3Q-11 -11 0 -11Q11 -11 11 -3V12Z" fill="#1d1420" />
        <path d="M-12 12V-6M12 12V-6M-14 -7H14" stroke={INK} strokeWidth={4.6} />
        <path d="M-12 12V-6M12 12V-6M-14 -7H14" stroke="#9a643a" strokeWidth={2.6} />
        <circle cx={-15} cy={-1} r={7} fill="url(#g-torch)" />
        <rect
          x={-16.6}
          y={-3.4}
          width={3.2}
          height={4.2}
          rx={0.8}
          fill="#ffd56b"
          stroke={INK}
          strokeWidth={0.8}
        />
        <path d="M2 12L4 5H16L18 12Z" fill="#6b7a8a" stroke={INK} strokeWidth={1.2} />
        <path
          d="M6 5L8 0L10 5ZM10 5L13 -1L15 5Z"
          fill="#7ee6ff"
          stroke="#1d5a78"
          strokeWidth={0.8}
        />
      </g>
      <Sparkles J={J} n={3} />
    </g>
  );
}

// ------------------------------------------------------------------ desert

function Desert({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const dunes = [-58, -14, 32, 76];
  const side = J.pick([-1, 1]);
  return (
    <g>
      <Base id="g-desert" />
      {dunes.map((y0, i) => {
        const y = y0 + J.j(6);
        const crest = J.j(40);
        const line = `M-110 ${r1(y + 20)}Q${r1(crest)} ${r1(y - 26)} 110 ${r1(y + 10)}`;
        return (
          <g key={i}>
            <path
              d={`${line}V120H-110Z`}
              fill={i % 2 ? '#f2c873' : '#f7d690'}
              stroke={INK}
              strokeWidth={1.2}
            />
            <path
              d={`M${r1(crest - 6)} ${r1(y - 3)}Q${r1(crest + 30)} ${r1(y + 4)} 110 ${r1(y + 22)}V${r1(y + 34)}Q${r1(crest + 20)} ${r1(y + 14)} ${r1(crest - 6)} ${r1(y - 3)}Z`}
              fill="#d9a050"
              opacity={0.6}
            />
            <path
              d={`M-110 ${r1(y + 22)}Q${r1(crest - 10)} ${r1(y - 22)} ${r1(crest + 20)} ${r1(y - 4)}`}
              stroke="#fff3cc"
              strokeWidth={2}
              fill="none"
              opacity={0.85}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {/* oasis: a palm leaning over a turquoise pool */}
      <g transform={`translate(${r1(-side * 44)} ${r1(-40 + J.j(5))})`} strokeLinejoin="round">
        <ellipse cx={0} cy={10} rx={19} ry={6.5} fill="#6cc544" stroke={INK} strokeWidth={1.2} />
        <ellipse cx={0} cy={10.5} rx={15} ry={4.5} fill="#3ec4d4" />
        <ellipse cx={-4} cy={9.5} rx={6} ry={1.1} fill="#e8fdff" />
        <path
          d="M6 8Q4 -6 -2 -18"
          stroke={INK}
          strokeWidth={4.4}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M6 8Q4 -6 -2 -18"
          stroke="#b0763e"
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
        <g transform="translate(-2 -18)" fill="#3fae3a" stroke={INK} strokeWidth={1}>
          <path d="M0 0Q-10 -6 -18 2Q-9 -2 0 0Z" />
          <path d="M0 0Q8 -8 17 -2Q8 -3 0 0Z" />
          <path d="M0 0Q-3 -10 -10 -14Q-3 -6 0 0Z" />
          <path d="M0 0Q5 -9 10 -12Q4 -4 0 0Z" />
          <path d="M0 0Q-12 2 -14 10Q-6 2 0 0Z" />
        </g>
      </g>
      {/* ruined sandstone columns */}
      <g transform={`translate(${r1(side * 46)} ${r1(-24 + J.j(6))})`} strokeLinejoin="round">
        <ellipse cx={4} cy={22} rx={18} ry={3.6} fill="#a8742e" opacity={0.4} />
        <path d="M-12 22V-14H-3V-6L-1 -10V22Z" fill="#f0d9a8" stroke={INK} strokeWidth={1.4} />
        <path d="M-5 22V-8L-3 -6V22Z" fill="#d4b47c" />
        <path d="M-14 -14H-1V-18H-14Z" fill="#e6c88e" stroke={INK} strokeWidth={1.2} />
        <path d="M4 22V2L8 -2L14 4V22Z" fill="#f0d9a8" stroke={INK} strokeWidth={1.4} />
        <path d="M10 22V0L14 4V22Z" fill="#d4b47c" />
        <path d="M-10 -10V18M6 4V18" stroke="#fffaf0" strokeWidth={1.2} opacity={0.8} />
        <path d="M-12 -2H-1M-12 10H-1M4 12H14" stroke="#c4a068" strokeWidth={0.9} />
      </g>
      {/* a little cactus and some rocks */}
      <g
        transform={`translate(${r1(-side * 40)} ${r1(56 + J.j(5))}) scale(0.8)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx={4} cy={20} rx={10} ry={3} fill="#a8742e" opacity={0.4} />
        <path d="M0 20V-12M0 6H-8V-4M0 0H8V-8" stroke={INK} strokeWidth={9} fill="none" />
        <path d="M0 20V-12M0 6H-8V-4M0 0H8V-8" stroke="#3fae3a" strokeWidth={6} fill="none" />
        <path d="M-1.5 18V-10" stroke="#9be07a" strokeWidth={1.6} />
      </g>
      {[...Array(3)].map((_, i) => {
        const x = J.j(70);
        const y = J.between(30, 85);
        if (!offToken(x, y, 32)) return null;
        return (
          <path
            key={i}
            d={`M${r1(x - 6)} ${r1(y + 1)}Q${r1(x - 5)} ${r1(y - 6)} ${r1(x + 1)} ${r1(y - 6)}Q${r1(x + 7)} ${r1(y - 4)} ${r1(x + 6)} ${r1(y + 1)}Z`}
            fill="#c99a62"
            stroke={INK}
            strokeWidth={1.1}
          />
        );
      })}
      <Sparkles J={J} n={2} />
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

export const TerrainArt = memo(function TerrainArt({
  type,
  seed,
}: {
  type: Terrain;
  seed: string;
}) {
  const raster = ART_MANIFEST.terrain[type];
  if (raster) {
    return (
      <image
        href={raster}
        x={-87}
        y={-100}
        width={174}
        height={200}
        preserveAspectRatio="xMidYMid slice"
      />
    );
  }
  const Comp = ART[type];
  return <Comp seed={seed} />;
});
