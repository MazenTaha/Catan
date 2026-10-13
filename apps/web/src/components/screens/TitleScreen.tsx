import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { applyAction, createGame, decideAction, randomSeed, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { audio } from '../../audio/engine';
import { peekAutosave } from '../../state/persistence';
import { useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { DEFAULT_NAMES } from '../../lexicon';

/** A decorative isle with founded holdings, played out by bots for the backdrop. */
function demoIsle(): GameState {
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
  const isle = useMemo(demoIsle, []);
  const item = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void, primary = false, testid?: string) => (
    <button
      className={`btn w-64 justify-start !py-3 text-[15px] ${primary ? 'btn-primary' : ''}`}
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
      {/* A still isle behind the menu: painted once, faded in by the compositor (no per-frame repaint). */}
      <div className="anim-isle-in pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
        <div className="w-[min(1100px,140vw)]" style={{ maskImage: 'radial-gradient(ellipse at center, #000 45%, transparent 72%)', WebkitMaskImage: 'radial-gradient(ellipse at center, #000 45%, transparent 72%)' }}>
          <BoardView state={isle} canAct={false} decorative />
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(10,11,13,0.25) 0%, rgba(10,11,13,0.85) 55%, #0a0b0d 85%)' }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 anim-drift" style={{ background: 'linear-gradient(0deg, rgba(150,170,175,0.12), transparent)' }} />

      <div className="relative z-10 flex flex-col items-center">
        <motion.h1
          className="font-logo text-[64px] leading-none tracking-[0.08em] text-gold sm:text-[92px]"
          style={{ textShadow: '0 0 40px rgba(224,112,42,0.35), 0 4px 0 #000', willChange: 'transform, opacity' }}
          initial={{ opacity: 0, scaleX: 1.3 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        >
          Hexfall
        </motion.h1>
        <motion.p className="mt-3 font-display text-[14px] uppercase tracking-[0.5em] text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          Trade · Build · Endure
        </motion.p>
        <div className="divider-ornament my-8 w-72 text-[10px]">✦</div>
        <motion.nav className="flex flex-col gap-2.5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }} aria-label="Main menu">
          {item('New game', 'flag', () => go('setup'), true, 'new-game')}
          {save && item('Continue', 'hourglass', () => continueGame(), false, 'continue')}
          {item('How to play', 'rules', () => openModal('rules'))}
          {item('Load record', 'import', () => openModal('import'))}
          {item('Settings', 'settings', () => openModal('settings'))}
          {item('Credits', 'scroll', () => openModal('credits'))}
        </motion.nav>
        {save && (
          <p className="mt-4 text-[14px] text-muted">
            Saved isle “{save.config.seed}” · round {save.state.round || 'founding'}
          </p>
        )}
      </div>
    </main>
  );
}
