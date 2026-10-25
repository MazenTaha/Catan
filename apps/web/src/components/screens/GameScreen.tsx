import { AnimatePresence } from 'framer-motion';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { sceneOpensWalk } from '../../devScenario';
import { activeActor, type Action } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { ZoomPan } from '../board/ZoomPan';
import { FlyingGains } from '../fx/FlyingGains';
import { FloatingToast, RollOverlay, TopBar, instruction } from '../hud/Hud';
import { VIEWBOX } from '../board/geometry';
import {
  ConfirmNewModal,
  DiscardModal,
  HarvestModal,
  PassDeviceCurtain,
  RollOffModal,
  StealModal,
  TitheModal,
  TradeInboxModal,
} from '../modals/GameModals';
import { LogModal } from '../modals/InfoModals';
import { BonusPanel, PlayersPanel, RecentLog } from '../panels/LeftRail';
import { ActionsPanel, HandPanel, canSeatAct } from '../panels/RightRail';
import { RookieTip } from '../ui/primitives';
import { useNet } from '../../state/net';
import { useBotDriver, useGameKeys, useTurnTimer } from './gameHooks';
import { isTouchDevice } from '../../state/device';

const VictoryScreen = lazy(() => import('../modals/VictoryScreen'));
const World3D = lazy(() => import('../world/World3D'));

type Layout = 'wide' | 'mid' | 'narrow';

function useLayout(): Layout {
  const get = (): Layout =>
    typeof window === 'undefined' ? 'wide' : window.innerWidth >= 1280 ? 'wide' : window.innerWidth >= 900 ? 'mid' : 'narrow';
  const [layout, setLayout] = useState<Layout>(get);
  useEffect(() => {
    const on = () => setLayout(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return layout;
}

/** Online games: shows when the link to the server drops and while it reconnects. */
function ConnectionBanner() {
  const status = useNet((n) => n.status);
  const error = useNet((n) => n.error);
  const leave = useStore((s) => s.leaveOnline);
  if (status === 'online') return null;
  const lost = status === 'offline' || status === 'idle';
  return (
    <div className="fixed inset-x-0 top-3 z-[75] flex justify-center px-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl border border-ember/60 bg-[#24160f]/95 px-4 py-2.5 text-[14px] shadow-panel">
        <span className={`h-2.5 w-2.5 rounded-full ${lost ? 'bg-ember' : 'bg-gold anim-pulse'}`} aria-hidden />
        <span>{lost ? (error ?? 'Lost the connection to the game.') : 'Connection lost — reconnecting…'}</span>
        {lost && (
          <button className="btn !py-1 text-[11px]" onClick={leave}>
            Main menu
          </button>
        )}
      </div>
    </div>
  );
}

export function GameScreen() {
  const session = useStore((s) => s.session);
  const dispatch = useStore((s) => s.dispatch);
  const modal = useStore((s) => s.modal);
  const showRollOff = useStore((s) => s.showRollOff);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const layout = useLayout();
  const [sheetOpen, setSheetOpen] = useState(true);
  // The 3D walk is desktop-only: phones and tablets keep the 2D board.
  const [walk, setView3d] = useState(sceneOpensWalk);
  const view3d = walk && !isTouchDevice;
  const placing = useStore((s) => s.mode !== null);
  const state = session?.state;
  const seat = state ? displaySeat(state) : 0;

  useBotDriver(state);
  useGameKeys(state, seat);
  useTurnTimer(state);

  const onAction = useCallback((a: Action) => dispatch(a), [dispatch]);
  if (!state) return null;

  const actor = activeActor(state);
  const canAct = canSeatAct(state, seat);
  const ph = state.phase;
  const humanSeat = state.players[seat].kind === 'human';
  const needsBoard = canAct && humanSeat && (ph.kind === 'setup' || ph.kind === 'move-wraith' || placing);

  // The board takes all the height left under the top bar and the players row.
  const board = (
    <div
      data-board
      className="relative mx-auto w-full"
      style={{ maxWidth: layout === 'narrow' ? undefined : `min(100%, calc((100vh - 150px) * ${(VIEWBOX.w / VIEWBOX.h).toFixed(3)}))` }}
    >
      {view3d ? (
        <div className="w-full" style={{ aspectRatio: `${VIEWBOX.w} / ${VIEWBOX.h}` }}>
          <Suspense fallback={<div className="grid h-full place-items-center rounded-lg bg-surface-1 font-display text-gold">Building the island…</div>}>
            <World3D state={state} seat={seat} needsBoard={needsBoard} onExit={() => setView3d(false)} />
          </Suspense>
        </div>
      ) : (
        <ZoomPan enabled={layout === 'narrow'}>
          <BoardView state={state} canAct={canAct} onAction={onAction} />
        </ZoomPan>
      )}
      {!isTouchDevice && (
        <div className="absolute bottom-3 right-3 z-20 flex gap-0.5 rounded-xl border border-iron/80 bg-[#141617]/90 p-0.5 shadow-panel" role="group" aria-label="Board view">
          {(['2D', '3D'] as const).map((v) => {
            const on = (v === '3D') === view3d;
            return (
              <button
                key={v}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-display text-[11px] uppercase tracking-[0.1em] transition-all ${on ? 'bg-gradient-to-b from-[#ffc978] via-gold to-[#e07a3e] text-[#2a1406] shadow-[0_6px_16px_-8px_rgb(255_140_60/0.9)]' : 'text-muted hover:bg-surface-2 hover:text-bone'}`}
                aria-pressed={on}
                title={v === '3D' ? 'Walk around your lands in first person' : 'Back to the board'}
                onClick={() => setView3d(v === '3D')}
              >
                {v === '3D' ? '3D walk' : '2D board'}
              </button>
            );
          })}
        </div>
      )}
      <RollOverlay state={state} />
      <div className={`absolute left-0 top-0 z-20 max-w-[min(360px,70%)] ${view3d ? 'hidden' : ''}`}>
        {ph.kind === 'setup' && canAct && (
          <RookieTip id="setup">
            Settlements can’t be next to another settlement. Favour high-dot numbers (6 and 8) and a mix of resources.
          </RookieTip>
        )}
        {ph.kind === 'move-wraith' && canAct && <RookieTip id="wraith">Pick an opponent’s best hex; it produces nothing while the robber is there.</RookieTip>}
      </div>
    </div>
  );

  const center = (
    <div className="flex min-h-0 flex-col gap-2">
      <PlayersPanel state={state} seat={seat} />
      <p className="sr-only" aria-live="polite">
        {instruction(state, seat)}
      </p>
      {board}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col gap-2 p-2 sm:p-3">
      <TopBar state={state} />
      <div
        className={`grid flex-1 gap-3 ${
          layout === 'wide' ? 'grid-cols-[minmax(240px,17vw)_minmax(0,1fr)_minmax(350px,24vw)]' : layout === 'mid' ? 'grid-cols-[minmax(0,1fr)_350px]' : 'grid-cols-1 pb-[52vh]'
        }`}
      >
        {layout === 'wide' && (
          <aside className="flex min-h-0 flex-col gap-3" aria-label="Claims and events">
            <BonusPanel state={state} />
            <RecentLog state={state} seat={seat} />
          </aside>
        )}
        <main className="min-w-0">
          {center}
          {layout !== 'wide' && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <BonusPanel state={state} />
              <RecentLog state={state} seat={seat} />
            </div>
          )}
        </main>
        {layout !== 'narrow' && (
          <aside className="flex min-h-0 flex-col gap-3" aria-label="Your hand and actions">
            <HandPanel state={state} seat={seat} />
            <ActionsPanel state={state} seat={seat} />
          </aside>
        )}
      </div>

      {layout === 'narrow' && (
        <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-iron/80 bg-[#141617]/95 shadow-panel">
          <button className="flex w-full flex-col items-center gap-1 pb-1.5 pt-2 font-display text-[11px] uppercase tracking-[0.2em] text-gold" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
            <span className="h-1 w-10 rounded-full bg-iron" aria-hidden />
            <span className="flex items-center gap-2">
              <Icon name="arrow" size={12} className={sheetOpen ? 'rotate-90' : '-rotate-90'} /> {sheetOpen ? 'Hide hand' : 'Show hand & actions'}
            </span>
          </button>
          {sheetOpen && (
            <div className="scroll-thin max-h-[48vh] space-y-2 overflow-y-auto px-2 pb-2">
              <HandPanel state={state} seat={seat} />
              <ActionsPanel state={state} seat={seat} />
            </div>
          )}
        </div>
      )}

      {session?.online && <ConnectionBanner />}
      <FlyingGains state={state} seat={seat} disabled={reduce} />
      <FloatingToast />

      <AnimatePresence>
        {state.handoff === null && ph.kind === 'discard' && actor === seat && humanSeat && <DiscardModal key={`d${state.actionCount}`} state={state} seat={seat} />}
        {state.handoff === null && ph.kind === 'steal' && actor === seat && humanSeat && <StealModal key="steal" state={state} seat={seat} />}
        {state.handoff === null && ph.kind === 'trade' && actor === seat && humanSeat && (
          <TradeInboxModal key={`t${ph.offer.id}`} state={state} seat={seat} />
        )}
        {showRollOff && state.handoff === null && <RollOffModal key="rolloff" state={state} />}
        {modal === 'harvest' && <HarvestModal key="harvest" state={state} seat={seat} />}
        {modal === 'tithe' && <TitheModal key="tithe" seat={seat} />}
        {modal === 'log' && <LogModal key="log" state={state} seat={seat} />}
        {modal === 'confirm-new' && <ConfirmNewModal key="confirm" />}
      </AnimatePresence>
      {/* Keyed per hand-off and outside AnimatePresence: a curtain must never be lost to an exit animation. */}
      {state.handoff !== null && <PassDeviceCurtain key={`${state.handoff}:${state.actionCount}`} state={state} />}
      {ph.kind === 'ended' && (
        <Suspense fallback={null}>
          <VictoryScreen state={state} />
        </Suspense>
      )}
    </div>
  );
}
