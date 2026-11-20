import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  COSTS,
  RESOURCES,
  activeActor,
  bankRates,
  canAfford,
  handLimitRisk,
  handTotal,
  legalCausewaySpots,
  legalCitadelSpots,
  legalOutpostSpots,
  relicCount,
  totalCards,
  type CostKey,
  type GameState,
  type OmenType,
  type Resource,
  type ResourceCounts,
} from '@hexfall/engine';
import { Icon, type IconName } from '../../art/icons/Icon';
import { TurnTimerBadge } from '../hud/Hud';
import { OmenCardFront } from '../../art/cards/OmenCard';
import { audio } from '../../audio/engine';
import { OMEN_FLAVOR, OMEN_NAME, OMEN_TEXT, PIECE_NAME, PIECE_PLURAL, RESOURCE_NAME } from '../../lexicon';
import { useStore, type PlaceMode, type Tab } from '../../state/store';
import { CostPips, Modal, RookieTip, ResourceCard, SegmentedTabs, Stepper, Tooltip, costProgress } from '../ui/primitives';
import { useUiHints } from '../../state/uiHints';
import { INK_NAME } from './LogLineView';
import { Arms } from '../../ui/hall/Arms';
import { ResourceArt, ScaleBar, Seg } from '../../ui/hall/Controls';
import { OakPanel } from '../../ui/hall/Surfaces';

export function canSeatAct(state: GameState, seat: number): boolean {
  return state.phase.kind !== 'ended' && state.handoff === null && activeActor(state) === seat && state.players[seat].kind === 'human';
}

// ------------------------------------------------------------------ hand

/** Thy Treasury: the hand as parchment cards with each resource's own art, and the 7-card scale. */
export function HandPanel({ state, seat }: { state: GameState; seat: number }) {
  const p = state.players[seat];
  const gains = useStore((s) => s.session?.turnGains[seat]);
  const hideUntilHold = useStore((s) => s.settings.hideHandUntilHold);
  const hoverCost = useUiHints((s) => s.cost);
  const [peek, setPeek] = useState(false);
  const risk = handLimitRisk(p);
  const hidden = hideUntilHold && !peek;
  const total = handTotal(p);
  return (
    <OakPanel title="Thy Treasury" aria-label={`${p.name}'s hand`}>
      <div className="px-3 pb-3">
        <div className="mb-2 flex items-center gap-2">
          <Arms color={p.color} sigil={p.sigil} size={22} />
          <h3 className="sr-only">Your hand</h3>
          <span className="flex-1" />
          <Tooltip align="end" label={risk > 0 ? `Over the limit: a 7 costs you ${risk} cards` : 'Safe from the robber at 7 cards or fewer'}>
            <span className={`hc-label text-[16px] ${risk > 0 ? 'hc-rubric' : ''}`} tabIndex={0}>
              {total} {total === 1 ? 'card' : 'cards'}
            </span>
          </Tooltip>
          {hideUntilHold && (
            <button
              className="hc-paper-btn hc-paper-btn--sm !w-[44px] !px-0"
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setPeek(true)}
              onKeyUp={() => setPeek(false)}
              aria-label="Hold to reveal hand"
              title="Hold to reveal"
            >
              <Icon name={peek ? 'eye' : 'eyeOff'} size={17} />
            </button>
          )}
        </div>
        <div className="-mx-1 flex justify-between gap-1" data-testid="hand">
          {RESOURCES.map((r) => {
            const need = hoverCost && (hoverCost[r] ?? 0) > 0 && !hidden ? (p.hand[r] >= (hoverCost[r] ?? 0) ? 'have' : 'missing') : null;
            return (
              <div key={r} data-res={r} className="min-w-0 max-w-[68px] flex-1">
                <ResourceCard res={r} count={p.hand[r]} gained={gains?.[r] ?? 0} hidden={hidden} need={need} fluid />
              </div>
            );
          })}
        </div>
        {!hidden && (
          <div className="mt-2">
            <ScaleBar value={total} label="Cards in hand against the limit of 7" />
            {risk > 0 ? (
              <p className="flex items-center gap-1 text-[15px] italic hc-rubric" role="note">
                <Icon name="wraith" size={15} /> A 7 would cost you <b className="hc-num">{risk}</b> cards
              </p>
            ) : (
              <p className="text-[15px] italic hc-ink-muted">
                <span className="hc-num text-[color:var(--map-ink)]">{Math.max(0, 7 - total)}</span> to the limit
              </p>
            )}
          </div>
        )}
      </div>
    </OakPanel>
  );
}

// ------------------------------------------------------------------ build tab

const BUILD_ITEMS: { key: CostKey; icon: IconName; mode?: PlaceMode; blurb: string }[] = [
  { key: 'causeway', icon: 'causeway', mode: 'causeway', blurb: 'Connects your buildings' },
  { key: 'outpost', icon: 'outpost', mode: 'outpost', blurb: '1 point' },
  { key: 'citadel', icon: 'citadel', mode: 'citadel', blurb: '2 points' },
  { key: 'omen', icon: 'omen', blurb: 'Random card' },
];

function BuildTab({ state, seat, active }: { state: GameState; seat: number; active: boolean }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const dispatch = useStore((s) => s.dispatch);
  const pushToast = useStore((s) => s.pushToast);
  const setCost = useUiHints((s) => s.setCost);
  const p = state.players[seat];
  const inMain = state.phase.kind === 'main' && active;
  return (
    <div className="flex flex-col">
      {BUILD_ITEMS.map((item, idx) => {
        const cost = COSTS[item.key];
        const supply =
          item.key === 'causeway' ? p.supply.causeways : item.key === 'outpost' ? p.supply.outposts : item.key === 'citadel' ? p.supply.citadels : state.omenDeck.length;
        const spots =
          item.key === 'causeway'
            ? legalCausewaySpots(state, seat).length
            : item.key === 'outpost'
              ? legalOutpostSpots(state, seat).length
              : item.key === 'citadel'
                ? legalCitadelSpots(state, seat).length
                : 1;
        const affordable = canAfford(p.hand, cost);
        const name = PIECE_NAME[item.key];
        // Why the build would be declined (null when it can go ahead).
        let declined: string | null = null;
        if (state.phase.kind === 'roll') declined = 'Roll the dice first';
        else if (!inMain) declined = 'You can’t build right now';
        else if (supply <= 0) declined = item.key === 'omen' ? 'No development cards left' : `No ${PIECE_PLURAL[item.key]} left`;
        else if (!affordable) declined = `Not enough resources for a ${name}`;
        else if (spots === 0) declined = `No place to build a ${name}`;
        const ready = active && declined === null;
        const selected = item.mode !== undefined && mode === item.mode;
        const prog = costProgress(cost, p.hand);
        const onClick = () => {
          if (declined) {
            audio.play('error');
            pushToast(declined, 'bad');
            return;
          }
          if (item.key === 'omen') {
            dispatch({ type: 'BuyOmen', player: seat });
          } else {
            setMode(selected ? null : item.mode!);
          }
        };
        const title = item.key === 'omen' ? 'Dev. card' : PIECE_NAME[item.key];
        const status = selected
          ? 'Esc to cancel'
          : ready
            ? item.key === 'omen'
              ? 'Buy'
              : 'Build'
            : !affordable
              ? `${prog.need - prog.have} short`
              : supply <= 0
                ? 'None left'
                : spots === 0
                  ? 'No spot'
                  : 'Not now';
        return (
          <button
            key={item.key}
            className={`relative flex min-h-[64px] items-center gap-2.5 px-2 py-2 text-left transition-colors hover:bg-[rgba(58,38,20,0.08)] ${idx ? 'border-t-[1.5px] border-dotted border-[color:var(--map-ink-muted)]' : ''}`}
            style={selected ? { background: 'rgba(168,40,30,0.1)', boxShadow: 'inset 3px 0 0 var(--rubric)' } : undefined}
            onClick={onClick}
            onMouseEnter={() => setCost(cost)}
            onMouseLeave={() => setCost(null)}
            onFocus={() => setCost(cost)}
            onBlur={() => setCost(null)}
            disabled={!active}
            aria-disabled={!ready && !selected}
            aria-pressed={item.mode ? selected : undefined}
            aria-label={`${selected ? 'Cancel' : item.key === 'omen' ? 'Buy' : 'Build'} ${title}`}
            data-testid={`build-${item.key}`}
            data-ready={ready}
          >
            <span className={ready || selected ? 'text-[color:var(--map-ink)]' : 'hc-ink-muted'} aria-hidden>
              <Icon name={item.icon} size={22} strokeWidth={1.7} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[19px] leading-tight">{title}</span>
                <span className="hc-num shrink-0 text-[13px] hc-ink-muted" title={item.key === 'omen' ? 'Development cards left' : 'Left in your supply'}>
                  {supply} left
                </span>
              </span>
              <span className="block truncate text-[13px] italic hc-ink-muted">{item.blurb}</span>
              <span className="mt-1 flex items-center justify-between gap-2">
                <CostPips cost={cost} hand={p.hand} />
                <span className={`shrink-0 text-[15px] italic ${selected ? 'hc-rubric' : ready ? 'hc-ok font-bold' : 'hc-rubric'}`}>{status}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ cards tab

function CardsTab({ state, seat, active }: { state: GameState; seat: number; active: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const openModal = useStore((s) => s.openModal);
  const p = state.players[seat];
  const [details, setDetails] = useState<OmenType | null>(null);
  /** Man up: choosing whom to call out. */
  const [challenging, setChallenging] = useState(false);
  // Only other people can be called out (bots never fight), online with live combat.
  const foes = state.config.pvp ? state.players.filter((o) => o.id !== seat && o.kind === 'human') : [];
  const groups = useMemo(() => {
    const m = new Map<OmenType, { total: number; fresh: number }>();
    for (const o of p.omens) {
      const g = m.get(o.type) ?? { total: 0, fresh: 0 };
      g.total++;
      if (o.boughtTurn >= state.turn) g.fresh++;
      m.set(o.type, g);
    }
    return [...m.entries()];
  }, [p.omens, state.turn]);
  const phaseOk = active && (state.phase.kind === 'roll' || state.phase.kind === 'main');
  const play = (t: OmenType) => {
    if (t === 'warden') dispatch({ type: 'PlayWarden', player: seat });
    else if (t === 'decree') dispatch({ type: 'PlayDecree', player: seat });
    else if (t === 'harvest') openModal('harvest');
    else if (t === 'tithe') openModal('tithe');
    else if (t === 'manup') setChallenging(true);
  };
  if (!groups.length) {
    return (
      <div className="py-5 text-center text-[16px] italic hc-ink-muted">
        <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-dashed border-[color:var(--map-ink-muted)]" aria-hidden>
          <Icon name="omen" size={22} />
        </span>
        No development cards yet. Buy one from the Build tab.
        {p.playedOmens.length > 0 && (
          <div className="mx-auto mt-4 w-fit text-left not-italic">
            <PlayedCards played={p.playedOmens} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {groups.map(([type, g], idx) => {
        const playable = g.total - g.fresh;
        const relic = type === 'relic';
        let status = 'Play';
        let enabled = false;
        if (relic) status = 'Hidden · +1 point';
        else if (!active) status = 'Not your turn';
        else if (state.omenPlayedThisTurn) status = 'One per turn';
        else if (playable === 0) status = 'Bought this turn';
        else if (!phaseOk) status = 'Not now';
        else if (type === 'manup' && !foes.length) status = 'No one to duel';
        else enabled = true;
        return (
          <div key={type} className={`flex items-start gap-3 px-1 py-2.5 ${idx ? 'border-t-[1.5px] border-dotted border-[color:var(--map-ink-muted)]' : ''}`}>
            <button onClick={() => setDetails(type)} aria-label={`${OMEN_NAME[type]} details`} className="shrink-0 transition-transform duration-200 hover:-translate-y-1 hover:rotate-[-3deg]">
              <OmenCardFront type={type} width={46} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[19px] leading-tight">{OMEN_NAME[type]}</span>
                <span className="hc-num text-[15px] hc-ink-muted">×{g.total}</span>
                {g.fresh > 0 && !relic && <span className="px-1.5 text-[12px] italic" style={{ border: '1px solid var(--azure, #1f3a7a)', color: '#1f3a7a' }}>New · next turn</span>}
              </div>
              <p className="text-[14px] leading-snug italic hc-ink-muted">{OMEN_TEXT[type]}</p>
              {!relic && (
                <button className={`mt-2 ${enabled ? 'hc-btn hc-btn--sm !min-h-[40px] !text-[16px]' : 'hc-paper-btn hc-paper-btn--sm'}`} disabled={!enabled} onClick={() => play(type)}>
                  {status}
                </button>
              )}
              {relic && <div className="mt-1 text-[15px] italic hc-ok">{status}</div>}
            </div>
          </div>
        );
      })}
      {challenging && (
        <Modal title="Man up: choose your opponent" icon="duel" onClose={() => setChallenging(false)}>
          <p className="mb-3">The board pauses while you two fight in the 3D walk. The winner takes a random resource card.</p>
          <div className="flex flex-col gap-2" role="group" aria-label="Opponents">
            {foes.map((o) => (
              <button
                key={o.id}
                className="hc-paper-btn justify-start"
                onClick={() => {
                  setChallenging(false);
                  dispatch({ type: 'PlayManUp', player: seat, target: o.id });
                  useStore.getState().setView3d(true);
                }}
              >
                <Arms color={o.color} sigil={o.sigil} size={24} />
                <span style={{ color: INK_NAME[o.color] }}>{o.name}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {details && <CardDetails type={details} onClose={() => setDetails(null)} />}
      {relicCount(p) > 0 && <div className="pt-1 text-[15px] italic">Victory Points: {relicCount(p)}</div>}
      <PlayedCards played={p.playedOmens} />
    </div>
  );
}

function CardDetails({ type, onClose }: { type: OmenType; onClose: () => void }) {
  return (
    <Modal title={OMEN_NAME[type]} icon="omen" onClose={onClose}>
      <div className="flex flex-col items-center gap-3 text-center">
        <OmenCardFront type={type} width={150} />
        <p className="text-[18px]">{OMEN_TEXT[type]}</p>
        <hr className="hc-dots w-full" />
        <p className="italic hc-ink-muted">“{OMEN_FLAVOR[type]}”</p>
      </div>
    </Modal>
  );
}

/**
 * The cards this player has played, face up in the order played: each new one is dealt onto
 * the right end of a fanned row, overlapping more as the row grows so it always fits.
 */
function PlayedCards({ played }: { played: OmenType[] }) {
  const reduce = useStore((s) => s.settings.reduceMotion);
  const [details, setDetails] = useState<OmenType | null>(null);
  if (!played.length) return null;
  const w = 40;
  const n = played.length;
  // Fit up to ~11 cards in the rail: overlap a quarter of a card, up to two thirds.
  const overlap = Math.min(w * 0.68, Math.max(w * 0.22, w - 230 / Math.max(1, n - 1)));
  return (
    <div className="mt-2 px-2 pb-2 pt-1.5" style={{ border: '1.5px solid var(--map-ink)', background: 'rgba(241,228,196,0.6)' }}>
      <div className="hc-label mb-2 flex items-center justify-between text-[15px]">
        <span>Played</span>
        <span className="hc-num hc-rubric">{n}</span>
      </div>
      <div className="flex h-[64px] items-end pl-1" role="list" aria-label="Played development cards">
        {played.map((t, i) => (
          <motion.button
            key={i}
            role="listitem"
            title={OMEN_NAME[t]}
            aria-label={`${OMEN_NAME[t]}, played`}
            onClick={() => setDetails(t)}
            initial={reduce ? false : { y: -26, opacity: 0, rotate: -14, scale: 1.15 }}
            animate={{ y: 0, opacity: 1, rotate: (i - (n - 1) / 2) * Math.min(4, 18 / n), scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            whileHover={reduce ? undefined : { y: -8, zIndex: 50 }}
            style={{ marginLeft: i ? -overlap : 0, zIndex: i, transformOrigin: '50% 100%' }}
            className="relative shadow-[0_4px_8px_rgba(0,0,0,0.45)]"
          >
            <OmenCardFront type={t} width={w} />
          </motion.button>
        ))}
      </div>
      {details && <CardDetails type={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ trade tab

/** A paper cell holding one resource's art and a small number. */
function cellClass(on: boolean) {
  return `relative flex h-[52px] flex-col items-center justify-center gap-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${on ? 'bg-[color:var(--map-ink)] text-[color:var(--paper-card)]' : 'bg-[color:var(--paper-card)] hover:bg-[#f7ecd0]'}`;
}
const CELL_STYLE = { border: '1.5px solid var(--map-ink)' };

function BankTrade({ state, seat, enabled }: { state: GameState; seat: number; enabled: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = state.players[seat];
  const rates = bankRates(state, seat);
  const [give, setGive] = useState<Resource | null>(null);
  const [receive, setReceive] = useState<Resource | null>(null);
  const [count, setCount] = useState(1);
  const rate = give ? rates[give] : 4;
  const maxCount = give ? Math.min(Math.floor(p.hand[give] / rate), receive ? state.bank[receive] : 19) : 1;
  const ok = enabled && give && receive && give !== receive && count >= 1 && count <= maxCount;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[38px_repeat(5,minmax(0,1fr))] items-center gap-1">
        <span className="hc-label text-[14px]">Give</span>
        {RESOURCES.map((r) => {
          const can = p.hand[r] >= rates[r];
          return (
            <button
              key={r}
              className={cellClass(give === r)}
              style={CELL_STYLE}
              disabled={!can || !enabled}
              onClick={() => {
                setGive(r);
                setCount(1);
                if (receive === r) setReceive(null);
              }}
              aria-pressed={give === r}
              aria-label={`Give ${RESOURCE_NAME[r]} at ${rates[r]} to 1`}
              title={`${RESOURCE_NAME[r]} — ${rates[r]}:1${rates[r] < 4 ? ' (harbor)' : ''}`}
            >
              <ResourceArt res={r} size={26} />
              <span className={`hc-num text-[12px] leading-none ${rates[r] < 4 && give !== r ? 'hc-rubric font-bold' : ''}`}>{rates[r]}:1</span>
            </button>
          );
        })}
        <span className="hc-label text-[14px]">Get</span>
        {RESOURCES.map((r) => (
          <button
            key={r}
            className={cellClass(receive === r)}
            style={CELL_STYLE}
            disabled={!enabled || r === give || state.bank[r] === 0}
            onClick={() => setReceive(r)}
            aria-pressed={receive === r}
            aria-label={`Receive ${RESOURCE_NAME[r]} (bank has ${state.bank[r]})`}
            title={`${RESOURCE_NAME[r]} — bank holds ${state.bank[r]}`}
          >
            <ResourceArt res={r} size={26} />
            <span className="hc-num text-[12px] leading-none">{state.bank[r]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Stepper value={count} onChange={setCount} min={1} max={Math.max(1, maxCount)} label="trades" />
        <button
          className="hc-btn hc-btn--sm min-w-0 flex-1 !text-[16px]"
          disabled={!ok}
          data-testid="bank-trade"
          onClick={() => {
            if (!give || !receive) return;
            dispatch({ type: 'BankTrade', player: seat, give, receive, count });
            setCount(1);
          }}
        >
          {give && receive ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="hc-num">{rate * count}</span>
              <ResourceArt res={give} size={22} />
              <Icon name="arrow" size={13} />
              <span className="hc-num">{count}</span>
              <ResourceArt res={receive} size={22} />
              <span className="sr-only">
                Trade {rate * count} {RESOURCE_NAME[give]} for {count} {RESOURCE_NAME[receive]}
              </span>
            </span>
          ) : (
            'Pick give & get'
          )}
        </button>
      </div>
    </div>
  );
}

/** A compact counter: tap to add one, tap the corner badge to take one away. */
function CountCell({ res, value, max, onChange, label, disabled }: { res: Resource; value: number; max: number; onChange: (v: number) => void; label: string; disabled: boolean }) {
  return (
    <div className="relative">
      <button
        className={`${cellClass(false)} w-full`}
        style={{ ...CELL_STYLE, boxShadow: value > 0 ? 'inset 0 0 0 2px var(--rubric)' : undefined }}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`More ${label}`}
        title={`${RESOURCE_NAME[res]}: tap to add`}
      >
        <ResourceArt res={res} size={24} />
        <span className={`hc-num text-[14px] leading-none ${value ? 'hc-rubric font-bold' : ''}`}>{value}</span>
      </button>
      {value > 0 && (
        <button
          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-[#fff3e0]"
          style={{ background: 'var(--rubric)', border: '1px solid var(--ink)' }}
          onClick={() => onChange(value - 1)}
          aria-label={`Fewer ${label}`}
        >
          <Icon name="minus" size={12} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

function PlayerTrade({ state, seat, enabled }: { state: GameState; seat: number; enabled: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = state.players[seat];
  const zero = (): ResourceCounts => ({ wood: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
  const [give, setGive] = useState<ResourceCounts>(zero);
  const [want, setWant] = useState<ResourceCounts>(zero);
  const [to, setTo] = useState<number[] | 'all'>('all');
  const others = state.players.filter((o) => o.id !== seat);
  const valid =
    enabled &&
    totalCards(give) > 0 &&
    totalCards(want) > 0 &&
    RESOURCES.every((r) => give[r] === 0 || want[r] === 0) &&
    RESOURCES.every((r) => give[r] <= p.hand[r]);
  return (
    <div className="flex flex-col gap-2">
      <div className="hc-label text-center text-[15px] hc-rubric">Bill of Exchange</div>
      <div className="grid grid-cols-[38px_repeat(5,minmax(0,1fr))] items-center gap-1">
        <span className="hc-label text-[14px]">Give</span>
        {RESOURCES.map((r) => (
          <CountCell key={r} res={r} value={give[r]} max={p.hand[r]} onChange={(v) => setGive({ ...give, [r]: v })} label={`${RESOURCE_NAME[r]} to give`} disabled={!enabled || want[r] > 0} />
        ))}
        <span className="hc-label text-[14px]">Want</span>
        {RESOURCES.map((r) => (
          <CountCell key={r} res={r} value={want[r]} max={19} onChange={(v) => setWant({ ...want, [r]: v })} label={`${RESOURCE_NAME[r]} wanted`} disabled={!enabled || give[r] > 0} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Offer to">
        <span className="hc-label w-[38px] text-[14px]">To</span>
        <button className={`hc-paper-btn hc-paper-btn--sm !min-h-[40px]`} onClick={() => setTo('all')} aria-pressed={to === 'all'}>
          All
        </button>
        {others.map((o) => {
          const on = to !== 'all' && to.includes(o.id);
          return (
            <Tooltip key={o.id} label={o.name}>
              <button className={`grid h-10 w-10 place-items-center transition-opacity ${on ? '' : 'opacity-60 hover:opacity-100'}`} style={on ? { boxShadow: '0 0 0 2px var(--rubric)' } : undefined} onClick={() => setTo([o.id])} aria-pressed={on} aria-label={o.name}>
                <Arms color={o.color} sigil={o.sigil} size={28} />
              </button>
            </Tooltip>
          );
        })}
        <button
          className="hc-btn hc-btn--sm ml-auto !min-h-[42px] !text-[16px]"
          disabled={!valid}
          onClick={() => {
            const err = dispatch({ type: 'ProposeTrade', player: seat, give, want, to });
            if (!err) {
              setGive(zero());
              setWant(zero());
            }
          }}
        >
          <Icon name="trade" size={15} /> Offer
        </button>
      </div>
    </div>
  );
}

function TradeTab({ state, seat, active }: { state: GameState; seat: number; active: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const [kind, setKind] = useState<'bank' | 'players'>('bank');
  const enabled = active && state.phase.kind === 'main';
  if (state.phase.kind === 'trade' && state.currentPlayer === seat) {
    const o = state.phase.offer;
    const waiting = o.targets.filter((t) => !o.declined.includes(t));
    return (
      <div className="flex flex-col gap-3 py-2 text-[17px]">
        <p>
          Offer out: waiting for{' '}
          {waiting.map((w) => (
            <b key={w} className="inline-flex items-center gap-1" style={{ color: INK_NAME[state.players[w].color] }}>
              <Arms color={state.players[w].color} sigil={state.players[w].sigil} size={18} /> {state.players[w].name}{' '}
            </b>
          ))}
        </p>
        <button className="hc-paper-btn hc-paper-btn--danger" onClick={() => dispatch({ type: 'CancelTrade', player: seat })}>
          Withdraw offer
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          label="Trade with"
          value={kind}
          onChange={setKind}
          small
          options={[
            { v: 'bank', l: 'Bank' },
            { v: 'players', l: 'Players' },
          ]}
        />
        {!enabled && (
          <span className="flex min-w-0 items-center gap-1 truncate text-[15px] italic hc-rubric">
            <Icon name="hourglass" size={13} className="shrink-0" />
            {active ? (state.phase.kind === 'roll' ? 'Roll first' : 'Not now') : 'Not your turn'}
          </span>
        )}
      </div>
      {kind === 'bank' ? <BankTrade state={state} seat={seat} enabled={enabled} /> : <PlayerTrade state={state} seat={seat} enabled={enabled} />}
    </div>
  );
}

// ------------------------------------------------------------------ rail

/** The Build / Cards / Trade tabs in an oak panel, then Roll and End turn and who plays next. */
export function ActionsPanel({ state, seat }: { state: GameState; seat: number }) {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const dispatch = useStore((s) => s.dispatch);
  const active = canSeatAct(state, seat) && state.currentPlayer === seat;
  const n = state.players.length;
  const next = state.players[(state.currentPlayer + 1) % n];
  const canEnd = active && state.phase.kind === 'main';
  const canRoll = active && state.phase.kind === 'roll';
  const timer = useStore((s) => s.settings.turnTimer);
  return (
    <section className="flex min-h-0 flex-col gap-3" aria-label="Actions">
      <OakPanel className="flex min-h-0 flex-1 flex-col" insetClassName="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-1">
        <SegmentedTabs<Tab>
          label="Actions"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'build', label: 'Build', icon: 'outpost', testId: 'tab-build' },
            { id: 'cards', label: 'Cards', icon: 'omen', badge: state.players[seat].omens.length, testId: 'tab-cards' },
            { id: 'trade', label: 'Trade', icon: 'trade', testId: 'tab-trade' },
          ]}
        />
        <div className="hc-scroll min-h-0 flex-1 overflow-y-auto pr-1 pt-1" role="tabpanel">
          {tab === 'build' && <BuildTab state={state} seat={seat} active={active} />}
          {tab === 'cards' && <CardsTab state={state} seat={seat} active={active} />}
          {tab === 'trade' && <TradeTab state={state} seat={seat} active={active} />}
          {tab === 'build' && active && state.phase.kind === 'main' && <RookieTip id="build">Pick a card, then click a glowing spot on the board. Esc cancels.</RookieTip>}
        </div>
      </OakPanel>
      <div className="flex gap-2">
        {canRoll && (
          <button className="hc-btn flex-1 !min-h-[62px] !text-[24px]" onClick={() => dispatch({ type: 'RollDice', player: seat })} data-testid="roll">
            <Icon name="dice" size={20} /> Roll <span className="hc-kbd">Space</span>
          </button>
        )}
        <button className={`hc-btn flex-1 !min-h-[62px] !text-[24px] ${canRoll ? 'hc-btn--dark' : ''}`} disabled={!canEnd} onClick={() => dispatch({ type: 'EndTurn', player: seat })} data-testid="end-turn">
          End turn {canEnd && <span className="hc-kbd">Space</span>}
        </button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[16px] italic text-[color:var(--on-dark-muted)]">
        Next up <Arms color={next.color} sigil={next.sigil} size={20} />
        <b className="not-italic text-[color:var(--on-dark)]">{next.name}</b>
        {timer > 0 && <TurnTimerBadge state={state} />}
      </p>
    </section>
  );
}
