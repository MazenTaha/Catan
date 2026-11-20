import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { RESOURCES, type Resource, type ResourceCounts } from '@hexfall/engine';
import { Icon, type IconName } from '../../art/icons/Icon';
import { cardArt } from '../../art/cards/cardArt';
import { RESOURCE_NAME } from '../../lexicon';
import { prefersReducedMotion, useStore } from '../../state/store';
import { ResourceArt } from '../../ui/hall/Controls';

/**
 * A resource card in a parchment frame with the resource's own illustration: lifts on hover,
 * a green rule when a hovered build needs it and the hand has it (`need: 'have'`), a dashed red
 * rule when it is missing (`need: 'missing'`). Zero cards fade but stay readable.
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
  const empty = count === 0 && !hidden;
  return (
    <div
      className={`hc-card group px-1 pb-1.5 pt-1.5 hover:-translate-y-1 ${compact ? 'h-[84px] w-[60px]' : fluid ? 'h-[104px] w-full' : 'h-[104px] w-[66px]'}`}
      data-zero={(empty || dim) && need !== 'have' ? 'true' : undefined}
      data-need={need ?? undefined}
      aria-label={`${RESOURCE_NAME[res]}: ${hidden ? 'hidden' : count}`}
      role="img"
    >
      <span className="block w-full overflow-hidden" style={{ height: compact ? 32 : 40, boxShadow: '0 0 0 1px rgba(26,18,11,0.55)' }}>
        <img src={cardArt(res)} alt="" draggable={false} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110" />
      </span>
      <span className={`hc-num ${compact ? 'text-[21px]' : 'text-[26px]'} mt-0.5 leading-none text-[color:var(--ink)]`}>{hidden ? '?' : count}</span>
      <span className="hc-body w-full truncate text-center text-[12.5px] italic leading-tight">{RESOURCE_NAME[res]}</span>
      <AnimatePresence>
        {gained > 0 && !hidden && (
          <motion.span
            key={gained}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="hc-wax-mark"
          >
            +{gained}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
});

/** Inline resource counts with the resources' own art, e.g. "2 [Wool] 1 [Ore]". */
export function CountsInline({ counts, size = 22 }: { counts: Partial<ResourceCounts>; size?: number }) {
  const has = RESOURCES.filter((r) => (counts[r] ?? 0) > 0);
  if (!has.length) return <span className="italic opacity-75">nothing</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
      {has.map((r) => (
        <span key={r} className="inline-flex items-center gap-1" title={RESOURCE_NAME[r]}>
          <span className="hc-num text-[1em]">{counts[r]}</span>
          <ResourceArt res={r} size={size} />
          <span className="sr-only">{RESOURCE_NAME[r]}</span>
        </span>
      ))}
    </span>
  );
}

/** Cost pips with the resources' art: clear when the player holds the card, faded and dashed when not. */
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
          className="inline-grid place-items-center p-[2px]"
          style={{
            border: p.have ? '1.5px solid var(--ok-ink)' : '1.5px dashed var(--rubric)',
            background: p.have ? 'rgba(47,90,70,0.12)' : 'transparent',
            opacity: p.have ? 1 : 0.6,
          }}
        >
          <ResourceArt res={p.r} size={22} />
        </span>
      ))}
    </span>
  );
}

/** How many of a cost's cards the hand already covers. */
export function costProgress(cost: Partial<ResourceCounts>, hand: ResourceCounts): { have: number; need: number } {
  let have = 0;
  let need = 0;
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    need += n;
    have += Math.min(n, hand[r]);
  }
  return { have, need };
}

/** −/+ boxes with a red numeral. */
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
    <div className="hc-stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
        <Icon name="minus" size={16} strokeWidth={2} />
      </button>
      <span className="hc-stepper__value" aria-live="polite">
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        <Icon name="plus" size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * A map note that appears on hover or keyboard focus (CSS only), joined to what it describes by
 * a dashed ink leader line. It is `display: none` until shown, so it never widens the page.
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
  const x = align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'start' ? 'left-0' : 'right-0';
  const lx = align === 'center' ? 'left-1/2' : align === 'start' ? 'left-4' : 'right-4';
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`tip-pop pointer-events-none absolute z-[80] hidden w-max max-w-[240px] group-focus-within/tip:block group-hover/tip:block ${x} ${
          side === 'top' ? 'bottom-full mb-3' : 'top-full mt-3'
        }`}
      >
        <span className="hc-note block text-center normal-case not-italic tracking-normal">
          <span className="italic">{label}</span>
        </span>
        <span className={`hc-leader ${lx} ${side === 'top' ? '-bottom-3 h-3' : '-top-3 h-3'}`} aria-hidden />
      </span>
    </span>
  );
}

/** A round brass icon button with an accessible name and a map-note hint. */
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
      <button className="hc-icon-btn" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed}>
        <Icon name={icon} size={20} strokeWidth={1.9} />
      </button>
    </Tooltip>
  );
}

/** Circular progress (0–1) with content in the middle. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  color = 'var(--rubric)',
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
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(58,38,20,0.25)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0.8,0.2,1)' }}
        />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

/** Small-caps tabs inside a panel; the selected one is underlined in red ink. */
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
  return (
    <div role="tablist" aria-label={label} className="hc-tabs">
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={on} data-testid={t.testId} onClick={() => onChange(t.id)}>
            {t.label}
            {t.badge ? <span className="hc-badge">{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A decree: a parchment dialog with a blackletter title in dark red ink, an optional emblem,
 * dotted ink dividers. Esc closes it and focus stays inside while it is open, as before;
 * dialogs that must be answered (`dismissable={false}`) cannot be closed.
 */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dismissable = true,
  icon,
  emblem,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissable?: boolean;
  icon?: Parameters<typeof Icon>[0]['name'];
  /** A coat of arms (or other emblem) shown before the title instead of the icon. */
  emblem?: ReactNode;
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
      className="hc-backdrop hc-scope"
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
        className={`hc-decree ${wide ? 'max-w-3xl' : 'max-w-[560px]'}`}
        initial={reduce ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
      >
        <header className="flex items-center gap-3 px-[26px] pb-2 pt-5">
          {emblem ??
            (icon && (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[color:var(--ink)] text-[color:var(--gold-light)]" style={{ background: 'radial-gradient(circle at 35% 30%, #4a2a1a, #1f1b18)' }} aria-hidden>
                <Icon name={icon} size={20} strokeWidth={1.8} />
              </span>
            ))}
          <h2 className="hc-decree__title min-w-0 flex-1">{title}</h2>
          {dismissable && onClose && (
            <button className="hc-paper-btn hc-paper-btn--sm !min-h-[44px] !w-[44px] !px-0" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} strokeWidth={2} />
            </button>
          )}
        </header>
        <hr className="hc-dots mx-[26px] mb-3 mt-1" />
        <div className="hc-decree__body hc-scroll">{children}</div>
      </motion.div>
    </motion.div>
  );
}

/** A rookie tip: a map note pinned to the board, shown once per id while rookie tips are on. */
export function RookieTip({ id, children }: { id: string; children: ReactNode }) {
  const show = useStore((s) => s.settings.rookieTips && !s.settings.dismissedTips.includes(id));
  const dismiss = useStore((s) => s.dismissTip);
  if (!show) return null;
  return (
    <div className="hc-note mt-2 flex items-start gap-2.5 !py-2 text-[15px]">
      <span className="mt-0.5 shrink-0 hc-rubric" aria-hidden>
        <Icon name="torch" size={17} strokeWidth={1.8} />
      </span>
      <div className="flex-1 italic">{children}</div>
      <button className="hc-paper-btn hc-paper-btn--sm !min-h-[32px] !w-[32px] !px-0" onClick={() => dismiss(id)} aria-label="Dismiss tip">
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
