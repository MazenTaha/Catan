import { memo } from 'react';
import type { HarborKind, PlayerColor, Resource, Sigil } from '@hexfall/engine';
import { pips } from '@hexfall/engine';
import { COLOR_DARK, COLOR_HEX } from '../../lexicon';
import { RES_COLOR } from '../icons/Icon';
import { SIGIL_PATH } from './Sigil';

const RES_SVG: Record<Resource, string> = {
  wood: 'M12 3 7 10h3l-4 5h4l-3 4h10l-3-4h4l-4-5h3zM12 19v3',
  clay: 'M3 9h8v5H3zM13 9h8v5h-8zM8 14h8v5H8zM6 4h12v5H6z',
  wool: 'M6 14a4 4 0 0 1 3-6 4.5 4.5 0 0 1 8 .5A3.5 3.5 0 0 1 18 15H7a3 3 0 0 1-1-1z',
  grain: 'M12 21V7M12 7c-2-1-3-3-3-5 2 1 3 2 3 5zm0 0c2-1 3-3 3-5-2 1-3 2-3 5zM12 12c-2-1-3.5-2.5-4-5 2 .5 3.5 2 4 5zm0 0c2-1 3.5-2.5 4-5-2 .5-3.5 2-4 5z',
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

function SigilMark({ sigil, color, x, y, size }: { sigil: Sigil; color: PlayerColor; x: number; y: number; size: number }) {
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
      <path className="anim-flicker" d="M0 -6C2.5 -3 3 -1 2 1.5C1.4 3 -1.4 3 -2 1.5C-3 -1 -2 -3 0 -6Z" fill="#ffb347" />
      <path className="anim-flicker" d="M0 -3C1.2 -1.5 1.3 0 .8 1.2C.5 1.8 -.5 1.8 -.8 1.2C-1.3 0 -1 -1.5 0 -3Z" fill="#fff1b8" />
    </g>
  );
});

interface PieceProps {
  color: PlayerColor;
  sigil: Sigil;
  ghost?: boolean;
  rim?: boolean;
}

export const OutpostPiece = memo(function OutpostPiece({ color, sigil, ghost, rim }: PieceProps) {
  const c = COLOR_HEX[color];
  const d = COLOR_DARK[color];
  return (
    <g opacity={ghost ? 0.6 : 1} strokeDasharray={ghost ? '3 2' : undefined}>
      {!ghost && <ellipse cx={0} cy={13} rx={15} ry={4.5} fill="#000" opacity={0.55} />}
      {rim && <path d="M-11 14L-10 -7L0 -24L10 -7L11 14Z" fill="none" stroke={c} strokeWidth={5} opacity={0.35} />}
      <path d="M-10 13L-9 -6H9L10 13Z" fill={`url(#g-piece-${color})`} stroke={d} strokeWidth={1.6} />
      <path d="M-12.5 -5.5L0 -22L12.5 -5.5Z" fill={d} stroke="#0a0b0d" strokeWidth={1.2} />
      <path d="M-12.5 -5.5L0 -22L0 -5.5Z" fill="#fff" opacity={0.1} />
      <path d="M-9 2H9M-9.4 8H9.4" stroke={d} strokeWidth={0.7} opacity={0.8} />
      <path d="M-3 13V8a3 3 0 0 1 6 0v5Z" fill="#0a0b0d" />
      <SigilMark sigil={sigil} color={color} x={0} y={-0.5} size={9} />
      {!ghost && <Torch x={12.5} y={-3} />}
    </g>
  );
});

export const CitadelPiece = memo(function CitadelPiece({ color, sigil, ghost, rim }: PieceProps) {
  const c = COLOR_HEX[color];
  const d = COLOR_DARK[color];
  return (
    <g opacity={ghost ? 0.6 : 1} strokeDasharray={ghost ? '3 2' : undefined}>
      {!ghost && <ellipse cx={0} cy={15} rx={22} ry={5} fill="#000" opacity={0.55} />}
      {rim && <path d="M-20 16V-8L-15 -24L0 -38L15 -24L20 -8V16Z" fill="none" stroke={c} strokeWidth={5} opacity={0.35} />}
      <path d="M17 -6L15 -22L13 -6ZM-13 -6L-15 -22L-17 -6Z" fill={d} stroke="#0a0b0d" strokeWidth={1} />
      <path
        d="M-19 15V-6H-14V-11H-9V-6H-5V-11H5V-6H9V-11H14V-6H19V15Z"
        fill={`url(#g-piece-${color})`}
        stroke={d}
        strokeWidth={1.6}
      />
      <path d="M-8 -6V-20L0 -36L8 -20V-6Z" fill={`url(#g-piece-${color})`} stroke={d} strokeWidth={1.4} />
      <path d="M-8 -20L0 -36L0 -20Z" fill="#fff" opacity={0.12} />
      <path d="M-2.4 -10V-15a2.4 2.4 0 0 1 4.8 0V-10Z" fill="#ffcf6b" />
      {!ghost && <circle cx={0} cy={-13} r={7} fill="url(#g-torch)" opacity={0.8} className="anim-pulse" />}
      <path d="M-19 4H19" stroke={d} strokeWidth={0.7} opacity={0.8} />
      <path d="M-4 15V9a4 4 0 0 1 8 0v6Z" fill="#0a0b0d" />
      <SigilMark sigil={sigil} color={color} x={-11.5} y={4} size={8} />
      <SigilMark sigil={sigil} color={color} x={11.5} y={4} size={8} />
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
  const d = COLOR_DARK[color];
  const L = length;
  return (
    <g opacity={ghost ? 0.6 : 1} strokeDasharray={ghost ? '3 2' : undefined}>
      {!ghost && <rect x={-L / 2 + 1} y={-4} width={L} height={12} rx={2} fill="#000" opacity={0.5} />}
      {rim && <rect x={-L / 2 - 3} y={-9} width={L + 6} height={18} rx={4} fill="none" stroke={c} strokeWidth={4} opacity={0.35} />}
      <rect x={-L / 2} y={-6} width={L} height={12} rx={2} fill={`url(#g-plank-${color})`} stroke={d} strokeWidth={1.6} />
      {[-0.3, 0, 0.3].map((t) => (
        <path key={t} d={`M${t * L} -6V6`} stroke={d} strokeWidth={0.9} opacity={0.8} />
      ))}
      {[-L / 2 + 5, L / 2 - 5].map((x) => (
        <g key={x}>
          <circle cx={x} cy={-2.4} r={1.5} fill="#1d1f24" />
          <circle cx={x} cy={2.4} r={1.5} fill="#1d1f24" />
          <circle cx={x - 0.4} cy={-2.8} r={0.5} fill="#9aa0aa" />
        </g>
      ))}
    </g>
  );
});

export const WraithPawn = memo(function WraithPawn() {
  return (
    <g>
      <circle r={44} fill="url(#g-wraith-halo)" />
      <path
        d="M-6 30C-22 40-34 34-40 46"
        stroke="#9fd2ff"
        strokeWidth={5}
        fill="none"
        opacity={0.35}
        filter="url(#f-blur2)"
      />
      <g className="anim-bob">
        <path
          d="M0 -36C15 -36 19 -21 19 -6L23 22L15 16L11 25L5 18L-1 26L-7 18L-12 25L-16 16L-23 22L-19 -6C-19 -21 -15 -36 0 -36Z"
          fill="url(#g-wraith)"
          stroke="#c9e6ff"
          strokeOpacity={0.45}
          strokeWidth={1}
        />
        <path d="M-19 -6C-26 0 -30 8 -33 4M19 -6C26 0 30 8 33 4" stroke="#bfe0f5" strokeWidth={1.4} opacity={0.5} fill="none" />
        <ellipse cx={0} cy={-16} rx={8.5} ry={11} fill="#040609" />
        <circle cx={-3.2} cy={-16} r={1.6} fill="#d8f2ff" />
        <circle cx={3.2} cy={-16} r={1.6} fill="#d8f2ff" />
        <circle cx={-3.2} cy={-16} r={4} fill="#9fd2ff" opacity={0.25} />
        <circle cx={3.2} cy={-16} r={4} fill="#9fd2ff" opacity={0.25} />
      </g>
    </g>
  );
});

export const NumberToken = memo(function NumberToken({ n, glow = false }: { n: number; glow?: boolean }) {
  const red = n === 6 || n === 8;
  const p = pips(n);
  return (
    <g aria-hidden>
      {glow && <circle r={34} fill="url(#g-token-glow)" className="anim-pulse" />}
      <circle r={25} cy={2} fill="#000" opacity={0.5} />
      <circle r={24} fill="url(#g-token)" stroke="#8a6d2f" strokeWidth={2} />
      <circle r={20.5} fill="none" stroke="#6b5a3a" strokeWidth={0.8} opacity={0.7} />
      {glow && <circle r={24} fill="none" stroke="#f3cf73" strokeWidth={2.5} />}
      <text
        y={4}
        textAnchor="middle"
        fontFamily="Cinzel, serif"
        fontWeight={700}
        fontSize={n >= 10 ? 19 : 22}
        fill={red ? '#8b1e2d' : '#2a2218'}
        style={red ? { filter: 'drop-shadow(0 0 2px rgba(200,40,40,.55))' } : undefined}
      >
        {n}
      </text>
      <g fill={red ? '#8b1e2d' : '#3a3024'}>
        {[...Array(p)].map((_, i) => (
          <circle key={i} cx={(i - (p - 1) / 2) * 4.2} cy={13} r={1.45} />
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
      <text y={kind === 'any' ? 4 : -1} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={12} fill="#e6dfcf">
        {rate}
      </text>
      {kind === 'any' ? (
        <text y={13} textAnchor="middle" fontFamily="Cinzel, serif" fontSize={6.5} fill="#a09986" letterSpacing={0.5}>
          ANY
        </text>
      ) : (
        <g transform="translate(0 8)">
          <ResGlyphSvg res={kind} size={10} />
        </g>
      )}
      {/* lantern */}
      <g transform="translate(19 -16)">
        <circle r={6} fill="url(#g-torch)" className="anim-pulse" />
        <rect x={-1.8} y={-2.4} width={3.6} height={4.8} rx={0.8} fill="#ffcf6b" stroke="#2a2016" strokeWidth={0.8} />
      </g>
    </g>
  );
});
