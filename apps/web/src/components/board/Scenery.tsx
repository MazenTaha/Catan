import { memo, type CSSProperties, type ReactElement } from 'react';
import { Rng, hashSeed, type Board, type HarborKind } from '@hexfall/engine';
import { WindmillSails, kilnChimney, windmillHub } from '../../art/terrain/TerrainArt';
import { ResGlyphSvg } from '../../art/pieces/Pieces';
import { RES_COLOR } from '../../art/icons/Icon';
import { mix } from '../../art/color';
import { HARBOR_NAME, RESOURCE_NAME } from '../../lexicon';
import {
  ISLAND_PATH,
  VIEWBOX,
  VIEWBOX_STR,
  harborGeometry,
  hexCenter,
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

/** Roughly inside the island (a flat-topped hexagon of radius R around the center). */
function nearIsland(x: number, y: number, R: number): boolean {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  return ay <= (Math.sqrt(3) / 2) * R && Math.sqrt(3) * ax + ay <= Math.sqrt(3) * R;
}

// ------------------------------------------------------------------ sea

/** Where the sun's glitter runs down the water (upper left, above the island). */
const SUN_X = -410;

const GLITTER = (() => {
  const rng = new Rng(hashSeed('sun-path'));
  const out: { x: number; y: number; w: number; o: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const y = VIEWBOX.y + 8 + i * 10;
    const spread = 14 + i * 2.6;
    const x = SUN_X + (rng.next() * 2 - 1) * spread * 0.5;
    out.push({ x, y, w: 8 + rng.next() * (10 + i * 1.5), o: 0.6 - i * 0.022 });
  }
  return out;
})();

const WAVES = (() => {
  const rng = new Rng(hashSeed('sea-waves'));
  const out: { x: number; y: number; s: number; o: number }[] = [];
  for (let tries = 0; out.length < 56 && tries < 2000; tries++) {
    const x = VIEWBOX.x + rng.next() * VIEWBOX.w;
    const y = VIEWBOX.y + rng.next() * VIEWBOX.h;
    if (nearIsland(x, y, 520)) continue;
    if (out.some((w) => Math.hypot(w.x - x, w.y - y) < 50)) continue;
    out.push({ x, y, s: 0.7 + rng.next() * 0.6, o: 0.1 + rng.next() * 0.14 });
  }
  return out;
})();

export const Sea = memo(function Sea() {
  return (
    <g aria-hidden>
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sea)" />
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sunglow)" />
      {/* restrained wave marks, like an old sea chart */}
      <path
        d={WAVES.map(
          (w) =>
            `M${r1(w.x - 12 * w.s)} ${r1(w.y)}q${r1(6 * w.s)} ${r1(-5 * w.s)} ${r1(12 * w.s)} 0q${r1(6 * w.s)} ${r1(-5 * w.s)} ${r1(12 * w.s)} 0`,
        ).join('')}
        stroke="#b9d3cb"
        strokeOpacity={0.22}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      <Glitter />
    </g>
  );
});

function Glitter({ part }: { part?: 0 | 1 }) {
  return (
    <g fill="#fff1cf">
      {GLITTER.map((d, i) =>
        part === undefined || i % 2 === part ? (
          <rect
            key={i}
            x={r1(d.x - d.w / 2)}
            y={r1(d.y)}
            width={r1(d.w)}
            height={2}
            rx={1}
            opacity={r1(Math.max(0.05, d.o) * (part === undefined ? 0.25 : 0.5))}
          />
        ) : null,
      )}
    </g>
  );
}

/** Two halves of the sun's glitter fading in and out of step: the water sparkles. */
export function SunGlint() {
  return (
    <>
      {([0, 1] as const).map((part) => (
        <svg
          key={part}
          viewBox={VIEWBOX_STR}
          className={`absolute inset-0 h-full w-full ${part ? 'anim-shimmer-b' : 'anim-shimmer-a'}`}
          aria-hidden
        >
          <Glitter part={part} />
        </svg>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ shore and light

/**
 * Drawn under the tiles: the board's soft contact shadow on the water, a narrow shelf of
 * muted shallows, a line of foam, the board's raised earthen edge, and a slim sandy beach.
 */
export function Shore() {
  const ring = { d: ISLAND_PATH, fill: 'none', strokeLinejoin: 'round' as const };
  return (
    <g>
      <path d={ISLAND_PATH} transform="translate(9 16)" fill="#04100f" opacity={0.5} filter="url(#f-soft)" />
      <g filter="url(#f-water)">
        <path {...ring} stroke="#2a6164" strokeWidth={104} opacity={0.5} />
        <path {...ring} stroke="#4d8680" strokeWidth={56} opacity={0.55} />
      </g>
      {[
        { k: 1.052, o: 0.42, w: 1.7, dash: '26 8 10 6 18 9' },
        { k: 1.09, o: 0.18, w: 1.4, dash: '14 12 30 10' },
      ].map((f) => (
        <path
          key={f.k}
          {...ring}
          transform={`scale(${f.k})`}
          stroke="#e9efe4"
          strokeOpacity={f.o}
          strokeWidth={f.w / f.k}
          strokeDasharray={f.dash}
          strokeLinecap="round"
        />
      ))}
      {/* the board's edge: a band of earth showing under the beach, deepest at the bottom */}
      <path {...ring} transform="translate(0 6)" stroke="#2b2318" strokeWidth={31} />
      <path {...ring} stroke="#9c8459" strokeWidth={26} />
      <path {...ring} stroke="#cdb784" strokeWidth={21} />
      <path {...ring} stroke="#e2d0a0" strokeWidth={13} />
      <path d={ISLAND_PATH} fill="#1a140b" />
    </g>
  );
}

/** Drawn over the tiles: one sunlight wash across the island, warm upper left, cool lower right. */
export function Sunlight() {
  return <path d={ISLAND_PATH} fill="url(#g-sunlight)" pointerEvents="none" />;
}

// ------------------------------------------------------------------ harbors

/** A small single-masted boat at anchor, its sail lit from the upper left. */
function Boat({ flip }: { flip: boolean }) {
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined} strokeLinejoin="round">
      <path d="M-24 8q4 1.2 8 0M17 8q3 1 6 0" stroke="#e6eee6" strokeWidth={0.9} fill="none" opacity={0.4} strokeLinecap="round" />
      <ellipse cx={3} cy={9} rx={19} ry={3.2} fill="#06141a" opacity={0.35} />
      <path d="M-17 1H16Q14 7 9 8.5H-11Q-16 6 -17 1Z" fill="#5b4029" stroke={EDGE} strokeWidth={0.8} />
      <path d="M-16.4 1.2H15.6L15 3H-15.8Z" fill="#8d6843" />
      <path d="M-11 8.5H9" stroke="#2c2016" strokeWidth={0.9} />
      <path d="M-1 1V-27" stroke="#3d2c1e" strokeWidth={1.4} />
      <path d="M0 -25Q12 -14 1 -2Z" fill="#cfc4a8" stroke={EDGE} strokeWidth={0.7} />
      <path d="M0 -25Q7.5 -15 1 -2Z" fill="#f1e8d2" />
      <path d="M-2 -22Q-12 -12 -2 -3Z" fill="#e6dcc2" stroke={EDGE} strokeWidth={0.7} />
      <path d="M-1 -27L7 -29L-1 -31Z" fill="#9e3a2a" />
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
    return (
      <g>
        {board.harbors.map((hb) => {
          const g = harborGeometry(hb);
          // the boat rides at anchor beside the plaque, facing along the coast
          const side = hb.id % 2 ? 1 : -1;
          const boat = {
            x: g.badge.x - g.ny * 40 * side + g.nx * 6,
            y: g.badge.y + g.nx * 40 * side + g.ny * 6,
          };
          return (
            <g key={hb.id}>
              {[g.a, g.b].map((p, i) => {
                const d = `M${r1(p.x)} ${r1(p.y)}L${r1(g.badge.x)} ${r1(g.badge.y)}`;
                return (
                  <g key={i} strokeLinecap="butt">
                    <path d={d} transform="translate(1.5 2.5)" stroke="#0b1a1c" strokeWidth={9} opacity={0.35} />
                    <path d={d} stroke="#7a5a3c" strokeWidth={7} />
                    <path d={d} stroke="#4e3826" strokeWidth={7} strokeDasharray="0.8 3.2" />
                    <path d={d} transform="translate(-0.6 -1)" stroke="#b08a5e" strokeWidth={1.6} opacity={0.75} />
                  </g>
                );
              })}
              <g transform={`translate(${r1(boat.x)} ${r1(boat.y)})`}>
                <Boat flip={side < 0} />
              </g>
              <g transform={`translate(${r1(g.badge.x)} ${r1(g.badge.y)}) scale(1.2)`}>
                <title>{`${HARBOR_NAME[hb.kind]} — ${hb.kind === 'any' ? '3:1 any resource' : `2:1 ${RESOURCE_NAME[hb.kind]}`}`}</title>
                <Plaque kind={hb.kind} />
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
