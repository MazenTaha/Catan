import { HOST_MIN } from '../lexicon-keys';
import { victoryPoints, vpBreakdown } from '../state/selectors';
import type { Ctx } from './context';

/**
 * Greatest Host: ≥ 3 played Wardens and strictly more than anyone else.
 * The holder keeps it on ties.
 */
export function updateGreatestHost(ctx: Ctx): void {
  const { s } = ctx;
  const counts = s.players.map((p) => p.playedWardens);
  const prev = s.greatestHost.holder;
  let holder = prev;
  for (let p = 0; p < counts.length; p++) {
    if (counts[p] < HOST_MIN || p === holder) continue;
    if (holder === null || counts[p] > counts[holder]) holder = p;
  }
  if (holder !== prev) {
    s.greatestHost = { holder };
    ctx.ev.push({ type: 'GreatestHostChanged', holder, previous: prev, count: counts[holder!] });
  }
}

/** A player wins only on their own turn, as soon as they reach the target. */
export function checkVictory(ctx: Ctx): void {
  const { s } = ctx;
  if (s.phase.kind === 'setup' || s.phase.kind === 'ended') return;
  const p = s.currentPlayer;
  const vp = victoryPoints(s, p, true);
  if (vp < s.config.targetVp) return;
  s.phase = { kind: 'ended', winner: p };
  s.winner = p;
  s.handoff = null;
  ctx.ev.push({
    type: 'GameWon',
    player: p,
    vp,
    breakdown: s.players.map((pl) => vpBreakdown(s, pl.id)),
  });
}
