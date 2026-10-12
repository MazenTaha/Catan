import { useMemo, useState } from 'react';
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
  missingResources,
  relicCount,
  totalCards,
  type CostKey,
  type GameState,
  type OmenType,
  type Resource,
  type ResourceCounts,
} from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph, type IconName } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { OmenCardFront } from '../../art/cards/OmenCard';
import { OMEN_FLAVOR, OMEN_NAME, OMEN_TEXT, PIECE_NAME, RESOURCE_NAME } from '../../lexicon';
import { useStore, type PlaceMode, type Tab } from '../../state/store';
import { CostPips, Modal, RookieTip, ResourceCard, Stepper } from '../ui/primitives';
import { NAME_COLOR } from './LogLineView';

export function canSeatAct(state: GameState, seat: number): boolean {
  return (
    state.phase.kind !== 'ended' &&
    state.handoff === null &&
    activeActor(state) === seat &&
    state.players[seat].kind === 'human'
  );
}

// ------------------------------------------------------------------ hand

export function HandPanel({ state, seat }: { state: GameState; seat: number }) {
  const p = state.players[seat];
  const gains = useStore((s) => s.session?.turnGains[seat]);
  const hideUntilHold = useStore((s) => s.settings.hideHandUntilHold);
  const [peek, setPeek] = useState(false);
  const risk = handLimitRisk(p);
  const hidden = hideUntilHold && !peek;
  return (
    <section className="panel rivets px-4 py-3" aria-label={`${p.name}'s hand`}>
      <div className="mb-2 flex items-center gap-2">
        <PlayerDisc color={p.color} sigil={p.sigil} size={22} />
        <h2 className="panel-title flex-1">
          <span>
            <span style={{ color: NAME_COLOR[p.color] }}>{p.name}</span>&rsquo;s hand
          </span>
        </h2>
        <span className="num text-[14px] text-muted">{handTotal(p)} cards</span>
        {hideUntilHold && (
          <button
            className="btn btn-ghost !px-1.5 !py-1"
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setPeek(true)}
            onKeyUp={() => setPeek(false)}
            aria-label="Hold to reveal hand"
            title="Hold to reveal"
          >
            <Icon name={peek ? 'eye' : 'eyeOff'} size={16} />
          </button>
        )}
      </div>
      <div className="flex justify-between gap-1.5" data-testid="hand">
        {RESOURCES.map((r) => (
          <div key={r} data-res={r}>
            <ResourceCard res={r} count={p.hand[r]} gained={gains?.[r] ?? 0} hidden={hidden} />
          </div>
        ))}
      </div>
      {risk > 0 && !hidden && (
        <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ember" role="note">
          <Icon name="wraith" size={15} /> A 7 would cost you <b className="num">{risk}</b> cards
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ build tab

const BUILD_ITEMS: { key: CostKey; icon: IconName; mode?: PlaceMode; blurb: string }[] = [
  { key: 'causeway', icon: 'causeway', mode: 'causeway', blurb: 'Extends your reach' },
  { key: 'outpost', icon: 'outpost', mode: 'outpost', blurb: '1 point · yields 1' },
  { key: 'citadel', icon: 'citadel', mode: 'citadel', blurb: '2 points · yields 2' },
  { key: 'omen', icon: 'omen', blurb: 'Draw a hidden Omen' },
];

function BuildTab({ state, seat, active }: { state: GameState; seat: number; active: boolean }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const dispatch = useStore((s) => s.dispatch);
  const p = state.players[seat];
  const inMain = state.phase.kind === 'main' && active;
  return (
    <div className="grid grid-cols-2 gap-2">
      {BUILD_ITEMS.map((item) => {
        const cost = COSTS[item.key];
        const missing = missingResources(p.hand, cost);
        const missingList = RESOURCES.filter((r) => (missing[r] ?? 0) > 0);
        const supply =
          item.key === 'causeway'
            ? p.supply.causeways
            : item.key === 'outpost'
              ? p.supply.outposts
              : item.key === 'citadel'
                ? p.supply.citadels
                : state.omenDeck.length;
        const spots =
          item.key === 'causeway'
            ? legalCausewaySpots(state, seat).length
            : item.key === 'outpost'
              ? legalOutpostSpots(state, seat).length
              : item.key === 'citadel'
                ? legalCitadelSpots(state, seat).length
                : 1;
        const affordable = canAfford(p.hand, cost);
        let status: string;
        let enabled = false;
        if (!active) status = 'Not your turn';
        else if (state.phase.kind === 'roll') status = 'Roll first';
        else if (!inMain) status = 'Not now';
        else if (supply <= 0) status = item.key === 'omen' ? 'Deck empty' : 'None left';
        else if (!affordable) status = `Need ${missingList.map((r) => (missing[r]! > 1 ? `${missing[r]} ${RESOURCE_NAME[r]}` : RESOURCE_NAME[r])).join(', ')}`;
        else if (spots === 0) status = 'No legal spot';
        else {
          status = item.key === 'omen' ? 'Buy' : 'Build';
          enabled = true;
        }
        const selected = item.mode !== undefined && mode === item.mode;
        const onClick = () => {
          if (!enabled) return;
          if (item.key === 'omen') {
            dispatch({ type: 'BuyOmen', player: seat });
          } else {
            setMode(selected ? null : item.mode!);
          }
        };
        return (
          <div
            key={item.key}
            className={`relative flex flex-col gap-1.5 border px-2.5 pb-2 pt-2 ${selected ? 'border-gold bg-[#241e10] shadow-glow' : 'border-iron/70 bg-surface-2/70'}`}
          >
            <div className="flex items-center gap-1.5">
              <Icon name={item.icon} size={18} className={enabled ? 'text-gold' : 'text-muted'} />
              <span className="font-display text-[14px] uppercase tracking-[0.08em]">{PIECE_NAME[item.key]}</span>
              <span className="num ml-auto text-[13px] text-muted" title={item.key === 'omen' ? 'Cards left in the Omen deck' : 'Left in your supply'}>
                {supply} left
              </span>
            </div>
            <CostPips cost={cost} hand={p.hand} />
            <div className="text-[13px] text-muted">{item.blurb}</div>
            <button
              className={`btn mt-auto !py-1.5 text-[11px] ${enabled ? 'btn-primary' : ''}`}
              onClick={onClick}
              disabled={!enabled}
              aria-pressed={item.mode ? selected : undefined}
              data-testid={`build-${item.key}`}
              title={status}
            >
              {selected ? 'Cancel (Esc)' : status}
            </button>
          </div>
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
  };
  if (!groups.length) {
    return (
      <div className="py-6 text-center text-muted">
        <Icon name="omen" size={28} className="mx-auto mb-2 text-iron" />
        No Omens yet. Buy one from the Build tab.
        <div className="mt-2 text-[14px]">
          Played: {p.playedOmens.length ? p.playedOmens.map((o) => OMEN_NAME[o]).join(', ') : 'none'}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {groups.map(([type, g]) => {
        const playable = g.total - g.fresh;
        const relic = type === 'relic';
        let status = 'Play';
        let enabled = false;
        if (relic) status = 'Hidden · +1 point';
        else if (!active) status = 'Not your turn';
        else if (state.omenPlayedThisTurn) status = 'One per turn';
        else if (playable === 0) status = 'Bought this turn';
        else if (!phaseOk) status = 'Not now';
        else enabled = true;
        return (
          <div
            key={type}
            className={`flex items-start gap-3 border px-3 py-2 ${relic ? 'border-tarnish bg-[#1f1b12]' : 'border-iron/70 bg-surface-2/70'}`}
          >
            <button onClick={() => setDetails(type)} aria-label={`${OMEN_NAME[type]} details`} className="shrink-0 transition-transform hover:-translate-y-0.5">
              <OmenCardFront type={type} width={46} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-[14px] uppercase tracking-[0.08em] text-bone">{OMEN_NAME[type]}</span>
                <span className="num text-[14px] text-muted">×{g.total}</span>
                {g.fresh > 0 && !relic && <span className="chip border-frost !py-0 text-[10px] text-frost">New · locked</span>}
              </div>
              <p className="text-[14px] leading-snug text-muted">{OMEN_TEXT[type]}</p>
              {!relic && (
                <button className={`btn mt-1.5 !py-1 text-[11px] ${enabled ? 'btn-primary' : ''}`} disabled={!enabled} onClick={() => play(type)}>
                  {status}
                </button>
              )}
              {relic && <div className="mt-1 text-[14px] text-gold">{status}</div>}
            </div>
          </div>
        );
      })}
      {details && (
        <Modal title={OMEN_NAME[details]} icon="omen" onClose={() => setDetails(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <OmenCardFront type={details} width={150} />
            <p className="text-[16px]">{OMEN_TEXT[details]}</p>
            <p className="italic text-muted">“{OMEN_FLAVOR[details]}”</p>
          </div>
        </Modal>
      )}
      <div className="text-[14px] text-muted">
        Relics: {relicCount(p)} · Played: {p.playedOmens.length ? p.playedOmens.map((o) => OMEN_NAME[o]).join(', ') : 'none'}
      </div>
    </div>
  );
}

export function OmenCardBack({ type, size = 44 }: { type?: OmenType; size?: number }) {
  const relic = type === 'relic';
  return (
    <svg width={size * 0.72} height={size} viewBox="0 0 36 50" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="34" height="48" rx="3" fill="#15121c" stroke={relic ? '#c9a24b' : '#8a6d2f'} strokeWidth="1.5" />
      <rect x="4" y="4" width="28" height="42" rx="2" fill="none" stroke="#3a3f4b" />
      <path d="M18 10l6 15-6 15-6-15z" fill="none" stroke="#c9a24b" strokeWidth="1.2" />
      <circle cx="18" cy="25" r="4" fill="none" stroke="#c9a24b" strokeWidth="1" />
      <circle cx="18" cy="25" r="1.4" fill={relic ? '#f0cf7b' : '#e0702a'} />
    </svg>
  );
}

// ------------------------------------------------------------------ trade tab

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
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[12px] uppercase tracking-[0.14em] text-gold">Bank &amp; harbors</h3>
        <span className="text-[13px] text-muted">best rate shown</span>
      </div>
      <div className="text-[14px] text-muted">Give</div>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => {
          const can = p.hand[r] >= rates[r];
          return (
            <button
              key={r}
              className={`flex flex-col items-center border px-1 py-1 ${give === r ? 'border-gold bg-[#241e10]' : 'border-iron/70'} ${can ? '' : 'opacity-45'}`}
              disabled={!can || !enabled}
              onClick={() => {
                setGive(r);
                setCount(1);
                if (receive === r) setReceive(null);
              }}
              aria-pressed={give === r}
              aria-label={`Give ${RESOURCE_NAME[r]} at ${rates[r]} to 1`}
              title={`${RESOURCE_NAME[r]} — ${rates[r]}:1`}
            >
              <span style={{ color: RES_COLOR[r] }}>
                <ResourceGlyph res={r} size={18} />
              </span>
              <span className={`num text-[12px] ${rates[r] < 4 ? 'text-gold' : 'text-muted'}`}>{rates[r]}:1</span>
            </button>
          );
        })}
      </div>
      <div className="text-[14px] text-muted">Receive</div>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => (
          <button
            key={r}
            className={`flex flex-col items-center border px-1 py-1 ${receive === r ? 'border-gold bg-[#241e10]' : 'border-iron/70'}`}
            disabled={!enabled || r === give || state.bank[r] === 0}
            onClick={() => setReceive(r)}
            aria-pressed={receive === r}
            aria-label={`Receive ${RESOURCE_NAME[r]} (bank has ${state.bank[r]})`}
            title={`${RESOURCE_NAME[r]} — bank holds ${state.bank[r]}`}
          >
            <span style={{ color: RES_COLOR[r] }}>
              <ResourceGlyph res={r} size={18} />
            </span>
            <span className="num text-[11px] text-muted">{state.bank[r]}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Stepper value={count} onChange={setCount} min={1} max={Math.max(1, maxCount)} label="trades" />
        <button
          className="btn btn-primary flex-1 !py-1.5 text-[11px]"
          disabled={!ok}
          data-testid="bank-trade"
          onClick={() => {
            if (!give || !receive) return;
            dispatch({ type: 'BankTrade', player: seat, give, receive, count });
            setCount(1);
          }}
        >
          {give && receive
            ? `Trade ${rate * count} ${RESOURCE_NAME[give]} → ${count} ${RESOURCE_NAME[receive]}`
            : 'Pick give & receive'}
        </button>
      </div>
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
      <h3 className="font-display text-[12px] uppercase tracking-[0.14em] text-gold">Offer to players</h3>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1 text-[14px]">
        <span className="text-[13px] text-muted" />
        <span className="text-center text-[13px] text-muted">Give</span>
        <span className="text-center text-[13px] text-muted">Want</span>
        {RESOURCES.map((r) => (
          <div key={r} className="contents">
            <span className="inline-flex items-center gap-1.5">
              <span style={{ color: RES_COLOR[r] }}>
                <ResourceGlyph res={r} size={16} />
              </span>
              {RESOURCE_NAME[r]}
            </span>
            <Stepper value={give[r]} max={p.hand[r]} onChange={(v) => setGive({ ...give, [r]: v })} label={`${RESOURCE_NAME[r]} to give`} />
            <Stepper value={want[r]} max={19} onChange={(v) => setWant({ ...want, [r]: v })} label={`${RESOURCE_NAME[r]} wanted`} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Offer to">
        <button className={`chip ${to === 'all' ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => setTo('all')} aria-pressed={to === 'all'}>
          Everyone
        </button>
        {others.map((o) => (
          <button
            key={o.id}
            className={`chip ${to !== 'all' && to.includes(o.id) ? 'border-gold text-gold' : 'text-muted'}`}
            onClick={() => setTo([o.id])}
            aria-pressed={to !== 'all' && to.includes(o.id)}
          >
            <span style={{ color: NAME_COLOR[o.color] }}>{o.name}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary !py-1.5 text-[11px]"
        disabled={!valid}
        onClick={() => {
          const err = dispatch({ type: 'ProposeTrade', player: seat, give, want, to });
          if (!err) {
            setGive(zero());
            setWant(zero());
          }
        }}
      >
        <Icon name="trade" size={14} /> Send offer
      </button>
    </div>
  );
}

function TradeTab({ state, seat, active }: { state: GameState; seat: number; active: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const enabled = active && state.phase.kind === 'main';
  if (state.phase.kind === 'trade' && state.currentPlayer === seat) {
    const o = state.phase.offer;
    const waiting = o.targets.filter((t) => !o.declined.includes(t));
    return (
      <div className="flex flex-col gap-2 text-[14px]">
        <p>
          Offer out: waiting for{' '}
          {waiting.map((w) => (
            <b key={w} style={{ color: NAME_COLOR[state.players[w].color] }}>
              {state.players[w].name}{' '}
            </b>
          ))}
        </p>
        <button className="btn btn-danger" onClick={() => dispatch({ type: 'CancelTrade', player: seat })}>
          Withdraw offer
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {!enabled && <p className="text-[14px] text-muted">{active ? (state.phase.kind === 'roll' ? 'Roll first to trade.' : 'Trading is not possible right now.') : 'Only the active player may trade.'}</p>}
      <BankTrade state={state} seat={seat} enabled={enabled} />
      <div className="divider-ornament text-[10px]">✦</div>
      <PlayerTrade state={state} seat={seat} enabled={enabled} />
    </div>
  );
}

// ------------------------------------------------------------------ rail

export function ActionsPanel({ state, seat }: { state: GameState; seat: number }) {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const dispatch = useStore((s) => s.dispatch);
  const active = canSeatAct(state, seat) && state.currentPlayer === seat;
  const n = state.players.length;
  const next = state.players[(state.currentPlayer + 1) % n];
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'build', label: 'Build' },
    { id: 'cards', label: 'Cards', badge: state.players[seat].omens.length },
    { id: 'trade', label: 'Trade' },
  ];
  const canEnd = active && state.phase.kind === 'main';
  return (
    <section className="panel rivets flex min-h-0 flex-col px-4 py-3" aria-label="Actions">
      <div role="tablist" className="mb-3 flex border-b border-iron/70">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`-mb-px flex-1 border-b-2 px-2 pb-2 font-display text-[12px] uppercase tracking-[0.14em] ${tab === t.id ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-bone'}`}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
            {t.badge ? <span className="num ml-1 text-[11px] text-bone">({t.badge})</span> : null}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1" role="tabpanel">
        {tab === 'build' && <BuildTab state={state} seat={seat} active={active} />}
        {tab === 'cards' && <CardsTab state={state} seat={seat} active={active} />}
        {tab === 'trade' && <TradeTab state={state} seat={seat} active={active} />}
        {tab === 'build' && active && state.phase.kind === 'main' && (
          <RookieTip id="build">Pick a card, then click a glowing spot on the isle. Esc cancels.</RookieTip>
        )}
      </div>
      <button
        className="btn btn-primary mt-3 w-full !py-3 text-[15px]"
        disabled={!canEnd}
        onClick={() => dispatch({ type: 'EndTurn', player: seat })}
        data-testid="end-turn"
      >
        <Icon name="hourglass" size={18} /> End turn
      </button>
      <p className="mt-1.5 text-center text-[14px] text-muted">
        Next up: <b style={{ color: NAME_COLOR[next.color] }}>{next.name}</b>
      </p>
    </section>
  );
}
