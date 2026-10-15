import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  RESOURCES,
  activeActor,
  emptyCounts,
  handTotal,
  hasAtLeast,
  totalCards,
  type GameState,
  type Resource,
  type ResourceCounts,
} from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { OMEN_NAME, OMEN_TEXT, RESOURCE_NAME } from '../../lexicon';
import { prefersReducedMotion, useStore } from '../../state/store';
import { DieFace } from '../hud/Dice';
import { NAME_COLOR } from '../panels/LogLineView';
import { CountsInline, Modal, ResourceCard, Stepper } from '../ui/primitives';

// ------------------------------------------------------------------ discard

export function DiscardModal({ state, seat }: { state: GameState; seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = state.players[seat];
  const need = state.phase.kind === 'discard' ? state.phase.pending[seat] : 0;
  const [pick, setPick] = useState<ResourceCounts>(emptyCounts);
  const chosen = totalCards(pick);
  return (
    <Modal title={`Discard ${need} cards`} icon="discard" dismissable={false}>
      <p className="mb-3 text-[15px] text-bone/90">
        A 7 was rolled and you hold {handTotal(p)} cards. Give up half to the bank.
      </p>
      <div className="flex flex-col gap-2">
        {RESOURCES.map((r) => (
          <div key={r} className="flex items-center gap-3">
            <ResourceCard res={r} count={p.hand[r] - pick[r]} compact />
            <span className="flex-1 text-[15px]">{RESOURCE_NAME[r]}</span>
            <Stepper value={pick[r]} max={Math.min(p.hand[r], pick[r] + need - chosen)} onChange={(v) => setPick({ ...pick, [r]: v })} label={`${RESOURCE_NAME[r]} to discard`} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className={`num text-[18px] ${chosen === need ? 'text-venom' : 'text-ember'}`} aria-live="polite">
          {chosen} / {need} chosen
        </span>
        <button
          className="btn btn-primary ml-auto"
          disabled={chosen !== need}
          onClick={() => dispatch({ type: 'Discard', player: seat, cards: pick })}
          data-testid="confirm-discard"
        >
          Discard
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ steal

export function StealModal({ state, seat }: { state: GameState; seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  if (state.phase.kind !== 'steal') return null;
  return (
    <Modal title="Choose whom to rob" icon="steal" dismissable={false}>
      <p className="mb-3 text-[15px] text-bone/90">The robber borders several players. Steal one random card from:</p>
      <div className="flex flex-col gap-2">
        {state.phase.candidates.map((c) => {
          const v = state.players[c];
          return (
            <button key={c} className="btn justify-start !py-3" onClick={() => dispatch({ type: 'StealFrom', player: seat, victim: c })}>
              <PlayerDisc color={v.color} sigil={v.sigil} size={26} />
              <span style={{ color: NAME_COLOR[v.color] }}>{v.name}</span>
              <span className="num ml-auto text-muted">{handTotal(v)} cards</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ trade inbox

export function TradeInboxModal({ state, seat }: { state: GameState; seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  const [counter, setCounter] = useState(false);
  if (state.phase.kind !== 'trade') return null;
  const offer = state.phase.offer;
  const from = state.players[offer.proposer];
  const me = state.players[seat];
  const canAccept = hasAtLeast(me.hand, offer.want);
  return (
    <Modal title="An offer arrives" icon="trade" dismissable={false}>
      <div className="mb-3 flex items-center gap-2">
        <PlayerDisc color={from.color} sigil={from.sigil} size={30} />
        <span className="text-[16px]">
          <b style={{ color: NAME_COLOR[from.color] }}>{from.name}</b> {offer.counterOf !== null ? 'counters' : 'proposes'}:
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-venom/50 bg-venom/10 p-3">
          <div className="font-display text-[11px] uppercase tracking-[0.14em] text-venom">You receive</div>
          <div className="mt-1 text-[18px]">
            <CountsInline counts={offer.give} size={18} />
          </div>
        </div>
        <div className="rounded-2xl border border-ember/50 bg-ember/10 p-3">
          <div className="font-display text-[11px] uppercase tracking-[0.14em] text-ember">You give</div>
          <div className="mt-1 text-[18px]">
            <CountsInline counts={offer.want} size={18} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[14px] text-muted">
        Your hand: <CountsInline counts={me.hand} size={14} />
      </div>
      {!counter ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!canAccept} onClick={() => dispatch({ type: 'RespondTrade', player: seat, response: 'accept' })} title={canAccept ? '' : 'You lack the requested cards'}>
            <Icon name="check" size={16} /> Accept
          </button>
          <button className="btn" onClick={() => setCounter(true)}>
            <Icon name="trade" size={16} /> Counter
          </button>
          <button className="btn btn-danger" onClick={() => dispatch({ type: 'RespondTrade', player: seat, response: 'decline' })}>
            <Icon name="close" size={16} /> Decline
          </button>
          {!canAccept && <p className="w-full text-[14px] text-ember">You lack the cards they ask for.</p>}
        </div>
      ) : (
        <CounterComposer
          state={state}
          seat={seat}
          initialGive={offer.want}
          initialWant={offer.give}
          onCancel={() => setCounter(false)}
        />
      )}
    </Modal>
  );
}

function CounterComposer({
  state,
  seat,
  initialGive,
  initialWant,
  onCancel,
}: {
  state: GameState;
  seat: number;
  initialGive: ResourceCounts;
  initialWant: ResourceCounts;
  onCancel: () => void;
}) {
  const dispatch = useStore((s) => s.dispatch);
  const me = state.players[seat];
  const [give, setGive] = useState<ResourceCounts>(() => {
    const g = { ...initialGive };
    for (const r of RESOURCES) g[r] = Math.min(g[r], me.hand[r]);
    return g;
  });
  const [want, setWant] = useState<ResourceCounts>({ ...initialWant });
  const valid =
    totalCards(give) > 0 && totalCards(want) > 0 && RESOURCES.every((r) => give[r] === 0 || want[r] === 0);
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1 text-[14px]">
        <span />
        <span className="text-center text-[13px] text-muted">You give</span>
        <span className="text-center text-[13px] text-muted">You want</span>
        {RESOURCES.map((r) => (
          <div key={r} className="contents">
            <span className="inline-flex items-center gap-1.5">
              <span style={{ color: RES_COLOR[r] }}>
                <ResourceGlyph res={r} size={16} />
              </span>
              {RESOURCE_NAME[r]}
            </span>
            <Stepper value={give[r]} max={me.hand[r]} onChange={(v) => setGive({ ...give, [r]: v })} label={`${RESOURCE_NAME[r]} to give`} />
            <Stepper value={want[r]} max={19} onChange={(v) => setWant({ ...want, [r]: v })} label={`${RESOURCE_NAME[r]} wanted`} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary" disabled={!valid} onClick={() => dispatch({ type: 'RespondTrade', player: seat, response: 'counter', give, want })}>
          Send counter
        </button>
        <button className="btn" onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ omen pickers

export function HarvestModal({ state, seat }: { state: GameState; seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  const close = useStore((s) => s.closeModal);
  const bankTotal = totalCards(state.bank);
  const need = Math.min(2, bankTotal);
  const [picks, setPicks] = useState<Resource[]>([]);
  const left = (r: Resource) => state.bank[r] - picks.filter((x) => x === r).length;
  return (
    <Modal title={OMEN_NAME.harvest} icon="gain" onClose={close}>
      <p className="mb-3 text-[15px] text-bone/90">{OMEN_TEXT.harvest} Choose {need}.</p>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCES.map((r) => (
          <button
            key={r}
            className="tile tile-interactive flex flex-col items-center gap-1 p-2 disabled:opacity-40"
            disabled={picks.length >= need || left(r) <= 0}
            onClick={() => setPicks([...picks, r])}
            aria-label={`Take ${RESOURCE_NAME[r]}`}
          >
            <span style={{ color: RES_COLOR[r] }}>
              <ResourceGlyph res={r} size={26} />
            </span>
            <span className="text-[11px]">{RESOURCE_NAME[r]}</span>
            <span className="num text-[11px] text-muted">bank {state.bank[r]}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-muted">Chosen:</span>
        {picks.length ? picks.map((r, i) => (
          <button key={i} onClick={() => setPicks(picks.filter((_, k) => k !== i))} className="chip" style={{ color: RES_COLOR[r] }} aria-label={`Remove ${RESOURCE_NAME[r]}`}>
            {RESOURCE_NAME[r]} ✕
          </button>
        )) : <span className="text-muted">—</span>}
        <button
          className="btn btn-primary ml-auto"
          disabled={picks.length !== need}
          onClick={() => {
            if (!dispatch({ type: 'PlayHarvestPact', player: seat, resources: picks })) close();
          }}
        >
          Invoke
        </button>
      </div>
    </Modal>
  );
}

export function TitheModal({ seat }: { seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  const close = useStore((s) => s.closeModal);
  return (
    <Modal title={OMEN_NAME.tithe} icon="blood" onClose={close}>
      <p className="mb-3 text-[15px] text-bone/90">{OMEN_TEXT.tithe}</p>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCES.map((r) => (
          <button
            key={r}
            className="tile tile-interactive flex flex-col items-center gap-1 p-2 hover:!border-ember"
            onClick={() => {
              if (!dispatch({ type: 'PlayBloodTithe', player: seat, resource: r })) close();
            }}
          >
            <span style={{ color: RES_COLOR[r] }}>
              <ResourceGlyph res={r} size={26} />
            </span>
            <span className="text-[11px]">{RESOURCE_NAME[r]}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ pass-device curtain

export function PassDeviceCurtain({ state }: { state: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  if (state.handoff === null) return null;
  const to = state.players[state.handoff];
  const ph = state.phase;
  let reason = 'It is your turn.';
  if (ph.kind === 'setup') reason = 'Place your starting settlements and roads.';
  if (ph.kind === 'discard') reason = `A 7! You must discard ${ph.pending[to.id]} cards.`;
  if (ph.kind === 'trade') reason = `${state.players[ph.offer.proposer].name} has an offer for you.`;
  const proposerCanCancel = ph.kind === 'trade' && state.currentPlayer !== to.id;
  return (
    <motion.div
      className="fixed inset-0 z-[70] grid place-items-center p-4"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #3a2030 0%, #120c18 55%, #08060b 85%)' }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Pass the device to ${to.name}`}
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <PlayerDisc color={to.color} sigil={to.sigil} size={96} active />
        <h2 className="mt-5 font-display text-[26px] uppercase tracking-[0.16em] text-gold">Pass the device</h2>
        <p className="mt-2 text-[20px]">
          to <b style={{ color: NAME_COLOR[to.color] }}>{to.name}</b>
        </p>
        <p className="mt-2 text-[16px] text-muted">{reason}</p>
        <div className="divider-ornament my-5 w-64 text-[10px]">✦</div>
        <button
          className="btn btn-primary !px-8 !py-3 text-[15px]"
          onClick={() => dispatch({ type: 'AckPassDevice', player: to.id })}
          autoFocus
          data-testid="ack-device"
        >
          I am {to.name} — reveal
        </button>
        {proposerCanCancel && (
          <button className="btn btn-ghost mt-3 text-[12px]" onClick={() => dispatch({ type: 'CancelTrade', player: state.currentPlayer })}>
            {state.players[state.currentPlayer].name}: withdraw the offer
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ roll-off

export function RollOffModal({ state }: { state: GameState }) {
  const close = useStore((s) => s.dismissRollOff);
  return (
    <Modal title="Who shall go first?" icon="dice" onClose={close}>
      <p className="mb-3 text-muted">Each player rolls; the highest total founds first.</p>
      {state.rollOff.map((round, ri) => (
        <div key={ri} className="mb-3">
          {state.rollOff.length > 1 && <div className="mb-1 text-[12px] uppercase tracking-[0.14em] text-muted">{ri === 0 ? 'Roll' : 'Tie — roll again'}</div>}
          <div className="flex flex-col gap-1.5">
            {round.map(([p, a, b], i) => (
              <motion.div
                key={p}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: ri * 0.6 + i * 0.25 }}
              >
                <PlayerDisc color={state.players[p].color} sigil={state.players[p].sigil} size={24} />
                <span className="w-28 truncate" style={{ color: NAME_COLOR[state.players[p].color] }}>
                  {state.players[p].name}
                </span>
                <DieFace value={a} size={28} />
                <DieFace value={b} size={28} />
                <span className="num text-[18px] text-gold">{a + b}</span>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
      <p className="mt-2 text-[16px]">
        <b style={{ color: NAME_COLOR[state.players[state.firstPlayer].color] }}>{state.players[state.firstPlayer].name}</b> goes first.
      </p>
      <button className="btn btn-primary mt-4 w-full" onClick={close} data-testid="begin-founding">
        Start setup
      </button>
    </Modal>
  );
}

export function ConfirmNewModal() {
  const close = useStore((s) => s.closeModal);
  const go = useStore((s) => s.go);
  const rematch = useStore((s) => s.rematch);
  return (
    <Modal title="Abandon this game?" icon="refresh" onClose={close}>
      <p className="text-[15px]">Start over? The current game stays saved until a new one begins.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => go('setup')}>
          New game…
        </button>
        <button className="btn" onClick={() => { close(); rematch(); }}>
          Restart same seed
        </button>
        <button className="btn" onClick={() => go('title')}>
          Main menu
        </button>
        <button className="btn btn-ghost ml-auto" onClick={close}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function needsDiscard(state: GameState, seat: number) {
  return state.phase.kind === 'discard' && activeActor(state) === seat && state.handoff === null;
}
