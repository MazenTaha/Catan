import { memo } from 'react';
import type { OmenType } from '@hexfall/engine';
import { OMEN_NAME } from '../../lexicon';
import { cardArt } from './cardArt';

export const OmenCardFront = memo(function OmenCardFront({ type, width = 64 }: { type: OmenType; width?: number }) {
  const relic = type === 'relic';
  return (
    <svg width={width} height={width * 1.45} viewBox="0 0 80 116" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`omen-bg-${type}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1e20" />
          <stop offset="100%" stopColor="#0d0c12" />
        </linearGradient>
      </defs>
      <rect
        x="1.5"
        y="1.5"
        width="77"
        height="113"
        rx="5"
        fill={`url(#omen-bg-${type})`}
        stroke={relic ? '#e2c071' : '#8a6d2f'}
        strokeWidth="2"
      />
      <rect x="6" y="6" width="68" height="104" rx="3" fill="none" stroke="#323739" />
      {/* the card's illustration in an ivory window */}
      <clipPath id={`omen-art-${type}`}>
        <rect x="11" y="11" width="58" height="45" rx="3" />
      </clipPath>
      <rect x="11" y="11" width="58" height="45" rx="3" fill="#efe2c4" />
      <image
        href={cardArt(type)}
        x="11"
        y="11"
        width="58"
        height="45"
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#omen-art-${type})`}
      />
      <rect x="11" y="11" width="58" height="45" rx="3" fill="none" stroke="#8a6d2f" strokeWidth="1" />
      <path d="M10 60h60" stroke="#8a6d2f" strokeOpacity="0.6" />
      <text
        x="40"
        y="76"
        textAnchor="middle"
        fontFamily="Cinzel, serif"
        fontSize={type === 'decree' || type === 'harvest' ? 7.5 : 9}
        fill={relic ? '#e2c071' : '#e6dfcf'}
        letterSpacing="0.6"
      >
        {OMEN_NAME[type].toUpperCase()}
      </text>
      <path d="M30 88l10-6 10 6-10 6z" fill="none" stroke="#c9a24b" strokeWidth="0.9" />
      <circle cx="40" cy="88" r="1.6" fill={relic ? '#f0cf7b' : '#e0702a'} />
    </svg>
  );
});
