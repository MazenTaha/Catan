import { Rng, hashSeed } from '../rng';
import { activeActor } from '../state/selectors';
import type { Action, BotLevel, GameState } from '../state/types';
import { archdemonAction } from './archdemon';
import { wandererAction } from './wanderer';
import { WARLORD, warlordAction } from './warlord';

export { lookaheadSetup, ARCHDEMON } from './archdemon';
export { WARLORD, estimateHeld, type Persona } from './warlord';
export * from './evaluate';

/**
 * Chooses an action for the seat that must act now, at the given difficulty. Bots only
 * ever return legal `Action`s; their randomness is derived from the game state, so the
 * same position always yields the same decision.
 */
export function decideAction(state: GameState, level?: BotLevel, salt = ''): Action {
  const p = state.handoff ?? activeActor(state);
  const lvl = level ?? state.players[p].bot ?? 'warlord';
  const rng = new Rng(hashSeed(`${state.rng}|${state.actionCount}|${p}|${salt}`));
  switch (lvl) {
    case 'wanderer':
      return wandererAction(state, rng);
    case 'archdemon':
      return archdemonAction(state, rng);
    default:
      return warlordAction(state, rng, WARLORD);
  }
}
