import { motion } from 'framer-motion';
import { useState } from 'react';
import { RESOURCES, activeActor, emptyCounts, handTotal, hasAtLeast, totalCards, type GameState, type Resource, type ResourceCounts } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { OMEN_NAME, OMEN_TEXT, RESOURCE_NAME } from '../../lexicon';
import { prefersReducedMotion, useStore } from '../../state/store';
import { DieFace } from '../hud/Dice';
import { INK_NAME } from '../panels/LogLineView';
import { CountsInline, Modal, ResourceCard, Stepper } from '../ui/primitives';
import { Arms } from '../../ui/hall/Arms';
import { Banner, BannerPole } from '../../ui/hall/Banner';
import { ResourceArt, SealButton } from '../../ui/hall/Controls';
import { HallBackground, ParchmentSheet, Torch } from '../../ui/hall/Surfaces';

/** A player's arms and name in ink, for decrees. */
function Named({ state, id, size = 22 }: { state: GameState; id: number; size?: number }) {
  const p = state.players[id];
  return (
    <b className="inline-flex items-center gap-1.5 align-middle" style={{ color: INK_NAME[p.color] }}>
      <Arms color={p.color} sigil={p.sigil} size={size} />
      {p.name}
    </b>
  );
}

// ------------------------------------------------------------------ discard

export function DiscardModal({ state, seat }: { state: GameState; seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = state.players[seat];
  const need = state.phase.kind === 'discard' ? state.phase.pending[seat] : 0;
  const [pick, setPick] = useState<ResourceCounts>(emptyCounts);
  const chosen = totalCards(pick);
  return (
    <Modal title={`Discard ${need} cards`} icon="discard" dismissable={false}>
      <p className="mb-3 text-[18px]">A 7 was rolled and you hold {handTotal(p)} cards. Give up half to the bank.</p>
      <div className="flex flex-col">
        {RESOURCES.map((r, i) => (
          <div key={r} className={`flex items-center gap-3 py-1.5 ${i ? 'border-t-[1.5px] border-dotted border-[color:var(--map-ink-muted)]' : ''}`}>
            <ResourceCard res={r} count={p.hand[r] - pick[r]} compact />
            <span className="flex-1 text-[18px]">{RESOURCE_NAME[r]}</span>
            <Stepper value={pick[r]} max={Math.min(p.hand[r], pick[r] + need - chosen)} onChange={(v) => setPick({ ...pick, [r]: v })} label={`${RESOURCE_NAME[r]} to discard`} />
          </div>
        ))}
      </div>
      <hr className="hc-dots my-3" />
      <div className="flex flex-wrap items-center gap-3">
        {/* one wax pip per card owed: filled as cards are chosen */}
        <span className="flex flex-wrap gap-1" aria-hidden>
          {Array.from({ length: need }, (_, i) => (
            <span
              key={i}
              className="h-4 w-4 rounded-full"
              style={i < chosen ? { background: 'radial-gradient(circle at 35% 30%, var(--wax-light), var(--wax) 60%, var(--wax-dark))', boxShadow: '0 0 0 1px var(--wax-dark)' } : { border: '1.5px dashed var(--map-ink-muted)' }}
            />
          ))}
        </span>
        <span className={`hc-num text-[19px] ${chosen === need ? 'hc-ok' : 'hc-rubric'}`} aria-live="polite">
          {chosen} / {need} chosen{chosen < need ? ` · pick ${need - chosen} more` : ''}
        </span>
        <span className="ml-auto">
          <SealButton onClick={() => dispatch({ type: 'Discard', player: seat, cards: pick })} disabled={chosen !== need} testId="confirm-discard">
            Discard
          </SealButton>
        </span>
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
      <p className="mb-3 text-[18px]">The robber borders several players. Steal one random card from:</p>
      <div className="flex flex-col gap-2">
        {state.phase.candidates.map((c) => {
          const v = state.players[c];
          return (
            <button key={c} className="hc-paper-btn !min-h-[56px] justify-start gap-3 !text-[19px]" onClick={() => dispatch({ type: 'StealFrom', player: seat, victim: c })}>
              <Arms color={v.color} sigil={v.sigil} size={34} />
              <span style={{ color: INK_NAME[v.color] }}>{v.name}</span>
              <span className="hc-num ml-auto italic hc-ink-muted">{handTotal(v)} cards</span>
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
    <Modal title="A Bargain Offered" icon="trade" dismissable={false} emblem={<Arms color={from.color} sigil={from.sigil} size={46} label={from.name} />}>
      <p className="text-[19px]">
        <Named state={state} id={offer.proposer} /> {offer.counterOf !== null ? 'counters' : 'proposes'}: <CountsInline counts={offer.give} /> for <CountsInline counts={offer.want} />.
      </p>
      <hr className="hc-dots my-3" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div>
          <div className="hc-label text-[15px] hc-ok">You receive</div>
          <div className="mt-1 text-[20px]">
            <CountsInline counts={offer.give} size={30} />
          </div>
        </div>
        <span className="hc-ink-muted" aria-hidden>
          <Icon name="trade" size={24} />
        </span>
        <div>
          <div className="hc-label text-[15px] hc-rubric">You give</div>
          <div className="mt-1 text-[20px]">
            <CountsInline counts={offer.want} size={30} />
          </div>
        </div>
      </div>
      <hr className="hc-dots my-3" />
      <div className="flex flex-wrap items-center gap-1.5 text-[16px] italic hc-ink-muted">
        Your hand: <CountsInline counts={me.hand} size={20} />
      </div>
      {!counter ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SealButton
            onClick={() => dispatch({ type: 'RespondTrade', player: seat, response: 'accept' })}
            disabled={!canAccept}
            title={canAccept ? '' : 'You lack the requested cards'}
          >
            Accept
          </SealButton>
          <button className="hc-paper-btn" onClick={() => setCounter(true)}>
            <Icon name="trade" size={16} /> Counter
          </button>
          <button className="hc-paper-btn hc-paper-btn--danger" onClick={() => dispatch({ type: 'RespondTrade', player: seat, response: 'decline' })}>
            <Icon name="close" size={16} /> Decline
          </button>
          {!canAccept && <p className="w-full text-[16px] italic hc-rubric">You lack the cards they ask for.</p>}
        </div>
      ) : (
        <CounterComposer state={state} seat={seat} initialGive={offer.want} initialWant={offer.give} onCancel={() => setCounter(false)} />
      )}
    </Modal>
  );
}

/** The counter-offer, laid out as a bill of exchange: what you give, what you want. */
function CounterComposer({ state, seat, initialGive, initialWant, onCancel }: { state: GameState; seat: number; initialGive: ResourceCounts; initialWant: ResourceCounts; onCancel: () => void }) {
  const dispatch = useStore((s) => s.dispatch);
  const me = state.players[seat];
  const [give, setGive] = useState<ResourceCounts>(() => {
    const g = { ...initialGive };
    for (const r of RESOURCES) g[r] = Math.min(g[r], me.hand[r]);
    return g;
  });
  const [want, setWant] = useState<ResourceCounts>({ ...initialWant });
  const valid = totalCards(give) > 0 && totalCards(want) > 0 && RESOURCES.every((r) => give[r] === 0 || want[r] === 0);
  return (
    <div className="mt-4">
      <div className="hc-label mb-1 text-center text-[17px] hc-rubric">Bill of Exchange</div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-1 text-[17px]">
        <span />
        <span className="hc-label text-center text-[14px]">You give</span>
        <span aria-hidden />
        <span className="hc-label text-center text-[14px]">You want</span>
        {RESOURCES.map((r) => (
          <div key={r} className="contents">
            <span className="inline-flex items-center gap-2">
              <ResourceArt res={r} size={28} />
              {RESOURCE_NAME[r]}
            </span>
            <Stepper value={give[r]} max={me.hand[r]} onChange={(v) => setGive({ ...give, [r]: v })} label={`${RESOURCE_NAME[r]} to give`} />
            <span className="hc-ink-muted" aria-hidden>
              <Icon name="trade" size={16} />
            </span>
            <Stepper value={want[r]} max={19} onChange={(v) => setWant({ ...want, [r]: v })} label={`${RESOURCE_NAME[r]} wanted`} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SealButton onClick={() => dispatch({ type: 'RespondTrade', player: seat, response: 'counter', give, want })} disabled={!valid}>
          Send counter
        </SealButton>
        <button className="hc-paper-btn" onClick={onCancel}>
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
      <p className="mb-3 text-[18px]">
        {OMEN_TEXT.harvest} Choose {need}.
      </p>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCES.map((r) => (
          <button
            key={r}
            className="hc-card !min-h-[44px] gap-1 p-1.5 disabled:opacity-40"
            disabled={picks.length >= need || left(r) <= 0}
            onClick={() => setPicks([...picks, r])}
            aria-label={`Take ${RESOURCE_NAME[r]}`}
          >
            <ResourceArt res={r} size={48} />
            <span className="text-[14px] italic">{RESOURCE_NAME[r]}</span>
            <span className="hc-num text-[13px] hc-ink-muted">bank {state.bank[r]}</span>
          </button>
        ))}
      </div>
      <hr className="hc-dots my-3" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="italic hc-ink-muted">Chosen:</span>
        {picks.length ? (
          picks.map((r, i) => (
            <button key={i} onClick={() => setPicks(picks.filter((_, k) => k !== i))} className="hc-paper-btn hc-paper-btn--sm gap-1.5" aria-label={`Remove ${RESOURCE_NAME[r]}`}>
              <ResourceArt res={r} size={22} /> {RESOURCE_NAME[r]} ✕
            </button>
          ))
        ) : (
          <span className="hc-ink-muted">—</span>
        )}
        <span className="ml-auto">
          <SealButton
            disabled={picks.length !== need}
            onClick={() => {
              if (!dispatch({ type: 'PlayHarvestPact', player: seat, resources: picks })) close();
            }}
          >
            Invoke
          </SealButton>
        </span>
      </div>
    </Modal>
  );
}

export function TitheModal({ seat }: { seat: number }) {
  const dispatch = useStore((s) => s.dispatch);
  const close = useStore((s) => s.closeModal);
  return (
    <Modal title={OMEN_NAME.tithe} icon="blood" onClose={close}>
      <p className="mb-3 text-[18px]">{OMEN_TEXT.tithe}</p>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCES.map((r) => (
          <button
            key={r}
            className="hc-card !min-h-[44px] gap-1 p-1.5 hover:!border-[color:var(--rubric)]"
            onClick={() => {
              if (!dispatch({ type: 'PlayBloodTithe', player: seat, resource: r })) close();
            }}
          >
            <ResourceArt res={r} size={48} />
            <span className="text-[14px] italic">{RESOURCE_NAME[r]}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ pass-device curtain

/** Hot-seat privacy: the whole hall, a banner of the next player's arms, and a decree to reveal. */
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
      className="fixed inset-0 z-[70] overflow-y-auto"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Pass the device to ${to.name}`}
    >
      <HallBackground
        className="grid min-h-full place-items-center p-4"
        decor={
          <>
            <Torch x="calc(50% - 300px)" y={60} height={140} />
            <Torch x="calc(50% + 240px)" y={60} height={140} flip />
          </>
        }
      >
        <div className="flex flex-col items-center gap-6 pt-6">
          <BannerPole gap={0} overhang={30} brackets={false}>
            <Banner width={160} height={240} tincture={{ player: to.color }} arms={{ color: to.color, sigil: to.sigil }} label={to.name} labelSize={20} lit />
          </BannerPole>
          <ParchmentSheet className="flex max-w-md flex-col items-center px-8 py-6 text-center">
            <h2 className="hc-title text-[44px] text-[color:var(--rubric-dark)]">Pass the device</h2>
            <p className="mt-1 text-[22px]">
              to <b style={{ color: INK_NAME[to.color] }}>{to.name}</b>
            </p>
            <p className="mt-1 text-[18px] italic hc-ink-muted">{reason}</p>
            <hr className="hc-dots my-4 w-full" />
            <SealButton onClick={() => dispatch({ type: 'AckPassDevice', player: to.id })} testId="ack-device" autoFocus>
              I am {to.name} — reveal
            </SealButton>
            {proposerCanCancel && (
              <button className="hc-paper-btn hc-paper-btn--sm mt-4" onClick={() => dispatch({ type: 'CancelTrade', player: state.currentPlayer })}>
                {state.players[state.currentPlayer].name}: withdraw the offer
              </button>
            )}
          </ParchmentSheet>
        </div>
      </HallBackground>
    </motion.div>
  );
}

// ------------------------------------------------------------------ roll-off

export function RollOffModal({ state }: { state: GameState }) {
  const close = useStore((s) => s.dismissRollOff);
  return (
    <Modal title="Who shall go first?" icon="dice" onClose={close}>
      <p className="mb-3 italic hc-ink-muted">Each player rolls; the highest total founds first.</p>
      {state.rollOff.map((round, ri) => (
        <div key={ri} className="mb-3">
          {state.rollOff.length > 1 && <div className="hc-label mb-1 text-[14px] hc-rubric">{ri === 0 ? 'Roll' : 'Tie — roll again'}</div>}
          <div className="flex flex-col gap-1.5">
            {round.map(([p, a, b], i) => (
              <motion.div key={p} className="flex items-center gap-3" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: ri * 0.6 + i * 0.25 }}>
                <span className="w-40 truncate">
                  <Named state={state} id={p} />
                </span>
                <DieFace value={a} size={32} />
                <DieFace value={b} size={32} />
                <span className="hc-num text-[22px] hc-rubric">{a + b}</span>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
      <hr className="hc-dots my-3" />
      <p className="text-[19px]">
        <Named state={state} id={state.firstPlayer} /> goes first.
      </p>
      <div className="mt-4">
        <SealButton onClick={close} testId="begin-founding">
          Start setup
        </SealButton>
      </div>
    </Modal>
  );
}

export function ConfirmNewModal() {
  const close = useStore((s) => s.closeModal);
  const go = useStore((s) => s.go);
  const rematch = useStore((s) => s.rematch);
  const online = useStore((s) => s.session?.online);
  const leaveOnline = useStore((s) => s.leaveOnline);
  if (online) {
    return (
      <Modal title="Leave this game?" icon="leave" onClose={close}>
        <p className="text-[18px]">The others keep playing and the computer takes over your seat. You can’t come back to this game once you leave.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="hc-paper-btn hc-paper-btn--danger" onClick={leaveOnline} data-testid="leave-online">
            Leave game
          </button>
          <button className="hc-paper-btn ml-auto" onClick={close}>
            Stay
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Leave this game?" icon="leave" onClose={close}>
      <p className="text-[18px]">The game stays saved until a new one begins; Continue on the main menu picks it up.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SealButton onClick={() => go('title')}>Main menu</SealButton>
        <button className="hc-paper-btn" onClick={() => go('setup')}>
          New game…
        </button>
        <button
          className="hc-paper-btn"
          onClick={() => {
            close();
            rematch();
          }}
        >
          Restart same seed
        </button>
        <button className="hc-paper-btn ml-auto" onClick={close}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function needsDiscard(state: GameState, seat: number) {
  return state.phase.kind === 'discard' && activeActor(state) === seat && state.handoff === null;
}
