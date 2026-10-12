import { deepClone } from '../clone';
import { Rng } from '../rng';
import { activeActor, privacyEnabled } from '../state/selectors';
import type { Action, ActionOutcome, GameError, GameState, Result } from '../state/types';
import { buildCauseway, buildCitadel, buildOutpost, placeSetupCauseway, placeSetupOutpost } from './build';
import type { Ctx } from './context';
import { requireCurrent, requirePhase } from './context';
import { RuleError, check, fail } from './errors';
import { buyOmen, playBloodTithe, playDecree, playHarvestPact, playWarden } from './omens';
import { produce } from './production';
import { beginSeven, discard, moveWraith, stealFrom } from './robber';
import { checkVictory } from './scoring';
import { bankTrade, cancelTrade, proposeTrade, respondTrade } from './trade';

function rollDice(ctx: Ctx, player: number): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'roll');
  const dice: [number, number] = [ctx.rng.die(), ctx.rng.die()];
  const total = dice[0] + dice[1];
  s.dice = dice;
  s.hasRolled = true;
  s.stats.rolls[total]++;
  ctx.ev.push({ type: 'DiceRolled', player, dice, total });
  if (total === 7) {
    beginSeven(ctx);
  } else {
    produce(ctx, total);
    s.phase = { kind: 'main' };
  }
}

function endTurn(ctx: Ctx, player: number): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main');
  ctx.ev.push({ type: 'TurnEnded', player });
  const next = (s.currentPlayer + 1) % s.players.length;
  if (next === s.firstPlayer) s.round++;
  s.turn++;
  s.currentPlayer = next;
  s.hasRolled = false;
  s.omenPlayedThisTurn = false;
  s.phase = { kind: 'roll' };
  ctx.ev.push({ type: 'TurnStarted', player: next, turn: s.turn, round: s.round });
}

function ackPassDevice(ctx: Ctx, player: number): void {
  const { s } = ctx;
  check(s.handoff === player, 'INVALID', 'No hand-off is pending for you');
  s.viewer = player;
  s.handoff = null;
  ctx.ev.push({ type: 'DevicePassed', player });
}

function dispatch(ctx: Ctx, a: Action): void {
  switch (a.type) {
    case 'RollDice':
      return rollDice(ctx, a.player);
    case 'PlaceSetupOutpost':
      return placeSetupOutpost(ctx, a.player, a.vertex);
    case 'PlaceSetupCauseway':
      return placeSetupCauseway(ctx, a.player, a.edge);
    case 'Discard':
      return discard(ctx, a.player, a.cards);
    case 'MoveWraith':
      return moveWraith(ctx, a.player, a.hex);
    case 'StealFrom':
      return stealFrom(ctx, a.player, a.victim);
    case 'BuildCauseway':
      return buildCauseway(ctx, a.player, a.edge);
    case 'BuildOutpost':
      return buildOutpost(ctx, a.player, a.vertex);
    case 'BuildCitadel':
      return buildCitadel(ctx, a.player, a.vertex);
    case 'BuyOmen':
      return buyOmen(ctx, a.player);
    case 'PlayWarden':
      return playWarden(ctx, a.player);
    case 'PlayDecree':
      return playDecree(ctx, a.player);
    case 'PlayHarvestPact':
      return playHarvestPact(ctx, a.player, a.resources);
    case 'PlayBloodTithe':
      return playBloodTithe(ctx, a.player, a.resource);
    case 'ProposeTrade':
      return proposeTrade(ctx, a.player, a.give, a.want, a.to);
    case 'RespondTrade':
      return respondTrade(ctx, a.player, a.response, a.give, a.want);
    case 'CancelTrade':
      return cancelTrade(ctx, a.player);
    case 'BankTrade':
      return bankTrade(ctx, a.player, a.give, a.receive, a.count ?? 1);
    case 'EndTurn':
      return endTurn(ctx, a.player);
    case 'AckPassDevice':
      return ackPassDevice(ctx, a.player);
    default:
      fail('INVALID', `Unknown action ${(a as { type?: string }).type}`);
  }
}

/** Recomputes whether the device must change hands (hot-seat privacy). */
function updateHandoff(s: GameState): void {
  if (s.phase.kind === 'ended' || !privacyEnabled(s)) {
    s.handoff = null;
    return;
  }
  const actor = activeActor(s);
  s.handoff = s.players[actor].kind === 'human' && actor !== s.viewer ? actor : null;
}

export function cloneState(s: GameState): GameState {
  return deepClone(s);
}

/**
 * Pure reducer: validates `action` against `state` and returns the next state plus the
 * events it produced, or a typed error. The input state is never mutated. All randomness
 * comes from (and is written back to) `state.rng`, so replays are exact.
 */
export function applyAction(state: GameState, action: Action): Result<ActionOutcome, GameError> {
  try {
    check(action && typeof action === 'object', 'INVALID', 'Malformed action');
    check(
      Number.isInteger(action.player) && state.players[action.player] !== undefined,
      'INVALID',
      'Unknown player',
    );
    check(state.phase.kind !== 'ended', 'GAME_OVER', 'The game is over');
    if (state.handoff !== null) {
      const allowed =
        (action.type === 'AckPassDevice' && action.player === state.handoff) ||
        (action.type === 'CancelTrade' && action.player === state.currentPlayer);
      check(allowed, 'AWAITING_HANDOFF', `Pass the device to ${state.players[state.handoff].name}`);
    } else {
      check(action.type !== 'AckPassDevice', 'INVALID', 'No hand-off is pending');
    }

    const s = cloneState(state);
    const ctx: Ctx = { s, ev: [], rng: new Rng(s.rng) };
    dispatch(ctx, action);
    s.rng = ctx.rng.state;
    s.actionCount++;
    if (action.type !== 'AckPassDevice') {
      checkVictory(ctx);
      updateHandoff(s);
    }
    return { ok: true, value: { state: s, events: ctx.ev } };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: { code: e.code, message: e.message } };
    throw e;
  }
}

/** Convenience: apply or throw (useful in tests and replays). */
export function applyOrThrow(state: GameState, action: Action): ActionOutcome {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error.code} — ${r.error.message}`);
  return r.value;
}

export function isLegal(state: GameState, action: Action): boolean {
  return applyAction(state, action).ok;
}
