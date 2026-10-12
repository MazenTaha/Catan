import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { RESOURCES, type Resource, type ResourceCounts } from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
import { RESOURCE_NAME } from '../../lexicon';
import { useStore } from '../../state/store';

/** Engraved runic resource card. */
export const ResourceCard = memo(function ResourceCard({
  res,
  count,
  gained = 0,
  dim = false,
  compact = false,
  hidden = false,
}: {
  res: Resource;
  count: number;
  gained?: number;
  dim?: boolean;
  compact?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col items-center justify-between rounded-[3px] border px-1 pb-1 pt-1.5 transition-opacity ${
        compact ? 'h-[74px] w-[54px]' : 'h-[92px] w-[62px]'
      } ${dim || count === 0 ? 'opacity-55' : ''}`}
      style={{
        borderColor: '#3a3f4b',
        background: `linear-gradient(180deg, ${RES_COLOR[res]}26, #15171d 55%, #0f1014)`,
        boxShadow: 'inset 0 0 0 1px #0006, inset 0 0 0 2px #8a6d2f40, 0 4px 10px #0008',
      }}
      aria-label={`${RESOURCE_NAME[res]}: ${hidden ? 'hidden' : count}`}
      role="img"
    >
      <span
        className="pointer-events-none absolute inset-x-1 top-0.5 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${RES_COLOR[res]}, transparent)` }}
      />
      <span style={{ color: RES_COLOR[res] }}>
        <ResourceGlyph res={res} size={compact ? 22 : 26} />
      </span>
      <span className={`num ${compact ? 'text-[18px]' : 'text-[22px]'} leading-none text-bone`}>
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
            className="num absolute -right-2 -top-2 rounded-full border border-venom/70 bg-[#17240f] px-1.5 text-[12px] font-bold text-venom shadow"
          >
            +{gained}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
});

/** Inline resource counts, e.g. "2 ◆ 1 ◆". */
export function CountsInline({ counts, size = 14 }: { counts: Partial<ResourceCounts>; size?: number }) {
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
          className="grid h-[22px] w-[22px] place-items-center rounded-full border"
          style={{
            borderColor: p.have ? RES_COLOR[p.r] : '#4a4f5b',
            background: p.have ? `${RES_COLOR[p.r]}33` : 'transparent',
            color: p.have ? RES_COLOR[p.r] : '#6b6a63',
          }}
        >
          <ResourceGlyph res={p.r} size={13} />
        </span>
      ))}
    </span>
  );
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
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        className="btn h-7 w-7 !p-0"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer ${label}`}
      >
        <Icon name="minus" size={14} />
      </button>
      <span className="num w-6 text-center text-[18px]" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="btn h-7 w-7 !p-0"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More ${label}`}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

/** Accessible modal shell with gothic header, Esc to close, focus management. */
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
        const items = [...ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )];
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose?.();
      }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel rivets panel-raised max-h-[90vh] w-full overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        initial={{ y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <header className="relative flex items-center gap-3 border-b border-iron/80 px-6 pb-3 pt-5">
          {icon && <Icon name={icon} size={20} className="text-gold" />}
          <h2 className="font-display text-lg uppercase tracking-[0.18em] text-gold">{title}</h2>
          {dismissable && onClose && (
            <button className="btn btn-ghost ml-auto !px-2" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="scroll-thin max-h-[calc(90vh-80px)] overflow-y-auto px-6 py-5">{children}</div>
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
    <div className="mt-2 flex items-start gap-2 border border-tarnish/50 bg-[#1d1a12]/90 px-3 py-2 text-[14px] text-bone/90">
      <Icon name="torch" size={16} className="mt-0.5 shrink-0 text-ember" />
      <div className="flex-1">{children}</div>
      <button className="text-muted hover:text-gold" onClick={() => dismiss(id)} aria-label="Dismiss tip">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
