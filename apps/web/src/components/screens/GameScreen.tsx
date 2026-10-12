import { AnimatePresence } from 'framer-motion';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { activeActor, type Action } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { displaySeat, prefersReducedMotion, useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { ZoomPan } from '../board/ZoomPan';
import { FlyingGains } from '../fx/FlyingGains';
import { BoardToast, DiceTray, TerrainKey, TopBar, TurnBanner } from '../hud/Hud';
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
import { useBotDriver, useGameKeys, useTurnTimer } from './gameHooks';

const VictoryScreen = lazy(() => import('../modals/VictoryScreen'));

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

export function GameScreen() {
  const session = useStore((s) => s.session);
  const dispatch = useStore((s) => s.dispatch);
  const modal = useStore((s) => s.modal);
  const showRollOff = useStore((s) => s.showRollOff);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const layout = useLayout();
  const [sheetOpen, setSheetOpen] = useState(true);
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
  const canRoll = canAct && ph.kind === 'roll' && state.currentPlayer === seat;
  const humanSeat = state.players[seat].kind === 'human';

  const board = (
    <div data-board className="mx-auto w-full" style={{ maxWidth: layout === 'narrow' ? undefined : 'min(100%, calc((100vh - 350px) * 1.055))' }}>
      <ZoomPan enabled={layout === 'narrow'}>
        <BoardView state={state} canAct={canAct} onAction={onAction} />
      </ZoomPan>
    </div>
  );

  const center = (
    <div className="flex min-h-0 flex-col gap-3">
      <TurnBanner state={state} seat={seat} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <DiceTray state={state} canRoll={canRoll} onRoll={() => dispatch({ type: 'RollDice', player: seat })} />
        <div className="flex-1">
          {ph.kind === 'setup' && canAct && (
            <RookieTip id="setup">
              Outposts can’t touch another outpost. Favour high-dot numbers (6 and 8) and a mix of resources.
            </RookieTip>
          )}
          {ph.kind === 'move-wraith' && canAct && <RookieTip id="wraith">Pick an opponent’s best tile; it yields nothing while haunted.</RookieTip>}
        </div>
      </div>
      {board}
      <BoardToast />
      <TerrainKey state={state} />
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col gap-3 p-2 sm:p-3">
      <TopBar state={state} />
      {layout !== 'wide' && <PlayersPanel state={state} seat={seat} horizontal />}
      <div
        className={`grid flex-1 gap-3 ${
          layout === 'wide' ? 'grid-cols-[290px_minmax(0,1fr)_370px]' : layout === 'mid' ? 'grid-cols-[minmax(0,1fr)_350px]' : 'grid-cols-1 pb-[52vh]'
        }`}
      >
        {layout === 'wide' && (
          <aside className="flex min-h-0 flex-col gap-3" aria-label="Players and events">
            <PlayersPanel state={state} seat={seat} />
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tarnish/60 bg-abyss/95 shadow-panel backdrop-blur">
          <button className="flex w-full items-center justify-center gap-2 py-1.5 font-display text-[11px] uppercase tracking-[0.2em] text-gold" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
            <Icon name="arrow" size={12} className={sheetOpen ? 'rotate-90' : '-rotate-90'} /> {sheetOpen ? 'Hide hand' : 'Show hand & actions'}
          </button>
          {sheetOpen && (
            <div className="scroll-thin max-h-[48vh] space-y-2 overflow-y-auto px-2 pb-2">
              <HandPanel state={state} seat={seat} />
              <ActionsPanel state={state} seat={seat} />
            </div>
          )}
        </div>
      )}

      <FlyingGains state={state} seat={seat} disabled={reduce} />

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
      <AnimatePresence>{state.handoff !== null && <PassDeviceCurtain state={state} />}</AnimatePresence>
      {ph.kind === 'ended' && (
        <Suspense fallback={null}>
          <VictoryScreen state={state} />
        </Suspense>
      )}
    </div>
  );
}
