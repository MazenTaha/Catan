import { memo, type ReactElement } from 'react';
import { Rng, hashSeed, type Terrain } from '@hexfall/engine';
import { ART_MANIFEST } from '../manifest';

/**
 * Hand-built SVG terrain illustrations drawn in a hex-local box (center 0,0, radius 100).
 * The caller clips them to the hex. Each takes a seed so every isle's tiles differ slightly.
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
}

function pinePath(x: number, y: number, h: number, lean: number): string {
  const tiers = 4;
  const w = h * 0.42;
  let d = `M${r1(x - 1.2)} ${r1(y)}L${r1(x + 1.2)} ${r1(y)}L${r1(x + 0.8 + lean * 3)} ${r1(y - h * 0.4)}L${r1(x - 0.8 + lean * 3)} ${r1(y - h * 0.4)}Z`;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = y - h * 0.12 - h * t * 0.78;
    const tw = w * (1 - t * 0.72);
    const cx = x + lean * i * 2.2;
    const top = ty - h * 0.34;
    d += `M${r1(cx - tw)} ${r1(ty)}L${r1(cx - tw * 0.45)} ${r1(ty - h * 0.08)}L${r1(cx - tw * 0.62)} ${r1(ty - h * 0.07)}L${r1(cx)} ${r1(top)}L${r1(cx + tw * 0.6)} ${r1(ty - h * 0.08)}L${r1(cx + tw * 0.42)} ${r1(ty - h * 0.09)}L${r1(cx + tw)} ${r1(ty)}Z`;
  }
  return d;
}

function Witchwood({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const rows = [-62, -30, 2, 34, 66];
  const trees: { x: number; y: number; h: number; lean: number }[] = [];
  rows.forEach((ry, ri) => {
    const count = ri === 0 || ri === 4 ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 42 + J.j(10);
      trees.push({ x, y: ry + 22 + J.j(6), h: 46 + J.j(10) + ri * 3, lean: J.j(1.6) });
    }
  });
  const mistY = J.between(-12, 18);
  return (
    <g>
      <rect x={-100} y={-110} width={200} height={220} fill="url(#g-witchwood)" />
      {[...Array(6)].map((_, i) => (
        <ellipse key={i} cx={r1(J.j(70))} cy={r1(J.j(80))} rx={r1(J.between(14, 26))} ry={r1(J.between(5, 9))} fill="#0d1a12" opacity={0.5} />
      ))}
      {trees
        .filter((t) => t.y < mistY + 10)
        .map((t, i) => (
          <path key={`b${i}`} d={pinePath(t.x, t.y, t.h, t.lean)} fill="#0b1510" stroke="#28463a" strokeWidth={0.7} strokeOpacity={0.55} />
        ))}
      <ellipse cx={0} cy={r1(mistY)} rx={120} ry={13} fill="#c9d8d0" opacity={0.17} filter="url(#f-blur6)" />
      {trees
        .filter((t) => t.y >= mistY + 10)
        .map((t, i) => (
          <path key={`f${i}`} d={pinePath(t.x, t.y, t.h, t.lean)} fill="#08100c" stroke="#33584a" strokeWidth={0.7} strokeOpacity={0.5} />
        ))}
      <ellipse cx={r1(J.j(30))} cy={r1(mistY + 40)} rx={90} ry={8} fill="#c9d8d0" opacity={0.09} filter="url(#f-blur6)" />
    </g>
  );
}

function AshenHills({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const bands = [-70, -35, 0, 35, 70];
  const vents = [...Array(3)].map(() => ({ x: J.j(55), y: J.j(55) }));
  return (
    <g>
      <rect x={-100} y={-110} width={200} height={220} fill="url(#g-ashen)" />
      {bands.map((y0, i) => {
        const y = y0 + J.j(5);
        const bend = 14 + J.j(8);
        return (
          <g key={i}>
            <path
              d={`M-110 ${r1(y)}Q${r1(J.j(30))} ${r1(y - bend)} 110 ${r1(y + J.j(6))}L110 ${r1(y + 36)}Q0 ${r1(y + 36 - bend)} -110 ${r1(y + 36)}Z`}
              fill={i % 2 ? '#6a2e1a' : '#82432a'}
              opacity={0.9}
            />
            <path d={`M-110 ${r1(y)}Q${r1(J.j(30))} ${r1(y - bend)} 110 ${r1(y)}`} stroke="#c06d42" strokeWidth={1.2} fill="none" opacity={0.45} />
            <path d={`M-110 ${r1(y + 4)}Q0 ${r1(y + 4 - bend)} 110 ${r1(y + 4)}`} stroke="#2a110a" strokeWidth={1} fill="none" opacity={0.5} />
          </g>
        );
      })}
      {[...Array(6)].map((_, i) => {
        let x = J.j(70);
        let y = J.j(70);
        let d = `M${r1(x)} ${r1(y)}`;
        for (let k = 0; k < 4; k++) {
          x += J.j(10);
          y += 6 + J.j(4);
          d += `L${r1(x)} ${r1(y)}`;
        }
        return <path key={i} d={d} stroke="#250e07" strokeWidth={1.3} fill="none" opacity={0.8} />;
      })}
      {vents.map((v, i) => (
        <g key={i}>
          <circle cx={r1(v.x)} cy={r1(v.y)} r={13} fill="url(#g-ember)" opacity={0.8} />
          <ellipse cx={r1(v.x)} cy={r1(v.y)} rx={4.5} ry={2.4} fill="#ffb26b" className="anim-pulse" />
          <path
            d={`M${r1(v.x)} ${r1(v.y - 3)}q-5 -10 2 -18t-2 -18`}
            stroke="#a89c92"
            strokeWidth={3}
            fill="none"
            opacity={0.22}
            filter="url(#f-blur2)"
          />
        </g>
      ))}
    </g>
  );
}

function GloomMoors({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const pools = [...Array(3)].map(() => ({ x: J.j(50), y: J.j(55), rx: J.between(16, 28), ry: J.between(6, 10) }));
  const reeds = [...Array(7)].map(() => ({ x: J.j(68), y: J.j(70) }));
  const wisps = [...Array(3)].map(() => ({ x: J.j(55), y: J.j(55), d: J.between(0, 2) }));
  return (
    <g>
      <rect x={-100} y={-110} width={200} height={220} fill="url(#g-moors)" />
      {[...Array(8)].map((_, i) => (
        <ellipse key={i} cx={r1(J.j(75))} cy={r1(J.j(80))} rx={r1(J.between(8, 18))} ry={r1(J.between(4, 7))} fill="#4c5a34" opacity={0.7} />
      ))}
      {pools.map((p, i) => (
        <g key={i}>
          <ellipse cx={r1(p.x)} cy={r1(p.y)} rx={r1(p.rx)} ry={r1(p.ry)} fill="#141b14" />
          <ellipse cx={r1(p.x - p.rx * 0.2)} cy={r1(p.y - p.ry * 0.3)} rx={r1(p.rx * 0.5)} ry={1.2} fill="#9fb8a6" opacity={0.25} />
        </g>
      ))}
      {reeds.map((r, i) => (
        <g key={i} stroke="#232a18" strokeWidth={1.3} fill="none" strokeLinecap="round">
          {[-4, -1.5, 1, 3.5].map((dx, k) => (
            <path key={k} d={`M${r1(r.x + dx)} ${r1(r.y)}q${r1(dx * 0.8)} -9 ${r1(dx * 1.4 + J.j(2))} ${r1(-16 - k * 2)}`} />
          ))}
          <ellipse cx={r1(r.x - 1)} cy={r1(r.y - 15)} rx={1.4} ry={3.4} fill="#3a2716" stroke="none" />
        </g>
      ))}
      <ellipse cx={0} cy={r1(J.j(25))} rx={120} ry={20} fill="#cfdccd" opacity={0.16} filter="url(#f-blur6)" />
      {wisps.map((w, i) => (
        <g key={i} className="anim-pulse" style={{ animationDelay: `${w.d}s` }}>
          <circle cx={r1(w.x)} cy={r1(w.y)} r={9} fill="url(#g-wisp)" />
          <circle cx={r1(w.x)} cy={r1(w.y)} r={1.8} fill="#e6fff3" />
        </g>
      ))}
    </g>
  );
}

function BlightedFields({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const rows: ReactElement[] = [];
  for (let i = -8; i <= 8; i++) {
    const off = i * 14 + J.j(2);
    let ticks = '';
    for (let k = -6; k <= 6; k++) {
      const x = k * 16 + off * 0.35 + J.j(2);
      const y = off + k * -5.5;
      ticks += `M${r1(x)} ${r1(y)}l${r1(J.j(1.5))} -7`;
    }
    rows.push(
      <g key={i}>
        <path d={`M-120 ${r1(off + 33)}L120 ${r1(off - 33)}`} stroke="#5f4b1d" strokeWidth={2} opacity={0.55} />
        <path d={ticks} stroke="#d6ba6a" strokeWidth={1.1} opacity={0.45} />
      </g>,
    );
  }
  const sx = J.j(30);
  const sy = J.j(20);
  return (
    <g>
      <rect x={-100} y={-110} width={200} height={220} fill="url(#g-fields)" />
      <g transform="rotate(0)">{rows}</g>
      {[...Array(4)].map((_, i) => (
        <ellipse key={i} cx={r1(J.j(65))} cy={r1(J.j(70))} rx={r1(J.between(10, 20))} ry={r1(J.between(4, 8))} fill="#4a3815" opacity={0.45} />
      ))}
      {/* scarecrow */}
      <g transform={`translate(${r1(sx)} ${r1(sy)})`} fill="#17130c" stroke="#17130c">
        <path d="M0 -22V24" strokeWidth={2.4} />
        <path d="M-17 -10H17" strokeWidth={2} />
        <circle cx={0} cy={-27} r={5.5} stroke="none" />
        <path d="M-8 -31h16l-3 -6h-10z" stroke="none" />
        <path d="M-9 -12h18l3 18-4-3-3 5-3-4-2 5-3-5-3 4-3-5-4 3z" stroke="none" />
        <path d="M-17 -10l-2 6m4-5 0 6m30-7 2 6m-5-5 0 6" strokeWidth={1.1} />
        {/* perched crow */}
        <path d="M12 -13q2 -5 6 -3l3 -1-2 2q1 3-3 3z" stroke="none" />
      </g>
      {[...Array(3)].map((_, i) => {
        const x = J.j(60);
        const y = -40 + J.j(25);
        return <path key={i} d={`M${r1(x - 6)} ${r1(y)}q3 -3.5 6 0q3 -3.5 6 0`} stroke="#14110b" strokeWidth={1.6} fill="none" />;
      })}
    </g>
  );
}

function ObsidianPeaks({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const spires = [
    { x: -38 + J.j(8), base: 55, h: 95 + J.j(15), w: 34 },
    { x: 8 + J.j(8), base: 60, h: 120 + J.j(15), w: 40 },
    { x: 48 + J.j(8), base: 50, h: 80 + J.j(12), w: 30 },
    { x: -5 + J.j(10), base: 90, h: 60 + J.j(10), w: 28 },
  ];
  return (
    <g>
      <rect x={-100} y={-110} width={200} height={220} fill="url(#g-peaks)" />
      <path
        d={`M-110 30L-70 ${r1(-30 + J.j(10))}L-40 0L-5 ${r1(-50 + J.j(10))}L30 -5L70 ${r1(-35 + J.j(10))}L110 20V110H-110Z`}
        fill="#4d5070"
        opacity={0.6}
      />
      {spires.map((s, i) => {
        const tip = { x: s.x + J.j(6), y: s.base - s.h };
        const mid = s.x + J.j(5);
        return (
          <g key={i}>
            <path d={`M${r1(s.x - s.w)} ${r1(s.base)}L${r1(tip.x)} ${r1(tip.y)}L${r1(mid)} ${r1(s.base)}Z`} fill="#1a1b2a" />
            <path d={`M${r1(mid)} ${r1(s.base)}L${r1(tip.x)} ${r1(tip.y)}L${r1(s.x + s.w)} ${r1(s.base)}Z`} fill="#3a3c58" />
            <path d={`M${r1(tip.x)} ${r1(tip.y)}L${r1(mid)} ${r1(s.base)}`} stroke="#a898e8" strokeWidth={0.9} opacity={0.55} />
            <path
              d={`M${r1(tip.x)} ${r1(tip.y)}L${r1(s.x + s.w)} ${r1(s.base)}`}
              stroke="#6d6a9a"
              strokeWidth={0.7}
              opacity={0.5}
            />
            <path
              d={`M${r1(tip.x + (s.x + s.w - tip.x) * 0.3)} ${r1(tip.y + (s.base - tip.y) * 0.3)}l${r1(-6 + J.j(3))} 14l7 8`}
              stroke="#0e0f18"
              strokeWidth={1}
              fill="none"
              opacity={0.8}
            />
          </g>
        );
      })}
      {[...Array(5)].map((_, i) => {
        const x = J.j(60);
        const y = J.j(50) - 5;
        const s = J.between(2, 4);
        return (
          <path
            key={i}
            d={`M${r1(x)} ${r1(y - s * 2)}L${r1(x + s * 0.5)} ${r1(y)}L${r1(x)} ${r1(y + s * 2)}L${r1(x - s * 0.5)} ${r1(y)}ZM${r1(x - s * 2)} ${r1(y)}L${r1(x + s * 2)} ${r1(y)}`}
            fill="#d4c6ff"
            stroke="#c7b5ff"
            strokeWidth={0.6}
            className={i % 2 ? 'anim-pulse' : undefined}
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        );
      })}
      {[...Array(10)].map((_, i) => {
        const x = J.j(80);
        const y = 60 + J.j(25);
        return <path key={i} d={`M${r1(x)} ${r1(y)}l4 -6l4 6z`} fill="#232438" />;
      })}
    </g>
  );
}

function DeadWaste({ seed }: { seed: string }) {
  const J = new Jit(seed);
  const cracks: string[] = [];
  for (let i = 0; i < 11; i++) {
    let x = J.j(80);
    let y = J.j(85);
    let d = `M${r1(x)} ${r1(y)}`;
    const dir = J.n() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      x += Math.cos(dir + J.j(0.9)) * 11;
      y += Math.sin(dir + J.j(0.9)) * 11;
      d += `L${r1(x)} ${r1(y)}`;
    }
    cracks.push(d);
  }
  const skull = { x: J.j(30) - 15, y: 30 + J.j(12) };
  const tree = { x: 25 + J.j(15), y: 10 + J.j(15) };
  return (
    <g>
      <rect x={-100} y={-110} width={200} height={220} fill="url(#g-waste)" />
      {cracks.map((d, i) => (
        <g key={i}>
          <path d={d} stroke="#c2b597" strokeWidth={2.2} fill="none" opacity={0.25} transform="translate(0.8 0.8)" />
          <path d={d} stroke="#3a3226" strokeWidth={1.3} fill="none" opacity={0.85} />
        </g>
      ))}
      {/* lone dead tree */}
      <g transform={`translate(${r1(tree.x)} ${r1(tree.y)})`} stroke="#211b13" fill="none" strokeLinecap="round">
        <path d="M0 0C-1 -14 2 -26 -2 -42" strokeWidth={3.2} />
        <path d="M-1 -22C-9 -26 -12 -34 -20 -36M-1 -30C6 -34 9 -42 16 -46M-2 -38C-6 -44 -4 -50 -9 -55M12 -42l6 -1M-16 -35l-3 -6" strokeWidth={1.5} />
        <ellipse cx={0} cy={1} rx={10} ry={2.5} fill="#4a4030" stroke="none" opacity={0.5} />
      </g>
      {/* half-buried skull */}
      <g transform={`translate(${r1(skull.x)} ${r1(skull.y)}) rotate(${r1(J.j(18))})`}>
        <path d="M-11 4C-12 -9 -5 -14 0 -14S12 -9 11 4Z" fill="#dcd2b8" stroke="#4b4232" strokeWidth={1} />
        <ellipse cx={-4.5} cy={-3} rx={3} ry={3.4} fill="#2b2419" />
        <ellipse cx={4.5} cy={-3} rx={3} ry={3.4} fill="#2b2419" />
        <path d="M-1 2l1 -3 1 3z" fill="#2b2419" />
        <path d="M-16 5Q0 -1 16 5L16 10H-16Z" fill="#8a7d63" />
      </g>
      {[...Array(3)].map((_, i) => {
        const x = J.j(60);
        const y = J.j(60);
        const a = J.j(80);
        return (
          <g key={i} transform={`translate(${r1(x)} ${r1(y)}) rotate(${r1(a)})`} fill="#d9d0b6" opacity={0.75}>
            <rect x={-6} y={-1} width={12} height={2} />
            <circle cx={-6} cy={-1.4} r={1.6} />
            <circle cx={-6} cy={1.4} r={1.6} />
            <circle cx={6} cy={-1.4} r={1.6} />
            <circle cx={6} cy={1.4} r={1.6} />
          </g>
        );
      })}
    </g>
  );
}

const ART: Record<Terrain, (p: { seed: string }) => ReactElement> = {
  witchwood: Witchwood,
  ashen: AshenHills,
  moors: GloomMoors,
  fields: BlightedFields,
  peaks: ObsidianPeaks,
  waste: DeadWaste,
};

export const TerrainArt = memo(function TerrainArt({ type, seed }: { type: Terrain; seed: string }) {
  const raster = ART_MANIFEST.terrain[type];
  if (raster) {
    return <image href={raster} x={-87} y={-100} width={174} height={200} preserveAspectRatio="xMidYMid slice" />;
  }
  const Comp = ART[type];
  return <Comp seed={seed} />;
});
