import { memo } from 'react';
import type { HarborKind, PlayerColor, Resource, Sigil } from '@hexfall/engine';
import { pips } from '@hexfall/engine';
import { COLOR_HEX } from '../../lexicon';
import { RES_COLOR } from '../icons/Icon';
import { SIGIL_PATH } from './Sigil';

const RES_SVG: Record<Resource, string> = {
  wood: 'M12 3 7 10h3l-4 5h4l-3 4h10l-3-4h4l-4-5h3zM12 19v3',
  clay: 'M3 9h8v5H3zM13 9h8v5h-8zM8 14h8v5H8zM6 4h12v5H6z',
  wool: 'M6 14a4 4 0 0 1 3-6 4.5 4.5 0 0 1 8 .5A3.5 3.5 0 0 1 18 15H7a3 3 0 0 1-1-1z',
  grain:
    'M12 21V7M12 7c-2-1-3-3-3-5 2 1 3 2 3 5zm0 0c2-1 3-3 3-5-2 1-3 2-3 5zM12 12c-2-1-3.5-2.5-4-5 2 .5 3.5 2 4 5zm0 0c2-1 3.5-2.5 4-5-2 .5-3.5 2-4 5z',
  ore: 'M12 3 5 8l1.5 9L12 21l5.5-4L19 8zM5 8l7 3 7-3M12 11v10',
};

/** Resource glyph positioned in SVG space (centered at 0,0). */
export function ResGlyphSvg({
  res,
  size = 16,
  color,
}: {
  res: Resource;
  size?: number;
  color?: string;
}) {
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

function SigilMark({
  sigil,
  color,
  x,
  y,
  size,
}: {
  sigil: Sigil;
  color: PlayerColor;
  x: number;
  y: number;
  size: number;
}) {
  const s = size / 20;
  return (
    <path
      d={SIGIL_PATH[sigil]}
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}
      fill={color === 'bone' ? '#3a3328' : '#0b0c10'}
      fillOpacity={0.75}
      fillRule="evenodd"
    />
  );
}

export const Torch = memo(function Torch({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={9} fill="url(#g-torch)" />
      <path d="M0 2V9" stroke="#3a2a1a" strokeWidth={1.6} />
      <path d="M0 -6C2.5 -3 3 -1 2 1.5C1.4 3 -1.4 3 -2 1.5C-3 -1 -2 -3 0 -6Z" fill="#ffb347" />
      <path
        d="M0 -3C1.2 -1.5 1.3 0 .8 1.2C.5 1.8 -.5 1.8 -.8 1.2C-1.3 0 -1 -1.5 0 -3Z"
        fill="#fff1b8"
      />
    </g>
  );
});

interface PieceProps {
  color: PlayerColor;
  sigil: Sigil;
  ghost?: boolean;
  rim?: boolean;
}

/** Line-art ink shared with the terrain art. */
const INK = '#2b1a22';
const GOLD = '#e9b955';

export const OutpostPiece = memo(function OutpostPiece({ color, sigil, ghost, rim }: PieceProps) {
  const c = COLOR_HEX[color];
  return (
    <g opacity={ghost ? 0.6 : 1} strokeDasharray={ghost ? '3 2' : undefined} strokeLinejoin="round">
      {!ghost && <ellipse cx={2} cy={13} rx={15} ry={4.5} fill={INK} opacity={0.45} />}
      {rim && (
        <path
          d="M-11 14L-10 -7L0 -24L10 -7L11 14Z"
          fill="none"
          stroke={c}
          strokeWidth={5}
          opacity={0.35}
        />
      )}
      <path d="M-10 13L-9.5 -5H9.5L10 13Z" fill={c} stroke={INK} strokeWidth={1.8} />
      <path d="M2.5 13V-5H9.5L10 13Z" fill="#000" opacity={0.22} />
      <path d="M-13 -4L0 -21L13 -4Z" fill={c} stroke={INK} strokeWidth={1.8} />
      <path d="M0 -21L13 -4H3Z" fill="#000" opacity={0.3} />
      <path d="M-13 -4L0 -21L13 -4" fill="none" stroke={INK} strokeWidth={1.8} />
      <path
        d="M-8.5 -6.5L-1 -16.5"
        stroke="#fff"
        strokeWidth={1.4}
        opacity={0.55}
        strokeLinecap="round"
      />
      <path d="M-12 -4H12" stroke={GOLD} strokeWidth={1.6} />
      <circle cx={0} cy={-21} r={1.8} fill={GOLD} stroke={INK} strokeWidth={0.8} />
      <path d="M-3 13V8a3 3 0 0 1 6 0v5Z" fill={INK} />
      <SigilMark sigil={sigil} color={color} x={0} y={1.5} size={8} />
      {!ghost && <Torch x={12.5} y={-3} />}
    </g>
  );
});

export const CitadelPiece = memo(function CitadelPiece({ color, sigil, ghost, rim }: PieceProps) {
  const c = COLOR_HEX[color];
  return (
    <g opacity={ghost ? 0.6 : 1} strokeDasharray={ghost ? '3 2' : undefined} strokeLinejoin="round">
      {!ghost && <ellipse cx={2} cy={15} rx={22} ry={5} fill={INK} opacity={0.45} />}
      {rim && (
        <path
          d="M-20 16V-8L-15 -24L0 -38L15 -24L20 -8V16Z"
          fill="none"
          stroke={c}
          strokeWidth={5}
          opacity={0.35}
        />
      )}
      {/* corner spires */}
      <path
        d="M17 -6L15 -22L13 -6ZM-13 -6L-15 -22L-17 -6Z"
        fill={c}
        stroke={INK}
        strokeWidth={1.3}
      />
      {/* walls with battlements */}
      <path
        d="M-19 15V-6H-14V-11H-9V-6H-5V-11H5V-6H9V-11H14V-6H19V15Z"
        fill={c}
        stroke={INK}
        strokeWidth={1.8}
      />
      <path d="M9 15V-6H14V-11H19V15Z" fill="#000" opacity={0.22} />
      <path d="M-19 0H19" stroke={GOLD} strokeWidth={1.6} />
      {/* keep */}
      <path d="M-8 -6V-20L0 -36L8 -20V-6Z" fill={c} stroke={INK} strokeWidth={1.6} />
      <path d="M0 -36L8 -20V-6H2V-20Z" fill="#000" opacity={0.25} />
      <path
        d="M-6 -21L-1 -31"
        stroke="#fff"
        strokeWidth={1.3}
        opacity={0.55}
        strokeLinecap="round"
      />
      <path d="M-8 -20H8" stroke={GOLD} strokeWidth={1.4} />
      <circle cx={0} cy={-36} r={2} fill={GOLD} stroke={INK} strokeWidth={0.8} />
      {!ghost && <circle cx={0} cy={-13} r={7} fill="url(#g-torch)" opacity={0.8} />}
      <path
        d="M-2.4 -10V-15a2.4 2.4 0 0 1 4.8 0V-10Z"
        fill="#ffd56b"
        stroke={INK}
        strokeWidth={0.8}
      />
      <path d="M-4 15V9a4 4 0 0 1 8 0v6Z" fill={INK} />
      <SigilMark sigil={sigil} color={color} x={-11.5} y={7} size={8} />
      <SigilMark sigil={sigil} color={color} x={11.5} y={7} size={8} />
    </g>
  );
});

/** Causeway plank drawn along +x, centered at 0,0. */
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
  return (
    <g opacity={ghost ? 0.6 : 1} strokeDasharray={ghost ? '3 2' : undefined}>
      {!ghost && (
        <rect x={-L / 2 + 1.5} y={-3} width={L} height={11} rx={3} fill={INK} opacity={0.4} />
      )}
      {rim && (
        <rect
          x={-L / 2 - 3}
          y={-9}
          width={L + 6}
          height={18}
          rx={4}
          fill="none"
          stroke={c}
          strokeWidth={4}
          opacity={0.35}
        />
      )}
      <rect
        x={-L / 2}
        y={-5.5}
        width={L}
        height={11}
        rx={3}
        fill={c}
        stroke={INK}
        strokeWidth={1.8}
      />
      <rect x={-L / 2 + 2} y={1.5} width={L - 4} height={2.6} rx={1.3} fill="#000" opacity={0.2} />
      <path
        d={`M${-L / 2 + 4} -2.6H${L / 2 - 4}`}
        stroke="#fff"
        strokeWidth={1.3}
        opacity={0.5}
        strokeLinecap="round"
      />
      {[-0.3, 0, 0.3].map((t) => (
        <path key={t} d={`M${t * L} -5.5V5.5`} stroke={INK} strokeWidth={1} opacity={0.7} />
      ))}
      {[-L / 2 + 5, L / 2 - 5].map((x) => (
        <circle key={x} cx={x} cy={0} r={1.7} fill={GOLD} stroke={INK} strokeWidth={0.7} />
      ))}
    </g>
  );
});

/** The robber: a hooded wanderer in dusky violet, eyes glowing under the hood. */
export const WraithPawn = memo(function WraithPawn() {
  return (
    <g strokeLinejoin="round">
      <ellipse cx={3} cy={34} rx={22} ry={6} fill={INK} opacity={0.45} />
      <circle cx={0} cy={4} r={34} fill="url(#g-wraith-halo)" />
      {/* base */}
      <path
        d="M-20 34Q-20 24 -12 22H12Q20 24 20 34Z"
        fill="#3a2a4a"
        stroke={INK}
        strokeWidth={1.8}
      />
      <path d="M-17 30H17" stroke={GOLD} strokeWidth={1.4} />
      {/* cloak */}
      <path d="M-12 22Q-15 4 -9 -8H9Q15 4 12 22Z" fill="#4a3660" stroke={INK} strokeWidth={1.8} />
      <path d="M-12 22Q-15 4 -9 -8H-2Q-6 6 -4 22Z" fill="#6e588c" />
      <path d="M3 -8Q6 8 4 22" stroke={INK} strokeWidth={1} fill="none" opacity={0.6} />
      {/* collar */}
      <ellipse cx={0} cy={-8} rx={11} ry={3.6} fill="#3a2a4a" stroke={INK} strokeWidth={1.4} />
      {/* hood */}
      <circle cx={0} cy={-20} r={11} fill="#4a3660" stroke={INK} strokeWidth={1.8} />
      <path d="M-11 -20A11 11 0 0 1 0 -31A9 11 0 0 0 -6 -20Z" fill="#8a72aa" />
      <ellipse cx={1} cy={-18} rx={6} ry={5.5} fill="#160e1c" />
      <circle cx={-1.5} cy={-18.5} r={1.3} fill="#ffcf6b" />
      <circle cx={3.5} cy={-18.5} r={1.3} fill="#ffcf6b" />
      <path
        d="M-8 -27A10 10 0 0 1 3 -30"
        stroke="#d8c8ff"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
});

/** A gold-rimmed medallion with a deep blue face; 6 and 8 glow coral. */
export const NumberToken = memo(function NumberToken({
  n,
  glow = false,
}: {
  n: number;
  glow?: boolean;
}) {
  const red = n === 6 || n === 8;
  const p = pips(n);
  const ink = red ? '#ff8e7a' : '#fff3d0';
  return (
    <g aria-hidden>
      {glow && <circle r={34} fill="url(#g-token-glow)" className="anim-pulse" />}
      <circle r={25} cy={3} fill="#2b1a22" opacity={0.4} />
      <circle r={24} fill="url(#g-token-rim)" stroke="#4a2f12" strokeWidth={2} />
      <g fill="#fff3c4" opacity={0.9}>
        <path d="M0-27 2.6-22.5H-2.6Z" />
        <path d="M0 27 2.6 22.5H-2.6Z" />
        <path d="M-27 0-22.5 2.6V-2.6Z" />
        <path d="M27 0 22.5 2.6V-2.6Z" />
      </g>
      <circle r={18.5} fill="url(#g-token)" stroke="#f7d98a" strokeWidth={1.5} />
      <path
        d="M-11 -9Q0 -15.5 11 -9"
        stroke="#fff"
        strokeOpacity={0.28}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {glow && <circle r={24} fill="none" stroke="#fff0b8" strokeWidth={2.5} />}
      <text
        y={4}
        textAnchor="middle"
        fontFamily="Cinzel, serif"
        fontWeight={700}
        fontSize={n >= 10 ? 17 : 20}
        fill={ink}
        style={red ? { filter: 'drop-shadow(0 0 3px rgba(255,120,90,.7))' } : undefined}
      >
        {n}
      </text>
      <g fill={ink}>
        {[...Array(p)].map((_, i) => (
          <circle key={i} cx={(i - (p - 1) / 2) * 3.8} cy={11.5} r={1.3} />
        ))}
      </g>
    </g>
  );
});

export const HarborBadge = memo(function HarborBadge({ kind }: { kind: HarborKind }) {
  const rate = kind === 'any' ? '3:1' : '2:1';
  return (
    <g>
      <circle r={26} fill="url(#g-torch)" opacity={0.45} />
      <path d="M-20 -15H20V11L0 18L-20 11Z" fill="#14161c" stroke="#8a6d2f" strokeWidth={1.6} />
      <path d="M-17 -12H17V9L0 15L-17 9Z" fill="none" stroke="#3a3f4b" strokeWidth={0.8} />
      <text
        y={kind === 'any' ? 4 : -1}
        textAnchor="middle"
        fontFamily="Cinzel, serif"
        fontWeight={700}
        fontSize={12}
        fill="#e6dfcf"
      >
        {rate}
      </text>
      {kind === 'any' ? (
        <text
          y={13}
          textAnchor="middle"
          fontFamily="Cinzel, serif"
          fontSize={6.5}
          fill="#a09986"
          letterSpacing={0.5}
        >
          ANY
        </text>
      ) : (
        <g transform="translate(0 8)">
          <ResGlyphSvg res={kind} size={10} />
        </g>
      )}
      {/* lantern */}
      <g transform="translate(19 -16)">
        <circle r={6} fill="url(#g-torch)" />
        <rect
          x={-1.8}
          y={-2.4}
          width={3.6}
          height={4.8}
          rx={0.8}
          fill="#ffcf6b"
          stroke="#2a2016"
          strokeWidth={0.8}
        />
      </g>
    </g>
  );
});
