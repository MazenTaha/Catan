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

      <radialGradient id="g-token" cx="38%" cy="30%" r="78%">
        <stop offset="0%" stopColor="#fdf7e6" />
        <stop offset="65%" stopColor="#ecdfbd" />
        <stop offset="100%" stopColor="#c7b384" />
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

      {/* moonlit sea: brighter water around the island, deep blue-black at the edges */}
      <radialGradient id="g-sea" cx="50%" cy="48%" r="70%">
        <stop offset="0%" stopColor="#1f6170" />
        <stop offset="45%" stopColor="#123f4d" />
        <stop offset="80%" stopColor="#0a2430" />
        <stop offset="100%" stopColor="#06151c" />
      </radialGradient>
      <radialGradient id="g-moonglow" cx="87%" cy="-4%" r="62%">
        <stop offset="0%" stopColor="#dce8ff" stopOpacity="0.42" />
        <stop offset="35%" stopColor="#9fc0e8" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#9fc0e8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="g-moonlight" x1="0.85" y1="0" x2="0.15" y2="1">
        <stop offset="0%" stopColor="#d8e6ff" stopOpacity="0.16" />
        <stop offset="45%" stopColor="#d8e6ff" stopOpacity="0" />
        <stop offset="100%" stopColor="#020611" stopOpacity="0.3" />
      </linearGradient>
      <filter id="f-water" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id="f-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <radialGradient id="g-firefly">
        <stop offset="0%" stopColor="#f6ffa8" stopOpacity="0.9" />
        <stop offset="40%" stopColor="#d8f27a" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#d8f27a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-cloudshadow">
        <stop offset="0%" stopColor="#02060f" stopOpacity="0.32" />
        <stop offset="60%" stopColor="#02060f" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#02060f" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-medallion" cx="40%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#24384a" />
        <stop offset="100%" stopColor="#0b1520" />
      </radialGradient>
      <linearGradient id="g-medallion-rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f3d98a" />
        <stop offset="50%" stopColor="#b48a3a" />
        <stop offset="100%" stopColor="#5e4318" />
      </linearGradient>
      <linearGradient id="g-token-rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f6dc8e" />
        <stop offset="55%" stopColor="#b88c3a" />
        <stop offset="100%" stopColor="#6a4b19" />
      </linearGradient>

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
