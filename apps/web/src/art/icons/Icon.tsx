import { memo } from 'react';
import type { Resource } from '@hexfall/engine';

/**
 * One consistent engraved icon set: 24×24, 1.5px strokes, round joins, currentColor.
 * Bone by default, gold when the parent sets `text-gold`.
 */
const PATHS = {
  crown: 'M4 18h16M5 18 3.5 8l5 4L12 5l3.5 7 5-4L19 18M8 21h8',
  outpost: 'M6 21V11l6-5 6 5v10M4 12l8-7 8 7M10 21v-5h4v5M12 3v2',
  citadel: 'M3 21V9l2-2 2 2v3h2V6l3-3 3 3v6h2V9l2-2 2 2v12M3 21h18M10 21v-4a2 2 0 0 1 4 0v4M12 8v2',
  causeway: 'M3 17 9 7m6 10 6-10M5.5 13h13M7.5 10h9M4 20h16',
  gain: 'M12 3v12m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
  scroll: 'M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M7 4a2 2 0 0 1 2 2v1M9 11h6M9 14h6M9 17h4',
  dice: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  bank: 'M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18M3 18h18',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9m10-18c0 5-5 6-5 9s5 4 5 9M9 18h6',
  discard: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6m4-6v6',
  wraith: 'M12 3c-4 0-6 3-6 7v10l2-2 2 2 2-2 2 2 2-2 2 2V10c0-4-2-7-6-7zM9.5 10h.01M14.5 10h.01M10 14c1 .7 3 .7 4 0',
  steal: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM12 14v3',
  omen: 'M6 3h12v18H6zM12 7l2.5 5L12 17l-2.5-5zM9 5h.01M15 19h.01',
  sword: 'M14.5 3H21v6.5L10 20.5 3.5 14zM5 19l-2 2m4.5-7.5 3 3M6 12l6 6',
  blood: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11zM10 15a2 2 0 0 0 2 2',
  trade: 'M4 8h13l-3-3M20 16H7l3 3',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0M12 3v2',
  relic: 'M12 3 4 8v8l8 5 8-5V8zM12 8l4 2.5v3L12 16l-4-2.5v-3zM12 3v5m0 8v5',
  rules: 'M5 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H5zM19 4h-5M19 4v14h-5M8 8h3M8 11h3',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17M17 7l2.1-2.1',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6m0-6-5 6',
  log: 'M4 5h16M4 10h16M4 15h10M4 20h7',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4 12.5 9.5 18 20 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.8M6.5 6.6C3.7 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  duel: 'M4 4l9.5 9.5M20 4l-9.5 9.5M4 4h3l9 9M20 4h-3l-9 9M6.5 15.5l-3 3 2 2 3-3M17.5 15.5l3 3-2 2-3-3M7 13l4 4M17 13l-4 4',
  chest: 'M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 11V8a4 3 0 0 1 4-3h8a4 3 0 0 1 4 3v3M9 5v6M15 5v6M11 13h2v3h-2z',
  pistol: 'M3 8h15l1 3h2v2h-9l-1 2h-2l-1 4H4l2-6H3zM10 13l1 2',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 9l11-2',
  crosshair: 'M12 2v5M12 17v5M2 12h5M17 12h5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  leave: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10',
  export: 'M12 3v12m0-12-4 4m4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  import: 'M12 15V3m0 12-4-4m4 4 4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  skull: 'M12 3a8 8 0 0 0-8 8c0 2.5 1.2 4.3 3 5.5V20h10v-3.5c1.8-1.2 3-3 3-5.5a8 8 0 0 0-8-8zM9 11.5h.01M15 11.5h.01M10 20v-2m4 2v-2M11 15h2',
  torch: 'M10 21h4l1-9H9zM12 12V9M12 3c2 2 3 3.5 1.5 6h-3C9 6.5 10 5 12 3z',
  bot: 'M6 9h12v10H6zM12 4v5M9.5 13h.01M14.5 13h.01M9 16.5h6M3 13v3m18-3v3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  harbor: 'M12 4v16M8 8h8M5 13a7 7 0 0 0 14 0M12 4a1.5 1.5 0 1 0 0-.01',
  question: 'M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4M12 17.5h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
} as const;

export type IconName = keyof typeof PATHS;

export const Icon = memo(function Icon({
  name,
  size = 18,
  className,
  title,
  strokeWidth = 1.5,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
});

/** Resource glyphs (rune-like), same engraved style. */
const RES_PATHS: Record<Resource, string> = {
  // Blackwood: a crooked pine with a rune-cut trunk
  wood: 'M12 3 7 10h3l-4 5h4l-3 4h10l-3-4h4l-4-5h3zM12 19v3',
  // Cinderclay: stacked fired bricks with an ember crack
  clay: 'M3 9h8v5H3zM13 9h8v5h-8zM8 14h8v5H8zM6 4h12v5H6zM14 4l-2 3',
  // Ghostwool: a curling fleece spiral
  wool: 'M6 14a4 4 0 0 1 3-6 4.5 4.5 0 0 1 8 .5A3.5 3.5 0 0 1 18 15H7a3 3 0 0 1-1-1zM12 12a1.5 1.5 0 1 1 2-1.5M9 18v2m6-2v2',
  // Wraithgrain: a withered sheaf
  grain: 'M12 21V7M12 7c-2-1-3-3-3-5 2 1 3 2 3 5zm0 0c2-1 3-3 3-5-2 1-3 2-3 5zM12 12c-2-1-3.5-2.5-4-5 2 .5 3.5 2 4 5zm0 0c2-1 3.5-2.5 4-5-2 .5-3.5 2-4 5zM12 17c-2-1-3.5-2.5-4-5 2 .5 3.5 2 4 5zm0 0c2-1 3.5-2.5 4-5-2 .5-3.5 2-4 5z',
  // Soul-iron: a faceted ore crystal with an inner soul spark
  ore: 'M12 3 5 8l1.5 9L12 21l5.5-4L19 8zM5 8l7 3 7-3M12 11v10M10.5 7.5 12 6l1.5 1.5L12 9z',
};

export const ResourceGlyph = memo(function ResourceGlyph({
  res,
  size = 18,
  className,
}: {
  res: Resource;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={RES_PATHS[res]} />
    </svg>
  );
});

export const RES_COLOR: Record<Resource, string> = {
  wood: '#6faa68',
  clay: '#d8845a',
  wool: '#c9d6a4',
  grain: '#dfbe62',
  ore: '#a9b6c1',
};
