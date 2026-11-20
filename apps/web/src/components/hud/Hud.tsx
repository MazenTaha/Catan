import { daylight, hourOf, stageName } from '../world/daytime';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { RESOURCES, activeActor, victoryPoints, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { OMEN_NAME, PIECE_NAME } from '../../lexicon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { DieFace } from './Dice';
import { IconButton } from '../ui/primitives';
import { Crest } from '../../ui/hall/Surfaces';

// ------------------------------------------------------------------ top bar

/** Narrow screens: the crest, title and the game's chips (room, round, time, the race) in one line. */
export function TitleBlock({ state, className = '' }: { state: GameState; className?: string }) {
  const online = useStore((s) => s.session?.online);
  const leader = Math.max(...state.players.map((_, i) => victoryPoints(state, i, false)));
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[color:var(--on-dark)] ${className}`}>
      <div className="flex items-center gap-2">
        <Crest size={30} />
        <h1 className="hc-title hc-title-gold text-[26px]">Catan Night</h1>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] italic text-[color:var(--on-dark-muted)]">
        {online && (
          <span title="Online game — share this code only with your table">
            <Icon name="user" size={13} className="inline align-[-1px]" /> <b className="hc-num not-italic text-[color:var(--on-dark)]">{online.code}</b>
          </span>
        )}
        {state.phase.kind !== 'setup' && <span aria-label={`Round ${state.round}`}>Round {state.round}</span>}
        <span aria-label={`Time of day: ${stageName(hourOf(state))}`}>
          <Icon name={daylight(hourOf(state)) < 0.35 ? 'moon' : 'sun'} size={13} className="inline align-[-1px]" /> {stageName(hourOf(state))}
        </span>
        <span title={`Leader has ${leader} of ${state.config.targetVp} points`}>
          <Icon name="crown" size={13} className="inline align-[-1px]" /> First to <b className="hc-num not-italic">{state.config.targetVp}</b>
        </span>
      </div>
    </div>
  );
}

/** Undo, log, rules, sound, settings and leave, as round brass buttons. */
export function Toolbar({ className = '', extra }: { className?: string; extra?: React.ReactNode }) {
  const openModal = useStore((s) => s.openModal);
  const muted = useStore((s) => s.settings.muted);
  const updateSettings = useStore((s) => s.updateSettings);
  const undoable = useStore((s) => (s.session?.undo.length ?? 0) > 0);
  const undo = useStore((s) => s.undo);
  return (
    <nav className={`flex items-center gap-2 ${className}`} aria-label="Game menu">
      <IconButton icon="undo" label="Undo last action" hint="Undo — placement, building and bank trades" align="start" onClick={undo} disabled={!undoable} />
      <IconButton icon="log" label="Full log" onClick={() => openModal('log')} />
      <IconButton icon="question" label="Rulebook" onClick={() => openModal('rules')} />
      <IconButton icon={muted ? 'mute' : 'sound'} label={muted ? 'Unmute' : 'Mute'} pressed={muted} onClick={() => updateSettings({ muted: !muted })} />
      <IconButton icon="settings" label="Settings" onClick={() => openModal('settings')} />
      {extra}
      <IconButton icon="leave" label="Leave game" align="end" onClick={() => openModal('confirm-new')} />
    </nav>
  );
}

/** Title line and toolbar in one bar, for screens too narrow for the side rails. */
export function TopBar({ state, tools = true, extra }: { state: GameState; tools?: boolean; extra?: React.ReactNode }) {
  return (
    <header className="hc-oak flex flex-wrap items-center gap-x-3 gap-y-2 !px-3 !py-2">
      <TitleBlock state={state} />
      {tools && <Toolbar className="ml-auto flex-wrap" extra={extra} />}
    </header>
  );
}

/** The herald's ribbon above the board: what to do now (the same words screen readers hear). */
export function InstructionRibbon({ state, seat }: { state: GameState; seat: number }) {
  return (
    <div className="flex justify-center" aria-hidden>
      <div className="relative">
        {[-1, 1].map((s) => (
          <span
            key={s}
            className="absolute top-[7px] h-[calc(100%-2px)] w-6"
            style={{ [s < 0 ? 'left' : 'right']: -16, background: '#b48a3a', border: '1.3px solid var(--ink)', clipPath: s < 0 ? 'polygon(0 0,100% 0,100% 100%,0 100%,40% 50%)' : 'polygon(0 0,100% 0,60% 50%,100% 100%,0 100%)' }}
          />
        ))}
        <div className="relative px-6 py-1.5 text-center text-[18px] italic text-[color:var(--map-ink)]" style={{ background: 'linear-gradient(180deg,#f7ecd0,#e6d4a8)', border: '1.5px solid var(--ink)' }}>
          {instruction(state, seat)}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ turn guidance

/** What the player whose move it is should do now (read out to screen readers). */
export function instruction(state: GameState, seat: number): string {
  const actor = activeActor(state);
  const a = state.players[actor];
  const mine = actor === seat;
  const ph = state.phase;
  if (state.handoff !== null) return `Pass the device to ${state.players[state.handoff].name}`;
  if (a.kind === 'bot' && ph.kind !== 'ended') return `${a.name} is thinking…`;
  switch (ph.kind) {
    case 'setup':
      if (ph.step === 'outpost') {
        return ph.index < state.players.length ? 'Place your first Settlement' : 'Place your second Settlement — it gives you resources at once';
      }
      return 'Build a Road from your new Settlement';
    case 'roll':
      return 'Roll the dice (Space) — or play a Knight first';
    case 'discard': {
      const n = ph.pending[actor];
      return mine ? `Discard ${n} cards` : `Waiting for ${a.name} to discard`;
    }
    case 'move-wraith':
      return 'Move the robber — click any other hex';
    case 'steal':
      return 'Choose whom to rob';
    case 'decree':
      return `Build ${ph.remaining} free Road${ph.remaining > 1 ? 's' : ''} (${OMEN_NAME.decree})`;
    case 'trade':
      return mine ? `${state.players[ph.offer.proposer].name} offers you a trade` : `Waiting for ${a.name} to answer the offer`;
    case 'main':
      return 'Build & trade, then end your turn (Space)';
    case 'duel': {
      const [a2, b2] = [state.players[ph.challenger], state.players[ph.target]];
      return seat === ph.target
        ? `${a2.name} challenges you to a duel. Enter the 3D walk!`
        : seat === ph.challenger
          ? `Duel ${b2.name} in the 3D walk. The game waits.`
          : `${a2.name} and ${b2.name} are duelling. The game waits.`;
    }
    case 'ended':
      return `${state.players[ph.winner].name} wins!`;
  }
}

/** Seconds left in the turn when the turn timer is on. */
export function TurnTimerBadge({ state }: { state: GameState }) {
  const deadline = useStore((s) => s.timerDeadline);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  if (!deadline || state.phase.kind === 'ended') return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`hc-num inline-flex items-center gap-1 px-2 text-[16px] ${left <= 10 ? 'anim-pulse' : ''}`}
      style={{ border: '1.5px solid var(--map-ink)', background: left <= 10 ? 'var(--rubric)' : 'var(--paper-card)', color: left <= 10 ? '#fff3e0' : 'var(--map-ink)' }}
      aria-label={`${left} seconds left`}
    >
      <Icon name="hourglass" size={13} /> {left}s
    </span>
  );
}

// ------------------------------------------------------------------ dice roll

const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** When anyone rolls, two bone dice tumble onto the board, show the total, then fade away. */
export function RollOverlay({ state }: { state: GameState }) {
  const roll = useStore((s) => s.fx.roll);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const [shown, setShown] = useState<number | null>(null);
  // The roll already on record when the screen opens (a continued game) isn't replayed.
  const opened = useRef(roll?.seq ?? 0);
  useEffect(() => {
    if (!roll || roll.seq === opened.current) return;
    setShown(roll.seq);
    const id = window.setTimeout(() => setShown(null), reduce ? 1400 : 2300);
    return () => window.clearTimeout(id);
    // a new roll is a new seq; the rest is read at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll?.seq]);
  return (
    <AnimatePresence>
      {roll && shown === roll.seq && <RollBurst key={roll.seq} dice={roll.dice} total={roll.total} name={state.players[roll.player].name} reduce={reduce} />}
    </AnimatePresence>
  );
}

function RollBurst({ dice, total, name, reduce }: { dice: [number, number]; total: number; name: string; reduce: boolean }) {
  const [faces, setFaces] = useState<[number, number]>(() => (reduce ? dice : [randomFace(), randomFace()]));
  const [landed, setLanded] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks++;
      if (ticks < 9) {
        setFaces([randomFace(), randomFace()]);
        return;
      }
      window.clearInterval(id);
      setFaces(dice);
      setLanded(true);
    }, 65);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seven = total === 7;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.5 } }}
      aria-hidden
    >
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(20,12,6,0.55), transparent 42%)' }} />
      <div className="relative flex flex-col items-center gap-3">
        {landed && !reduce && (
          <motion.span
            className="absolute left-1/2 top-[42px] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ border: '2px dashed var(--gold-light)' }}
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
        <div className="flex gap-4">
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              initial={reduce ? false : { y: 160, x: i ? 110 : -110, rotate: i ? -540 : 540, scale: 0.35 }}
              animate={{ y: 0, x: 0, rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 160, damping: 13, mass: 0.9, delay: i * 0.06 }}
            >
              <DieFace value={faces[i]} size={84} red={landed && seven} />
            </motion.div>
          ))}
        </div>
        <motion.div
          className="hc-slip !gap-3 !px-5 !py-1.5"
          initial={{ opacity: 0, scale: 0.5, y: 10 }}
          animate={landed ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.5, y: 10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
        >
          <span className="hc-label text-[16px]">{name}</span>
          <span className={`hc-title text-[36px] leading-none ${seven ? 'hc-rubric' : 'text-[color:var(--ink)]'}`}>{total}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ toast

const TOAST_MS = 2600;

/** Notices arrive as a herald's slip at the top of the board, then fade away on their own. */
export function FloatingToast() {
  const toast = useStore((s) => s.toast);
  const [shown, setShown] = useState<number | null>(null);
  const ms = toast?.tone === 'bad' ? TOAST_MS : TOAST_MS + 800;
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const id = window.setTimeout(() => setShown(null), ms);
    return () => window.clearTimeout(id);
  }, [toast, ms]);
  const visible = toast && shown === toast.id;
  const tone = toast?.tone ?? 'info';
  const accent = tone === 'good' ? 'var(--ok-ink)' : tone === 'bad' ? 'var(--rubric)' : tone === 'gold' ? '#8a6018' : 'var(--map-ink-muted)';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[70] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="hc-slip relative max-w-xl overflow-hidden"
            role="status"
            data-testid="toast"
          >
            <span className="shrink-0" style={{ color: accent }} aria-hidden>
              <Icon name={tone === 'good' ? 'gain' : tone === 'bad' ? 'close' : tone === 'gold' ? 'crown' : 'scroll'} size={19} strokeWidth={2} />
            </span>
            <span>{toast.text}</span>
            <motion.span
              className="absolute bottom-0 left-0 h-[3px]"
              style={{ background: accent }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: ms / 1000, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Expected odds against this game's rolls, as an ink bar chart. */
export function ProbabilityPanel({ state }: { state: GameState }) {
  const rolls = state.stats.rolls;
  const total = rolls.reduce((a, b) => a + b, 0);
  const maxExpected = 6 / 36;
  const maxSeen = Math.max(1, ...rolls);
  return (
    <div className="hc-parchment mx-auto w-full max-w-xl px-4 py-3" aria-label="Roll odds and history">
      <div className="hc-label mb-2 text-[16px]">Odds vs. this game's rolls ({total})</div>
      <div className="flex h-28 items-end gap-1.5">
        {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => {
          const p = 6 - Math.abs(7 - n);
          const expected = p / 36 / maxExpected;
          const seen = total ? rolls[n] / maxSeen : 0;
          return (
            <div key={n} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-20 w-full items-end justify-center">
                <div className="absolute bottom-0 w-full" style={{ height: `${expected * 100}%`, borderTop: '1.5px dashed var(--map-ink)' }} title={`${Math.round((p / 36) * 100)}% expected`} />
                <div className="relative w-2/3" style={{ height: `${seen * 100}%`, background: n === 7 ? 'var(--rubric)' : 'var(--map-ink)' }} title={`${rolls[n]} rolled`} />
              </div>
              <span className={`hc-num text-[14px] ${n === 6 || n === 8 ? 'hc-rubric' : ''}`}>{n}</span>
            </div>
          );
        })}
      </div>
      <p className="hc-gloss mt-1">Dashes: expected odds · Bars: rolled so far</p>
    </div>
  );
}

// ------------------------------------------------------------------ misc

export function PieceSupply({ state, seat }: { state: GameState; seat: number }) {
  const p = state.players[seat];
  return (
    <div className="flex gap-3 text-[15px] italic">
      <span>
        {p.supply.causeways} {PIECE_NAME.causeway}s
      </span>
      <span>
        {p.supply.outposts} {PIECE_NAME.outpost}s
      </span>
      <span>
        {p.supply.citadels} {PIECE_NAME.citadel}s
      </span>
    </div>
  );
}

export function useDisplaySeat(state: GameState | undefined): number {
  return state ? displaySeat(state) : 0;
}

export { RESOURCES };
