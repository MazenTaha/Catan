import { memo } from 'react';
import type { OmenType } from '@hexfall/engine';
import { OMEN_NAME } from '../../lexicon';

/** Tiny engraved illustrations for each Omen (drawn in a 60×60 box). */
const ART: Record<OmenType, JSX.Element> = {
  warden: (
    <g stroke="#e6dfcf" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M30 8l12 6v14c0 10-6 18-12 22-6-4-12-12-12-22V14z" fill="#1c1a24" />
      <path d="M22 22h16M26 22v8M34 22v8M30 30v10" stroke="#c9a24b" />
      <path d="M12 48 48 12M44 10l6 6M10 46l4 4" />
    </g>
  ),
  relic: (
    <g stroke="#c9a24b" strokeWidth={1.6} fill="none" strokeLinejoin="round">
      <path d="M14 40l4-18 8 8 4-14 4 14 8-8 4 18z" fill="#2a2214" />
      <path d="M14 44h32" />
      <circle cx={30} cy={34} r={3.5} fill="#f0cf7b" />
      <circle cx={20} cy={36} r={1.8} fill="#8b1e2d" stroke="none" />
      <circle cx={40} cy={36} r={1.8} fill="#6fa8c4" stroke="none" />
    </g>
  ),
  decree: (
    <g stroke="#e6dfcf" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 12h26a4 4 0 0 1 4 4v28H22a4 4 0 0 1-4-4V16a4 4 0 0 0-4-4z" fill="#232019" />
      <path d="M24 22h16M24 28h16M24 34h10" stroke="#a09986" />
      <circle cx={42} cy={44} r={5} fill="#8b1e2d" stroke="#5a1520" />
      <path d="M8 52l10-6 6 4 10-6" stroke="#c9a24b" />
    </g>
  ),
  harvest: (
    <g stroke="#d8b65a" strokeWidth={1.6} fill="none" strokeLinecap="round">
      <path d="M30 52V18M30 18c-4-2-6-6-6-10 4 2 6 5 6 10zm0 0c4-2 6-6 6-10-4 2-6 5-6 10zM30 28c-5-2-8-5-9-10 5 1 8 4 9 10zm0 0c5-2 8-5 9-10-5 1-8 4-9 10zM30 38c-5-2-8-5-9-10 5 1 8 4 9 10zm0 0c5-2 8-5 9-10-5 1-8 4-9 10z" />
      <path d="M22 44c4 2 12 2 16 0" stroke="#8a6d2f" strokeWidth={2.4} />
    </g>
  ),
  tithe: (
    <g strokeLinecap="round">
      <path d="M30 8s14 16 14 26a14 14 0 0 1-28 0c0-10 14-26 14-26z" fill="#5a1520" stroke="#c4302b" strokeWidth={1.6} />
      <path d="M24 36a6 6 0 0 0 6 6" stroke="#e6a0a0" strokeWidth={1.4} fill="none" />
      <path d="M10 52h40" stroke="#8a6d2f" strokeWidth={1.4} />
    </g>
  ),
};

export const OmenCardFront = memo(function OmenCardFront({ type, width = 64 }: { type: OmenType; width?: number }) {
  const relic = type === 'relic';
  return (
    <svg width={width} height={width * 1.45} viewBox="0 0 80 116" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`omen-bg-${type}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1a26" />
          <stop offset="100%" stopColor="#0d0c12" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="77" height="113" rx="5" fill={`url(#omen-bg-${type})`} stroke={relic ? '#e2c071' : '#8a6d2f'} strokeWidth="2" />
      <rect x="6" y="6" width="68" height="104" rx="3" fill="none" stroke="#323739" />
      {/* gothic arch header */}
      <path d="M14 46V26a26 26 0 0 1 52 0v20z" fill="#070809" stroke="#8a6d2f" strokeWidth="1" />
      <g transform="translate(10 4)">{ART[type]}</g>
      <path d="M10 60h60" stroke="#8a6d2f" strokeOpacity="0.6" />
      <text x="40" y="76" textAnchor="middle" fontFamily="Cinzel, serif" fontSize={type === 'decree' || type === 'harvest' ? 7.5 : 9} fill={relic ? '#e2c071' : '#e6dfcf'} letterSpacing="0.6">
        {OMEN_NAME[type].toUpperCase()}
      </text>
      <path d="M30 88l10-6 10 6-10 6z" fill="none" stroke="#c9a24b" strokeWidth="0.9" />
      <circle cx="40" cy="88" r="1.6" fill={relic ? '#f0cf7b' : '#e0702a'} />
    </svg>
  );
});
