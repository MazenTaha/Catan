import { applyOrThrow } from './rules/reducer';
import { activeActor } from './state/selectors';
import { createGame } from './state/setup';
import type { Action, ActionType, GameConfig, GameEvent, GameState } from './state/types';

/** Everything needed to reproduce a game exactly. */
export interface GameRecord {
  format: 'hexfall-record';
  version: 1;
  config: GameConfig;
  actions: Action[];
}

export function makeRecord(config: GameConfig, actions: Action[]): GameRecord {
  return { format: 'hexfall-record', version: 1, config, actions };
}

/** Rebuilds the state by re-applying every action from the initial config. */
export function replay(
  record: Pick<GameRecord, 'config' | 'actions'>,
  upTo = record.actions.length,
): { state: GameState; events: GameEvent[] } {
  let state = createGame(record.config);
  const events: GameEvent[] = [];
  for (let i = 0; i < upTo; i++) {
    const out = applyOrThrow(state, record.actions[i]);
    state = out.state;
    events.push(...out.events);
  }
  return { state, events };
}

export function parseRecord(json: string): GameRecord {
  const data = JSON.parse(json) as Partial<GameRecord>;
  if (data.format !== 'hexfall-record' || data.version !== 1 || !data.config || !Array.isArray(data.actions)) {
    throw new Error('Not a Hexfall game record');
  }
  return data as GameRecord;
}

const UNDOABLE: ReadonlySet<ActionType> = new Set<ActionType>([
  'PlaceSetupOutpost',
  'PlaceSetupCauseway',
  'BuildCauseway',
  'BuildOutpost',
  'BuildCitadel',
  'BankTrade',
]);

const REVEALING: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  'DiceRolled',
  'Stolen',
  'OmenBought',
  'OmenPlayed',
  'TradeCompleted',
  'GameWon',
]);

/**
 * Whether `action` (which turned `prev` into `next`) may be taken back: only placement,
 * building and bank trades that consumed no randomness, revealed nothing, and left the
 * same seat in control. Dice, steals and Omen draws are never undoable.
 */
export function isUndoable(prev: GameState, action: Action, next: GameState, events: GameEvent[]): boolean {
  if (!UNDOABLE.has(action.type)) return false;
  if (prev.rng !== next.rng) return false;
  if (events.some((e) => REVEALING.has(e.type))) return false;
  if (next.phase.kind === 'ended' || next.handoff !== null) return false;
  return activeActor(next) === action.player;
}
