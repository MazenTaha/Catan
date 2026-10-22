import { memo } from 'react';
import type { PlayerColor, Resource, Sigil } from '@hexfall/engine';
import { pips } from '@hexfall/engine';
import { COLOR_HEX } from '../../lexicon';
import { lit, shade } from '../color';
import { RES_COLOR } from '../icons/Icon';
import { SIGIL_PATH } from './Sigil';

/**
 * The game pieces as painted miniatures: one light from the upper left (warm on lit faces,
 * cool on shaded ones), soft contact shadows to the lower right, and only a faint edge line
 * where it helps a silhouette read. Player colour covers most of every piece, and settlements,
 * cities and roads differ in silhouette, so ownership and kind read without relying on colour.
 */

const RES_SVG: Record<Resource, string> = {
  wood: 'M12 3 7 10h3l-4 5h4l-3 4h10l-3-4h4l-4-5h3zM12 19v3',
  clay: 'M3 9h8v5H3zM13 9h8v5h-8zM8 14h8v5H8zM6 4h12v5H6z',
  wool: 'M6 14a4 4 0 0 1 3-6 4.5 4.5 0 0 1 8 .5A3.5 3.5 0 0 1 18 15H7a3 3 0 0 1-1-1z',
  grain:
    'M12 21V7M12 7c-2-1-3-3-3-5 2 1 3 2 3 5zm0 0c2-1 3-3 3-5-2 1-3 2-3 5zM12 12c-2-1-3.5-2.5-4-5 2 .5 3.5 2 4 5zm0 0c2-1 3.5-2.5 4-5-2 .5-3.5 2-4 5z',
  ore: 'M12 3 5 8l1.5 9L12 21l5.5-4L19 8zM5 8l7 3 7-3M12 11v10',
};

/** Resource glyph positioned in SVG space (centered at 0,0). */
export function ResGlyphSvg({ res, size = 16, color }: { res: Resource; size?: number; color?: string }) {
  const s = size / 24;
  return (
    <g transform={`translate(${-size / 2} ${-size / 2}) scale(${s})`}>
      <path
        d={RES_SVG[res]}
        fill="none"
        stroke={color ?? RES_COLOR[res]}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Faint silhouette line. */
const EDGE = 'rgba(16,13,9,0.62)';
const STONE = '#8f897c';
const STONE_LIT = '#cbc4b2';
const DOOR = '#2a1f16';
const WINDOW = '#e9b65c';

function SigilMark({ sigil, color, x, y, size }: { sigil: Sigil; color: PlayerColor; x: number; y: number; size: number }) {
  const s = size / 20;
  return (
    <path
      d={SIGIL_PATH[sigil]}
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}
      fill={color === 'bone' ? '#3a3328' : shade(COLOR_HEX[color], 0.72)}
      fillOpacity={0.85}
      fillRule="evenodd"
    />
  );
}

interface PieceProps {
  color: PlayerColor;
  sigil: Sigil;
  ghost?: boolean;
  rim?: boolean;
}

/** Player colour, lit and shaded for the three faces a piece shows. */
function tones(color: PlayerColor) {
  const c = COLOR_HEX[color];
  return {
    wall: lit(c, 0.1),
    wallLit: lit(c, 0.32),
    side: shade(c, 0.42),
    roof: shade(c, 0.24),
    roofLit: lit(shade(c, 0.1), 0.2),
    verge: shade(c, 0.62),
    timber: shade(c, 0.58),
    rim: lit(c, 0.45),
  };
}

const SETTLEMENT_SIL = 'M-12.5 14.5V-2L-3 -12.5L5 -15.5L12.5 -6.5V8L12.5 13Z';

export const OutpostPiece = memo(function OutpostPiece({ color, sigil, ghost, rim }: PieceProps) {
  const t = tones(color);
  return (
    <g opacity={ghost ? 0.62 : 1} strokeDasharray={ghost ? '3 2' : undefined} strokeLinejoin="round">
      {!ghost && <ellipse cx={5} cy={13.5} rx={15} ry={4} fill="#0a0d08" opacity={0.38} />}
      {rim && <path d={SETTLEMENT_SIL} fill="none" stroke={t.rim} strokeWidth={4.5} opacity={0.5} />}
      {/* stone plinth */}
      <path d="M-11.5 14V10.5H4L11.5 7.5V11L4 14Z" fill={STONE} stroke={EDGE} strokeWidth={0.8} />
      <path d="M-11.5 10.5H4L11.5 7.5" stroke={STONE_LIT} strokeWidth={0.9} fill="none" />
      {/* gable end facing the viewer, in sun */}
      <path d="M-10 10.5V-2L-3 -11L4 -2V10.5Z" fill={t.wall} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-10 10.5V-2L-3 -11L-3 10.5Z" fill={t.wallLit} opacity={0.45} />
      {/* side wall receding to the right, in shade */}
      <path d="M4 10.5V-2L10.5 -5V7.5Z" fill={t.side} stroke={EDGE} strokeWidth={0.9} />
      {/* roof over the side wall, its ridge catching light */}
      <path d="M-3 -11L4 -2.2L11.6 -5.4L4.6 -14.2Z" fill={t.roof} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-3 -11L4.6 -14.2L5.8 -12.8L-1.4 -9.6Z" fill={t.roofLit} />
      <path d="M-11 -1.4L-3 -11.6L4.6 -1.6" stroke={t.verge} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {/* half-timbering, door and a warm window */}
      <path d="M-10 3.5H4M-6.6 3.5V10.5M0.6 3.5V10.5" stroke={t.timber} strokeWidth={0.9} opacity={0.6} fill="none" />
      <path d="M-4.6 10.5V6.6Q-4.6 4.8 -3 4.8Q-1.4 4.8 -1.4 6.6V10.5Z" fill={DOOR} />
      <path d="M6 2L8.4 0.9V3.7L6 4.8Z" fill={WINDOW} />
      {/* chimney */}
      <path d="M6.4 -10.6V-15.8H9.2V-12Z" fill={STONE} stroke={EDGE} strokeWidth={0.7} />
      <path d="M6.4 -15.8H9.2" stroke={STONE_LIT} strokeWidth={0.8} />
      <SigilMark sigil={sigil} color={color} x={-3} y={-1.8} size={6.5} />
    </g>
  );
});

const CITY_SIL = 'M-22.5 14.5V-15L-15.5 -30.5L-8.5 -15V-9L-2.5 -18.5L4 -21.5L9 -18V-30H19.5V9L20.5 14.5Z';

export const CitadelPiece = memo(function CitadelPiece({ color, sigil, ghost, rim }: PieceProps) {
  const t = tones(color);
  return (
    <g opacity={ghost ? 0.62 : 1} strokeDasharray={ghost ? '3 2' : undefined} strokeLinejoin="round">
      {!ghost && <ellipse cx={5} cy={15.5} rx={23} ry={5} fill="#0a0d08" opacity={0.4} />}
      {rim && <path d={CITY_SIL} fill="none" stroke={t.rim} strokeWidth={4.5} opacity={0.5} />}
      {/* stone plinth */}
      <path d="M-21 16V12.5H8L20 8.5V12L8 16Z" fill={STONE} stroke={EDGE} strokeWidth={0.8} />
      <path d="M-21 12.5H8L20 8.5" stroke={STONE_LIT} strokeWidth={0.9} fill="none" />
      {/* gabled hall behind */}
      <path d="M6 12.5V-8L12.5 -11V9Z" fill={t.side} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-11 12.5V-8L-2.5 -17L6 -8V12.5Z" fill={t.wall} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-2.5 -17L6 -8.2L12.6 -11.4L4 -20.2Z" fill={t.roof} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-2.5 -17L4 -20.2L5.2 -18.8L-0.8 -15.8Z" fill={t.roofLit} />
      <path d="M-11.8 -7.4L-2.5 -17.6L6.6 -7.6" stroke={t.verge} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <path d="M-4.2 -5.5V-8.4Q-4.2 -10 -2.5 -10Q-0.8 -10 -0.8 -8.4V-5.5Z" fill={WINDOW} />
      {/* round tower with a conical roof */}
      <path d="M-20 12.5V-15H-11V12.5Z" fill={t.wall} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-20 12.5V-15H-17V12.5Z" fill={t.wallLit} opacity={0.55} />
      <path d="M-13.6 12.5V-15H-11V12.5Z" fill={t.side} opacity={0.7} />
      <path d="M-22 -14.5L-15.5 -30L-9 -14.5Z" fill={t.roof} stroke={EDGE} strokeWidth={0.9} />
      <path d="M-22 -14.5L-15.5 -30L-15.5 -14.5Z" fill={t.roofLit} />
      <path d="M-16.4 -6V-9.6H-14.6V-6Z" fill={DOOR} />
      {/* crenellated keep with a pennant */}
      <path d="M15 9V-26L19 -27.5V7.5Z" fill={t.side} stroke={EDGE} strokeWidth={0.9} />
      <path
        d="M9 12V-26V-29H11V-26H13V-29H15V-26V12Z"
        fill={t.wall}
        stroke={EDGE}
        strokeWidth={0.9}
      />
      <path d="M9 12V-26H11V12Z" fill={t.wallLit} opacity={0.5} />
      <path d="M11.4 -19V-15.4M11.4 -9V-5.4" stroke={DOOR} strokeWidth={1.1} />
      <path d="M12 -29V-36" stroke="#3d2c1e" strokeWidth={0.9} />
      <path d="M12 -36L18.5 -34.4L12 -32.8Z" fill={t.wallLit} stroke={EDGE} strokeWidth={0.5} />
      {/* curtain wall in front, with a gate */}
      <path
        d="M-12 12.5V3.5H-10V1.8H-8V3.5H-5V1.8H-3V3.5H0V1.8H2V3.5H5V1.8H7V3.5H9V12.5Z"
        fill={t.wall}
        stroke={EDGE}
        strokeWidth={0.9}
      />
      <path d="M-12 5.4H9" stroke={t.timber} strokeWidth={0.7} opacity={0.5} />
      <path d="M-3.4 12.5V8.4Q-3.4 6 -1 6Q1.4 6 1.4 8.4V12.5Z" fill={DOOR} />
      <SigilMark sigil={sigil} color={color} x={-15.5} y={0} size={6} />
      <SigilMark sigil={sigil} color={color} x={-7.5} y={8.6} size={5.5} />
    </g>
  );
});

/** A timber road drawn along +x, centered at 0,0. */
export const CausewayPiece = memo(function CausewayPiece({
  color,
  ghost,
  rim,
  length = 58,
}: {
  color: PlayerColor;
  ghost?: boolean;
  rim?: boolean;
  length?: number;
}) {
  const c = COLOR_HEX[color];
  const L = length;
  const h = L / 2;
  const grain = `M${-h + 4} -0.4q8 -1.2 16 0t16 0t16 0M${-h + 9} 2q7 -0.9 14 0t14 0`;
  return (
    <g opacity={ghost ? 0.62 : 1} strokeDasharray={ghost ? '3 2' : undefined}>
      {!ghost && <rect x={-h + 2.5} y={-2} width={L} height={10} rx={3} fill="#0a0d08" opacity={0.32} />}
      {rim && (
        <rect x={-h - 3} y={-8.5} width={L + 6} height={17} rx={5} fill="none" stroke={lit(c, 0.45)} strokeWidth={4} opacity={0.5} />
      )}
      <rect x={-h} y={-4.8} width={L} height={9.6} rx={2.4} fill={lit(c, 0.06)} stroke={EDGE} strokeWidth={0.9} />
      <rect x={-h + 1} y={1.6} width={L - 2} height={2.8} rx={1.3} fill={shade(c, 0.45)} opacity={0.85} />
      <rect x={-h + 1.5} y={-4.1} width={L - 3} height={2} rx={1} fill={lit(c, 0.38)} opacity={0.85} />
      <path d={grain} stroke={shade(c, 0.5)} strokeWidth={0.7} fill="none" opacity={0.45} />
      <path d={`M${-L / 6} -4.8V4.8M${L / 6} -4.8V4.8`} stroke={shade(c, 0.6)} strokeWidth={0.8} opacity={0.6} />
      {[-h + 4, h - 4].map((x) => (
        <circle key={x} cx={x} cy={0} r={1.1} fill={shade(c, 0.65)} />
      ))}
    </g>
  );
});

/** The robber: a hooded traveller in weathered charcoal, leaning on a staff, on a stone pawn base. */
export const WraithPawn = memo(function WraithPawn() {
  return (
    <g strokeLinejoin="round">
      <ellipse cx={6} cy={34} rx={20} ry={5} fill="#0a0d08" opacity={0.4} />
      {/* staff */}
      <path d="M13.5 -19L10.5 31" stroke="#4e3a28" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M13 -18.5L10.2 29" stroke="#8a6a48" strokeWidth={0.7} strokeLinecap="round" />
      {/* pawn base */}
      <path d="M-17 34Q-17 26 -10 24.5H10Q17 26 17 34Z" fill="#4b4e4c" stroke={EDGE} strokeWidth={0.9} />
      <path d="M-17 34Q-17 26 -10 24.5H-2Q-9 27 -9 34Z" fill="#6f716c" />
      {/* cloak */}
      <path d="M-11 25Q-14 8 -8.5 -6Q0 -9.5 8.5 -6Q14 8 11 25Q0 27.5 -11 25Z" fill="#383b3d" stroke={EDGE} strokeWidth={1} />
      <path d="M-11 25Q-14 8 -8.5 -6Q-3 -8 -1 -7.5Q-6 6 -4 26Q-8 25.8 -11 25Z" fill="#5d615f" />
      <path d="M2 -6Q5 8 4 25M-4 -5Q-7 8 -6.5 24" stroke="#232628" strokeWidth={0.9} fill="none" opacity={0.75} />
      <path d="M-9.6 8Q0 10.6 9.6 8" stroke="#2a2016" strokeWidth={1.6} fill="none" />
      <path d="M-1.2 8.6H1.4V10.6H-1.2Z" fill="#c9cdcd" />
      {/* hand on the staff */}
      <ellipse cx={11.6} cy={2} rx={2.4} ry={2} fill="#2e3133" />
      {/* hood */}
      <path d="M-9 -6Q-11 -20 -2 -27Q3 -29.5 7 -26Q11 -19 9 -6Q0 -2.5 -9 -6Z" fill="#45484a" stroke={EDGE} strokeWidth={1} />
      <path d="M-9 -6Q-11 -20 -2 -27Q0 -28 1.5 -27.6Q-5 -19 -4.5 -5Q-7 -5 -9 -6Z" fill="#6c6f6c" />
      <path d="M-4.5 -8Q-5.5 -18 1 -19.5Q6 -18 5 -8Q0 -6.5 -4.5 -8Z" fill="#141516" />
      <path d="M-1.6 -12.4h1.2M2.4 -12.4h1.2" stroke="#b9ab84" strokeWidth={0.8} opacity={0.65} strokeLinecap="round" />
    </g>
  );
});

/** An aged-ivory number token; 6 and 8 are lettered in madder red. */
export const NumberToken = memo(function NumberToken({ n, glow = false }: { n: number; glow?: boolean }) {
  const red = n === 6 || n === 8;
  const p = pips(n);
  const ink = red ? '#a3311f' : '#3b2f22';
  return (
    <g aria-hidden>
      {glow && <circle r={34} fill="url(#g-token-glow)" className="anim-pulse" />}
      <circle r={23.5} cx={2} cy={3} fill="#0c0e08" opacity={0.38} />
      <circle r={23} fill="url(#g-token-rim)" stroke="rgba(50,40,24,0.55)" strokeWidth={0.8} />
      <circle r={19.5} fill="url(#g-token)" />
      <circle r={19.5} fill="none" stroke="#8d7a55" strokeWidth={0.9} opacity={0.55} />
      <path d="M-13 -11Q-5 -18 5 -17.5" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {glow && <circle r={23} fill="none" stroke="#fff0b8" strokeWidth={2.5} />}
      <text y={4.5} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={n >= 10 ? 17 : 20} fill={ink}>
        {n}
      </text>
      <g fill={ink}>
        {[...Array(p)].map((_, i) => (
          <circle key={i} cx={(i - (p - 1) / 2) * 3.8} cy={11.5} r={1.35} />
        ))}
      </g>
    </g>
  );
});
