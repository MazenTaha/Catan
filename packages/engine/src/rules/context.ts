import { COSTS, RESOURCES, addCounts, hasAtLeast, type CostKey, type ResourceCounts } from '../lexicon-keys';
import type { Rng } from '../rng';
import type { GameEvent, GameState, PhaseKind } from '../state/types';
import { check } from './errors';

/** Mutable working context for a single reducer call (operates on a private clone). */
export interface Ctx {
  s: GameState;
  ev: GameEvent[];
  rng: Rng;
}

export function requireCurrent(ctx: Ctx, player: number): void {
  check(player === ctx.s.currentPlayer, 'NOT_YOUR_TURN', "It is not your turn");
}

export function requirePhase(ctx: Ctx, ...kinds: PhaseKind[]): void {
  const k = ctx.s.phase.kind;
  if (kinds.includes(k)) return;
  if (k === 'roll' && kinds.includes('main')) check(false, 'MUST_ROLL', 'Roll the dice first');
  check(false, 'WRONG_PHASE', phaseHint(k));
}

function phaseHint(k: PhaseKind): string {
  switch (k) {
    case 'setup':
      return 'Finish placing your starting pieces first';
    case 'roll':
      return 'Roll the dice first';
    case 'discard':
      return 'Waiting for discards';
    case 'move-wraith':
      return 'Move the Wraith first';
    case 'steal':
      return 'Choose whom to rob first';
    case 'decree':
      return 'Place your free causeways first';
    case 'trade':
      return 'Resolve the open trade first';
    case 'main':
      return 'Not now';
    case 'ended':
      return 'The game is over';
  }
}

/** Pay a cost from a player's hand to the bank. */
export function payCost(ctx: Ctx, player: number, cost: CostKey | Partial<ResourceCounts>): void {
  const c = typeof cost === 'string' ? COSTS[cost] : cost;
  const p = ctx.s.players[player];
  check(hasAtLeast(p.hand, c), 'CANNOT_AFFORD', 'You lack the resources');
  p.hand = addCounts(p.hand, c, -1);
  ctx.s.bank = addCounts(ctx.s.bank, c, 1);
}

/** Move cards from the bank to a player (caller guarantees bank stock). */
export function grant(ctx: Ctx, player: number, counts: Partial<ResourceCounts>, track = true): void {
  const p = ctx.s.players[player];
  p.hand = addCounts(p.hand, counts, 1);
  ctx.s.bank = addCounts(ctx.s.bank, counts, -1);
  if (track) ctx.s.stats.gained[player] = addCounts(ctx.s.stats.gained[player], counts, 1);
  for (const r of RESOURCES) {
    if (ctx.s.bank[r] < 0) throw new Error(`bank underflow ${r}`);
  }
}

/** Move cards between two players. */
export function transfer(ctx: Ctx, from: number, to: number, counts: Partial<ResourceCounts>): void {
  const a = ctx.s.players[from];
  const b = ctx.s.players[to];
  check(hasAtLeast(a.hand, counts), 'CANNOT_AFFORD', `${a.name} lacks the cards`);
  a.hand = addCounts(a.hand, counts, -1);
  b.hand = addCounts(b.hand, counts, 1);
}
