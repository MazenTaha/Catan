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

      {/* neutral grain: texture without tinting everything brown */}
      <filter id="f-noise" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
        <feColorMatrix in="n" values="0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0.55 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>

      {/*
        terrain grounds: each tuned on its own (light, middle, shadow), brightest toward the sun.
        Greens run from spring meadow to cool forest shade, gold stays luminous, clay warm,
        rock cool slate, sand pale honey; no shared beige filter.
      */}
      <radialGradient id="g-forest" cx="32%" cy="26%" r="85%">
        <stop offset="0%" stopColor="#5a9a45" />
        <stop offset="55%" stopColor="#2f6e38" />
        <stop offset="100%" stopColor="#1a4a32" />
      </radialGradient>
      <radialGradient id="g-hills" cx="32%" cy="26%" r="85%">
        <stop offset="0%" stopColor="#e39661" />
        <stop offset="55%" stopColor="#c76a3c" />
        <stop offset="100%" stopColor="#97452b" />
      </radialGradient>
      <radialGradient id="g-pasture" cx="34%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#a6d465" />
        <stop offset="60%" stopColor="#6db245" />
        <stop offset="100%" stopColor="#3f8a3a" />
      </radialGradient>
      <radialGradient id="g-fields" cx="34%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#f6d670" />
        <stop offset="60%" stopColor="#e4b23f" />
        <stop offset="100%" stopColor="#bf8a2a" />
      </radialGradient>
      <linearGradient id="g-mountains" x1="0.2" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#b9c3ca" />
        <stop offset="50%" stopColor="#8995a0" />
        <stop offset="100%" stopColor="#5b7056" />
      </linearGradient>
      <radialGradient id="g-desert" cx="34%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#f8e6b0" />
        <stop offset="60%" stopColor="#eec983" />
        <stop offset="100%" stopColor="#d4a462" />
      </radialGradient>

      {/* every tile: warm light falling from the upper left, cool shade gathering lower right */}
      <linearGradient id="g-tile-light" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#fff4d6" stopOpacity="0.16" />
        <stop offset="42%" stopColor="#fff4d6" stopOpacity="0" />
        <stop offset="70%" stopColor="#0c1d2a" stopOpacity="0" />
        <stop offset="100%" stopColor="#0c1d2a" stopOpacity="0.22" />
      </linearGradient>
      {/* the same light across the whole island, so tiles agree with each other */}
      <linearGradient id="g-sunlight" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#fff0c4" stopOpacity="0.1" />
        <stop offset="45%" stopColor="#fff0c4" stopOpacity="0" />
        <stop offset="100%" stopColor="#0c1d2e" stopOpacity="0.16" />
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

      {/* the sea: clear blue, deepening away from the island, warmed where the sun lies on it */}
      <radialGradient id="g-sea" cx="50%" cy="48%" r="72%">
        <stop offset="0%" stopColor="#2386b3" />
        <stop offset="50%" stopColor="#1b75a6" />
        <stop offset="85%" stopColor="#156395" />
        <stop offset="100%" stopColor="#125684" />
      </radialGradient>
      <radialGradient id="g-sunglow" cx="10%" cy="-4%" r="55%">
        <stop offset="0%" stopColor="#fff0c8" stopOpacity="0.14" />
        <stop offset="45%" stopColor="#fff0c8" stopOpacity="0.04" />
        <stop offset="100%" stopColor="#fff0c8" stopOpacity="0" />
      </radialGradient>
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
