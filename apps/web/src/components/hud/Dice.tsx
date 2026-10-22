const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/** A carved bone die face. */
export function DieFace({ value, size = 52, red = false }: { value: number; size?: number; red?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="die-bone" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#f2e9d4" />
          <stop offset="70%" stopColor="#cdbd98" />
          <stop offset="100%" stopColor="#8f7f5d" />
        </radialGradient>
      </defs>
      <rect x="4" y="8" width="92" height="88" rx="18" fill="#000" opacity="0.45" />
      <rect x="4" y="4" width="92" height="88" rx="18" fill="url(#die-bone)" stroke="#5a4b33" strokeWidth="3" />
      <rect x="11" y="10" width="78" height="76" rx="13" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="2" />
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y - 2} r={9} fill={red ? '#6b1220' : '#241b12'} />
          <circle cx={x - 1.5} cy={y - 3.5} r={3} fill="#000" opacity="0.35" />
        </g>
      ))}
    </svg>
  );
}
