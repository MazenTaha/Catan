import { memo, type ReactElement } from 'react';
import { Rng, hashSeed } from '@hexfall/engine';

/**
 * The shared kit the terrain is painted from: trees, scrub, rocks, sheep, flower patches and
 * sheaves, each built once as a `<g id="fl-…">` in the board's defs and placed on tiles with
 * `<use>`. Every piece carries its own soft contact shadow and is lit from the upper left
 * (warm highlights, cool blue-green shade), so a tile full of them stays coherent and cheap:
 * one DOM node per tree instead of a dozen. Variants are generated from fixed seeds, never
 * from game state, so the art is stable across sessions and independent of the game's RNG.
 */

export const r1 = (n: number) => Math.round(n * 10) / 10;

/** A seeded jitter source for composition (separate from the game's RNG stream). */
export class Jit {
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
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rng.next() * xs.length)];
  }
  int(n: number): number {
    return Math.floor(this.rng.next() * n);
  }
}

type Pt = [number, number];

/** A closed, smooth outline through the points (Catmull-Rom as cubic Béziers). */
export function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** An open, smooth line through the points. */
export function smoothOpen(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/** Points of a wobbly ellipse, for organic masses (canopies, ponds, patches). */
export function blobPts(J: Jit, cx: number, cy: number, rx: number, ry: number, n = 9, wob = 0.18): Pt[] {
  return [...Array(n)].map((_, i) => {
    const a = (i / n) * Math.PI * 2 + J.j(0.12);
    const k = 1 + J.j(wob);
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as Pt;
  });
}

export const blob = (J: Jit, cx: number, cy: number, rx: number, ry: number, n = 9, wob = 0.18) =>
  smoothClosed(blobPts(J, cx, cy, rx, ry, n, wob));

/** Soft contact shadow, thrown to the lower right (the light is upper left). */
const Shadow = ({ x = 0, rx, ry, o = 0.32 }: { x?: number; rx: number; ry: number; o?: number }) => (
  <ellipse cx={r1(x + rx * 0.35)} cy={r1(ry * 0.35)} rx={r1(rx)} ry={r1(ry)} fill="#0b1712" opacity={o} />
);

/** Faint silhouette line, used only where it helps a shape read at game size. */
const EDGE = 'rgba(14,20,12,0.5)';

// ------------------------------------------------------------------ trees

const CANOPIES = [
  { dark: '#1a4630', mid: '#2e7a3c', light: '#5eae4a', sun: '#c2e27c' }, // oak
  { dark: '#21502c', mid: '#438a3a', light: '#88c150', sun: '#e0ea8c' }, // beech, warmer
  { dark: '#123d33', mid: '#246a4b', light: '#4b9a60', sun: '#a9d88c' }, // deep shade, cooler
] as const;

/** A broadleaf: lobed canopy in three tones over a short trunk, origin at the trunk's foot. */
function Broadleaf({ k }: { k: number }) {
  const J = new Jit(`oak-${k}`);
  const pal = CANOPIES[k % CANOPIES.length];
  const n = 4 + (k % 2);
  const lobes = [...Array(n)].map((_, i) => {
    const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * 2.6 + J.j(0.2);
    const d = i === Math.floor(n / 2) ? 3 : 6.5;
    return {
      x: Math.cos(a) * d + J.j(1.2),
      y: -17 + Math.sin(a) * d * 0.8 + J.j(1),
      r: J.between(6, 7.8),
    };
  });
  const lobe = (l: (typeof lobes)[number], dx: number, dy: number, s: number, seed: string) =>
    blob(new Jit(seed), l.x + dx, l.y + dy, l.r * s, l.r * s * 0.92, 8, 0.12);
  return (
    <g id={`fl-oak-${k}`}>
      <Shadow rx={14} ry={4.2} />
      <path d="M-1.8 0.5L-1.1-10H1.3L2 0.5Z" fill="#46382a" />
      <path d="M-1.8 0.5L-1.1-10H0L-0.2 0.5Z" fill="#6b5a42" />
      {lobes.map((l, i) => (
        <path key={`o${i}`} d={lobe(l, 0, 0, 1.06, `o${k}${i}`)} fill={pal.dark} stroke={EDGE} strokeWidth={1.3} />
      ))}
      {lobes.map((l, i) => (
        <path key={`d${i}`} d={lobe(l, 0, 0, 1.06, `o${k}${i}`)} fill={pal.dark} />
      ))}
      {lobes.map((l, i) => (
        <path key={`m${i}`} d={lobe(l, -1.3, -1.7, 0.82, `m${k}${i}`)} fill={pal.mid} />
      ))}
      {lobes
        .filter((l) => l.x < 2.5)
        .map((l, i) => (
          <path key={`l${i}`} d={lobe(l, -2.4, -2.9, 0.52, `l${k}${i}`)} fill={pal.light} />
        ))}
      {[0, 1, 2].map((i) => {
        const l = lobes[i % lobes.length];
        return (
          <ellipse
            key={`s${i}`}
            cx={r1(l.x - 3.2 + J.j(1))}
            cy={r1(l.y - 3.6 + J.j(1))}
            rx={1.6}
            ry={1.1}
            fill={pal.sun}
            opacity={0.7}
          />
        );
      })}
    </g>
  );
}

/** A conifer: a jagged, tiered spire with its sunlit half on the left. */
function Conifer({ k }: { k: number }) {
  const J = new Jit(`fir-${k}`);
  const h = 30 + J.j(3);
  const w = 9 + J.j(1);
  const tiers = 5;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = -4 - t * (h - 6);
    const ww = w * (1 - t * 0.82);
    left.push([-ww, y], [-ww * 0.45, y - (h / tiers) * 0.45]);
    right.push([ww, y], [ww * 0.45, y - (h / tiers) * 0.45]);
  }
  const top: Pt = [J.j(0.6), -h];
  const outline = [...left, top, ...right.reverse()];
  const d = `M${outline.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;
  const litD = `M${[...left, top, [top[0] + 0.5, -4] as Pt].map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;
  const dark = k % 2 ? '#113a32' : '#164236';
  return (
    <g id={`fl-fir-${k}`}>
      <Shadow rx={11} ry={3.4} />
      <path d="M-1 0.5V-5H1.2V0.5Z" fill="#45372a" />
      <path d={d} fill={dark} stroke={EDGE} strokeWidth={0.9} strokeLinejoin="round" />
      <path d={litD} fill={k % 2 ? '#2b6a4e' : '#347757'} />
      {left
        .filter((_, i) => i % 2 === 0)
        .map(([x, y], i) => (
          <path
            key={i}
            d={`M${r1(x + 0.6)} ${r1(y - 0.4)}L${r1(x * 0.5)} ${r1(y - 2.4)}`}
            stroke="#92cc96"
            strokeWidth={0.9}
            strokeLinecap="round"
            opacity={0.65}
          />
        ))}
    </g>
  );
}

// ------------------------------------------------------------------ scrub, rocks, ground

/** Low scrub: an olive cushion of foliage (meadows, hills). */
function Scrub({ k }: { k: number }) {
  const J = new Jit(`scrub-${k}`);
  const pal = [
    ['#2d5a2a', '#4e8a3a', '#9dcd63'],
    ['#3a5e28', '#6a9540', '#b8d472'],
    ['#244f2f', '#42804b', '#8ec47b'],
  ][k % 3];
  return (
    <g id={`fl-scrub-${k}`}>
      <Shadow rx={8} ry={2.6} />
      <path d={blob(J, 0, -3.5, 7, 4.6, 8, 0.2)} fill={pal[0]} stroke={EDGE} strokeWidth={0.8} />
      <path d={blob(J, -1.2, -4.6, 5.2, 3.3, 7, 0.2)} fill={pal[1]} />
      <ellipse cx={-2.6} cy={-6} rx={2.4} ry={1.3} fill={pal[2]} opacity={0.8} />
    </g>
  );
}

/** A dry shrub: bare twigs with a few grey-green leaves (desert, high ground). */
function DryShrub({ k }: { k: number }) {
  const J = new Jit(`dry-${k}`);
  const twigs = [...Array(6)].map((_, i) => {
    const a = -Math.PI / 2 + (i - 2.5) * 0.38 + J.j(0.15);
    const l = J.between(5, 8);
    return `M0 0Q${r1(Math.cos(a) * l * 0.4)} ${r1(Math.sin(a) * l * 0.6)} ${r1(Math.cos(a) * l)} ${r1(Math.sin(a) * l)}`;
  });
  return (
    <g id={`fl-dry-${k}`}>
      <Shadow rx={6} ry={1.8} o={0.22} />
      <path d={twigs.join('')} stroke="#7a6446" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      {[...Array(5)].map((_, i) => (
        <circle key={i} cx={r1(J.j(5))} cy={r1(-3 - J.n() * 4)} r={1} fill={i % 2 ? '#93a66a' : '#b3bf82'} />
      ))}
    </g>
  );
}

const STONE = {
  lime: { lit: '#e4e0d3', mid: '#b5b3aa', dark: '#6b717b' },
  char: { lit: '#a9aeb4', mid: '#737c85', dark: '#38424d' },
  ochre: { lit: '#f2d99e', mid: '#d0a866', dark: '#8b6a3f' },
  clay: { lit: '#eba67a', mid: '#b96b42', dark: '#6b3326' },
} as const;
export type StoneKind = keyof typeof STONE;

/** A weathered boulder with a lit top-left face and a cool shaded flank. */
function Rock({ kind, k }: { kind: StoneKind; k: number }) {
  const J = new Jit(`rock-${kind}-${k}`);
  const p = STONE[kind];
  const w = 6 + J.j(1.5);
  const h = 4.5 + J.j(1.2);
  const body: Pt[] = [
    [-w, 0],
    [-w * 0.8, -h * 0.7],
    [-w * 0.2, -h],
    [w * 0.5, -h * 0.85],
    [w, -h * 0.2],
    [w * 0.85, 0.4],
  ];
  const ridge: Pt = [w * 0.15, -h * 0.55];
  const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;
  return (
    <g id={`fl-rock-${kind}-${k}`}>
      <Shadow rx={w * 1.05} ry={2.2} o={0.3} />
      <path d={poly(body)} fill={p.mid} stroke={EDGE} strokeWidth={0.7} strokeLinejoin="round" />
      <path d={poly([body[0], body[1], body[2], body[3], ridge, [-w * 0.3, 0]])} fill={p.lit} />
      <path d={poly([ridge, body[3], body[4], body[5]])} fill={p.dark} opacity={0.75} />
    </g>
  );
}

/** A sheep standing in the grass, facing left or right; the light stays upper left. */
function Sheep({ right }: { right: boolean }) {
  const s = right ? 1 : -1;
  return (
    <g id={`fl-sheep-${right ? 'r' : 'l'}`}>
      <Shadow rx={6.5} ry={1.8} o={0.3} />
      <path d={`M${-3 * s} 0V-3M${-1 * s} 0.3V-3M${2.6 * s} 0V-3M${4.2 * s} 0.3V-3`} stroke="#2a2724" strokeWidth={1} strokeLinecap="round" />
      <path
        d="M-5.6-4.4C-6.2-7.4-3.4-8.6-1.6-8.2C-0.4-9.6 2.4-9.6 3.4-8C5.6-8.4 6.8-6 5.8-4.2C6.4-2.2 4.6-1.6 3.2-1.8C1.6-1 -1-1 -2.4-1.8C-4.4-1.4-6.4-2.4-5.6-4.4Z"
        transform={right ? undefined : 'scale(-1 1)'}
        fill="#e6e2d6"
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <ellipse cx={-1.6} cy={-6.4} rx={3.6} ry={1.8} fill="#fcfaf2" />
      <path d={`M${5.2 * s} -5.6c${1.4 * s} -0.8 ${2.8 * s} -0.4 ${2.9 * s} 1c${0.1 * s} 1.2 ${-0.8 * s} 1.8 ${-1.8 * s} 1.6z`} fill="#2c2926" />
      <path d={`M${5.4 * s} -5.6l${-0.9 * s} -0.9`} stroke="#2c2926" strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
}

/** A patch of grass blades. */
function Tuft({ k }: { k: number }) {
  const J = new Jit(`tuft-${k}`);
  const blades = [...Array(6)].map((_, i) => {
    const x = (i - 2.5) * 1.3 + J.j(0.4);
    const h = J.between(3.5, 6.5);
    const lean = J.j(1.6);
    return `M${r1(x)} 0Q${r1(x + lean * 0.3)} ${r1(-h * 0.6)} ${r1(x + lean)} ${r1(-h)}`;
  });
  return (
    <g id={`fl-tuft-${k}`} fill="none" strokeLinecap="round">
      <path d={blades.join('')} stroke={k % 2 ? '#2e6a2d' : '#3e7e31'} strokeWidth={1} />
      <path d={blades.slice(0, 3).join('')} stroke="#aedb6c" strokeWidth={0.6} opacity={0.7} />
    </g>
  );
}

/** Restrained wildflower patches: a few blooms among a little grass. */
function Flowers({ kind }: { kind: 'daisy' | 'poppy' | 'lavender' | 'buttercup' }) {
  const J = new Jit(`flw-${kind}`);
  const spots = [...Array(kind === 'lavender' ? 6 : 8)].map(() => [J.j(6.5), J.j(3.2)] as Pt);
  const grass = (
    <path
      d={spots.map(([x, y]) => `M${r1(x)} ${r1(y + 1.6)}l${r1(J.j(0.6))} -2.4`).join('')}
      stroke="#2e6a2d"
      strokeWidth={0.7}
      strokeLinecap="round"
    />
  );
  if (kind === 'lavender')
    return (
      <g id="fl-flw-lavender">
        {grass}
        {spots.map(([x, y], i) => (
          <path key={i} d={`M${r1(x)} ${r1(y)}v-3.2`} stroke={i % 2 ? '#8a6cc4' : '#a68ad8'} strokeWidth={1.4} strokeLinecap="round" />
        ))}
      </g>
    );
  const petal = { daisy: '#fcfaf2', poppy: '#d83a24', buttercup: '#f4d03c' }[kind];
  const heart = { daisy: '#e0b13e', poppy: '#2a1e18', buttercup: '#b98f2a' }[kind];
  return (
    <g id={`fl-flw-${kind}`}>
      {grass}
      {spots.map(([x, y], i) => (
        <g key={i}>
          <circle cx={r1(x)} cy={r1(y)} r={kind === 'poppy' ? 1.25 : 1.05} fill={petal} />
          {i % 2 === 0 && <circle cx={r1(x)} cy={r1(y)} r={0.4} fill={heart} />}
        </g>
      ))}
    </g>
  );
}

/** Reeds at a pond's edge. */
function Reeds() {
  return (
    <g id="fl-reeds" strokeLinecap="round" fill="none">
      <path d="M-3 0Q-3.4-4-4.2-7M-1 0V-8.5M1 0Q1.6-4 2.6-7.4M3 0Q3.2-3 4.4-5" stroke="#4c8034" strokeWidth={0.8} />
      <path d="M-1-6.5V-8.5M2.3-5.8l.3-1.6" stroke="#7a5a36" strokeWidth={1.4} />
    </g>
  );
}

/** A stook of harvested wheat. */
function Stook() {
  return (
    <g id="fl-stook">
      <Shadow rx={5.5} ry={1.7} />
      <path d="M-4.4 0L-1.2-8.6H1.2L4.4 0Z" fill="#dbaa3c" stroke={EDGE} strokeWidth={0.6} strokeLinejoin="round" />
      <path d="M-4.4 0L-1.2-8.6H0.2L-0.6 0Z" fill="#f7dd8a" />
      <path d="M-1.2-8.6L-2.6-11M0-8.6V-11.4M1.2-8.6L2.6-11" stroke="#eec65c" strokeWidth={0.8} strokeLinecap="round" />
      <path d="M-2.5-4.2H2.5" stroke="#7d6036" strokeWidth={0.9} />
    </g>
  );
}

/** A felled stump with a short log beside it. */
function Stump() {
  return (
    <g id="fl-stump">
      <Shadow rx={8} ry={2.2} />
      <path d="M-6.5 0.2L-6-3.4H-1.6L-1.2 0.2Z" fill="#5e4a34" />
      <ellipse cx={-3.8} cy={-3.4} rx={2.3} ry={1} fill="#c9a97a" />
      <path d="M0.6-0.6L8.4-2.4" stroke="#5e4a34" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M0.6-1.2L8.4-3" stroke="#7d6446" strokeWidth={0.9} strokeLinecap="round" />
      <circle cx={8.6} cy={-2.4} r={1.3} fill="#c9a97a" />
    </g>
  );
}

const STONE_KINDS = Object.keys(STONE) as StoneKind[];

/** Every shared art piece, for the board's `<defs>`. */
export const FloraDefs = memo(function FloraDefs() {
  const out: ReactElement[] = [];
  for (let k = 0; k < 6; k++) out.push(<Broadleaf key={`oak${k}`} k={k} />);
  for (let k = 0; k < 4; k++) out.push(<Conifer key={`fir${k}`} k={k} />);
  for (let k = 0; k < 3; k++) out.push(<Scrub key={`scrub${k}`} k={k} />, <DryShrub key={`dry${k}`} k={k} />);
  for (const kind of STONE_KINDS)
    for (let k = 0; k < 3; k++) out.push(<Rock key={`rock${kind}${k}`} kind={kind} k={k} />);
  for (let k = 0; k < 2; k++) out.push(<Tuft key={`tuft${k}`} k={k} />);
  return (
    <>
      {out}
      <Sheep right />
      <Sheep right={false} />
      <Flowers kind="daisy" />
      <Flowers kind="poppy" />
      <Flowers kind="buttercup" />
      <Flowers kind="lavender" />
      <Reeds />
      <Stook />
      <Stump />
    </>
  );
});

/** Places a shared piece. */
export function Use({ id, x, y, s = 1, o }: { id: string; x: number; y: number; s?: number; o?: number }) {
  return (
    <use
      href={`#${id}`}
      transform={`translate(${r1(x)} ${r1(y)})${s !== 1 ? ` scale(${r1(s * 100) / 100})` : ''}`}
      opacity={o}
    />
  );
}
