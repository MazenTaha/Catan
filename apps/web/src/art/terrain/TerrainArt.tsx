import { memo, type ReactElement } from 'react';
import { Rng, hashSeed, type Terrain } from '@hexfall/engine';
import { ART_MANIFEST } from '../manifest';

/**
 * Hand-built SVG terrain illustrations drawn in a hex-local box (center 0,0, circumradius 100,
 * pointy-top). The caller clips them to the hex. Moonlight comes from the upper left, so lit
 * faces are on the left and shadows fall to the right. Each tile takes a seed so every board's
 * tiles differ slightly. The number token covers the middle, so features sit around it.
 * A raster override in `ART_MANIFEST.terrain[type]` replaces the procedural art.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

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

const Base = ({ id }: { id: string }) => <rect x={-100} y={-110} width={200} height={220} fill={`url(#${id})`} />;

// ------------------------------------------------------------------ forest (lumber)

function fir(x: number, y: number, h: number, k: number, J: Jit) {
  const w = h * 0.36;
  const tiers = 4;
  const dark: string[] = [];
  const lit: string[] = [];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const by = y - h * 0.16 - h * t * 0.7;
    const tw = w * (1 - t * 0.68);
    const top = by - h * 0.36;
    const jag = J.j(1.5);
    dark.push(`M${r1(x - tw)} ${r1(by)}L${r1(x)} ${r1(top)}L${r1(x + tw)} ${r1(by + jag)}Q${r1(x)} ${r1(by - 4)} ${r1(x - tw)} ${r1(by)}Z`);
    lit.push(`M${r1(x - tw)} ${r1(by)}L${r1(x)} ${r1(top)}L${r1(x - tw * 0.05)} ${r1(by - 3)}Z`);
  }
  return (
    <g key={k}>
      <ellipse cx={r1(x + 4)} cy={r1(y + 1)} rx={r1(w * 0.9)} ry={r1(w * 0.28)} fill="#06120b" opacity={0.55} />
      <rect x={r1(x - 1.6)} y={r1(y - h * 0.2)} width={3.2} height={r1(h * 0.22)} fill="#3b2614" />
      <path d={dark.join('')} fill="#123824" stroke="#0a1f14" strokeWidth={0.6} />
      <path d={lit.join('')} fill="#2f6b45" />
      <path d={`M${r1(x)} ${r1(y - h * 0.16 - h * 0.7 - h * 0.36 + h * 0.25)}L${r1(x - w * 0.3)} ${r1(y - h * 0.5)}`} stroke="#8fd0a0" strokeWidth={0.7} opacity={0.5} />
    </g>
  );
}

function Forest({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const trees: { x: number; y: number; h: number }[] = [];
  for (let row = 0; row < 8; row++) {
    const y = -78 + row * 25 + J.j(4);
    const off = row % 2 ? 13 : 0;
    for (let col = -4; col <= 4; col++) {
      const x = col * 26 + off + J.j(6);
      if (!offToken(x, y - 12, 36)) continue;
      if (J.n() < 0.12) continue;
      trees.push({ x, y, h: 34 + J.j(6) + row * 1.2 });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  const clearing = { x: J.pick([-44, 44]), y: 62 + J.j(6) };
  return (
    <g>
      <Base id="g-forest" />
      {[...Array(8)].map((_, i) => (
        <ellipse key={i} cx={r1(J.j(75))} cy={r1(J.j(85))} rx={r1(J.between(12, 24))} ry={r1(J.between(4, 8))} fill="#1d4a2c" opacity={0.6} />
      ))}
      {trees.filter((t) => Math.hypot(t.x - clearing.x, t.y - clearing.y) > 26).map((t, i) => fir(t.x, t.y, t.h, i, J))}
      {/* log pile in a small clearing */}
      <g transform={`translate(${r1(clearing.x)} ${r1(clearing.y)})`}>
        <ellipse cx={2} cy={7} rx={18} ry={5} fill="#0b1c11" opacity={0.6} />
        {[
          [-8, 2],
          [0, 2],
          [8, 2],
          [-4, -4.5],
          [4, -4.5],
          [0, -11],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={4} fill="#8a5a30" stroke="#3a2210" strokeWidth={1} />
            <circle cx={x} cy={y} r={1.8} fill="none" stroke="#c99a62" strokeWidth={0.6} />
          </g>
        ))}
        <path d="M14 6l9 -3 1 3 -9 3z" fill="#5b3a1c" />
        <path d="M21 1l5 -6" stroke="#9aa3ad" strokeWidth={2} strokeLinecap="round" />
      </g>
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
          <rect x={r1(bx - 4.2)} y={r1(by - 2.4)} width={8.4} height={4.8} fill="#b4532d" stroke="#4a1a0b" strokeWidth={0.7} />
          <rect x={r1(bx - 4.2)} y={r1(by - 2.4)} width={8.4} height={1.3} fill="#e08455" opacity={0.7} />
        </g>,
      );
    }
  }
  return (
    <g>
      <ellipse cx={x + 3} cy={y + 4} rx={rows * 6 + 6} ry={4} fill="#2a0e06" opacity={0.55} />
      {out}
    </g>
  );
}

function Hills({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const ridges = [-60, -20, 22, 64];
  const side = J.pick([-1, 1]);
  return (
    <g>
      <Base id="g-hills" />
      {ridges.map((y0, i) => {
        const y = y0 + J.j(5);
        const peak = J.j(40);
        const lift = 22 + J.j(6);
        return (
          <g key={i}>
            <path
              d={`M-110 ${r1(y + 18)}Q${r1(peak)} ${r1(y - lift)} 110 ${r1(y + 14)}V120H-110Z`}
              fill={['#7d3a1f', '#8e4526', '#7a361b', '#904a29'][i]}
            />
            <path d={`M-110 ${r1(y + 18)}Q${r1(peak)} ${r1(y - lift)} 110 ${r1(y + 14)}`} stroke="#d98a5a" strokeWidth={1.6} fill="none" opacity={0.55} />
            {[...Array(4)].map((_, k) => {
              const x = J.j(80);
              return <path key={k} d={`M${r1(x)} ${r1(y + 10 + J.j(4))}q4 -5 8 0`} stroke="#4c1c0c" strokeWidth={1} fill="none" opacity={0.6} />;
            })}
          </g>
        );
      })}
      {/* clay pit */}
      <ellipse cx={r1(-side * 42)} cy={-46} rx={22} ry={8} fill="#3a150a" />
      <ellipse cx={r1(-side * 42 - 4)} cy={-48} rx={13} ry={3} fill="#a85b38" opacity={0.6} />
      <BrickStack x={r1(-side * 40)} y={58} rows={3} />
      <BrickStack x={r1(side * 50)} y={-30} rows={2} />
      {/* brick kiln with a warm glow */}
      <g transform={`translate(${r1(side * 44)} ${r1(52 + J.j(4))})`}>
        <ellipse cx={3} cy={10} rx={20} ry={5} fill="#2a0e06" opacity={0.6} />
        <circle cx={0} cy={3} r={16} fill="url(#g-ember)" opacity={0.7} />
        <path d="M-14 10V-2Q-14 -16 0 -16Q14 -16 14 -2V10Z" fill="#6c2f17" stroke="#2a0e06" strokeWidth={1} />
        <path d="M-14 10V-2Q-14 -16 0 -16L0 10Z" fill="#8d4524" />
        <path d="M-12 -2H12M-13 4H13M-8 -9H8" stroke="#3e1608" strokeWidth={0.7} />
        <path d="M-5 10V3Q-5 -2 0 -2Q5 -2 5 3V10Z" fill="#ffb05a" />
        <path d="M-3 10V4Q-3 1 0 1Q3 1 3 4V10Z" fill="#fff0b8" />
        <rect x={6} y={-24} width={5} height={10} fill="#5a2612" />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ pasture (wool)

function Sheep({ x, y, flip }: { x: number; y: number; flip: boolean }) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx={1} cy={9} rx={13} ry={3} fill="#10200a" opacity={0.5} />
      <path d="M-7 4v6M-3 5v6M4 5v6M8 4v6" stroke="#2b2622" strokeWidth={1.8} strokeLinecap="round" />
      <g fill="#ece8dc">
        <circle cx={-6} cy={0} r={5.5} />
        <circle cx={0} cy={-2.5} r={6} />
        <circle cx={6} cy={0} r={5.5} />
        <circle cx={-2} cy={3} r={5.5} />
        <circle cx={4} cy={3.5} r={5} />
      </g>
      <path d="M-11 3Q0 9 11 3" stroke="#b9b2a1" strokeWidth={2.4} fill="none" opacity={0.8} />
      <circle cx={-3} cy={-5} r={2.6} fill="#fffaf0" />
      <ellipse cx={-12} cy={-1} rx={3.6} ry={4.4} fill="#2b2622" />
      <path d="M-14 -4l-3 -1M-10 -4l2 -2" stroke="#2b2622" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={-13} cy={-1.5} r={0.7} fill="#e8e0c8" />
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
  return (
    <g>
      <Base id="g-pasture" />
      {[...Array(7)].map((_, i) => (
        <ellipse key={i} cx={r1(J.j(75))} cy={r1(J.j(85))} rx={r1(J.between(14, 28))} ry={r1(J.between(6, 10))} fill="#6fa448" opacity={0.35} />
      ))}
      {[...Array(46)].map((_, i) => {
        const x = J.j(85);
        const y = J.j(95);
        return (
          <path
            key={i}
            d={`M${r1(x - 2)} ${r1(y)}l1 -4M${r1(x)} ${r1(y)}l0.5 -5M${r1(x + 2)} ${r1(y)}l-0.5 -4`}
            stroke={i % 3 ? '#2f5a1e' : '#8dc062'}
            strokeWidth={0.9}
            strokeLinecap="round"
          />
        );
      })}
      {[...Array(10)].map((_, i) => (
        <circle key={i} cx={r1(J.j(80))} cy={r1(J.j(90))} r={0.9} fill={i % 2 ? '#f2e6a0' : '#e8eef8'} />
      ))}
      {/* split-rail fence */}
      <g transform={`translate(0 ${fenceY * 68}) rotate(${fenceY * -4})`}>
        {[-60, -36, -12, 12, 36, 60].map((x) => (
          <rect key={x} x={x - 1.4} y={-9} width={2.8} height={13} fill="#6a4a2a" stroke="#2c1d0e" strokeWidth={0.5} />
        ))}
        <path d="M-64 -6H64M-64 -1H64" stroke="#8a643a" strokeWidth={1.8} />
      </g>
      {sheep.map((s, i) => (
        <Sheep key={i} x={s.x} y={s.y} flip={s.flip} />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ fields (grain)

function Fields({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const rows: ReactElement[] = [];
  for (let i = -9; i <= 9; i++) {
    const c = i * 13;
    rows.push(
      <path key={`r${i}`} d={`M-130 ${r1(c + 40)}L130 ${r1(c - 40)}`} stroke={i % 2 ? '#9c7424' : '#c49a3a'} strokeWidth={7} opacity={0.55} />,
    );
  }
  const ears: ReactElement[] = [];
  let k = 0;
  for (let i = -9; i <= 9; i++) {
    for (let t = -6; t <= 6; t++) {
      const x = t * 15 + J.j(3);
      const y = i * 13 - x * (40 / 130) + J.j(2);
      if (!offToken(x, y, 30)) continue;
      if (J.n() < 0.25) continue;
      const lean = J.j(2.5);
      ears.push(
        <g key={k++}>
          <path d={`M${r1(x)} ${r1(y)}l${r1(lean)} -8`} stroke="#6b4c16" strokeWidth={0.8} />
          <ellipse cx={r1(x + lean)} cy={r1(y - 10)} rx={1.5} ry={3.4} fill="#f2cf6b" transform={`rotate(${r1(lean * 6)} ${r1(x + lean)} ${r1(y - 10)})`} />
          <path d={`M${r1(x + lean - 1.2)} ${r1(y - 12)}l-1 -3M${r1(x + lean + 1.2)} ${r1(y - 12)}l1 -3`} stroke="#f7e09a" strokeWidth={0.5} />
        </g>,
      );
    }
  }
  const side = J.pick([-1, 1]);
  return (
    <g>
      <Base id="g-fields" />
      {rows}
      {ears}
      {/* sheaves */}
      {[
        { x: side * -46, y: 52 },
        { x: side * 50, y: -20 },
      ].map((s, i) => (
        <g key={i} transform={`translate(${r1(s.x + J.j(5))} ${r1(s.y + J.j(5))})`}>
          <ellipse cx={3} cy={11} rx={12} ry={3.4} fill="#3d2a0a" opacity={0.55} />
          <path d="M-9 11L-3 -9L0 -13L3 -9L9 11Z" fill="#d9ad4a" stroke="#6b4c16" strokeWidth={0.8} />
          <path d="M-9 11L-3 -9L0 -13L0 11Z" fill="#f0cb68" />
          <path d="M-6 -4L-9 -14M0 -13L0 -19M6 -4L9 -14M-3 -9L-5 -17M3 -9L5 -17" stroke="#e9c35b" strokeWidth={1.4} strokeLinecap="round" />
          <path d="M-5 1H5" stroke="#7a3c18" strokeWidth={2.2} />
        </g>
      ))}
      {/* windmill */}
      <g transform={`translate(${r1(side * 44)} ${r1(-48 + J.j(4))})`}>
        <ellipse cx={4} cy={18} rx={13} ry={3.5} fill="#3d2a0a" opacity={0.55} />
        <path d="M-7 18L-5 -6H5L7 18Z" fill="#cbb79a" stroke="#4e3b22" strokeWidth={0.8} />
        <path d="M-7 18L-5 -6H0V18Z" fill="#e6d6ba" />
        <path d="M-7 -6L0 -14L7 -6Z" fill="#7a3c18" stroke="#3a1c0a" strokeWidth={0.8} />
        <rect x={-2} y={8} width={4} height={10} fill="#3a2a16" />
        <rect x={-1.6} y={0} width={3.2} height={3.6} fill="#ffcf6b" />
        <g transform={`rotate(${r1(J.between(0, 90))} 0 -6)`} stroke="#4e3b22" strokeWidth={0.8}>
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a} 0 -6)`}>
              <path d="M0 -6V-30" strokeWidth={1.4} />
              <rect x={0.6} y={-29} width={5} height={19} fill="#e8dcc4" fillOpacity={0.85} />
            </g>
          ))}
        </g>
        <circle cx={0} cy={-6} r={1.8} fill="#3a2a16" />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ mountains (ore)

function Mountains({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const peaks = [
    { x: -40 + J.j(6), base: 30, h: 100 + J.j(10), w: 52 },
    { x: 34 + J.j(6), base: 20, h: 118 + J.j(10), w: 58 },
    { x: -2 + J.j(6), base: 78, h: 70 + J.j(8), w: 46 },
  ];
  const mine = { x: J.pick([-1, 1]) * 46, y: 68 };
  return (
    <g>
      <Base id="g-mountains" />
      {/* distant range */}
      <path d={`M-110 -20L-80 ${r1(-62 + J.j(6))}L-52 -38L-22 ${r1(-78 + J.j(6))}L12 -44L48 ${r1(-70 + J.j(6))}L80 -40L110 -58V20H-110Z`} fill="#4a5568" opacity={0.7} />
      {peaks.map((p, i) => {
        const tip = { x: p.x + J.j(4), y: p.base - p.h };
        const l = { x: p.x - p.w, y: p.base };
        const r = { x: p.x + p.w, y: p.base };
        const ridge = { x: p.x + J.j(6), y: p.base };
        const snowT = 0.3;
        const sl = { x: tip.x + (l.x - tip.x) * snowT, y: tip.y + (l.y - tip.y) * snowT };
        const sr = { x: tip.x + (r.x - tip.x) * snowT, y: tip.y + (r.y - tip.y) * snowT };
        const sm = { x: tip.x + (ridge.x - tip.x) * (snowT + 0.08), y: tip.y + (ridge.y - tip.y) * (snowT + 0.08) };
        return (
          <g key={i}>
            <path d={`M${r1(l.x)} ${r1(l.y)}L${r1(tip.x)} ${r1(tip.y)}L${r1(ridge.x)} ${r1(ridge.y)}Z`} fill="#8b97ab" />
            <path d={`M${r1(ridge.x)} ${r1(ridge.y)}L${r1(tip.x)} ${r1(tip.y)}L${r1(r.x)} ${r1(r.y)}Z`} fill="#3c4456" />
            {/* rock strata */}
            {[0.45, 0.62, 0.8].map((t) => (
              <path
                key={t}
                d={`M${r1(tip.x + (l.x - tip.x) * t)} ${r1(tip.y + (l.y - tip.y) * t)}L${r1(tip.x + (ridge.x - tip.x) * t + J.j(3))} ${r1(tip.y + (ridge.y - tip.y) * t + 4)}`}
                stroke="#5e6a80"
                strokeWidth={0.9}
              />
            ))}
            <path
              d={`M${r1(sl.x)} ${r1(sl.y)}L${r1(tip.x)} ${r1(tip.y)}L${r1(sr.x)} ${r1(sr.y)}L${r1(sr.x - 6)} ${r1(sr.y - 4)}L${r1(sm.x)} ${r1(sm.y)}L${r1(sl.x + 7)} ${r1(sl.y - 2)}Z`}
              fill="#e9f0f8"
            />
            <path d={`M${r1(tip.x)} ${r1(tip.y)}L${r1(sr.x)} ${r1(sr.y)}L${r1(sr.x - 6)} ${r1(sr.y - 4)}L${r1(sm.x)} ${r1(sm.y)}Z`} fill="#a9b9cf" />
            <path d={`M${r1(tip.x)} ${r1(tip.y)}L${r1(l.x)} ${r1(l.y)}`} stroke="#d6e2f2" strokeWidth={0.8} opacity={0.6} />
          </g>
        );
      })}
      {/* ore veins */}
      {[...Array(7)].map((_, i) => {
        const x = J.j(70);
        const y = J.between(-10, 70);
        if (!offToken(x, y, 30)) return null;
        const s = J.between(1.6, 3);
        return (
          <path
            key={i}
            d={`M${r1(x)} ${r1(y - s * 1.6)}L${r1(x + s)} ${r1(y)}L${r1(x)} ${r1(y + s * 1.6)}L${r1(x - s)} ${r1(y)}Z`}
            fill="#bfe3ff"
            stroke="#ffffff"
            strokeWidth={0.4}
          />
        );
      })}
      {/* scree */}
      {[...Array(12)].map((_, i) => (
        <path key={i} d={`M${r1(J.j(85))} ${r1(80 + J.j(18))}l3.5 -4.5l3.5 4.5z`} fill={i % 2 ? '#2c3342' : '#5c677b'} />
      ))}
      {/* mine entrance */}
      <g transform={`translate(${r1(mine.x)} ${r1(mine.y)})`}>
        <ellipse cx={2} cy={12} rx={20} ry={4} fill="#11141c" opacity={0.6} />
        <path d="M-12 12V-4Q-12 -14 0 -14Q12 -14 12 -4V12Z" fill="#0c0e14" />
        <path d="M-13 12V-8M13 12V-8M-15 -9H15" stroke="#6b4a2a" strokeWidth={3} />
        <circle cx={-15} cy={-3} r={7} fill="url(#g-torch)" />
        <rect x={-16.5} y={-5} width={3} height={4} rx={0.8} fill="#ffcf6b" />
        <path d="M2 12L4 4H16L18 12Z" fill="#4b5161" stroke="#1b1e27" strokeWidth={0.8} />
        <circle cx={7} cy={3} r={2.4} fill="#9fb8cf" />
        <circle cx={12} cy={2.4} r={2.2} fill="#7f97ad" />
      </g>
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
        return (
          <g key={i}>
            <path d={`M-110 ${r1(y + 20)}Q${r1(crest)} ${r1(y - 26)} 110 ${r1(y + 10)}V120H-110Z`} fill={i % 2 ? '#c9a868' : '#d8ba7c'} />
            <path d={`M${r1(crest - 10)} ${r1(y - 3)}Q${r1(crest + 30)} ${r1(y + 4)} 110 ${r1(y + 22)}V120H${r1(crest - 10)}Z`} fill="#a98a50" opacity={0.45} />
            <path d={`M-110 ${r1(y + 20)}Q${r1(crest)} ${r1(y - 26)} 110 ${r1(y + 10)}`} stroke="#f4e2b0" strokeWidth={1.4} fill="none" opacity={0.7} />
            {[...Array(3)].map((_, k) => {
              const x = J.j(70);
              return <path key={k} d={`M${r1(x - 10)} ${r1(y + 14 + k * 5)}q5 -2.5 10 0t10 0`} stroke="#9e7f45" strokeWidth={0.8} fill="none" opacity={0.6} />;
            })}
          </g>
        );
      })}
      {/* saguaro cactus */}
      <g transform={`translate(${r1(side * 46)} ${r1(-30 + J.j(6))})`} strokeLinecap="round">
        <ellipse cx={4} cy={22} rx={10} ry={3} fill="#5e4a24" opacity={0.5} />
        <path d="M0 22V-14" stroke="#2f5a32" strokeWidth={7} />
        <path d="M0 6H-8V-6M0 0H8V-10" stroke="#2f5a32" strokeWidth={5} fill="none" strokeLinejoin="round" />
        <path d="M-1.5 20V-13" stroke="#5f9a5c" strokeWidth={2} />
      </g>
      {/* rocks and a bleached skull */}
      {[...Array(4)].map((_, i) => {
        const x = J.j(70);
        const y = J.between(30, 85);
        return (
          <g key={i}>
            <ellipse cx={r1(x + 2)} cy={r1(y + 2)} rx={6} ry={2} fill="#6d5631" opacity={0.5} />
            <path d={`M${r1(x - 5)} ${r1(y + 1)}Q${r1(x - 4)} ${r1(y - 5)} ${r1(x + 1)} ${r1(y - 5)}Q${r1(x + 6)} ${r1(y - 3)} ${r1(x + 5)} ${r1(y + 1)}Z`} fill="#8f7a58" />
          </g>
        );
      })}
      <g transform={`translate(${r1(-side * 42)} ${r1(58 + J.j(5))}) scale(0.8)`}>
        <path d="M-10 4C-11 -8 -5 -12 0 -12S11 -8 10 4Z" fill="#efe6cf" stroke="#7b6a4c" strokeWidth={1} />
        <ellipse cx={-4} cy={-3} rx={2.6} ry={3} fill="#3b3226" />
        <ellipse cx={4} cy={-3} rx={2.6} ry={3} fill="#3b3226" />
        <path d="M-18 6Q0 0 18 6L18 10H-18Z" fill="#c9a868" />
      </g>
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
