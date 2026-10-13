import { memo } from 'react';
import { PLAYER_COLORS } from '@hexfall/engine';
import { COLOR_DARK, COLOR_HEX } from '../../lexicon';
import { HEX_PATH } from './geometry';

/** Shared gradients, filters and clip paths for the board. Rendered once. */
export const BoardDefs = memo(function BoardDefs() {
  return (
    <defs>
      <clipPath id="hexClip">
        <path d={HEX_PATH} />
      </clipPath>

      <filter id="f-blur2" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" />
      </filter>
      <filter id="f-blur6" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id="f-noise" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
        <feColorMatrix
          in="n"
          values="0 0 0 0 0.12  0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0.55 0"
        />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>

      {/* terrain bases: moonlight from the upper left */}
      <radialGradient id="g-forest" cx="30%" cy="25%" r="90%">
        <stop offset="0%" stopColor="#2c5e3a" />
        <stop offset="60%" stopColor="#1a3d26" />
        <stop offset="100%" stopColor="#0c2015" />
      </radialGradient>
      <radialGradient id="g-hills" cx="30%" cy="25%" r="90%">
        <stop offset="0%" stopColor="#b05a33" />
        <stop offset="60%" stopColor="#8a4224" />
        <stop offset="100%" stopColor="#4a1d0d" />
      </radialGradient>
      <radialGradient id="g-pasture" cx="30%" cy="25%" r="90%">
        <stop offset="0%" stopColor="#6aa244" />
        <stop offset="60%" stopColor="#4a7d2e" />
        <stop offset="100%" stopColor="#264416" />
      </radialGradient>
      <radialGradient id="g-fields" cx="30%" cy="25%" r="90%">
        <stop offset="0%" stopColor="#e2bb52" />
        <stop offset="60%" stopColor="#c0952f" />
        <stop offset="100%" stopColor="#6e4f14" />
      </radialGradient>
      <radialGradient id="g-mountains" cx="30%" cy="20%" r="95%">
        <stop offset="0%" stopColor="#7d899c" />
        <stop offset="55%" stopColor="#566175" />
        <stop offset="100%" stopColor="#262c38" />
      </radialGradient>
      <radialGradient id="g-desert" cx="30%" cy="25%" r="90%">
        <stop offset="0%" stopColor="#ead098" />
        <stop offset="60%" stopColor="#cfb176" />
        <stop offset="100%" stopColor="#8a6d3c" />
      </radialGradient>

      <radialGradient id="g-tile-vignette" cx="50%" cy="50%" r="55%">
        <stop offset="55%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
      </radialGradient>
      <linearGradient id="g-bevel-light" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff2d0" stopOpacity="0.35" />
        <stop offset="45%" stopColor="#fff2d0" stopOpacity="0" />
      </linearGradient>

      <radialGradient id="g-ember">
        <stop offset="0%" stopColor="#ffb066" stopOpacity="0.9" />
        <stop offset="45%" stopColor="#e0702a" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#e0702a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-wisp">
        <stop offset="0%" stopColor="#d9fff0" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#9fe3c6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-torch">
        <stop offset="0%" stopColor="#ffc46b" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#e0702a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-torchlight">
        <stop offset="0%" stopColor="#ffb357" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#ffb357" stopOpacity="0" />
      </radialGradient>

      <radialGradient id="g-token" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stopColor="#f3ead5" />
        <stop offset="70%" stopColor="#d6c7a2" />
        <stop offset="100%" stopColor="#a8976f" />
      </radialGradient>
      <radialGradient id="g-token-glow">
        <stop offset="40%" stopColor="#ffd77a" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#ffd77a" stopOpacity="0" />
      </radialGradient>

      <linearGradient id="g-wraith" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#d9efff" stopOpacity="0.95" />
        <stop offset="55%" stopColor="#7aa7c7" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#2b4a63" stopOpacity="0.1" />
      </linearGradient>
      <radialGradient id="g-wraith-halo">
        <stop offset="0%" stopColor="#8fc7ff" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#8fc7ff" stopOpacity="0" />
      </radialGradient>

      <linearGradient id="g-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0f2a33" />
        <stop offset="50%" stopColor="#0c1f26" />
        <stop offset="100%" stopColor="#071216" />
      </linearGradient>
      {/* soft fog banks: a gradient instead of a blur filter, so they cost nothing to draw */}
      <radialGradient id="g-fog">
        <stop offset="0%" stopColor="#9fb3b6" stopOpacity="0.2" />
        <stop offset="60%" stopColor="#9fb3b6" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#9fb3b6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-sea-light" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#3d6b72" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#3d6b72" stopOpacity="0" />
      </radialGradient>

      {PLAYER_COLORS.map((c) => (
        <linearGradient key={c} id={`g-piece-${c}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={COLOR_HEX[c]} />
          <stop offset="100%" stopColor={COLOR_DARK[c]} />
        </linearGradient>
      ))}
      {PLAYER_COLORS.map((c) => (
        <linearGradient key={`p${c}`} id={`g-plank-${c}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLOR_HEX[c]} />
          <stop offset="100%" stopColor={COLOR_DARK[c]} />
        </linearGradient>
      ))}
    </defs>
  );
});
