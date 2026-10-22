import { memo } from 'react';
import type { PlayerColor, Sigil as SigilKey } from '@hexfall/engine';
import { COLOR_DARK, COLOR_HEX } from '../../lexicon';

/** Sigil glyph paths in a 20×20 box centered at (10,10). Filled shapes so they read tiny. */
export const SIGIL_PATH: Record<SigilKey, string> = {
  skull:
    'M10 2.5a6.5 6.5 0 0 0-6.5 6.5c0 2.1 1 3.6 2.5 4.6V16h8v-2.4c1.5-1 2.5-2.5 2.5-4.6A6.5 6.5 0 0 0 10 2.5zM7.3 8.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.4 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 12.4h2l-1 1.6zM8 16v1.5h1V16zm3 0v1.5h1V16z',
  moon: 'M12.5 2.6a7.5 7.5 0 1 0 4.9 12.3A6 6 0 0 1 12.5 2.6z',
  eye: 'M10 5C5.5 5 2 10 2 10s3.5 5 8 5 8-5 8-5-3.5-5-8-5zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM10 8.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  thorn: 'M10 1.5 12 7l5.5-1.5L13.5 10l4 4.5L12 13l-2 5.5L8 13l-5.5 1.5L6.5 10 2.5 5.5 8 7z',
};

export const SigilGlyph = memo(function SigilGlyph({
  sigil,
  size = 14,
  color = 'currentColor',
  className,
}: {
  sigil: SigilKey;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden>
      <path d={SIGIL_PATH[sigil]} fill={color} fillRule="evenodd" />
    </svg>
  );
});

/** Gem-like player disc with the sigil engraved on it. */
export const PlayerDisc = memo(function PlayerDisc({
  color,
  sigil,
  size = 28,
  active = false,
  label,
}: {
  color: PlayerColor;
  sigil: SigilKey;
  size?: number;
  active?: boolean;
  label?: string;
}) {
  const id = `disc-${color}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="25%" stopColor={COLOR_HEX[color]} />
          <stop offset="100%" stopColor={COLOR_DARK[color]} />
        </radialGradient>
      </defs>
      {active && <circle cx="20" cy="20" r="19" fill="none" stroke="#c9a24b" strokeWidth="2" className="anim-pulse" />}
      <circle cx="20" cy="20" r="15.5" fill={`url(#${id})`} stroke="#070809" strokeWidth="2" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="#8a6d2f" strokeWidth="0.8" />
      <g transform="translate(10.5 10.5) scale(0.95)">
        <path
          d={SIGIL_PATH[sigil]}
          fill={color === 'bone' ? '#2a2620' : '#0a0b0c'}
          fillOpacity="0.78"
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
});
