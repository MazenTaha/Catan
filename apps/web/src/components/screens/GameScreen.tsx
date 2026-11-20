import { AnimatePresence } from 'framer-motion';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sceneOpensWalk } from '../../devScenario';
import { activeActor, type Action } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { ZoomPan } from '../board/ZoomPan';
import { FlyingGains } from '../fx/FlyingGains';
import { FloatingToast, InstructionRibbon, RollOverlay, Toolbar, TopBar, instruction } from '../hud/Hud';
import { VIEWBOX } from '../board/geometry';
import { ConfirmNewModal, DiscardModal, HarvestModal, PassDeviceCurtain, RollOffModal, StealModal, TitheModal, TradeInboxModal } from '../modals/GameModals';
import { LogModal } from '../modals/InfoModals';
import { LastRoll, ListsPanel, PlayersPanel, RecentLog } from '../panels/LeftRail';
import { ActionsPanel, HandPanel, canSeatAct } from '../panels/RightRail';
import { IconButton, RookieTip } from '../ui/primitives';
import { useNet } from '../../state/net';
import { useBotDriver, useGameKeys, useTurnTimer } from './gameHooks';
import { isTouchDevice } from '../../state/device';
import { ChartSheet, HallBackground, HallLoader, WarTable } from '../../ui/hall/Surfaces';

const VictoryScreen = lazy(() => import('../modals/VictoryScreen'));
const World3D = lazy(() => import('../world/World3D'));

type Layout = 'wide' | 'mid' | 'narrow';

function useLayout(): Layout {
  const get = (): Layout => (typeof window === 'undefined' ? 'wide' : window.innerWidth >= 1280 ? 'wide' : window.innerWidth >= 900 ? 'mid' : 'narrow');
  const [layout, setLayout] = useState<Layout>(get);
  useEffect(() => {
    const on = () => setLayout(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return layout;
}

/** Room under the board for the chart's bottom margin, its rolled end and the war table's edge. */
const UNDER_BOARD = 64;

/**
 * Height left for the board between its top edge and the bottom of the window, so the board
 * (and the 3D walk) can take all of it. Re-measured when the window or the rows above it change.
 */
function useBoardHeight(on: boolean, under: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return setHeight(null);
    const measure = () => setHeight(Math.max(320, Math.floor(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - under)));
    measure();
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [on, under]);
  return [ref, height] as const;
}

/** Online games: an iron plaque when the link to the server drops and while it reconnects. */
function ConnectionBanner() {
  const status = useNet((n) => n.status);
  const error = useNet((n) => n.error);
  const leave = useStore((s) => s.leaveOnline);
  if (status === 'online') return null;
  const lost = status === 'offline' || status === 'idle';
  return (
    <div className="fixed inset-x-0 top-3 z-[75] flex justify-center px-4" role="status" aria-live="polite">
      <div className="hc-plaque hc-plaque--iron !cursor-default gap-3 !px-4 !py-1.5 text-[17px]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18" />
        </svg>
        <span className={lost ? '' : 'anim-pulse'}>{lost ? (error ?? 'Lost the connection to the game.') : 'Connection lost — reconnecting…'}</span>
        {lost && (
          <button className="hc-plaque hc-plaque--sm" onClick={leave}>
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
  const [ledger, setLedger] = useState(false);
  // The 3D walk is desktop-only: phones and tablets keep the 2D board.
  const walk = useStore((s) => s.view3d);
  const setView3d = useStore((s) => s.setView3d);
  useEffect(() => {
    if (sceneOpensWalk()) setView3d(true);
  }, [setView3d]);
  const view3d = walk && !isTouchDevice;
  const state = session?.state;
  const seat = state ? displaySeat(state) : 0;
  const [boardRef, boardH] = useBoardHeight(layout !== 'narrow' && !!state, view3d ? 16 : UNDER_BOARD);

  useBotDriver(state);
  useGameKeys(state, seat);
  useTurnTimer(state);

  const onAction = useCallback((a: Action) => dispatch(a), [dispatch]);
  if (!state) return null;

  const canAct = canSeatAct(state, seat);
  const ph = state.phase;
  const humanSeat = state.players[seat].kind === 'human';
  const actor = activeActor(state);

  // The board takes all the height left under the banners and the herald's ribbon; the 3D walk
  // fills the whole width as well, since its camera adapts to any shape.
  const boardInner = (
    <div
      ref={boardRef}
      data-board
      className="relative mx-auto w-full"
      style={{ maxWidth: boardH === null || view3d ? undefined : `min(100%, ${Math.round(boardH * (VIEWBOX.w / VIEWBOX.h))}px)` }}
    >
      {view3d ? (
        <div className="w-full" style={boardH === null ? { aspectRatio: `${VIEWBOX.w} / ${VIEWBOX.h}` } : { height: boardH }}>
          <Suspense
            fallback={
              <div className="h-full bg-black/40">
                <HallLoader>Building the island…</HallLoader>
              </div>
            }
          >
            <World3D state={state} seat={seat} onExit={() => setView3d(false)} />
          </Suspense>
        </div>
      ) : (
        <ZoomPan enabled={layout === 'narrow'}>
          <BoardView state={state} canAct={canAct} onAction={onAction} />
        </ZoomPan>
      )}
      {!isTouchDevice && (
        <div className="absolute bottom-3 right-3 z-20 flex gap-1.5" role="group" aria-label="Board view">
          {(['2D', '3D'] as const).map((v) => {
            const on = (v === '3D') === view3d;
            const called = v === '3D' && !view3d && ph.kind === 'duel' && (ph.target === seat || ph.challenger === seat);
            return (
              <button
                key={v}
                className={`hc-plaque hc-plaque--sm ${called ? 'duel-call !text-[#fff3e0]' : ''}`}
                data-testid={v === '3D' ? 'walk-3d' : undefined}
                aria-pressed={on}
                title={v === '3D' ? 'Explore your lands in third person' : 'Back to the board'}
                onClick={() => setView3d(v === '3D')}
              >
                {v === '3D' ? '3D walk' : '2D board'}
              </button>
            );
          })}
        </div>
      )}
      <RollOverlay state={state} />
      <div className={`absolute left-2 top-2 z-20 max-w-[min(360px,70%)] ${view3d ? 'hidden' : ''}`}>
        {ph.kind === 'setup' && canAct && <RookieTip id="setup">Settlements can’t be next to another settlement. Favour high-dot numbers (6 and 8) and a mix of resources.</RookieTip>}
        {ph.kind === 'move-wraith' && canAct && <RookieTip id="wraith">Pick an opponent’s best hex; it produces nothing while the robber is there.</RookieTip>}
      </div>
    </div>
  );

  // The board laid on a vellum chart, on the oak war table (the 3D walk keeps its own frame).
  const board = view3d ? (
    boardInner
  ) : (
    <WarTable className={layout === 'narrow' ? '!border-t-[6px] px-1 pb-2 pt-1' : 'px-4 pb-1 pt-3'}>
      <ChartSheet pad={layout === 'narrow' ? 10 : 18} style={{ margin: layout === 'narrow' ? '10px 2px' : '12px 0 14px' }}>
        {boardInner}
      </ChartSheet>
    </WarTable>
  );

  const live = (
    <p className="sr-only" aria-live="polite">
      {instruction(state, seat)}
    </p>
  );

  return (
    <HallBackground className="flex min-h-screen flex-col p-2 sm:p-3">
      {layout !== 'narrow' ? (
        <div className={`grid flex-1 gap-4 ${layout === 'wide' ? 'grid-cols-[256px_minmax(0,1fr)_286px]' : 'grid-cols-[220px_minmax(0,1fr)_260px]'}`}>
          <aside className="flex h-[calc(100vh-24px)] min-h-0 flex-col gap-4" aria-label="Claims and events">
            <ListsPanel state={state} />
            <RecentLog state={state} seat={seat} />
            <LastRoll state={state} />
          </aside>
          <main className="flex min-w-0 flex-col gap-1">
            <PlayersPanel state={state} seat={seat} size={layout === 'wide' ? 'wide' : 'mid'} />
            {live}
            {!view3d && <InstructionRibbon state={state} seat={seat} />}
            {board}
          </main>
          <aside className="flex h-[calc(100vh-24px)] min-h-0 flex-col gap-3" aria-label="Your hand and actions">
            <Toolbar className="justify-center" />
            <HandPanel state={state} seat={seat} />
            <ActionsPanel state={state} seat={seat} />
          </aside>
        </div>
      ) : (
        // Phones: the board on top, a pennant strip, the Lists and Herald behind a toolbar button,
        // the treasury in a bottom sheet with End turn always in reach.
        <main className="flex min-w-0 flex-col gap-2 pb-[56vh]">
          <TopBar
            state={state}
            extra={<IconButton icon="scroll" label={ledger ? 'Hide the Lists and Herald' : 'Show the Lists and Herald'} pressed={ledger} onClick={() => setLedger((o) => !o)} />}
          />
          <PlayersPanel state={state} seat={seat} size="strip" />
          {live}
          <InstructionRibbon state={state} seat={seat} />
          {board}
          {ledger && (
            <div className="grid gap-4">
              <ListsPanel state={state} />
              <div className="flex h-[360px] flex-col">
                <RecentLog state={state} seat={seat} />
              </div>
              <LastRoll state={state} />
            </div>
          )}
        </main>
      )}

      {layout === 'narrow' && (
        <div className="hc-oak fixed inset-x-0 bottom-0 z-30 !rounded-none !p-0" style={{ borderWidth: '3px 0 0' }}>
          <button className="flex min-h-[44px] w-full flex-col items-center gap-1 pb-1.5 pt-2 text-[color:var(--gold-light)]" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
            <span className="h-1 w-10 rounded-full bg-[color:var(--oak-edge)]" aria-hidden />
            <span className="hc-label flex items-center gap-2 text-[16px]">
              <Icon name="arrow" size={13} className={sheetOpen ? 'rotate-90' : '-rotate-90'} /> {sheetOpen ? 'Hide hand' : 'Show hand & actions'}
            </span>
          </button>
          {sheetOpen && (
            <div className="hc-scroll max-h-[52vh] space-y-3 overflow-y-auto px-2 pb-3 pt-2">
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
        {state.handoff === null && ph.kind === 'trade' && actor === seat && humanSeat && <TradeInboxModal key={`t${ph.offer.id}`} state={state} seat={seat} />}
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
    </HallBackground>
  );
}
