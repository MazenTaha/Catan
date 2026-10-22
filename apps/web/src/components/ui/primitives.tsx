import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useId, useRef, type ReactNode } from 'react';
import { RESOURCES, type Resource, type ResourceCounts } from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph, type IconName } from '../../art/icons/Icon';
import { RESOURCE_NAME } from '../../lexicon';
import { prefersReducedMotion, useStore } from '../../state/store';

/**
 * A resource card you can feel: lifts on hover, glows when a hovered build needs it
 * (`need: 'have'`) or shows a dashed outline when it is missing (`need: 'missing'`).
 */
export const ResourceCard = memo(function ResourceCard({
  res,
  count,
  gained = 0,
  dim = false,
  compact = false,
  hidden = false,
  need = null,
  fluid = false,
}: {
  res: Resource;
  count: number;
  gained?: number;
  dim?: boolean;
  compact?: boolean;
  hidden?: boolean;
  need?: 'have' | 'missing' | null;
  /** Fill the parent's width (the hand shares its row between five cards). */
  fluid?: boolean;
}) {
  const c = RES_COLOR[res];
  const empty = count === 0;
  return (
    <div
      className={`group relative flex flex-col items-center justify-between overflow-hidden rounded-xl border px-1 pb-1.5 pt-2 transition-[transform,opacity,box-shadow,border-color] duration-200 hover:-translate-y-1 ${
        compact ? 'h-[78px] w-[56px]' : fluid ? 'h-[92px] w-full' : 'h-[96px] w-[64px]'
      } ${(dim || empty) && need !== 'have' ? 'opacity-50' : ''}`}
      style={{
        borderColor: need === 'have' ? c : need === 'missing' ? '#ff805c' : `${c}55`,
        borderStyle: need === 'missing' ? 'dashed' : 'solid',
        background: `radial-gradient(120% 70% at 50% 0%, ${c}38, transparent 60%), linear-gradient(180deg, #202325, #121415)`,
        boxShadow:
          need === 'have'
            ? `0 0 0 1px ${c}, 0 0 20px -2px ${c}aa, 0 10px 18px -10px #000`
            : 'inset 0 1px 0 #ffffff12, 0 8px 16px -10px #000',
      }}
      aria-label={`${RESOURCE_NAME[res]}: ${hidden ? 'hidden' : count}`}
      role="img"
    >
      <span
        className="grid place-items-center rounded-full transition-transform duration-200 group-hover:scale-110"
        style={{
          color: c,
          width: compact ? 30 : 34,
          height: compact ? 30 : 34,
          background: `${c}1f`,
          boxShadow: `inset 0 0 0 1px ${c}40`,
        }}
      >
        <ResourceGlyph res={res} size={compact ? 18 : 21} />
      </span>
      <span className={`num ${compact ? 'text-[19px]' : 'text-[23px]'} leading-none text-bone`}>
        {hidden ? '?' : count}
      </span>
      <span className="w-full truncate text-center font-body text-[11px] leading-none text-muted">
        {RESOURCE_NAME[res]}
      </span>
      <AnimatePresence>
        {gained > 0 && !hidden && (
          <motion.span
            key={gained}
            initial={{ scale: 0.4, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="num absolute right-1 top-1 rounded-full bg-venom px-1.5 text-[11px] font-bold leading-[18px] text-[#14230b] shadow"
          >
            +{gained}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
});

/** Inline resource counts, e.g. "2 ◆ 1 ◆". */
export function CountsInline({
  counts,
  size = 14,
}: {
  counts: Partial<ResourceCounts>;
  size?: number;
}) {
  const has = RESOURCES.filter((r) => (counts[r] ?? 0) > 0);
  if (!has.length) return <span className="text-muted">nothing</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 align-middle">
      {has.map((r) => (
        <span key={r} className="inline-flex items-center gap-0.5" title={RESOURCE_NAME[r]}>
          <span className="num text-[0.95em]">{counts[r]}</span>
          <span style={{ color: RES_COLOR[r] }}>
            <ResourceGlyph res={r} size={size} />
          </span>
          <span className="sr-only">{RESOURCE_NAME[r]}</span>
        </span>
      ))}
    </span>
  );
}

/** Cost pips: filled when the player holds the card, hollow when not. */
export function CostPips({ cost, hand }: { cost: Partial<ResourceCounts>; hand: ResourceCounts }) {
  const pips: { r: Resource; have: boolean; k: string }[] = [];
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    for (let i = 0; i < n; i++) pips.push({ r, have: hand[r] > i, k: `${r}${i}` });
  }
  return (
    <span className="inline-flex flex-wrap gap-1" aria-hidden>
      {pips.map((p) => (
        <span
          key={p.k}
          title={RESOURCE_NAME[p.r]}
          className="grid h-[24px] w-[24px] place-items-center rounded-lg border transition-colors"
          style={{
            borderColor: p.have ? RES_COLOR[p.r] : '#4a5154',
            background: p.have ? `${RES_COLOR[p.r]}30` : '#00000030',
            color: p.have ? RES_COLOR[p.r] : '#737b7e',
            borderStyle: p.have ? 'solid' : 'dashed',
          }}
        >
          <ResourceGlyph res={p.r} size={13} />
        </span>
      ))}
    </span>
  );
}

/** How many of a cost's cards the hand already covers. */
export function costProgress(
  cost: Partial<ResourceCounts>,
  hand: ResourceCounts,
): { have: number; need: number } {
  let have = 0;
  let need = 0;
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    need += n;
    have += Math.min(n, hand[r]);
  }
  return { have, need };
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  label: string;
}) {
  return (
    <div
      className="inline-flex items-center rounded-xl border border-iron/80 bg-surface-1/80 p-0.5"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="icon-btn !h-7 !w-7 !rounded-lg"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer ${label}`}
      >
        <Icon name="minus" size={14} />
      </button>
      <span
        className={`num w-6 text-center text-[17px] ${value > 0 ? 'text-gold' : 'text-muted'}`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className="icon-btn !h-7 !w-7 !rounded-lg"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More ${label}`}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

/**
 * A small label that appears on hover or keyboard focus (CSS only). It is `display: none`
 * until shown, so a tooltip near the screen edge never widens the page.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  className = '',
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'center' | 'start' | 'end';
  className?: string;
}) {
  const x =
    align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'start' ? 'left-0' : 'right-0';
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`tip-pop pointer-events-none absolute z-[80] hidden w-max max-w-[220px] rounded-lg border border-iron/80 bg-[#0f1112]/95 px-2.5 py-1.5 text-center font-body text-[13px] normal-case leading-snug tracking-normal text-bone shadow-panel group-focus-within/tip:block group-hover/tip:block ${x} ${
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
      >
        {label}
      </span>
    </span>
  );
}

/** An icon-only button with an accessible name and a hover tooltip. */
export function IconButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  pressed,
  side = 'bottom',
  align = 'center',
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  side?: 'top' | 'bottom';
  align?: 'center' | 'start' | 'end';
}) {
  return (
    <Tooltip label={hint ?? label} side={side} align={align}>
      <button
        className="icon-btn"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
      >
        <Icon name={icon} size={17} />
      </button>
    </Tooltip>
  );
}

/** Circular progress (0–1) with content in the middle. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  color = 'rgb(var(--gold))',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(0 0 0 / 0.35)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{
            transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0.8,0.2,1)',
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

/** Tabs drawn as a segmented control with a sliding highlight. */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: T; label: string; icon?: IconName; badge?: number; testId?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const uid = useId();
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative flex rounded-2xl border border-iron/70 bg-black/25 p-1"
    >
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            data-testid={t.testId}
            onClick={() => onChange(t.id)}
            className={`relative z-0 flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 font-display text-[12px] uppercase tracking-[0.12em] transition-colors ${
              on ? 'text-[#2a1406]' : 'text-muted hover:text-bone'
            }`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${uid}`}
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }
                }
                className="absolute inset-0 -z-10 rounded-xl"
                style={{
                  background: 'linear-gradient(180deg, #ffc978, rgb(var(--gold)) 50%, #e07a3e)',
                  boxShadow:
                    '0 6px 16px -8px rgb(255 140 60 / 0.8), inset 0 1px 0 rgb(255 245 220 / 0.7)',
                }}
              />
            )}
            {t.icon && <Icon name={t.icon} size={15} />}
            {t.label}
            {t.badge ? (
              <span
                className={`num grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] ${
                  on ? 'bg-[#2a1406]/20 text-[#2a1406]' : 'bg-ember text-[#2a1406]'
                }`}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Accessible modal shell: Esc to close, focus trap, soft slide-up. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dismissable = true,
  icon,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissable?: boolean;
  icon?: Parameters<typeof Icon>[0]['name'];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable && onClose) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        const items = [
          ...ref.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [dismissable, onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-[#050606]/75 p-4"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose?.();
      }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel panel-raised max-h-[90vh] w-full overflow-hidden !rounded-3xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        initial={reduce ? false : { y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
      >
        <header className="relative flex items-center gap-3 px-6 pb-3 pt-5">
          {icon && (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold shadow-[inset_0_0_0_1px_rgb(var(--gold)/0.35)]">
              <Icon name={icon} size={17} />
            </span>
          )}
          <h2 className="font-display text-lg uppercase tracking-[0.14em] text-gold">{title}</h2>
          {dismissable && onClose && (
            <button className="icon-btn ml-auto" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
          <span className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-tarnish/70 to-transparent" />
        </header>
        <div className="scroll-thin max-h-[calc(90vh-84px)] overflow-y-auto px-6 py-5">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Small dismissible rookie tip, shown once per id while rookie tips are on. */
export function RookieTip({ id, children }: { id: string; children: ReactNode }) {
  const show = useStore((s) => s.settings.rookieTips && !s.settings.dismissedTips.includes(id));
  const dismiss = useStore((s) => s.dismissTip);
  if (!show) return null;
  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gradient-to-br from-[#3a2418]/95 to-[#1a1c1d]/95 px-3 py-2.5 text-[14px] text-bone/90 shadow-panel">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-ember/20 text-ember">
        <Icon name="torch" size={15} />
      </span>
      <div className="flex-1">{children}</div>
      <button
        className="icon-btn !h-6 !w-6 !rounded-md"
        onClick={() => dismiss(id)}
        aria-label="Dismiss tip"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
