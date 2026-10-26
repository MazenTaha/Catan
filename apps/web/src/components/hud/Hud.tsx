import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { RESOURCES, activeActor, victoryPoints, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { OMEN_NAME, PIECE_NAME } from '../../lexicon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { DieFace } from './Dice';
import { IconButton, Tooltip } from '../ui/primitives';

// ------------------------------------------------------------------ top bar

/** Logo, room code, round and the race to the target: the game's title block. */
export function TitleBlock({ state, className = '' }: { state: GameState; className?: string }) {
  const online = useStore((s) => s.session?.online);
  const leader = Math.max(...state.players.map((_, i) => victoryPoints(state, i, false)));
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#ffb760] to-[#c4473a] shadow-[0_6px_18px_-6px_rgb(255_120_60/0.8),inset_0_1px_0_rgb(255_240_210/0.6)]">
          <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
            <path d="M32 6 54 19v26L32 58 10 45V19z" fill="#2a1406" opacity="0.25" />
            <path d="M32 6 54 19v26L32 58 10 45V19z" fill="none" stroke="#2a1406" strokeWidth="4" />
            <path d="M32 18 43 40H21z" fill="#2a1406" />
          </svg>
        </span>
        <h1 className="font-logo text-[17px] leading-none tracking-[0.05em] text-gold">Catan Night</h1>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {online && (
          <Tooltip label="Online game — share this code only with your table" side="bottom">
            <span className="chip num border-frost/50 bg-frost/10 text-frost" tabIndex={0}>
              <Icon name="user" size={12} /> {online.code}
            </span>
          </Tooltip>
        )}
        {state.phase.kind !== 'setup' && (
          <span className="chip num border-gold/40 bg-gold/10 text-gold" aria-label={`Round ${state.round}`}>
            <Icon name="hourglass" size={12} />
            Round {state.round}
          </span>
        )}
        <Tooltip label={`Leader has ${leader} of ${state.config.targetVp} points`} side="bottom">
          <span className="chip text-muted" tabIndex={0}>
            <Icon name="crown" size={12} className="text-gold" />
            First to <b className="num text-gold">{state.config.targetVp}</b>
            <span className="meter ml-1 w-10" aria-hidden>
              <span style={{ width: `${(leader / state.config.targetVp) * 100}%` }} />
            </span>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

/** Undo, log, rules, sound, settings and leave. */
export function Toolbar({ className = '' }: { className?: string }) {
  const openModal = useStore((s) => s.openModal);
  const muted = useStore((s) => s.settings.muted);
  const updateSettings = useStore((s) => s.updateSettings);
  const undoable = useStore((s) => (s.session?.undo.length ?? 0) > 0);
  const undo = useStore((s) => s.undo);
  return (
    <nav
      className={`flex items-center gap-0.5 rounded-xl border border-iron/60 bg-black/20 p-0.5 ${className}`}
      aria-label="Game menu"
    >
      <IconButton icon="undo" label="Undo last action" hint="Undo — placement, building and bank trades" align="start" onClick={undo} disabled={!undoable} />
      <IconButton icon="log" label="Full log" onClick={() => openModal('log')} />
      <IconButton icon="question" label="Rulebook" onClick={() => openModal('rules')} />
      <IconButton
        icon={muted ? 'mute' : 'sound'}
        label={muted ? 'Unmute' : 'Mute'}
        pressed={muted}
        onClick={() => updateSettings({ muted: !muted })}
      />
      <IconButton icon="settings" label="Settings" onClick={() => openModal('settings')} />
      <IconButton icon="leave" label="Leave game" align="end" onClick={() => openModal('confirm-new')} />
    </nav>
  );
}

/** Title block and toolbar in one bar, for screens too narrow for the side rails. */
export function TopBar({ state, tools = true }: { state: GameState; tools?: boolean }) {
  return (
    <header className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-1.5 sm:px-4">
      <TitleBlock state={state} />
      {tools && <Toolbar className="ml-auto" />}
    </header>
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
        return ph.index < state.players.length
          ? 'Place your first Settlement'
          : 'Place your second Settlement — it gives you resources at once';
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
      return mine
        ? `${state.players[ph.offer.proposer].name} offers you a trade`
        : `Waiting for ${a.name} to answer the offer`;
    case 'main':
      return 'Build & trade, then end your turn (Space)';
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
      className={`chip num !px-3 !py-1 text-[13px] ${left <= 10 ? 'border-ember bg-ember/15 text-ember anim-pulse' : 'text-bone'}`}
      aria-label={`${left} seconds left`}
    >
      <Icon name="hourglass" size={12} /> {left}s
    </span>
  );
}

// ------------------------------------------------------------------ dice roll

const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** When anyone rolls, two dice tumble onto the board, show the total, then fade away. */
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
      {roll && shown === roll.seq && (
        <RollBurst key={roll.seq} dice={roll.dice} total={roll.total} name={state.players[roll.player].name} reduce={reduce} />
      )}
    </AnimatePresence>
  );
}

function RollBurst({
  dice,
  total,
  name,
  reduce,
}: {
  dice: [number, number];
  total: number;
  name: string;
  reduce: boolean;
}) {
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
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(9,10,11,0.6), transparent 42%)' }}
      />
      <div className="relative flex flex-col items-center gap-3">
        {landed && !reduce && (
          <motion.span
            className="absolute left-1/2 top-[42px] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold"
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
              style={{ filter: 'drop-shadow(0 18px 16px rgba(0,0,0,0.45))' }}
            >
              <DieFace value={faces[i]} size={84} red={landed && seven} />
            </motion.div>
          ))}
        </div>
        <motion.div
          className="flex items-baseline gap-2 rounded-full border border-gold/50 bg-[#141617]/90 px-4 py-1 shadow-panel"
          initial={{ opacity: 0, scale: 0.5, y: 10 }}
          animate={landed ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.5, y: 10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
        >
          <span className="font-display text-[11px] uppercase tracking-[0.16em] text-muted">{name}</span>
          <span className={`num text-[30px] leading-none ${seven ? 'text-ember' : 'text-gold'}`}>{total}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ toast

const TOAST_MS = 2600;

/** Notices float up from the bottom of the screen, then fade away on their own. */
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
  const accent = tone === 'good' ? '#8cc56a' : tone === 'bad' ? '#ff805c' : tone === 'gold' ? '#f2ac52' : '#b09e96';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="relative flex max-w-xl items-center gap-3 overflow-hidden rounded-2xl border border-iron/80 bg-[#16181a]/95 py-2.5 pl-2.5 pr-4 text-[15px] shadow-panel"
            role="status"
            data-testid="toast"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}26`, color: accent }}>
              <Icon name={tone === 'good' ? 'gain' : tone === 'bad' ? 'close' : tone === 'gold' ? 'crown' : 'scroll'} size={17} />
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

export function ProbabilityPanel({ state }: { state: GameState }) {
  const rolls = state.stats.rolls;
  const total = rolls.reduce((a, b) => a + b, 0);
  const maxExpected = 6 / 36;
  const maxSeen = Math.max(1, ...rolls);
  return (
    <div className="panel mx-auto w-full max-w-xl px-4 py-3" aria-label="Roll odds and history">
      <div className="panel-title mb-2">Odds vs. this game's rolls ({total})</div>
      <div className="flex h-28 items-end gap-1.5">
        {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => {
          const p = 6 - Math.abs(7 - n);
          const expected = p / 36 / maxExpected;
          const seen = total ? rolls[n] / maxSeen : 0;
          return (
            <div key={n} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-20 w-full items-end justify-center">
                <div className="absolute bottom-0 w-full border border-tarnish/40 bg-tarnish/15" style={{ height: `${expected * 100}%` }} title={`${Math.round((p / 36) * 100)}% expected`} />
                <div className={`relative w-2/3 ${n === 7 ? 'bg-blood' : n === 6 || n === 8 ? 'bg-ember/80' : 'bg-gold/80'}`} style={{ height: `${seen * 100}%` }} title={`${rolls[n]} rolled`} />
              </div>
              <span className={`num text-[14px] ${n === 6 || n === 8 ? 'text-ember' : 'text-muted'}`}>{n}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[14px] text-muted">Outline: expected odds · Bars: rolled so far</p>
    </div>
  );
}

// ------------------------------------------------------------------ misc

export function PieceSupply({ state, seat }: { state: GameState; seat: number }) {
  const p = state.players[seat];
  return (
    <div className="flex gap-3 text-[14px] text-muted">
      <span>{p.supply.causeways} {PIECE_NAME.causeway}s</span>
      <span>{p.supply.outposts} {PIECE_NAME.outpost}s</span>
      <span>{p.supply.citadels} {PIECE_NAME.citadel}s</span>
    </div>
  );
}

export function useDisplaySeat(state: GameState | undefined): number {
  return state ? displaySeat(state) : 0;
}

export { RESOURCES };
