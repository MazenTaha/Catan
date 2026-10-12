import { useEffect, useRef } from 'react';
import { activeActor, chooseDiscard, decideAction, type GameState } from '@hexfall/engine';
import { useStore } from '../../state/store';
import { canSeatAct } from '../panels/RightRail';

const BOT_DELAY = { slow: [1300, 1700], normal: [600, 1200], fast: [180, 320], instant: [0, 0] } as const;

/** Lets bots act with a short "thinking" delay whenever they are the seat that must act. */
export function useBotDriver(state: GameState | undefined) {
  const dispatch = useStore((s) => s.dispatch);
  const speed = useStore((s) => s.settings.botSpeed);
  const paused = useStore((s) => s.showRollOff);
  useEffect(() => {
    if (!state || paused || state.phase.kind === 'ended' || state.handoff !== null) return;
    const actor = activeActor(state);
    if (state.players[actor].kind !== 'bot') return;
    const [lo, hi] = BOT_DELAY[speed];
    // Let a fresh roll finish tumbling before the bot moves on.
    const afterRoll = state.hasRolled && state.phase.kind === 'main' && speed !== 'instant' ? 500 : 0;
    const delay = lo + Math.random() * (hi - lo) + afterRoll;
    const id = window.setTimeout(() => {
      const a = decideAction(state);
      dispatch(a);
    }, delay);
    return () => window.clearTimeout(id);
  }, [state, speed, dispatch, paused]);
}

/** Global keys: Space rolls / ends the turn, Esc leaves placement mode. */
export function useGameKeys(state: GameState | undefined, seat: number) {
  const dispatch = useStore((s) => s.dispatch);
  const setMode = useStore((s) => s.setMode);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (!state || st.modal) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.key === 'Escape' && st.mode) {
        setMode(null);
        return;
      }
      if (e.code === 'Space' && !(el && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'))) {
        if (!canSeatAct(state, seat) || state.currentPlayer !== seat) return;
        if (state.phase.kind === 'roll') {
          e.preventDefault();
          dispatch({ type: 'RollDice', player: seat });
        } else if (state.phase.kind === 'main') {
          e.preventDefault();
          dispatch({ type: 'EndTurn', player: seat });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, seat, dispatch, setMode]);
}

/** Optional turn timer: on expiry the human's pending decision is resolved sensibly. */
export function useTurnTimer(state: GameState | undefined) {
  const seconds = useStore((s) => s.settings.turnTimer);
  const setDeadline = useStore((s) => s.setTimerDeadline);
  const dispatch = useStore((s) => s.dispatch);
  const keyRef = useRef('');
  useEffect(() => {
    if (!state || seconds === 0 || state.phase.kind === 'ended' || state.handoff !== null) {
      keyRef.current = '';
      setDeadline(null);
      return;
    }
    const actor = activeActor(state);
    if (state.players[actor].kind === 'bot') {
      keyRef.current = '';
      setDeadline(null);
      return;
    }
    const key = `${state.turn}|${actor}|${state.phase.kind}`;
    let deadline = useStore.getState().timerDeadline;
    if (key !== keyRef.current || deadline === null) {
      keyRef.current = key;
      deadline = Date.now() + seconds * 1000;
      setDeadline(deadline);
    }
    const id = window.setTimeout(() => {
      const ph = state.phase;
      if (ph.kind === 'roll') dispatch({ type: 'RollDice', player: actor });
      else if (ph.kind === 'discard') {
        dispatch({ type: 'Discard', player: actor, cards: chooseDiscard(state.players[actor].hand, ph.pending[actor]) });
      } else if (ph.kind === 'main') dispatch({ type: 'EndTurn', player: actor });
      else if (ph.kind === 'trade') {
        if (actor === state.currentPlayer && ph.offer.proposer === actor) dispatch({ type: 'CancelTrade', player: actor });
        else dispatch({ type: 'RespondTrade', player: actor, response: 'decline' });
      } else dispatch(decideAction(state, 'warlord', 'timer'));
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(id);
  }, [state, seconds, setDeadline, dispatch]);
}
