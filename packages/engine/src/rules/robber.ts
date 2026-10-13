import { HAND_LIMIT, RESOURCES, addCounts, hasAtLeast, toCounts, totalCards, type ResourceCounts } from '../lexicon-keys';
import { handTotal, stealCandidates } from '../state/selectors';
import type { Phase, ResumePhase } from '../state/types';
import type { Ctx } from './context';
import { requireCurrent, requirePhase, transfer } from './context';
import { check } from './errors';

export function resumePhase(r: ResumePhase): Phase {
  return r === 'roll' ? { kind: 'roll' } : { kind: 'main' };
}

export function validCounts(c: Partial<ResourceCounts>): boolean {
  if (!c || typeof c !== 'object') return false;
  for (const k of Object.keys(c)) if (!(RESOURCES as readonly string[]).includes(k)) return false;
  return RESOURCES.every((r) => {
    const v = c[r] ?? 0;
    return Number.isInteger(v) && v >= 0;
  });
}

/** A 7 was rolled: players over the hand limit discard half, then the Wraith moves. */
export function beginSeven(ctx: Ctx): void {
  const { s } = ctx;
  const pending = s.players.map((p) => {
    const n = handTotal(p);
    return n > HAND_LIMIT ? Math.floor(n / 2) : 0;
  });
  if (pending.some((x) => x > 0)) {
    s.phase = { kind: 'discard', pending };
    ctx.ev.push({ type: 'DiscardRequired', pending: [...pending] });
  } else {
    s.phase = { kind: 'move-wraith', reason: 'seven', resume: 'main' };
  }
}

export function discard(ctx: Ctx, player: number, cards: Partial<ResourceCounts>): void {
  const { s } = ctx;
  requirePhase(ctx, 'discard');
  if (s.phase.kind !== 'discard') return;
  const owed = s.phase.pending[player] ?? 0;
  check(owed > 0, 'INVALID', 'You do not need to discard');
  check(validCounts(cards), 'INVALID', 'Invalid discard');
  const c = toCounts(cards);
  check(totalCards(c) === owed, 'INVALID', `Discard exactly ${owed} cards`);
  const p = s.players[player];
  check(hasAtLeast(p.hand, c), 'CANNOT_AFFORD', 'You do not hold those cards');
  p.hand = addCounts(p.hand, c, -1);
  s.bank = addCounts(s.bank, c, 1);
  s.stats.discarded[player] += owed;
  ctx.ev.push({ type: 'Discarded', player, cards: c });
  s.phase.pending[player] = 0;
  if (s.phase.pending.every((x) => x === 0)) {
    s.phase = { kind: 'move-wraith', reason: 'seven', resume: 'main' };
  }
}

export function moveWraith(ctx: Ctx, player: number, hex: number): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'move-wraith');
  if (s.phase.kind !== 'move-wraith') return;
  check(Number.isInteger(hex) && hex >= 0 && hex < s.board.hexes.length, 'ILLEGAL_SPOT', 'No such hex');
  check(hex !== s.wraithHex, 'ILLEGAL_SPOT', 'The robber must move to a different hex');
  const resume = s.phase.resume;
  const from = s.wraithHex;
  s.wraithHex = hex;
  ctx.ev.push({ type: 'WraithMoved', player, from, to: hex });
  const candidates = stealCandidates(s, hex, player);
  if (candidates.length === 0) {
    ctx.ev.push({ type: 'StealSkipped', player });
    s.phase = resumePhase(resume);
  } else if (candidates.length === 1) {
    doSteal(ctx, player, candidates[0]);
    s.phase = resumePhase(resume);
  } else {
    s.phase = { kind: 'steal', candidates, resume };
  }
}

export function stealFrom(ctx: Ctx, player: number, victim: number): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'steal');
  if (s.phase.kind !== 'steal') return;
  check(s.phase.candidates.includes(victim), 'INVALID', 'You cannot rob that player');
  const resume = s.phase.resume;
  doSteal(ctx, player, victim);
  s.phase = resumePhase(resume);
}

function doSteal(ctx: Ctx, thief: number, victim: number): void {
  const hand = ctx.s.players[victim].hand;
  const total = totalCards(hand);
  if (total === 0) return;
  let k = ctx.rng.int(total);
  for (const r of RESOURCES) {
    if (k < hand[r]) {
      transfer(ctx, victim, thief, { [r]: 1 });
      ctx.s.stats.stolen[thief]++;
      ctx.ev.push({ type: 'Stolen', thief, victim, resource: r });
      return;
    }
    k -= hand[r];
  }
}
