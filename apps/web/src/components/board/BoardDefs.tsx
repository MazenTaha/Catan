import { memo } from 'react';
import { FloraDefs } from '../../art/terrain/flora';
import { HEX_PATH } from './geometry';

/**
 * Shared gradients, filters, clip paths and the terrain kit for the board. Rendered once.
 * One light for everything: warm sun from the upper left, cool blue-green shade lower right.
 */
export const BoardDefs = memo(function BoardDefs() {
  return (
    <defs>
      <clipPath id="hexClip">
        <path d={HEX_PATH} />
      </clipPath>

      <filter id="f-noise" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
        <feColorMatrix in="n" values="0 0 0 0 0.12  0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0.55 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>

      {/* terrain grounds: natural, slightly muted, brightest toward the sun */}
      <radialGradient id="g-forest" cx="32%" cy="26%" r="85%">
        <stop offset="0%" stopColor="#5f7c3e" />
        <stop offset="55%" stopColor="#3d5c2d" />
        <stop offset="100%" stopColor="#2a4423" />
      </radialGradient>
      <radialGradient id="g-hills" cx="32%" cy="26%" r="85%">
        <stop offset="0%" stopColor="#cc9064" />
        <stop offset="55%" stopColor="#ad6b44" />
        <stop offset="100%" stopColor="#8a4e33" />
      </radialGradient>
      <radialGradient id="g-pasture" cx="34%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#98b55e" />
        <stop offset="60%" stopColor="#729743" />
        <stop offset="100%" stopColor="#557a33" />
      </radialGradient>
      <radialGradient id="g-fields" cx="34%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#e4c470" />
        <stop offset="60%" stopColor="#cfa64d" />
        <stop offset="100%" stopColor="#b08739" />
      </radialGradient>
      <linearGradient id="g-mountains" x1="0.2" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#a3a59b" />
        <stop offset="50%" stopColor="#7e8377" />
        <stop offset="100%" stopColor="#5d6948" />
      </linearGradient>
      <radialGradient id="g-desert" cx="34%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#efd8a2" />
        <stop offset="60%" stopColor="#dabd82" />
        <stop offset="100%" stopColor="#bc9862" />
      </radialGradient>

      {/* every tile: warm light falling from the upper left, cool shade gathering lower right */}
      <linearGradient id="g-tile-light" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#fff0c8" stopOpacity="0.2" />
        <stop offset="42%" stopColor="#fff0c8" stopOpacity="0" />
        <stop offset="70%" stopColor="#0f1c1e" stopOpacity="0" />
        <stop offset="100%" stopColor="#0f1c1e" stopOpacity="0.28" />
      </linearGradient>
      {/* the same light across the whole island, so tiles agree with each other */}
      <linearGradient id="g-sunlight" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#ffe3a6" stopOpacity="0.14" />
        <stop offset="45%" stopColor="#ffe3a6" stopOpacity="0" />
        <stop offset="100%" stopColor="#10202a" stopOpacity="0.2" />
      </linearGradient>

      <radialGradient id="g-ember">
        <stop offset="0%" stopColor="#ffb066" stopOpacity="0.9" />
        <stop offset="45%" stopColor="#e0702a" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#e0702a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-target">
        <stop offset="0%" stopColor="#fff1c8" stopOpacity="0.75" />
        <stop offset="55%" stopColor="#e9b955" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#e9b955" stopOpacity="0" />
      </radialGradient>

      {/* number tokens and harbor plaques: aged ivory, lit from the upper left */}
      <radialGradient id="g-token" cx="38%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#fbf5e4" />
        <stop offset="70%" stopColor="#ece0c2" />
        <stop offset="100%" stopColor="#d9c9a3" />
      </radialGradient>
      <linearGradient id="g-token-rim" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#f1e6c8" />
        <stop offset="55%" stopColor="#c9b78d" />
        <stop offset="100%" stopColor="#8d7a55" />
      </linearGradient>
      <radialGradient id="g-token-glow">
        <stop offset="40%" stopColor="#ffd77a" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#ffd77a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="g-timber" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#a8825a" />
        <stop offset="55%" stopColor="#7a5a3c" />
        <stop offset="100%" stopColor="#4e3826" />
      </linearGradient>

      {/* the sea: deep natural teal, warmed where the sun lies on it (upper left) */}
      <radialGradient id="g-sea" cx="50%" cy="48%" r="70%">
        <stop offset="0%" stopColor="#2d5f66" />
        <stop offset="45%" stopColor="#1e4850" />
        <stop offset="80%" stopColor="#14333b" />
        <stop offset="100%" stopColor="#0c2027" />
      </radialGradient>
      <radialGradient id="g-sunglow" cx="10%" cy="-4%" r="62%">
        <stop offset="0%" stopColor="#ffe2a8" stopOpacity="0.3" />
        <stop offset="40%" stopColor="#f2c98a" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#f2c98a" stopOpacity="0" />
      </radialGradient>
      <filter id="f-water" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id="f-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <radialGradient id="g-mote">
        <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.85" />
        <stop offset="45%" stopColor="#fff0c0" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#fff0c0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-cloudshadow">
        <stop offset="0%" stopColor="#0a1a1c" stopOpacity="0.24" />
        <stop offset="60%" stopColor="#0a1a1c" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#0a1a1c" stopOpacity="0" />
      </radialGradient>

      <FloraDefs />
    </defs>
  );
});
