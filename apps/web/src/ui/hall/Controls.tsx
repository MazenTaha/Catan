import { memo, type ReactNode } from 'react';
import type { Resource } from '@hexfall/engine';
import { cardArt } from '../../art/cards/cardArt';
import { RESOURCE_NAME } from '../../lexicon';
import { sealImage } from './Surfaces';

/**
 * A resource's own card illustration, cropped to fit small places (costs, trades, logs). The art
 * is the same everywhere a resource appears; only the crop changes.
 */
export const ResourceArt = memo(function ResourceArt({
  res,
  size = 24,
  label = false,
  className = '',
}: {
  res: Resource;
  size?: number;
  /** Name it for screen readers (otherwise the surrounding text does). */
  label?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`hc-art ${className}`}
      style={{ width: size, height: Math.round(size * 0.8) }}
      role={label ? 'img' : undefined}
      aria-label={label ? RESOURCE_NAME[res] : undefined}
      aria-hidden={label ? undefined : true}
      title={RESOURCE_NAME[res]}
    >
      <img src={cardArt(res)} alt="" draggable={false} style={{ transform: size < 30 ? 'scale(1.35)' : undefined }} />
    </span>
  );
});

/** An ink check box on paper: a real checkbox input, with its label beside it. */
export function Check({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-4 py-2 ${disabled ? 'opacity-60' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] leading-tight">{label}</span>
        {hint && <span className="hc-gloss block hc-ink-muted">{hint}</span>}
      </span>
      <span className="hc-check-hit">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="hc-check peer-focus-visible:shadow-[var(--focus-ring)]" aria-hidden>
          {checked && (
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path d="M3.5 10.5l4.2 4.2L16.8 4.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </span>
    </label>
  );
}

/** An ink-ruled segmented control; the chosen option is filled with map ink. */
export function Seg<T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
  small = false,
  disabled = false,
  className = '',
}: {
  value: T;
  options: { v: T; l: ReactNode; testId?: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`hc-seg ${small ? 'hc-seg--sm' : ''} ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={o.v === value}
          onClick={() => onChange(o.v)}
          disabled={disabled}
          data-testid={o.testId}
          title={o.title}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/**
 * The hand-limit meter drawn as a map's scale bar: alternating ink and paper up to the limit,
 * red beyond it, a dashed red line at the limit and a red pointer at the current count.
 */
export function ScaleBar({ value, limit = 7, label }: { value: number; limit?: number; label: string }) {
  const max = Math.max(limit + 5, value + 1);
  const w = 100 / max;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="relative w-full select-none" style={{ height: 34 }}>
      {/* pointer */}
      <svg className="absolute" style={{ left: `calc(${Math.min(value, max) * w}% - 6px)`, top: 0, transition: 'left var(--dur) var(--ease)' }} width="12" height="10" aria-hidden>
        <path d="M0 0H12L6 9Z" fill="var(--rubric)" stroke="var(--ink)" strokeWidth="1" />
      </svg>
      <div className="absolute inset-x-0 flex" style={{ top: 11, height: 8, border: '1.2px solid var(--ink)' }}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className="h-full"
            style={{
              width: `${w}%`,
              background: i < limit ? (i % 2 ? 'var(--paper-card)' : 'var(--map-ink)') : i % 2 ? '#f0c4b8' : 'var(--rubric)',
            }}
          />
        ))}
      </div>
      <span className="absolute" style={{ left: `${limit * w}%`, top: 4, height: 22, borderLeft: '1.5px dashed var(--rubric)' }} aria-hidden />
      <div className="absolute inset-x-0 text-[11px] leading-none hc-ink-muted" style={{ top: 22 }} aria-hidden>
        {Array.from({ length: max + 1 }, (_, i) => i)
          .filter((i) => i === 0 || i % 2 === 1 || i === max)
          .map((i) => (
            <span key={i} className="absolute -translate-x-1/2 hc-num" style={{ left: `${i * w}%`, color: i === limit ? 'var(--rubric)' : undefined }}>
              {i}
            </span>
          ))}
      </div>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/** A bone die (the 7 shows its pips in red). */
export const BoneDie = memo(function BoneDie({ value, size = 48, red = false }: { value: number; size?: number; red?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.5))' }}>
      <defs>
        <radialGradient id={`bone${size}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fbf3df" />
          <stop offset=".7" stopColor="#ead9b4" />
          <stop offset="1" stopColor="#c9b183" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="16" fill={`url(#bone${size})`} stroke="#1a120b" strokeWidth="3" />
      <rect x="10" y="10" width="80" height="80" rx="12" fill="none" stroke="#fff8e6" strokeOpacity=".6" strokeWidth="1.5" />
      {(PIPS[value] ?? []).map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r="8.5" fill={red ? '#7a1912' : '#2a1d12'} />
          <circle cx={x - 2} cy={y - 2} r="2.4" fill="#000" opacity=".35" />
        </g>
      ))}
    </svg>
  );
});

/** A wax seal with its label beside it, for confirming (Accept, Done, Seal & send). */
export function SealButton({
  children,
  onClick,
  disabled,
  onDark = false,
  size = 52,
  testId,
  title,
  autoFocus,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  onDark?: boolean;
  size?: number;
  testId?: string;
  title?: string;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={`hc-seal-btn ${onDark ? 'hc-seal-btn--on-dark' : ''}`}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      title={title}
      autoFocus={autoFocus}
    >
      <img src={sealImage} alt="" aria-hidden width={size} height={size} />
      <span>{children}</span>
    </button>
  );
}

/** A map note: a paper slip with an optional red italic title. */
export function MapNote({ title, children, className = '' }: { title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`hc-note ${className}`}>
      {title && <div className="hc-note__title">{title}</div>}
      {children && <div className="hc-note__body">{children}</div>}
    </div>
  );
}
