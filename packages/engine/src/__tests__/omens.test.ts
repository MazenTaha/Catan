import { describe, expect, it } from 'vitest';
import { getTopology } from '../board/topology';
import { OMEN_DECK_COUNTS, totalCards } from '../lexicon-keys';
import { Rng } from '../rng';
import { legalCausewaySpots, playableOmens, victoryPoints } from '../state/selectors';
import { buildOmenDeck } from '../state/setup';
import type { GameState, OwnedOmen } from '../state/types';
import { act, actEv, blankMain, blankRoll, edit, expectErr, newGame, setHand, totalResources } from './helpers';

const t = getTopology();

const give = (s: GameState, p: number, ...omens: OwnedOmen['type'][]) =>
  edit(s, (d) => {
    d.players[p].omens.push(...omens.map((type) => ({ type, boughtTurn: 0 })));
  });

describe('omen deck', () => {
  it('has 25 cards with the right composition, shuffled by seed', () => {
    const deck = buildOmenDeck(Rng.fromSeed('d'));
    expect(deck).toHaveLength(25);
    for (const [k, n] of Object.entries(OMEN_DECK_COUNTS)) {
      expect(deck.filter((x) => x === k)).toHaveLength(n);
    }
    expect(buildOmenDeck(Rng.fromSeed('d'))).toEqual(deck);
    expect(newGame({ seed: 'a' }).omenDeck).not.toEqual(newGame({ seed: 'b' }).omenDeck);
  });

  it('buying pays the cost, draws the top card and locks it this turn', () => {
    let s = setHand(blankMain(), 0, { wool: 1, grain: 1, ore: 1 });
    s = edit(s, (d) => d.omenDeck.push('warden'));
    const out = actEv(s, { type: 'BuyOmen', player: 0 });
    s = out.state;
    expect(s.players[0].omens).toEqual([{ type: 'warden', boughtTurn: 1 }]);
    expect(totalCards(s.players[0].hand)).toBe(0);
    expect(out.events[0]).toEqual({ type: 'OmenBought', player: 0, omen: 'warden' });
    expect(playableOmens(s, 0)).toHaveLength(0);
    expectErr(s, { type: 'PlayWarden', player: 0 }, 'CARD_LOCKED');
    expectErr(s, { type: 'BuyOmen', player: 0 }, 'CANNOT_AFFORD');
    const empty = setHand(edit(s, (d) => (d.omenDeck = [])), 0, { wool: 1, grain: 1, ore: 1 });
    expectErr(empty, { type: 'BuyOmen', player: 0 }, 'DECK_EMPTY');
    expectErr(blankRoll(), { type: 'BuyOmen', player: 0 }, 'MUST_ROLL');
  });

  it('only one non-Relic Omen per turn; Relics are never played', () => {
    let s = give(blankMain(), 0, 'tithe', 'tithe', 'relic');
    expect(playableOmens(s, 0).map((o) => o.type)).toEqual(['tithe', 'tithe']);
    s = act(s, { type: 'PlayBloodTithe', player: 0, resource: 'ore' });
    expectErr(s, { type: 'PlayBloodTithe', player: 0, resource: 'ore' }, 'OMEN_LIMIT');
    expectErr(blankMain(), { type: 'PlayWarden', player: 0 }, 'NO_CARD');
    expect(victoryPoints(s, 0)).toBe(1);
  });
});

describe('Warden', () => {
  it('before rolling: moves the Wraith then returns to the roll', () => {
    let s = give(blankRoll(), 0, 'warden');
    s = act(s, { type: 'PlayWarden', player: 0 });
    expect(s.phase).toEqual({ kind: 'move-wraith', reason: 'warden', resume: 'roll' });
    expect(s.players[0].playedWardens).toBe(1);
    s = act(s, { type: 'MoveWraith', player: 0, hex: s.wraithHex === 0 ? 1 : 0 });
    expect(s.phase.kind).toBe('roll');
  });

  it('after rolling: steals and returns to main', () => {
    let s = give(blankMain(), 0, 'warden');
    const h = s.wraithHex === 3 ? 4 : 3;
    s = edit(s, (d) => (d.buildings[t.hexVertices[h][0]] = { owner: 2, kind: 'outpost' }));
    s = setHand(s, 2, { clay: 1 });
    s = act(s, { type: 'PlayWarden', player: 0 });
    s = act(s, { type: 'MoveWraith', player: 0, hex: h });
    expect(s.players[0].hand.clay).toBe(1);
    expect(s.phase.kind).toBe('main');
  });
});

describe('Greatest Host', () => {
  it('needs 3 Wardens, transfers only on strictly more, holder keeps ties', () => {
    let s = edit(blankMain(), (d) => {
      d.players[1].playedWardens = 3;
      d.greatestHost.holder = 1;
      d.players[0].playedWardens = 2;
    });
    s = give(s, 0, 'warden');
    let out = actEv(s, { type: 'PlayWarden', player: 0 });
    expect(out.state.greatestHost.holder).toBe(1);
    s = edit(out.state, (d) => {
      d.phase = { kind: 'main' };
      d.omenPlayedThisTurn = false;
    });
    s = give(s, 0, 'warden');
    out = actEv(s, { type: 'PlayWarden', player: 0 });
    expect(out.state.greatestHost.holder).toBe(0);
    expect(out.events).toContainEqual({ type: 'GreatestHostChanged', holder: 0, previous: 1, count: 4 });
    expect(victoryPoints(out.state, 0)).toBe(2);
  });

  it('fewer than 3 never claims', () => {
    let s = give(blankMain(), 0, 'warden');
    s = act(s, { type: 'PlayWarden', player: 0 });
    expect(s.greatestHost.holder).toBeNull();
  });
});

describe('Pathmaker’s Decree', () => {
  function anchored(s: GameState) {
    const v = t.vertices.find((x) => t.vertexHexes[x].length === 3)!;
    return edit(s, (d) => (d.buildings[v] = { owner: 0, kind: 'outpost' }));
  }

  it('places two free causeways', () => {
    let s = give(anchored(blankMain()), 0, 'decree');
    s = act(s, { type: 'PlayDecree', player: 0 });
    expect(s.phase).toMatchObject({ kind: 'decree', remaining: 2 });
    expectErr(s, { type: 'EndTurn', player: 0 }, 'WRONG_PHASE');
    s = act(s, { type: 'BuildCauseway', player: 0, edge: legalCausewaySpots(s, 0)[0] });
    expect(s.phase).toMatchObject({ kind: 'decree', remaining: 1 });
    s = act(s, { type: 'BuildCauseway', player: 0, edge: legalCausewaySpots(s, 0)[0] });
    expect(s.phase.kind).toBe('main');
    expect(s.players[0].supply.causeways).toBe(13);
    expect(totalResources(s)).toBe(95);
  });

  it('places only one when only one legal spot exists', () => {
    // Outpost on a coastal degree-2 vertex: one edge taken by an opponent, the other
    // leads to an opponent outpost (cannot extend through it).
    const s0 = blankMain();
    const v = t.vertices.find((x) => t.vertexNeighbors[x].length === 2)!;
    const [e1, e2] = t.vertexEdges[v];
    const [a, b] = t.edgeVertices[e2];
    const w = a === v ? b : a;
    let s = edit(s0, (d) => {
      d.buildings[v] = { owner: 0, kind: 'outpost' };
      d.causeways[e1] = 1;
      d.buildings[w] = { owner: 1, kind: 'outpost' };
    });
    s = give(s, 0, 'decree');
    expect(legalCausewaySpots(s, 0)).toEqual([e2]);
    s = act(s, { type: 'PlayDecree', player: 0 });
    s = act(s, { type: 'BuildCauseway', player: 0, edge: e2 });
    expect(s.phase.kind).toBe('main');
    expect(s.players[0].supply.causeways).toBe(14);
  });

  it('cannot be played with nowhere to build or no supply; supply of one gives one', () => {
    const s = give(blankMain(), 0, 'decree');
    expectErr(s, { type: 'PlayDecree', player: 0 }, 'ILLEGAL_SPOT');
    const anchoredS = give(anchored(blankMain()), 0, 'decree');
    const none = edit(anchoredS, (d) => (d.players[0].supply.causeways = 0));
    expectErr(none, { type: 'PlayDecree', player: 0 }, 'NO_SUPPLY');
    const one = act(edit(anchoredS, (d) => (d.players[0].supply.causeways = 1)), { type: 'PlayDecree', player: 0 });
    expect(one.phase).toMatchObject({ kind: 'decree', remaining: 1 });
  });
});

describe('Harvest Pact', () => {
  it('takes two resources from the bank', () => {
    let s = give(blankMain(), 0, 'harvest');
    s = act(s, { type: 'PlayHarvestPact', player: 0, resources: ['ore', 'ore'] });
    expect(s.players[0].hand.ore).toBe(2);
    expect(s.bank.ore).toBe(17);
  });

  it('is limited by bank stock', () => {
    let s = give(blankMain(), 0, 'harvest');
    s = edit(s, (d) => {
      d.players[1].hand = { ...d.bank };
      d.bank = { wood: 0, clay: 0, wool: 0, grain: 0, ore: 1 };
      d.players[1].hand.ore -= 1;
    });
    expect(totalResources(s)).toBe(95);
    expectErr(s, { type: 'PlayHarvestPact', player: 0, resources: ['ore', 'wood'] }, 'INVALID');
    s = act(s, { type: 'PlayHarvestPact', player: 0, resources: ['ore'] });
    expect(s.players[0].hand.ore).toBe(1);
    const s2 = edit(give(blankMain(), 0, 'harvest'), (d) => {
      d.players[1].hand = { ...d.bank, ore: 18 };
      d.bank = { wood: 0, clay: 0, wool: 0, grain: 0, ore: 1 };
      d.bank.wool = 1;
      d.players[1].hand.wool -= 1;
    });
    expectErr(s2, { type: 'PlayHarvestPact', player: 0, resources: ['ore', 'ore'] }, 'BANK_EMPTY');
    const empty = edit(give(blankMain(), 0, 'harvest'), (d) => {
      d.players[1].hand = { ...d.bank };
      d.bank = { wood: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    });
    expectErr(empty, { type: 'PlayHarvestPact', player: 0, resources: [] }, 'BANK_EMPTY');
  });
});

describe('Blood Tithe', () => {
  it('takes all of the named resource from every other player', () => {
    let s = give(blankMain(), 0, 'tithe');
    s = setHand(s, 1, { grain: 3, ore: 1 });
    s = setHand(s, 2, { grain: 2 });
    s = setHand(s, 0, { grain: 1 });
    const out = actEv(s, { type: 'PlayBloodTithe', player: 0, resource: 'grain' });
    s = out.state;
    expect(s.players[0].hand.grain).toBe(6);
    expect(s.players[1].hand).toMatchObject({ grain: 0, ore: 1 });
    expect(out.events.at(-1)).toEqual({
      type: 'TitheTaken',
      player: 0,
      resource: 'grain',
      total: 5,
      from: [0, 3, 2, 0],
    });
    // @ts-expect-error bad resource
    expectErr(give(blankMain(), 0, 'tithe'), { type: 'PlayBloodTithe', player: 0, resource: 'gold' }, 'INVALID');
  });
});
