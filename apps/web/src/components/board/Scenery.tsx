import { memo, type CSSProperties, type ReactElement } from 'react';
import { Rng, hashSeed, type Board, type HarborKind } from '@hexfall/engine';
import { WindmillSails, kilnChimney, windmillHub } from '../../art/terrain/TerrainArt';
import { ResGlyphSvg } from '../../art/pieces/Pieces';
import { HARBOR_NAME, RESOURCE_NAME } from '../../lexicon';
import { ISLAND_PATH, VIEWBOX, VIEWBOX_STR, harborGeometry, hexCenter, toPercent } from './geometry';

/**
 * Everything around and above the tiles that makes the board feel like a moonlit island:
 * the sea, its shores, the moonlight, harbors with ships, and the small things that move.
 * Static parts are painted once. Moving parts animate only opacity/transform on their own
 * small layers, so they cost the compositor almost nothing and stop entirely in Lite mode.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Roughly inside the island (a flat-topped hexagon of radius R around the center). */
function nearIsland(x: number, y: number, R: number): boolean {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  return ay <= (Math.sqrt(3) / 2) * R && Math.sqrt(3) * ax + ay <= Math.sqrt(3) * R;
}

// ------------------------------------------------------------------ sea

/** Where the moon's reflection runs down the water (top right, above the island). */
const MOON_X = 400;

const REFLECTION = (() => {
  const rng = new Rng(hashSeed('moon-path'));
  const out: { x: number; y: number; w: number; o: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const y = VIEWBOX.y + 8 + i * 9.5;
    const spread = 14 + i * 2.6;
    const x = MOON_X + (rng.next() * 2 - 1) * spread * 0.5;
    out.push({ x, y, w: 8 + rng.next() * (10 + i * 1.6), o: 0.7 - i * 0.022 });
  }
  return out;
})();

const WAVES = (() => {
  const rng = new Rng(hashSeed('sea-waves'));
  const out: { x: number; y: number; s: number; o: number }[] = [];
  for (let tries = 0; out.length < 70 && tries < 2000; tries++) {
    const x = VIEWBOX.x + rng.next() * VIEWBOX.w;
    const y = VIEWBOX.y + rng.next() * VIEWBOX.h;
    if (nearIsland(x, y, 520)) continue;
    if (out.some((w) => Math.hypot(w.x - x, w.y - y) < 46)) continue;
    out.push({ x, y, s: 0.7 + rng.next() * 0.7, o: 0.18 + rng.next() * 0.22 });
  }
  return out;
})();

export const Sea = memo(function Sea() {
  return (
    <g aria-hidden>
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sea)" />
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-moonglow)" />
      {/* painted wave marks, like an old sea chart */}
      {WAVES.map((w, i) => (
        <path
          key={i}
          d={`M${r1(w.x - 12 * w.s)} ${r1(w.y)}q${r1(6 * w.s)} ${r1(-6 * w.s)} ${r1(12 * w.s)} 0q${r1(6 * w.s)} ${r1(-6 * w.s)} ${r1(12 * w.s)} 0`}
          stroke="#a9e0e4"
          strokeOpacity={w.o + 0.12}
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <MoonReflection />
    </g>
  );
});

function MoonReflection({ part }: { part?: 0 | 1 }) {
  return (
    <g fill="#eef4ff">
      {REFLECTION.map((d, i) =>
        part === undefined || i % 2 === part ? (
          <rect key={i} x={r1(d.x - d.w / 2)} y={r1(d.y)} width={r1(d.w)} height={2.2} rx={1.1} opacity={r1(Math.max(0.08, d.o) * (part === undefined ? 0.5 : 1))} />
        ) : null,
      )}
    </g>
  );
}

/** Two halves of the moon's reflection fading in and out of step: the water glitters. */
export function MoonShimmer() {
  return (
    <>
      {([0, 1] as const).map((part) => (
        <svg key={part} viewBox={VIEWBOX_STR} className={`absolute inset-0 h-full w-full ${part ? 'anim-shimmer-b' : 'anim-shimmer-a'}`} aria-hidden>
          <MoonReflection part={part} />
        </svg>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ shores and light

/** Drawn under the tiles: the island's shadow, shelving water, surf and a sandy beach. */
export function Shore() {
  const ring = { d: ISLAND_PATH, fill: 'none', strokeLinejoin: 'round' as const };
  return (
    <g>
      <path d={ISLAND_PATH} transform="translate(10 18)" fill="#01080b" opacity={0.55} filter="url(#f-soft)" />
      {/* shelving water: deep blue to turquoise, blurred into a smooth gradient */}
      <g filter="url(#f-water)">
        <path {...ring} stroke="#0f3a44" strokeWidth={180} opacity={0.7} />
        <path {...ring} stroke="#1a5e66" strokeWidth={120} />
        <path {...ring} stroke="#2b8a87" strokeWidth={70} />
      </g>
      {/* surf lines rolling in, slightly irregular */}
      {[
        { k: 1.06, o: 0.55, w: 2.2, dash: '26 8 10 6 18 9' },
        { k: 1.11, o: 0.28, w: 1.8, dash: '14 12 30 10' },
      ].map((f) => (
        <path key={f.k} {...ring} transform={`scale(${f.k})`} stroke="#effcf8" strokeOpacity={f.o} strokeWidth={f.w / f.k} strokeDasharray={f.dash} strokeLinecap="round" />
      ))}
      {/* beach: wet sand, dry sand */}
      <path {...ring} stroke="#a8915e" strokeWidth={34} />
      <path {...ring} stroke="#dcc48c" strokeWidth={28} />
      <path d={ISLAND_PATH} fill="#1a140b" />
    </g>
  );
}

/** Drawn over the tiles: moonlight from the upper left, deepening shadow to the lower right. */
export function Moonlight() {
  return <path d={ISLAND_PATH} fill="url(#g-moonlight)" pointerEvents="none" />;
}

// ------------------------------------------------------------------ harbors

function Ship({ flip }: { flip: boolean }) {
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined}>
      <ellipse cx={0} cy={9} rx={20} ry={3.5} fill="#05141a" opacity={0.5} />
      <path d="M-18 2H18L13 9H-12Z" fill="#5a3a1e" stroke="#20130a" strokeWidth={1} />
      <path d="M-18 2H18L17 4H-17Z" fill="#8a5d33" />
      <path d="M-1 2V-26" stroke="#3a2614" strokeWidth={1.6} />
      <path d="M0 -24Q12 -14 1 -2Z" fill="#e9e1cb" stroke="#6b5a3e" strokeWidth={0.6} />
      <path d="M-2 -22Q-14 -12 -2 -3Z" fill="#b9b1a0" stroke="#6b5a3e" strokeWidth={0.6} />
      <path d="M-1 -26L7 -29L-1 -31Z" fill="#c4302b" />
      <circle cx={14} cy={-1} r={4} fill="url(#g-torch)" />
      <circle cx={14} cy={-1} r={1.2} fill="#ffd27a" />
    </g>
  );
}

function Medallion({ kind }: { kind: HarborKind }) {
  const any = kind === 'any';
  return (
    <g>
      <circle r={25} fill="#06141a" opacity={0.45} transform="translate(2 3)" />
      <circle r={24} fill="url(#g-medallion-rim)" />
      <circle r={20} fill="url(#g-medallion)" />
      <circle r={20} fill="none" stroke="#e8c46a" strokeOpacity={0.35} strokeWidth={0.8} />
      <text y={any ? 3 : -2} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={any ? 13 : 12} fill="#f3ead2">
        {any ? '3:1' : '2:1'}
      </text>
      {any ? (
        <text y={13} textAnchor="middle" fontFamily="Cinzel, serif" fontSize={6.5} fill="#c8b98f" letterSpacing={0.6}>
          ANY
        </text>
      ) : (
        <g transform="translate(0 9)">
          <ResGlyphSvg res={kind} size={11} />
        </g>
      )}
    </g>
  );
}

export const Harbors = memo(
  function Harbors({ board }: { board: Board }) {
    return (
      <g>
        {board.harbors.map((hb) => {
          const g = harborGeometry(hb);
          // the ship rides at anchor beside the medallion, facing along the coast
          const side = hb.id % 2 ? 1 : -1;
          const ship = { x: g.badge.x - g.ny * 40 * side + g.nx * 6, y: g.badge.y + g.nx * 40 * side + g.ny * 6 };
          return (
            <g key={hb.id}>
              {[g.a, g.b].map((p, i) => {
                const d = `M${r1(p.x)} ${r1(p.y)}L${r1(g.badge.x)} ${r1(g.badge.y)}`;
                return (
                  <g key={i} strokeLinecap="butt">
                    <path d={d} stroke="#1c120a" strokeWidth={11} />
                    <path d={d} stroke="#7a5532" strokeWidth={8} />
                    <path d={d} stroke="#3e2a16" strokeWidth={8} strokeDasharray="1.2 5" />
                  </g>
                );
              })}
              <g transform={`translate(${r1(ship.x)} ${r1(ship.y)})`}>
                <Ship flip={side < 0} />
              </g>
              <g transform={`translate(${r1(g.badge.x)} ${r1(g.badge.y)}) scale(1.2)`}>
                <title>{`${HARBOR_NAME[hb.kind]} — ${hb.kind === 'any' ? '3:1 any resource' : `2:1 ${RESOURCE_NAME[hb.kind]}`}`}</title>
                <Medallion kind={hb.kind} />
              </g>
            </g>
          );
        })}
      </g>
    );
  },
  (a, b) => a.board.seed === b.board.seed && a.board.mode === b.board.mode,
);

// ------------------------------------------------------------------ living details

const box = (x: number, y: number, w: number, h: number): CSSProperties => {
  const p = toPercent({ x: x - w / 2, y: y - h / 2 });
  return { left: p.left, top: p.top, width: `${(w / VIEWBOX.w) * 100}%`, height: `${(h / VIEWBOX.h) * 100}%` };
};

const FIREFLY_GROUPS = 3;

/**
 * Turning windmill sails, kiln smoke, fireflies over woods and meadows, and cloud shadows
 * drifting across the island. With `still`, only the sails are drawn (not moving).
 */
export const Ambient = memo(
  function Ambient({ board, still }: { board: Board; still: boolean }) {
    const mills: ReactElement[] = [];
    const smoke: ReactElement[] = [];
    const flies: { x: number; y: number }[][] = Array.from({ length: FIREFLY_GROUPS }, () => []);
    const rng = new Rng(hashSeed(`${board.seed}:ambient`));
    for (const h of board.hexes) {
      const c = hexCenter(h.id);
      const seed = `${board.seed}:${h.id}`;
      if (h.terrain === 'fields') {
        const hub = windmillHub(seed);
        mills.push(
          <div key={h.id} className="absolute" style={box(c.x + hub.x, c.y + hub.y, 56, 56)}>
            <svg viewBox="-28 -28 56 56" className={`h-full w-full overflow-visible ${still ? '' : 'anim-spin'}`} style={{ animationDelay: `${-rng.next() * 12}s` }}>
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
              <span key={i} className="smoke-puff" style={{ animationDelay: `${i * 1.4 + rng.next() * 0.5}s` }} />
            ))}
          </div>,
        );
      }
      if (!still && (h.terrain === 'witchwood' || h.terrain === 'moors')) {
        for (let i = 0; i < 4; i++) {
          const a = rng.next() * Math.PI * 2;
          const r = 38 + rng.next() * 40;
          flies[i % FIREFLY_GROUPS].push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.9 });
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
        {flies.map((group, gi) => (
          <svg key={gi} viewBox={VIEWBOX_STR} className={`absolute inset-0 h-full w-full anim-firefly-${gi}`}>
            {group.map((f, i) => (
              <g key={i} transform={`translate(${r1(f.x)} ${r1(f.y)})`}>
                <circle r={7} fill="url(#g-firefly)" />
                <circle r={1.6} fill="#fbffd0" />
              </g>
            ))}
          </svg>
        ))}
      </div>
    );
  },
  (a, b) => a.board.seed === b.board.seed && a.board.mode === b.board.mode && a.still === b.still,
);
