import { memo, useId } from 'react';
import type { PlayerColor, Sigil } from '@hexfall/engine';
import { SIGIL_PATH } from '../../art/pieces/Sigil';
import { COLOR_HEX, COLOR_NAME, SIGIL_NAME } from '../../lexicon';

/** The heater shield, in a 100×120 box. */
export const SHIELD_PATH = 'M7 7H93V52C93 85 74 104 50 115 26 104 7 85 7 52Z';

/** Light fields (White, Orange) take an ink charge; dark ones a gold charge. */
const LIGHT: Record<PlayerColor, boolean> = { crimson: false, frost: false, bone: true, violet: true };

/** A player's colour, about 15% deeper: banner cloth only, never game logic. */
export function clothOf(color: PlayerColor): string {
  const hex = COLOR_HEX[color].slice(1);
  const k = color === 'bone' ? 0.9 : 0.85;
  const c = [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The blazon line, e.g. "Red, a skull Or". */
export function blazon(color: PlayerColor, sigil: Sigil): string {
  return `${COLOR_NAME[color]}, a ${SIGIL_NAME[sigil].toLowerCase()} ${LIGHT[color] ? 'sable' : 'Or'}`;
}

/** The arms as SVG content in a 100×120 box, for use inside another SVG (banners). */
export function ArmsShape({
  color,
  sigil,
  empty = false,
  sheen,
}: {
  color?: PlayerColor;
  sigil?: Sigil;
  empty?: boolean;
  /** Id of an <ArmsDefs> gradient in the same SVG. */
  sheen: string;
}) {
  if (empty || !color || !sigil) {
    return (
      <g>
        <path d={SHIELD_PATH} fill="rgba(0,0,0,0.25)" stroke="#f3d27a" strokeWidth="2.5" strokeDasharray="7 6" />
        <path d="M50 42V78M32 60H68" stroke="#f3d27a" strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }
  const charge = LIGHT[color] ? '#1a120b' : '#e8bd55';
  return (
    <g>
      <path d={SHIELD_PATH} fill={COLOR_HEX[color]} />
      {/* a soft light from the upper left, shade lower right */}
      <path d={SHIELD_PATH} fill={`url(#${sheen})`} />
      <g transform="translate(22 26) scale(2.8)">
        <path d={SIGIL_PATH[sigil]} fill="#000" fillOpacity="0.35" fillRule="evenodd" transform="translate(0.35 0.5)" />
        <path d={SIGIL_PATH[sigil]} fill={charge} fillRule="evenodd" />
      </g>
      <path d={SHIELD_PATH} fill="none" stroke="#d9a93f" strokeWidth="5" />
      <path d={SHIELD_PATH} fill="none" stroke="#1a120b" strokeWidth="2" />
    </g>
  );
}

/** The shield's sheen gradient, defined once per SVG. */
export function ArmsDefs({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
      <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
      <stop offset="1" stopColor="#000" stopOpacity="0.32" />
    </linearGradient>
  );
}

/**
 * A player's coat of arms: a heater shield in the player's colour, a gold rim, and the player's
 * sigil as the charge, so colour is never the only cue.
 */
export const Arms = memo(function Arms({
  color,
  sigil,
  size = 24,
  label,
  className,
}: {
  color: PlayerColor;
  sigil: Sigil;
  /** Height in pixels; the width follows the shield (5:6). */
  size?: number;
  label?: string;
  className?: string;
}) {
  const id = `arms${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={(size * 100) / 120}
      height={size}
      viewBox="0 0 100 120"
      className={`shrink-0 ${className ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' }}
    >
      <defs>
        <ArmsDefs id={id} />
      </defs>
      <ArmsShape color={color} sigil={sigil} sheen={id} />
    </svg>
  );
});
