import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { applyAction, createGame, decideAction, randomSeed, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { audio } from '../../audio/engine';
import { savedOnlineSeat, useNet } from '../../state/net';
import { peekAutosave } from '../../state/persistence';
import { useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { DEFAULT_NAMES } from '../../lexicon';

/** A decorative board with settlements and roads, played out by bots for the backdrop. */
function demoBoard(): GameState {
  let s = createGame({
    seed: randomSeed(),
    layout: 'balanced',
    targetVp: 10,
    firstPlayer: 0,
    seats: [
      { name: DEFAULT_NAMES[0], color: 'crimson', sigil: 'skull', kind: 'bot', bot: 'warlord' },
      { name: DEFAULT_NAMES[1], color: 'frost', sigil: 'moon', kind: 'bot', bot: 'warlord' },
      { name: DEFAULT_NAMES[2], color: 'bone', sigil: 'eye', kind: 'bot', bot: 'warlord' },
      { name: DEFAULT_NAMES[3], color: 'violet', sigil: 'thorn', kind: 'bot', bot: 'warlord' },
    ],
  });
  for (let i = 0; i < 60 && s.phase.kind !== 'ended'; i++) {
    const r = applyAction(s, decideAction(s));
    if (!r.ok) break;
    s = r.value.state;
  }
  return s;
}

export function TitleScreen() {
  const go = useStore((s) => s.go);
  const continueGame = useStore((s) => s.continueGame);
  const openModal = useStore((s) => s.openModal);
  const [save] = useState(() => peekAutosave());
  const [online] = useState(() => savedOnlineSeat());
  const net = useNet();
  const backdrop = useMemo(demoBoard, []);
  const item = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void, primary = false, testid?: string) => (
    <button
      className={`btn w-72 justify-start !rounded-2xl !px-5 !py-3.5 text-[15px] ${primary ? 'btn-primary' : ''}`}
      onClick={() => {
        audio.unlock();
        audio.play('click');
        onClick();
      }}
      data-testid={testid}
    >
      <Icon name={icon} size={18} /> {label}
    </button>
  );
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {/* A still board behind the menu: painted once, faded in by the compositor (no per-frame repaint). */}
      <div className="anim-board-in pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
        <div className="w-[min(1100px,140vw)]" style={{ maskImage: 'radial-gradient(ellipse at center, #000 45%, transparent 72%)', WebkitMaskImage: 'radial-gradient(ellipse at center, #000 45%, transparent 72%)' }}>
          <BoardView state={backdrop} canAct={false} decorative />
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(24,14,26,0.2) 0%, rgba(24,14,26,0.82) 55%, #120c16 85%)' }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 anim-drift" style={{ background: 'linear-gradient(0deg, rgba(255,128,72,0.16), transparent)' }} />

      <div className="relative z-10 flex flex-col items-center">
        <motion.h1
          className="text-center font-logo text-[52px] leading-none tracking-[0.06em] text-gold sm:text-[88px]"
          style={{ textShadow: '0 0 48px rgba(255,140,60,0.45), 0 4px 0 #1a0b10', willChange: 'transform, opacity' }}
          initial={{ opacity: 0, scaleX: 1.3 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        >
          Catan <span className="text-bone/90">Night</span>
        </motion.h1>
        <motion.p className="mt-3 font-display text-[14px] uppercase tracking-[0.5em] text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          Trade · Build · Settle
        </motion.p>
        <div className="divider-ornament my-8 w-72 text-[10px]">✦</div>
        <motion.nav className="flex flex-col gap-2.5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }} aria-label="Main menu">
          {item('Play', 'flag', () => go('setup'), true, 'new-game')}
          {online && item(`Rejoin ${online.code}`, 'user', () => net.resume(online.code, online.token), false, 'rejoin')}
          {save && item('Continue', 'hourglass', () => continueGame(), false, 'continue')}
          {item('How to play', 'rules', () => openModal('rules'))}
          {item('Load record', 'import', () => openModal('import'))}
          {item('Settings', 'settings', () => openModal('settings'))}
          {item('Credits', 'scroll', () => openModal('credits'))}
        </motion.nav>
        {online && (net.status === 'connecting' || net.error) && (
          <p className="mt-4 text-[14px] text-muted" aria-live="polite">
            {net.status === 'connecting' ? `Rejoining ${online.code}…` : net.error}
          </p>
        )}
        {save && (
          <p className="mt-4 text-[14px] text-muted">
            Saved game · round {save.state.round || 'setup'}
          </p>
        )}
      </div>
    </main>
  );
}
