import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { RESOURCES, activeActor, victoryPoints, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { OMEN_NAME, PIECE_NAME } from '../../lexicon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { DicePair } from './Dice';
import { IconButton, Tooltip } from '../ui/primitives';

// ------------------------------------------------------------------ top bar

export function TopBar({ state }: { state: GameState }) {
  const openModal = useStore((s) => s.openModal);
  const muted = useStore((s) => s.settings.muted);
  const updateSettings = useStore((s) => s.updateSettings);
  const undoable = useStore((s) => (s.session?.undo.length ?? 0) > 0);
  const undo = useStore((s) => s.undo);
  const online = useStore((s) => s.session?.online);
  const leader = Math.max(...state.players.map((_, i) => victoryPoints(state, i, false)));
  return (
    <header className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-1.5 sm:px-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#ffb760] to-[#c4473a] shadow-[0_6px_18px_-6px_rgb(255_120_60/0.8),inset_0_1px_0_rgb(255_240_210/0.6)]">
          <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden>
            <path d="M32 6 54 19v26L32 58 10 45V19z" fill="#2a1406" opacity="0.25" />
            <path d="M32 6 54 19v26L32 58 10 45V19z" fill="none" stroke="#2a1406" strokeWidth="4" />
            <path d="M32 18 43 40H21z" fill="#2a1406" />
          </svg>
        </span>
        <h1 className="font-logo text-[19px] leading-none tracking-[0.06em] text-gold">Catan Night</h1>
      </div>
      <div className="flex items-center gap-2">
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
            <span className="meter ml-1 w-14" aria-hidden>
              <span style={{ width: `${(leader / state.config.targetVp) * 100}%` }} />
            </span>
          </span>
        </Tooltip>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-xl border border-iron/60 bg-black/20 p-0.5">
        <IconButton icon="undo" label="Undo last action" hint="Undo — placement, building and bank trades" onClick={undo} disabled={!undoable} />
        <IconButton icon="log" label="Full log" onClick={() => openModal('log')} />
        <IconButton icon="question" label="Rulebook" onClick={() => openModal('rules')} />
        <IconButton
          icon={muted ? 'mute' : 'sound'}
          label={muted ? 'Unmute' : 'Mute'}
          pressed={muted}
          onClick={() => updateSettings({ muted: !muted })}
        />
        <IconButton icon="settings" label="Settings" align="end" onClick={() => openModal('settings')} />
        </div>
        <button
          className="btn"
          onClick={() => openModal('confirm-new')}
          aria-label={online ? 'Leave game' : 'New game'}
        >
          <Icon name={online ? 'arrow' : 'refresh'} size={14} />{' '}
          <span className="hidden sm:inline">{online ? 'Leave game' : 'New game'}</span>
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
  const steps = ph === 'setup' ? ['Settlement', 'Road'] : ['Roll', 'Build & trade', 'End turn'];
  let active = 0;
  if (state.phase.kind === 'setup') active = state.phase.step === 'outpost' ? 0 : 1;
  else if (ph === 'roll') active = 0;
  else if (ph === 'ended') active = 3;
  else active = 1;
  const timer = useStore((s) => s.settings.turnTimer);
  const yours = cur.id === seat && cur.kind === 'human';
  return (
    <section
      className={`panel flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 transition-shadow ${yours ? 'shadow-[0_0_0_1px_rgb(var(--gold)/0.35),0_16px_40px_-18px_rgb(255_140_60/0.6)]' : ''}`}
      aria-label="Turn"
    >
      <span className="relative">
        {yours && <span className="absolute -inset-1.5 rounded-full bg-gold/25 blur-md anim-pulse" aria-hidden />}
        <PlayerDisc color={cur.color} sigil={cur.sigil} size={44} active />
      </span>
      <div className="min-w-[190px] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-display text-[15px] uppercase tracking-[0.14em] text-gold">
            {state.phase.kind === 'setup' ? `${cur.name} — setup` : `${cur.name}'s turn`}
          </span>
          {yours && <span className="chip !py-0 border-ember/60 bg-ember/15 text-[10px] text-ember">Your move</span>}
        </div>
        <div className="truncate text-[15px] text-bone/90" aria-live="polite">
          {instruction(state, seat)}
        </div>
        <ol className="mt-2 hidden items-center gap-1 md:flex" aria-label="Turn steps">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] font-display text-[10px] uppercase tracking-[0.12em] transition-colors ${
                  i === active
                    ? 'bg-gold text-[#2a1406] shadow-[0_0_14px_-2px_rgb(var(--gold)/0.8)]'
                    : i < active
                      ? 'bg-venom/15 text-venom'
                      : 'bg-black/25 text-muted'
                }`}
                aria-current={i === active ? 'step' : undefined}
              >
                {i < active && <Icon name="check" size={11} />}
                {s}
              </span>
              {i < steps.length - 1 && (
                <span className={`h-[2px] w-5 rounded-full ${i < active ? 'bg-venom/50' : 'bg-iron/70'}`} aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </div>
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
    <span
      className={`chip num !px-3 !py-1 text-[13px] ${left <= 10 ? 'border-ember bg-ember/15 text-ember anim-pulse' : 'text-bone'}`}
      aria-label={`${left} seconds left`}
    >
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
    <div className="flex items-center gap-3 rounded-2xl border border-iron/60 bg-black/20 py-1.5 pl-2 pr-1.5">
      <DicePair dice={dice} seq={roll?.seq ?? 0} reduceMotion={reduce} size={44} />
      <div className="flex min-w-[44px] flex-col items-center">
        <span className="font-display text-[9px] uppercase tracking-[0.22em] text-muted">Total</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={roll?.seq ?? 0}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.6 }}
            className={`num text-[30px] leading-none ${total === 7 ? 'text-ember' : 'text-gold'}`}
            style={{ textShadow: total ? '0 0 14px rgb(var(--gold) / 0.45)' : undefined }}
          >
            {total ?? '–'}
          </motion.span>
        </AnimatePresence>
      </div>
      {canRoll && (
        <button className="btn btn-primary !px-3.5 !py-2" onClick={onRoll} data-testid="roll">
          <Icon name="dice" size={15} /> Roll
          <span className="kbd !border-[#8a4318]/50 !bg-[#2a1406]/15 !text-[#2a1406]/80">Space</span>
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
            className="relative flex max-w-xl items-center gap-3 overflow-hidden rounded-2xl border border-iron/80 bg-[#1c1522]/95 py-2.5 pl-2.5 pr-4 text-[15px] shadow-panel"
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
