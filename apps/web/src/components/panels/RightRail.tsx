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
import { TurnTimerBadge } from '../hud/Hud';
import { OmenCardFront } from '../../art/cards/OmenCard';
import { audio } from '../../audio/engine';
import {
  OMEN_FLAVOR,
  OMEN_NAME,
  OMEN_TEXT,
  PIECE_NAME,
  PIECE_PLURAL,
  RESOURCE_NAME,
} from '../../lexicon';
import { useStore, type PlaceMode, type Tab } from '../../state/store';
import {
  CostPips,
  Modal,
  RookieTip,
  ResourceCard,
  SegmentedTabs,
  Stepper,
  Tooltip,
  costProgress,
} from '../ui/primitives';
import { useUiHints } from '../../state/uiHints';
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
  const hoverCost = useUiHints((s) => s.cost);
  const [peek, setPeek] = useState(false);
  const risk = handLimitRisk(p);
  const hidden = hideUntilHold && !peek;
  const total = handTotal(p);
  return (
    <section className="panel px-3.5 py-3" aria-label={`${p.name}'s hand`}>
      <div className="mb-2.5 flex items-center gap-2 px-0.5">
        <PlayerDisc color={p.color} sigil={p.sigil} size={24} />
        <h2 className="panel-title flex-1">
          <span>
            <span style={{ color: NAME_COLOR[p.color] }}>{p.name}</span>&rsquo;s hand
          </span>
        </h2>
        <Tooltip
          align="end"
          label={
            risk > 0
              ? `Over the limit: a 7 costs you ${risk} cards`
              : 'Safe from the robber at 7 cards or fewer'
          }
        >
          <span
            className={`chip num !py-0.5 ${risk > 0 ? 'border-ember/70 text-ember' : 'text-bone'}`}
            tabIndex={0}
          >
            {total} {total === 1 ? 'card' : 'cards'}
          </span>
        </Tooltip>
        {hideUntilHold && (
          <button
            className="icon-btn !h-8 !w-8"
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
        {RESOURCES.map((r) => {
          const need =
            hoverCost && (hoverCost[r] ?? 0) > 0 && !hidden
              ? p.hand[r] >= (hoverCost[r] ?? 0)
                ? 'have'
                : 'missing'
              : null;
          return (
            <div key={r} data-res={r} className="min-w-0 max-w-[68px] flex-1">
              <ResourceCard
                res={r}
                count={p.hand[r]}
                gained={gains?.[r] ?? 0}
                hidden={hidden}
                need={need}
                fluid
              />
            </div>
          );
        })}
      </div>
      {!hidden && (
        <div className="mt-2.5 flex items-center gap-2 px-0.5 text-[13px]">
          <div className="meter flex-1" aria-hidden>
            <span
              style={{
                width: `${Math.min(100, (total / 7) * 100)}%`,
                background: risk > 0 ? 'linear-gradient(90deg, #ff805c, #b0364a)' : undefined,
              }}
            />
          </div>
          {risk > 0 ? (
            <span className="flex items-center gap-1 text-ember" role="note">
              <Icon name="wraith" size={14} /> A 7 would cost you <b className="num">{risk}</b>{' '}
              cards
            </span>
          ) : (
            <span className="text-muted">
              <span className="num text-bone">{Math.max(0, 7 - total)}</span> to the limit
            </span>
          )}
        </div>
      )}
    </section>
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
    <div className="grid grid-cols-2 gap-2">
      {BUILD_ITEMS.map((item) => {
        const cost = COSTS[item.key];
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
        const name = PIECE_NAME[item.key];
        // Why the build would be declined (null when it can go ahead).
        let declined: string | null = null;
        if (state.phase.kind === 'roll') declined = 'Roll the dice first';
        else if (!inMain) declined = 'You can’t build right now';
        else if (supply <= 0)
          declined =
            item.key === 'omen' ? 'No development cards left' : `No ${PIECE_PLURAL[item.key]} left`;
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
        return (
          <button
            key={item.key}
            className={`tile tile-interactive flex flex-col gap-2 px-3 pb-2.5 pt-2.5 text-left ${selected ? 'tile-selected' : ''}`}
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
            <div className="flex w-full items-center gap-2">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${ready || selected ? 'bg-gold/20 text-gold' : 'bg-black/25 text-muted'}`}
              >
                <Icon name={item.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1 whitespace-nowrap font-display text-[12px] uppercase tracking-[0.04em] text-bone">
                {title}
              </span>
            </div>
            <div className="-mt-1 flex w-full items-center justify-between gap-1 text-[12px] leading-tight text-muted">
              <span className="truncate">{item.blurb}</span>
              <span
                className="num shrink-0 rounded-md bg-black/30 px-1.5 text-[11px]"
                title={item.key === 'omen' ? 'Development cards left' : 'Left in your supply'}
              >
                {supply} left
              </span>
            </div>
            <CostPips cost={cost} hand={p.hand} />
            <div className="flex w-full items-center gap-2">
              <div className="meter flex-1" aria-hidden>
                <span
                  style={{
                    width: `${(prog.have / prog.need) * 100}%`,
                    background: affordable ? 'linear-gradient(90deg,#6fae4e,#8cc56a)' : undefined,
                  }}
                />
              </div>
              <span
                className={`font-display text-[10px] uppercase tracking-[0.12em] ${selected ? 'text-gold' : ready ? 'text-venom' : 'text-muted'}`}
              >
                {selected
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
                          : 'Not now'}
              </span>
            </div>
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
      <div className="rounded-2xl border border-dashed border-iron/80 py-6 text-center text-muted">
        <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-black/25 text-gold/70">
          <Icon name="omen" size={24} />
        </span>
        No development cards yet. Buy one from the Build tab.
        <div className="mt-2 text-[14px]">
          Played:{' '}
          {p.playedOmens.length ? p.playedOmens.map((o) => OMEN_NAME[o]).join(', ') : 'none'}
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
            className={`tile flex items-start gap-3 px-3 py-2.5 ${relic ? 'tile-selected' : ''}`}
          >
            <button
              onClick={() => setDetails(type)}
              aria-label={`${OMEN_NAME[type]} details`}
              className="shrink-0 rounded-lg transition-transform duration-200 hover:-translate-y-1 hover:rotate-[-3deg]"
            >
              <OmenCardFront type={type} width={46} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-[14px] uppercase tracking-[0.08em] text-bone">
                  {OMEN_NAME[type]}
                </span>
                <span className="num text-[14px] text-muted">×{g.total}</span>
                {g.fresh > 0 && !relic && (
                  <span className="chip !py-0 border-frost/60 bg-frost/10 text-[10px] text-frost">
                    New · next turn
                  </span>
                )}
              </div>
              <p className="text-[14px] leading-snug text-muted">{OMEN_TEXT[type]}</p>
              {!relic && (
                <button
                  className={`btn mt-2 !py-1.5 text-[11px] ${enabled ? 'btn-primary' : ''}`}
                  disabled={!enabled}
                  onClick={() => play(type)}
                >
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
        Victory Points: {relicCount(p)} · Played:{' '}
        {p.playedOmens.length ? p.playedOmens.map((o) => OMEN_NAME[o]).join(', ') : 'none'}
      </div>
    </div>
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
  const maxCount = give
    ? Math.min(Math.floor(p.hand[give] / rate), receive ? state.bank[receive] : 19)
    : 1;
  const ok = enabled && give && receive && give !== receive && count >= 1 && count <= maxCount;
  const cell = (on: boolean) =>
    `tile tile-interactive flex h-11 flex-col items-center justify-center gap-0.5 !rounded-lg disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 ${on ? 'tile-selected' : ''}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[34px_repeat(5,minmax(0,1fr))] items-center gap-1">
        <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted">
          Give
        </span>
        {RESOURCES.map((r) => {
          const can = p.hand[r] >= rates[r];
          return (
            <button
              key={r}
              className={cell(give === r)}
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
              <span style={{ color: RES_COLOR[r] }}>
                <ResourceGlyph res={r} size={16} />
              </span>
              <span
                className={`num text-[10px] leading-none ${rates[r] < 4 ? 'text-gold' : 'text-muted'}`}
              >
                {rates[r]}:1
              </span>
            </button>
          );
        })}
        <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted">Get</span>
        {RESOURCES.map((r) => (
          <button
            key={r}
            className={cell(receive === r)}
            disabled={!enabled || r === give || state.bank[r] === 0}
            onClick={() => setReceive(r)}
            aria-pressed={receive === r}
            aria-label={`Receive ${RESOURCE_NAME[r]} (bank has ${state.bank[r]})`}
            title={`${RESOURCE_NAME[r]} — bank holds ${state.bank[r]}`}
          >
            <span style={{ color: RES_COLOR[r] }}>
              <ResourceGlyph res={r} size={16} />
            </span>
            <span className="num text-[10px] leading-none text-muted">{state.bank[r]}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Stepper
          value={count}
          onChange={setCount}
          min={1}
          max={Math.max(1, maxCount)}
          label="trades"
        />
        <button
          className="btn btn-primary min-w-0 flex-1"
          disabled={!ok}
          data-testid="bank-trade"
          onClick={() => {
            if (!give || !receive) return;
            dispatch({ type: 'BankTrade', player: seat, give, receive, count });
            setCount(1);
          }}
        >
          {give && receive ? (
            <span className="inline-flex items-center gap-1">
              <span className="num">{rate * count}</span>
              <ResourceGlyph res={give} size={13} />
              <Icon name="arrow" size={11} />
              <span className="num">{count}</span>
              <ResourceGlyph res={receive} size={13} />
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
function CountCell({
  res,
  value,
  max,
  onChange,
  label,
  disabled,
}: {
  res: Resource;
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <button
        className={`tile tile-interactive flex h-11 w-full flex-col items-center justify-center gap-0.5 !rounded-lg disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 ${value > 0 ? 'tile-selected' : ''}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`More ${label}`}
        title={`${RESOURCE_NAME[res]}: tap to add`}
      >
        <span style={{ color: RES_COLOR[res] }}>
          <ResourceGlyph res={res} size={15} />
        </span>
        <span className={`num text-[12px] leading-none ${value ? 'text-gold' : 'text-muted'}`}>
          {value}
        </span>
      </button>
      {value > 0 && (
        <button
          className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-ember text-[#2a1406] shadow"
          onClick={() => onChange(value - 1)}
          aria-label={`Fewer ${label}`}
        >
          <Icon name="minus" size={10} />
        </button>
      )}
    </div>
  );
}

function PlayerTrade({
  state,
  seat,
  enabled,
}: {
  state: GameState;
  seat: number;
  enabled: boolean;
}) {
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
      <div className="grid grid-cols-[34px_repeat(5,minmax(0,1fr))] items-center gap-1">
        <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted">
          Give
        </span>
        {RESOURCES.map((r) => (
          <CountCell
            key={r}
            res={r}
            value={give[r]}
            max={p.hand[r]}
            onChange={(v) => setGive({ ...give, [r]: v })}
            label={`${RESOURCE_NAME[r]} to give`}
            disabled={!enabled || want[r] > 0}
          />
        ))}
        <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted">
          Want
        </span>
        {RESOURCES.map((r) => (
          <CountCell
            key={r}
            res={r}
            value={want[r]}
            max={19}
            onChange={(v) => setWant({ ...want, [r]: v })}
            label={`${RESOURCE_NAME[r]} wanted`}
            disabled={!enabled || give[r] > 0}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5" role="group" aria-label="Offer to">
        <span className="w-[34px] font-display text-[10px] uppercase tracking-[0.12em] text-muted">
          To
        </span>
        <button
          className={`chip !px-2 !py-0.5 ${to === 'all' ? 'border-gold bg-gold/15 text-gold' : 'text-muted'}`}
          onClick={() => setTo('all')}
          aria-pressed={to === 'all'}
        >
          All
        </button>
        {others.map((o) => {
          const on = to !== 'all' && to.includes(o.id);
          return (
            <Tooltip key={o.id} label={o.name}>
              <button
                className={`rounded-full p-0.5 transition-all ${on ? 'ring-2 ring-gold' : 'opacity-60 hover:opacity-100'}`}
                onClick={() => setTo([o.id])}
                aria-pressed={on}
                aria-label={o.name}
              >
                <PlayerDisc color={o.color} sigil={o.sigil} size={22} />
              </button>
            </Tooltip>
          );
        })}
        <button
          className="btn btn-primary ml-auto"
          disabled={!valid}
          onClick={() => {
            const err = dispatch({ type: 'ProposeTrade', player: seat, give, want, to });
            if (!err) {
              setGive(zero());
              setWant(zero());
            }
          }}
        >
          <Icon name="trade" size={13} /> Offer
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
      <div className="flex flex-col gap-2 text-[14px]">
        <p>
          Offer out: waiting for{' '}
          {waiting.map((w) => (
            <b key={w} style={{ color: NAME_COLOR[state.players[w].color] }}>
              {state.players[w].name}{' '}
            </b>
          ))}
        </p>
        <button
          className="btn btn-danger"
          onClick={() => dispatch({ type: 'CancelTrade', player: seat })}
        >
          Withdraw offer
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div
          className="flex rounded-lg border border-iron/70 bg-black/25 p-0.5"
          role="group"
          aria-label="Trade with"
        >
          {(
            [
              ['bank', 'Bank', 'bank'],
              ['players', 'Players', 'user'],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-display text-[11px] uppercase tracking-[0.1em] transition-colors ${
                kind === k
                  ? 'bg-surface-2 text-gold shadow-[inset_0_0_0_1px_rgb(var(--gold)/0.4)]'
                  : 'text-muted hover:text-bone'
              }`}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
            >
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>
        {!enabled && (
          <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-muted">
            <Icon name="hourglass" size={12} className="shrink-0 text-gold/70" />
            {active ? (state.phase.kind === 'roll' ? 'Roll first' : 'Not now') : 'Not your turn'}
          </span>
        )}
      </div>
      {kind === 'bank' ? (
        <BankTrade state={state} seat={seat} enabled={enabled} />
      ) : (
        <PlayerTrade state={state} seat={seat} enabled={enabled} />
      )}
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
  const canEnd = active && state.phase.kind === 'main';
  const canRoll = active && state.phase.kind === 'roll';
  const timer = useStore((s) => s.settings.turnTimer);
  return (
    <section className="panel flex min-h-0 flex-col px-3.5 py-3" aria-label="Actions">
      <div className="mb-3">
        <SegmentedTabs<Tab>
          label="Actions"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'build', label: 'Build', icon: 'outpost', testId: 'tab-build' },
            {
              id: 'cards',
              label: 'Cards',
              icon: 'omen',
              badge: state.players[seat].omens.length,
              testId: 'tab-cards',
            },
            { id: 'trade', label: 'Trade', icon: 'trade', testId: 'tab-trade' },
          ]}
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1" role="tabpanel">
        {tab === 'build' && <BuildTab state={state} seat={seat} active={active} />}
        {tab === 'cards' && <CardsTab state={state} seat={seat} active={active} />}
        {tab === 'trade' && <TradeTab state={state} seat={seat} active={active} />}
        {tab === 'build' && active && state.phase.kind === 'main' && (
          <RookieTip id="build">
            Pick a card, then click a glowing spot on the board. Esc cancels.
          </RookieTip>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        {canRoll && (
          <button
            className="btn btn-primary flex-1 !rounded-xl !py-2.5 text-[13px]"
            onClick={() => dispatch({ type: 'RollDice', player: seat })}
            data-testid="roll"
          >
            <Icon name="dice" size={15} /> Roll
            <span className="kbd !border-[#8a4318]/50 !bg-[#2a1406]/15 !text-[#2a1406]/80">
              Space
            </span>
          </button>
        )}
        <button
          className={`btn flex-1 !rounded-xl !py-2.5 text-[13px] ${canRoll ? '' : 'btn-primary'}`}
          disabled={!canEnd}
          onClick={() => dispatch({ type: 'EndTurn', player: seat })}
          data-testid="end-turn"
        >
          <Icon name="hourglass" size={15} /> End turn
          {canEnd && (
            <span className="kbd !border-[#8a4318]/50 !bg-[#2a1406]/15 !text-[#2a1406]/80">
              Space
            </span>
          )}
        </button>
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-muted">
        Next up <PlayerDisc color={next.color} sigil={next.sigil} size={18} />
        <b style={{ color: NAME_COLOR[next.color] }}>{next.name}</b>
        {timer > 0 && <TurnTimerBadge state={state} />}
      </p>
    </section>
  );
}
