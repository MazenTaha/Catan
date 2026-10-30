import { DAMAGE, MAX_HEALTH, RESOURCES, WEAPONS, totalCards, type Resource, type Weapon } from '../lexicon-keys';
import type { ArmsState } from '../state/types';
import type { Ctx } from './context';
import { requireCurrent, requirePhase, transfer } from './context';
import { check, fail } from './errors';

/**
 * The 3D walk's combat (DECISIONS #40). Positions and aim live in the browser and the server;
 * the engine owns only what must persist and replay: who is armed, bullets, health, kills,
 * cards taken or owed, and the Man up duel that pauses the board.
 */

function armsOf(ctx: Ctx): ArmsState {
  const a = ctx.s.arms;
  if (!a) fail('INVALID', 'This game has no weapons');
  return a;
}

/** After a seat's second starting settlement: the chest goes into one of its two, at random. */
export function hideChest(ctx: Ctx, player: number): void {
  const a = ctx.s.arms;
  if (!a || a.chest[player]) return;
  const homes = Object.keys(ctx.s.buildings)
    .filter((v) => ctx.s.buildings[v].owner === player)
    .sort();
  a.starts[player] = homes;
  if (homes.length) a.chest[player] = homes[ctx.rng.int(homes.length)];
}

export function openChest(ctx: Ctx, player: number): void {
  const a = armsOf(ctx);
  check(ctx.s.players[player].kind === 'human', 'INVALID', 'Only players can open chests');
  check(a.chest[player] !== null, 'INVALID', 'Your chest is not hidden yet');
  check(!a.armed[player], 'INVALID', 'You already opened your chest');
  a.armed[player] = true;
  ctx.ev.push({ type: 'ChestOpened', player });
}

export function fire(ctx: Ctx, player: number): void {
  const a = armsOf(ctx);
  check(a.armed[player], 'INVALID', 'Find your weapon chest first');
  check(a.bullets[player] > 0, 'INVALID', 'No bullets left this game');
  a.bullets[player]--;
  ctx.ev.push({ type: 'ShotFired', player, left: a.bullets[player] });
}

/** Players may fight any time, except that a duel allows only its two duelists to strike. */
export function strike(ctx: Ctx, player: number, victim: number, weapon: Weapon, parried: boolean): void {
  const { s } = ctx;
  const a = armsOf(ctx);
  check(!!s.config.pvp, 'INVALID', 'Fighting other players is off in this game');
  check(WEAPONS.includes(weapon), 'INVALID', 'Unknown weapon');
  check(s.players[victim] !== undefined && victim !== player, 'INVALID', 'Unknown target');
  check(
    s.players[player].kind === 'human' && s.players[victim].kind === 'human',
    'INVALID',
    'Only players can fight',
  );
  check(weapon === 'fist' || a.armed[player], 'INVALID', 'Find your weapon chest first');
  if (s.phase.kind === 'duel') {
    const pair = [s.phase.challenger, s.phase.target];
    check(pair.includes(player) && pair.includes(victim), 'WRONG_PHASE', 'A duel is under way');
  }
  const damage = parried ? 0 : DAMAGE[weapon];
  a.health[victim] = Math.max(0, a.health[victim] - damage);
  ctx.ev.push({ type: 'Struck', attacker: player, victim, weapon, damage, health: a.health[victim], parried });
  if (a.health[victim] === 0) slay(ctx, player, victim, false);
}

/** A death: the killer takes one random resource card (or is owed one), the victim respawns whole. */
function slay(ctx: Ctx, killer: number, victim: number, yielded: boolean): void {
  const { s } = ctx;
  const a = s.arms!;
  a.health[victim] = MAX_HEALTH;
  a.kills[killer]++;
  const resource = takeRandom(ctx, victim, killer);
  if (!resource) a.owed[victim][killer]++;
  ctx.ev.push({ type: 'Slain', killer, victim, resource });
  const ph = s.phase;
  if (ph.kind === 'duel' && [ph.challenger, ph.target].includes(killer) && [ph.challenger, ph.target].includes(victim)) {
    s.phase = { kind: ph.resume };
    ctx.ev.push({ type: 'DuelEnded', winner: killer, loser: victim, yielded });
  }
}

function takeRandom(ctx: Ctx, from: number, to: number): Resource | null {
  const hand = ctx.s.players[from].hand;
  const total = totalCards(hand);
  if (!total) return null;
  let k = ctx.rng.int(total);
  for (const r of RESOURCES) {
    if (k < hand[r]) {
      transfer(ctx, from, to, { [r]: 1 });
      return r;
    }
    k -= hand[r];
  }
  return null;
}

/** Card debts are paid the moment the debtor holds a card again, after any action. */
export function settleDebts(ctx: Ctx): void {
  const a = ctx.s.arms;
  if (!a) return;
  a.owed.forEach((row, debtor) =>
    row.forEach((n, creditor) => {
      for (let i = 0; i < n && totalCards(ctx.s.players[debtor].hand) > 0; i++) {
        const resource = takeRandom(ctx, debtor, creditor);
        if (!resource) return;
        a.owed[debtor][creditor]--;
        ctx.ev.push({ type: 'DebtPaid', from: debtor, to: creditor, resource });
      }
    }),
  );
}

export function playManUp(ctx: Ctx, player: number, target: number): void {
  const { s } = ctx;
  armsOf(ctx);
  check(!!s.config.pvp, 'INVALID', 'Duels are off in this game');
  check(
    s.players[target] !== undefined && target !== player && s.players[target].kind === 'human',
    'INVALID',
    'Challenge another player',
  );
  requireCurrent(ctx, player);
  requirePhase(ctx, 'roll', 'main');
  check(!s.omenPlayedThisTurn, 'OMEN_LIMIT', 'Only one development card may be played each turn');
  const p = s.players[player];
  const idx = p.omens.findIndex((o) => o.type === 'manup' && o.boughtTurn < s.turn);
  if (idx < 0) {
    if (p.omens.some((o) => o.type === 'manup')) {
      fail('CARD_LOCKED', 'A development card cannot be played on the turn it was bought');
    }
    fail('NO_CARD', 'You do not hold that development card');
  }
  p.omens.splice(idx, 1);
  p.playedOmens.push('manup');
  s.omenPlayedThisTurn = true;
  ctx.ev.push({ type: 'OmenPlayed', player, omen: 'manup' });
  s.phase = { kind: 'duel', challenger: player, target, resume: s.hasRolled ? 'main' : 'roll' };
  ctx.ev.push({ type: 'DuelStarted', challenger: player, target });
}

/** Giving up a duel (or being absent too long) counts as losing it. */
export function yieldDuel(ctx: Ctx, player: number): void {
  const ph = ctx.s.phase;
  check(ph.kind === 'duel', 'WRONG_PHASE', 'There is no duel to yield');
  if (ph.kind !== 'duel') return;
  check(player === ph.challenger || player === ph.target, 'INVALID', 'You are not in this duel');
  slay(ctx, player === ph.challenger ? ph.target : ph.challenger, player, true);
}
