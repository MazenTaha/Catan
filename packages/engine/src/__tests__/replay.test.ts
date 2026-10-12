import { describe, expect, it } from 'vitest';
import { RESOURCES, SUPPLY, totalCards } from '../lexicon-keys';
import { isUndoable, makeRecord, parseRecord, replay } from '../replay';
import { Rng } from '../rng';
import { chooseDiscard, legalActions } from '../rules/legal';
import { applyAction } from '../rules/reducer';
import { activeActor, legalCausewaySpots, legalOutpostSpots } from '../state/selectors';
import { createGame } from '../state/setup';
import type { Action, GameConfig, GameState } from '../state/types';
import { act, actEv, blankMain, blankRoll, config, rngForTotal, edit, setHand, totalResources } from './helpers';

/** Random playout with an occasional domestic trade proposal. */
function randomPlayout(cfg: GameConfig, steps: number, seed: string) {
  const rng = Rng.fromSeed(seed);
  let state = createGame(cfg);
  const actions: Action[] = [];
  for (let i = 0; i < steps && state.phase.kind !== 'ended'; i++) {
    let options = legalActions(state, rng);
    if (state.phase.kind === 'main' && state.handoff === null && rng.next() < 0.1) {
      const p = state.currentPlayer;
      const have = RESOURCES.filter((r) => state.players[p].hand[r] > 0);
      if (have.length) {
        const g = rng.pick(have);
        const w = rng.pick(RESOURCES.filter((r) => r !== g));
        options = [{ type: 'ProposeTrade', player: p, give: { [g]: 1 }, want: { [w]: 1 }, to: 'all' }];
      }
    }
    if (state.phase.kind === 'trade' && state.handoff === null && rng.next() < 0.2) {
      const p = activeActor(state);
      const have = RESOURCES.filter((r) => state.players[p].hand[r] > 0);
      if (have.length && state.phase.offer.counterOf === null) {
        const g = rng.pick(have);
        const w = rng.pick(RESOURCES.filter((r) => r !== g));
        options = [{ type: 'RespondTrade', player: p, response: 'counter', give: { [g]: 1 }, want: { [w]: 1 } }];
      }
    }
    // Prefer not ending the turn immediately so games progress.
    const nonEnd = options.filter((a) => a.type !== 'EndTurn');
    const pick = nonEnd.length && rng.next() < 0.7 ? rng.pick(nonEnd) : rng.pick(options);
    const r = applyAction(state, pick);
    if (!r.ok) throw new Error(`legal action rejected: ${pick.type} ${r.error.message}`);
    state = r.value.state;
    actions.push(pick);
    checkInvariants(state);
  }
  return { state, actions };
}

/** Throws (cheaply) when a conservation/supply invariant is violated. */
function checkInvariants(s: GameState) {
  const bad = (msg: string) => {
    throw new Error(`invariant violated: ${msg} (action ${s.actionCount})`);
  };
  if (totalResources(s) !== 95) bad('resource conservation');
  for (const r of RESOURCES) {
    if (s.bank[r] < 0 || s.bank[r] > 19) bad(`bank ${r}`);
    for (const p of s.players) if (p.hand[r] < 0) bad(`hand ${r}`);
  }
  for (const p of s.players) {
    if (p.supply.causeways < 0 || p.supply.outposts < 0 || p.supply.citadels < 0) bad('negative supply');
    let out = 0;
    let cit = 0;
    for (const v in s.buildings) {
      const b = s.buildings[v];
      if (b.owner !== p.id) continue;
      if (b.kind === 'outpost') out++;
      else cit++;
    }
    if (out + p.supply.outposts !== SUPPLY.outposts) bad('outpost supply');
    if (cit + p.supply.citadels !== SUPPLY.citadels) bad('citadel supply');
    const roads = Object.values(s.causeways).filter((o) => o === p.id).length;
    if (roads + p.supply.causeways !== SUPPLY.causeways) bad('causeway supply');
  }
  const omensHeld = s.players.reduce((n, p) => n + p.omens.length + p.playedOmens.length, 0);
  if (omensHeld + s.omenDeck.length !== 25) bad('omen conservation');
}

describe('determinism and replay', () => {
  it('same seed + same actions ⇒ identical state', () => {
    const cfg = config({ seed: 'det-1', firstPlayer: 'rolloff' });
    const a = randomPlayout(cfg, 400, 'pick-1');
    const b = replay({ config: cfg, actions: a.actions });
    expect(b.state).toEqual(a.state);
    const again = replay({ config: cfg, actions: a.actions });
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(a.state));
  });

  it('exported records round-trip through JSON', () => {
    const cfg = config({ seed: 'det-2' });
    const a = randomPlayout(cfg, 250, 'pick-2');
    const json = JSON.stringify(makeRecord(cfg, a.actions));
    const rec = parseRecord(json);
    expect(replay(rec).state).toEqual(a.state);
    const partial = replay(rec, 10).state;
    expect(partial.actionCount).toBe(10);
    expect(() => parseRecord('{"format":"nope"}')).toThrow();
  });

  it('replay throws on a corrupted log', () => {
    const cfg = config({ seed: 'det-3' });
    expect(() => replay({ config: cfg, actions: [{ type: 'EndTurn', player: 0 }] })).toThrow(/rejected/);
  });

  it('a snapshot of the opening is stable', () => {
    const s = createGame(config({ seed: 'snapshot-isle', firstPlayer: 'rolloff' }));
    expect({
      terrain: s.board.hexes.map((h) => h.terrain[0] + (h.token ?? '')).join(' '),
      harbors: s.board.harbors.map((h) => h.kind).join(','),
      first: s.firstPlayer,
      top: s.omenDeck.slice(-3),
    }).toMatchSnapshot();
  });
});

describe('undo eligibility', () => {
  it('setup placements are undoable while the same seat acts', () => {
    const s0 = createGame(config());
    const v = legalOutpostSpots(s0, 0)[0];
    const a1: Action = { type: 'PlaceSetupOutpost', player: 0, vertex: v };
    const o1 = actEv(s0, a1);
    expect(isUndoable(s0, a1, o1.state, o1.events)).toBe(true);
    const a2: Action = { type: 'PlaceSetupCauseway', player: 0, edge: legalCausewaySpots(o1.state, 0)[0] };
    const o2 = actEv(o1.state, a2);
    expect(isUndoable(o1.state, a2, o2.state, o2.events)).toBe(false); // seat changed
  });

  it('building and bank trades are undoable; dice, omens and steals are not', () => {
    const s = setHand(blankMain(), 0, { wood: 4 });
    const bank: Action = { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore' };
    const o = actEv(s, bank);
    expect(isUndoable(s, bank, o.state, o.events)).toBe(true);

    const r0 = edit(blankRoll(), (d) => (d.rng = rngForTotal(5)));
    const roll: Action = { type: 'RollDice', player: 0 };
    const o2 = actEv(r0, roll);
    expect(isUndoable(r0, roll, o2.state, o2.events)).toBe(false);

    const b0 = setHand(blankMain(), 0, { wool: 1, grain: 1, ore: 1 });
    const buy: Action = { type: 'BuyOmen', player: 0 };
    const o3 = actEv(b0, buy);
    expect(isUndoable(b0, buy, o3.state, o3.events)).toBe(false);

    const end: Action = { type: 'EndTurn', player: 0 };
    const o4 = actEv(blankMain(), end);
    expect(isUndoable(blankMain(), end, o4.state, o4.events)).toBe(false);
  });
});

describe('legal action generator', () => {
  it('chooseDiscard sheds the largest piles deterministically or randomly', () => {
    const hand = { wood: 5, clay: 1, wool: 0, grain: 2, ore: 0 };
    const d = chooseDiscard(hand, 4);
    expect(totalCards(d)).toBe(4);
    expect(d.wood).toBe(4);
    const r = chooseDiscard(hand, 4, Rng.fromSeed('x'));
    expect(totalCards(r)).toBe(4);
  });

  it('every generated action is accepted', () => {
    let s = createGame(config({ seed: 'gen' }));
    const rng = Rng.fromSeed('gen');
    for (let i = 0; i < 300 && s.phase.kind !== 'ended'; i++) {
      const opts = legalActions(s, rng);
      for (const a of opts) expect(applyAction(s, a).ok).toBe(true);
      s = act(s, rng.pick(opts));
    }
  });

  it('includes hand-off acknowledgements and nothing after the game ends', () => {
    const s = createGame(config({ privacy: true }));
    expect(legalActions(s)).toEqual([{ type: 'AckPassDevice', player: 0 }]);
    const ended = edit(blankMain(), (d) => (d.phase = { kind: 'ended', winner: 0 }));
    expect(legalActions(ended)).toEqual([]);
  });
});

describe('fuzz: random legal playouts', () => {
  it('never throw and never break invariants', () => {
    for (let g = 0; g < 30; g++) {
      const n = g % 3 === 0 ? 3 : 4;
      const cfg = config({
        seed: `fuzz-${g}`,
        seats: config().seats.slice(0, n),
        layout: (['balanced', 'random', 'beginner'] as const)[g % 3],
        firstPlayer: 'rolloff',
        privacy: g % 2 === 0,
        targetVp: 8 + (g % 7),
      });
      randomPlayout(cfg, 1500, `fuzz-pick-${g}`);
    }
  });
});
