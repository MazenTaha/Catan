import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { RESOURCES, activeActor, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { OMEN_NAME, PIECE_NAME } from '../../lexicon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { DicePair } from './Dice';

// ------------------------------------------------------------------ top bar

export function TopBar({ state }: { state: GameState }) {
  const openModal = useStore((s) => s.openModal);
  const muted = useStore((s) => s.settings.muted);
  const updateSettings = useStore((s) => s.updateSettings);
  const undoable = useStore((s) => (s.session?.undo.length ?? 0) > 0);
  const undo = useStore((s) => s.undo);
  return (
    <header className="panel rivets flex flex-wrap items-center gap-3 px-4 py-2 sm:px-6" style={{ ['--chamfer' as string]: '8px' }}>
      <div className="flex items-center gap-2">
        <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
          <path d="M32 4 56 18v28L32 60 8 46V18z" fill="#14161c" stroke="#c9a24b" strokeWidth="3" />
          <path d="M32 16 44 40H20z" fill="none" stroke="#e0702a" strokeWidth="3" />
          <circle cx="32" cy="33" r="3" fill="#c9a24b" />
        </svg>
        <h1 className="font-logo text-[22px] leading-none tracking-[0.08em] text-gold">Catan Night</h1>
      </div>
      <span className="chip num text-bone" aria-label={`Round ${state.round}`}>
        {state.phase.kind === 'setup' ? 'Setup' : `Round ${state.round}`}
      </span>
      <span className="chip text-muted">
        First to <b className="num text-gold">{state.config.targetVp}</b> points
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button className="btn btn-ghost !px-2" onClick={undo} disabled={!undoable} aria-label="Undo last action" title="Undo (placement, building and bank trades only)">
          <Icon name="undo" />
        </button>
        <button className="btn btn-ghost !px-2" onClick={() => openModal('log')} aria-label="Full log" title="Full log">
          <Icon name="log" />
        </button>
        <button className="btn btn-ghost !px-2" onClick={() => openModal('rules')} aria-label="Rulebook" title="Rulebook">
          <Icon name="question" />
        </button>
        <button
          className="btn btn-ghost !px-2"
          onClick={() => updateSettings({ muted: !muted })}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          <Icon name={muted ? 'mute' : 'sound'} />
        </button>
        <button className="btn btn-ghost !px-2" onClick={() => openModal('settings')} aria-label="Settings" title="Settings">
          <Icon name="settings" />
        </button>
        <button className="btn ml-1" onClick={() => openModal('confirm-new')}>
          <Icon name="refresh" size={16} /> New game
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ turn banner

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

export function TurnBanner({ state, seat, children }: { state: GameState; seat: number; children?: ReactNode }) {
  const cur = state.players[state.currentPlayer];
  const ph = state.phase.kind;
  const steps =
    ph === 'setup'
      ? ['Settlement', 'Road']
      : ['Roll', 'Build & trade', 'End turn'];
  let active = 0;
  if (state.phase.kind === 'setup') active = state.phase.step === 'outpost' ? 0 : 1;
  else if (ph === 'roll') active = 0;
  else if (ph === 'ended') active = 3;
  else active = 1;
  const timer = useStore((s) => s.settings.turnTimer);
  return (
    <section className="panel rivets flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" aria-label="Turn">
      <PlayerDisc color={cur.color} sigil={cur.sigil} size={38} active />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[15px] uppercase tracking-[0.16em] text-gold">
          {state.phase.kind === 'setup' ? `${cur.name} — setup` : `${cur.name}'s turn`}
        </div>
        <div className="truncate text-[15px] text-bone/90" aria-live="polite">
          {instruction(state, seat)}
        </div>
      </div>
      <ol className="hidden items-center gap-1.5 2xl:flex" aria-label="Turn steps">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={`chip ${i === active ? 'border-gold text-gold shadow-glow' : i < active ? 'text-venom' : 'text-muted'}`}
              aria-current={i === active ? 'step' : undefined}
            >
              {i < active && <Icon name="check" size={11} />}
              {s}
            </span>
            {i < steps.length - 1 && <Icon name="arrow" size={12} className="text-iron" />}
          </li>
        ))}
      </ol>
      {timer > 0 && <TurnTimerBadge state={state} />}
      {children}
    </section>
  );
}

function TurnTimerBadge({ state }: { state: GameState }) {
  const deadline = useStore((s) => s.timerDeadline);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  if (!deadline || state.phase.kind === 'ended') return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className={`chip num ${left <= 10 ? 'border-blood text-ember' : 'text-bone'}`} aria-label={`${left} seconds left`}>
      <Icon name="hourglass" size={12} /> {left}s
    </span>
  );
}

// ------------------------------------------------------------------ dice tray

export function DiceTray({ state, canRoll, onRoll }: { state: GameState; canRoll: boolean; onRoll: () => void }) {
  const roll = useStore((s) => s.fx.roll);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const dice = state.dice;
  const total = dice ? dice[0] + dice[1] : null;
  return (
    <div className="flex items-center gap-3">
      <DicePair dice={dice} seq={roll?.seq ?? 0} reduceMotion={reduce} size={46} />
      <div className="flex flex-col items-center">
        <span className="font-display text-[10px] uppercase tracking-[0.2em] text-muted">Total</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={roll?.seq ?? 0}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.6 }}
            className={`num text-[30px] leading-none ${total === 7 ? 'text-[#e0585f]' : 'text-gold'}`}
          >
            {total ?? '–'}
          </motion.span>
        </AnimatePresence>
      </div>
      {canRoll && (
        <button className="btn btn-primary ml-1" onClick={onRoll} data-testid="roll">
          <Icon name="dice" size={16} /> Roll
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ toast

const TOAST_MS = 2600;

/** Notices float up from the bottom of the screen, then fade away on their own. */
export function FloatingToast() {
  const toast = useStore((s) => s.toast);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const id = window.setTimeout(() => setShown(null), toast.tone === 'bad' ? TOAST_MS : TOAST_MS + 800);
    return () => window.clearTimeout(id);
  }, [toast]);
  const visible = toast && shown === toast.id;
  const tone = toast?.tone ?? 'info';
  const color =
    tone === 'good' ? 'border-venom/60' : tone === 'bad' ? 'border-blood' : tone === 'gold' ? 'border-gold' : 'border-iron';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className={`flex max-w-xl items-center gap-2 border ${color} bg-surface-1/95 px-4 py-2.5 text-[15px] shadow-panel`}
            role="status"
            data-testid="toast"
          >
            <Icon
              name={tone === 'good' ? 'gain' : tone === 'bad' ? 'close' : tone === 'gold' ? 'crown' : 'scroll'}
              size={16}
              className={tone === 'good' ? 'text-venom' : tone === 'bad' ? 'text-ember' : 'text-gold'}
            />
            <span>{toast.text}</span>
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
                <div className={`relative w-2/3 ${n === 7 ? 'bg-blood' : n === 6 || n === 8 ? 'bg-[#b8453f]' : 'bg-gold/80'}`} style={{ height: `${seen * 100}%` }} title={`${rolls[n]} rolled`} />
              </div>
              <span className={`num text-[14px] ${n === 6 || n === 8 ? 'text-[#e0585f]' : 'text-muted'}`}>{n}</span>
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
