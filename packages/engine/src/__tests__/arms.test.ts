import { describe, expect, it } from 'vitest';
import { BULLETS, MANUP_CARDS, MAX_HEALTH, totalCards } from '../lexicon-keys';
import { Rng } from '../rng';
import { legalActions } from '../rules/legal';
import { buildOmenDeck } from '../state/setup';
import type { GameState } from '../state/types';
import { act, actEv, autoSetup, edit, expectErr, newGame, setHand } from './helpers';

const armed = (over: { pvp?: boolean } = {}) => {
  const s = autoSetup(newGame({ arms: true, pvp: over.pvp ?? true }));
  return edit(s, (d) => {
    d.arms!.armed = d.arms!.armed.map(() => true);
  });
};

const kill = (s: GameState, killer: number, victim: number) => {
  for (let i = 0; i < 2; i++) s = act(s, { type: 'Strike', player: killer, victim, weapon: 'revolver' });
  return s;
};

describe('weapon chest', () => {
  it('is hidden in one of each seat’s two starting settlements', () => {
    const s = autoSetup(newGame({ arms: true }));
    s.players.forEach((p) => {
      const homes = Object.keys(s.buildings).filter((v) => s.buildings[v].owner === p.id);
      expect(homes).toHaveLength(2);
      expect(homes).toContain(s.arms!.chest[p.id]);
    });
    expect(s.arms!.bullets).toEqual([BULLETS, BULLETS, BULLETS, BULLETS]);
  });

  it('arms a player once, off turn too', () => {
    let s = autoSetup(newGame({ arms: true }));
    expectErr(s, { type: 'Fire', player: 2 }, 'INVALID');
    s = act(s, { type: 'OpenChest', player: 2 });
    expect(s.arms!.armed[2]).toBe(true);
    expectErr(s, { type: 'OpenChest', player: 2 }, 'INVALID');
  });

  it('leaves games without arms unchanged', () => {
    const plain = newGame();
    expect(plain.arms).toBeUndefined();
    expect(plain.omenDeck).toEqual(newGame({ arms: true }).omenDeck);
    expectErr(autoSetup(plain), { type: 'OpenChest', player: 0 }, 'INVALID');
  });
});

describe('revolver', () => {
  it('has five rounds for the whole game', () => {
    let s = armed();
    for (let i = 0; i < BULLETS; i++) s = act(s, { type: 'Fire', player: 1 });
    expect(s.arms!.bullets[1]).toBe(0);
    expectErr(s, { type: 'Fire', player: 1 }, 'INVALID');
  });
});

describe('fights', () => {
  it('needs pvp, two humans and a weapon unless bare-handed', () => {
    const solo = armed({ pvp: false });
    expectErr(solo, { type: 'Strike', player: 0, victim: 1, weapon: 'sword' }, 'INVALID');
    let s = autoSetup(newGame({ arms: true, pvp: true }));
    expectErr(s, { type: 'Strike', player: 0, victim: 1, weapon: 'sword' }, 'INVALID');
    s = act(s, { type: 'Strike', player: 0, victim: 1, weapon: 'fist' });
    expect(s.arms!.health[1]).toBe(MAX_HEALTH - 10);
    const bots = edit(armed(), (d) => (d.players[3].kind = 'bot'));
    expectErr(bots, { type: 'Strike', player: 0, victim: 3, weapon: 'sword' }, 'INVALID');
  });

  it('keeps health between hits; a parry takes no damage', () => {
    let s = armed();
    s = act(s, { type: 'Strike', player: 0, victim: 1, weapon: 'sword' });
    s = act(s, { type: 'Strike', player: 2, victim: 1, weapon: 'sword', parried: true });
    expect(s.arms!.health[1]).toBe(75);
  });

  it('a kill takes one random resource card and restores the victim', () => {
    let s = setHand(armed(), 1, { wood: 1, ore: 1 });
    s = setHand(s, 0, {});
    const before = totalCards(s.players[0].hand);
    const out = actEv(kill(s, 0, 1), { type: 'Strike', player: 2, victim: 3, weapon: 'fist' });
    s = out.state;
    expect(totalCards(s.players[0].hand)).toBe(before + 1);
    expect(totalCards(s.players[1].hand)).toBe(1);
    expect(s.arms!.health[1]).toBe(MAX_HEALTH);
    expect(s.arms!.kills[0]).toBe(1);
  });

  it('an empty-handed victim owes the card and pays it as soon as they hold one', () => {
    let s = setHand(setHand(armed(), 1, {}), 0, {});
    const slain = actEv(s, { type: 'Strike', player: 0, victim: 1, weapon: 'revolver' });
    s = slain.state;
    const last = actEv(s, { type: 'Strike', player: 0, victim: 1, weapon: 'revolver' });
    expect(last.events).toContainEqual({ type: 'Slain', killer: 0, victim: 1, resource: null });
    s = last.state;
    expect(s.arms!.owed[1][0]).toBe(1);
    // Any action settles debts; the bank-backed setHand stands in for a production roll.
    s = setHand(s, 1, { grain: 2 });
    const paid = actEv(s, { type: 'Fire', player: 2 });
    expect(paid.events).toContainEqual({ type: 'DebtPaid', from: 1, to: 0, resource: 'grain' });
    expect(paid.state.arms!.owed[1][0]).toBe(0);
    expect(paid.state.players[0].hand.grain).toBe(1);
    expect(paid.state.players[1].hand.grain).toBe(1);
  });
});

describe('Man up', () => {
  it('adds six cards to live-combat decks only', () => {
    expect(buildOmenDeck(Rng.fromSeed('d'), true).filter((c) => c === 'manup')).toHaveLength(MANUP_CARDS);
    expect(buildOmenDeck(Rng.fromSeed('d'), true)).toHaveLength(25 + MANUP_CARDS);
    expect(newGame({ arms: true, pvp: true }).omenDeck).toHaveLength(31);
  });

  it('pauses the board until one duelist dies, then resumes the turn', () => {
    let s = edit(armed(), (d) => d.players[0].omens.push({ type: 'manup', boughtTurn: 0 }));
    expect(s.phase.kind).toBe('roll');
    expectErr(s, { type: 'PlayManUp', player: 0, target: 0 }, 'INVALID');
    s = act(s, { type: 'PlayManUp', player: 0, target: 2 });
    expect(s.phase).toEqual({ kind: 'duel', challenger: 0, target: 2, resume: 'roll' });
    expect(legalActions(s)).toEqual([]);
    expectErr(s, { type: 'RollDice', player: 0 }, 'WRONG_PHASE');
    expectErr(s, { type: 'Strike', player: 1, victim: 2, weapon: 'sword' }, 'WRONG_PHASE');
    s = setHand(s, 0, { wool: 1 });
    s = kill(s, 2, 0);
    expect(s.phase.kind).toBe('roll');
    expect(s.players[2].hand.wool).toBeGreaterThanOrEqual(1);
  });

  it('yielding loses the duel', () => {
    let s = edit(armed(), (d) => d.players[0].omens.push({ type: 'manup', boughtTurn: 0 }));
    s = act(s, { type: 'PlayManUp', player: 0, target: 1 });
    expectErr(s, { type: 'YieldDuel', player: 3 }, 'INVALID');
    const out = actEv(s, { type: 'YieldDuel', player: 1 });
    expect(out.events).toContainEqual({ type: 'DuelEnded', winner: 0, loser: 1, yielded: true });
    expect(out.state.phase.kind).toBe('roll');
  });
});
