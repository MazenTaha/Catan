import { describe, expect, it } from 'vitest';
import { getTopology } from '../board/topology';
import { TERRAIN_RESOURCE, emptyCounts } from '../lexicon-keys';
import {
  activeActor,
  canAfford,
  expectedYield,
  handLimitRisk,
  legalCausewaySpots,
  legalCitadelSpots,
  legalOutpostSpots,
  missingResources,
  victoryPoints,
  vpBreakdown,
} from '../state/selectors';
import { createGame, validateConfig } from '../state/setup';
import type { GameState } from '../state/types';
import {
  act,
  actEv,
  autoSetup,
  blankMain,
  blankRoll,
  config,
  edit,
  expectErr,
  hexWith,
  newGame,
  resourceOf,
  rngForTotal,
  setHand,
  totalResources,
} from './helpers';

const t = getTopology();

describe('createGame', () => {
  it('validates configs', () => {
    expect(validateConfig(config())).toBeNull();
    expect(validateConfig(config({ targetVp: 7 }))).toMatch(/Target/);
    expect(validateConfig(config({ targetVp: 15 }))).toMatch(/Target/);
    const c = config();
    expect(validateConfig({ ...c, seats: c.seats.slice(0, 2) })).toMatch(/3 or 4/);
    expect(validateConfig({ ...c, seats: [c.seats[0], c.seats[0], c.seats[1]] })).toMatch(/unique/);
    expect(validateConfig({ ...c, seats: c.seats.map((x) => ({ ...x, name: ' ' })) })).toMatch(/name/);
    expect(validateConfig({ ...c, firstPlayer: 9 })).toMatch(/first/);
    expect(() => createGame({ ...c, targetVp: 1 })).toThrow();
  });

  it('initializes bank, supplies, deck and wraith', () => {
    const s = newGame();
    expect(s.bank).toEqual({ wood: 19, clay: 19, wool: 19, grain: 19, ore: 19 });
    expect(s.omenDeck).toHaveLength(25);
    for (const p of s.players) expect(p.supply).toEqual({ causeways: 15, outposts: 5, citadels: 4 });
    expect(s.board.hexes[s.wraithHex].terrain).toBe('waste');
    expect(s.phase).toEqual({ kind: 'setup', index: 0, step: 'outpost', lastOutpost: null });
  });

  it('rolls off for the first player when requested', () => {
    for (let i = 0; i < 10; i++) {
      const s = createGame(config({ seed: `ro-${i}`, firstPlayer: 'rolloff' }));
      const last = s.rollOff[s.rollOff.length - 1];
      const best = Math.max(...last.map((r) => r[1] + r[2]));
      const winners = last.filter((r) => r[1] + r[2] === best);
      expect(winners).toHaveLength(1);
      expect(s.firstPlayer).toBe(winners[0][0]);
      expect(s.setupOrder[0]).toBe(s.firstPlayer);
      expect(s.currentPlayer).toBe(s.firstPlayer);
    }
  });

  it('a 3-player game works', () => {
    const s = autoSetup(newGame({ seats: config().seats.slice(0, 3) }));
    expect(s.players).toHaveLength(3);
    expect(Object.keys(s.buildings)).toHaveLength(6);
  });
});

describe('setup phase', () => {
  it('follows snake order', () => {
    let s = newGame();
    const order: number[] = [];
    while (s.phase.kind === 'setup') {
      const p = s.currentPlayer;
      if (s.phase.step === 'outpost') {
        order.push(p);
        s = act(s, { type: 'PlaceSetupOutpost', player: p, vertex: legalOutpostSpots(s, p)[0] });
      } else {
        s = act(s, { type: 'PlaceSetupCauseway', player: p, edge: legalCausewaySpots(s, p)[0] });
      }
    }
    expect(order).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(s.phase.kind).toBe('roll');
    expect(s.turn).toBe(1);
    expect(s.round).toBe(1);
    expect(s.currentPlayer).toBe(0);
  });

  it('second outpost yields one resource per adjacent non-waste hex; first yields none', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) {
      const p = s.currentPlayer;
      s = act(s, { type: 'PlaceSetupOutpost', player: p, vertex: legalOutpostSpots(s, p)[0] });
      expect(s.players[p].hand).toEqual(emptyCounts());
      s = act(s, { type: 'PlaceSetupCauseway', player: p, edge: legalCausewaySpots(s, p)[0] });
    }
    const p = s.currentPlayer;
    const v = legalOutpostSpots(s, p).find((x) => t.vertexHexes[x].length === 3)!;
    const expected = emptyCounts();
    for (const h of t.vertexHexes[v]) {
      const r = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
      if (r) expected[r]++;
    }
    const out = actEv(s, { type: 'PlaceSetupOutpost', player: p, vertex: v });
    expect(out.state.players[p].hand).toEqual(expected);
    expect(out.events.some((e) => e.type === 'SetupResourcesGranted')).toBe(true);
    expect(totalResources(out.state)).toBe(95);
  });

  it('enforces the distance rule, including against your own outposts', () => {
    let s = newGame();
    const v = t.vertices[20];
    s = act(s, { type: 'PlaceSetupOutpost', player: 0, vertex: v });
    s = act(s, { type: 'PlaceSetupCauseway', player: 0, edge: legalCausewaySpots(s, 0)[0] });
    expectErr(s, { type: 'PlaceSetupOutpost', player: 1, vertex: t.vertexNeighbors[v][0] }, 'TOO_CLOSE');
    expectErr(s, { type: 'PlaceSetupOutpost', player: 1, vertex: v }, 'OCCUPIED');
    expectErr(s, { type: 'PlaceSetupOutpost', player: 1, vertex: 'nope' }, 'ILLEGAL_SPOT');
    expect(legalOutpostSpots(s, 1)).not.toContain(t.vertexNeighbors[v][0]);
  });

  it('the setup causeway must touch the outpost just placed', () => {
    let s = newGame();
    const v = t.vertices[20];
    expectErr(s, { type: 'PlaceSetupCauseway', player: 0, edge: t.edges[0] }, 'WRONG_PHASE');
    s = act(s, { type: 'PlaceSetupOutpost', player: 0, vertex: v });
    expectErr(s, { type: 'PlaceSetupOutpost', player: 0, vertex: t.vertices[40] }, 'WRONG_PHASE');
    const far = t.edges.find((e) => !t.edgeVertices[e].includes(v))!;
    expectErr(s, { type: 'PlaceSetupCauseway', player: 0, edge: far }, 'NOT_CONNECTED');
    expect(legalCausewaySpots(s, 0)).toEqual(t.vertexEdges[v]);
  });

  it('rejects out-of-turn actions', () => {
    const s = newGame();
    expectErr(s, { type: 'PlaceSetupOutpost', player: 2, vertex: t.vertices[0] }, 'NOT_YOUR_TURN');
    expectErr(s, { type: 'RollDice', player: 0 }, 'WRONG_PHASE');
    expectErr(s, { type: 'EndTurn', player: 0 }, 'WRONG_PHASE');
  });
});

describe('turn flow', () => {
  it('must roll before building or trading, then end turn advances', () => {
    let s = setHand(autoSetup(newGame()), 0, { wood: 1, clay: 1 });
    const edge = legalCausewaySpots(s, 0)[0];
    expectErr(s, { type: 'BuildCauseway', player: 0, edge }, 'MUST_ROLL');
    expectErr(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore' }, 'MUST_ROLL');
    expectErr(s, { type: 'EndTurn', player: 0 }, 'MUST_ROLL');
    s = edit(s, (d) => (d.rng = rngForTotal(5)));
    s = act(s, { type: 'RollDice', player: 0 });
    expect(s.dice![0] + s.dice![1]).toBe(5);
    expect(s.phase.kind).toBe('main');
    expectErr(s, { type: 'RollDice', player: 0 }, 'WRONG_PHASE');
    const out = actEv(s, { type: 'EndTurn', player: 0 });
    expect(out.state.currentPlayer).toBe(1);
    expect(out.state.turn).toBe(2);
    expect(out.state.phase.kind).toBe('roll');
    expect(out.events.map((e) => e.type)).toEqual(['TurnEnded', 'TurnStarted']);
  });

  it('round increments when play returns to the first player', () => {
    let s = autoSetup(newGame());
    for (let i = 0; i < 4; i++) {
      s = edit(s, (d) => (d.rng = rngForTotal(4)));
      s = act(s, { type: 'RollDice', player: s.currentPlayer });
      s = act(s, { type: 'EndTurn', player: s.currentPlayer });
    }
    expect(s.round).toBe(2);
    expect(s.turn).toBe(5);
    expect(s.currentPlayer).toBe(0);
  });

  it('rejects malformed and unknown actions', () => {
    const s = blankMain();
    expectErr(s, { type: 'EndTurn', player: 9 }, 'INVALID');
    // @ts-expect-error unknown type
    expectErr(s, { type: 'Teleport', player: 0 }, 'INVALID');
    expectErr(s, { type: 'AckPassDevice', player: 0 }, 'INVALID');
  });
});

describe('production', () => {
  function withBuilding(s: GameState, v: string, owner: number, kind: 'outpost' | 'citadel' = 'outpost') {
    return edit(s, (d) => {
      d.buildings[v] = { owner, kind };
    });
  }
  const roll = (s: GameState, total: number) =>
    actEv(edit(s, (d) => (d.rng = rngForTotal(total))), { type: 'RollDice', player: s.currentPlayer });

  it('pays outposts 1 and citadels 2; reports paying hexes', () => {
    let s = blankRoll();
    const h = hexWith(s, (x) => x.token === 8 && x.id !== s.wraithHex);
    const res = resourceOf(s, h);
    const [v0, , v2] = t.hexVertices[h];
    s = withBuilding(s, v0, 1, 'outpost');
    s = withBuilding(s, v2, 2, 'citadel');
    const out = roll(s, 8);
    expect(out.state.players[1].hand[res]).toBeGreaterThanOrEqual(1);
    expect(out.state.players[2].hand[res]).toBeGreaterThanOrEqual(2);
    const ev = out.events.find((e) => e.type === 'ResourcesProduced');
    expect(ev && ev.type === 'ResourcesProduced' && ev.hexes.includes(h)).toBe(true);
    expect(totalResources(out.state)).toBe(95);
  });

  it('the Wraith blocks its hex', () => {
    let s = blankRoll();
    const h = hexWith(s, (x) => x.token === 6);
    s = withBuilding(s, t.hexVertices[h][0], 1);
    s = edit(s, (d) => (d.wraithHex = h));
    const out = roll(s, 6);
    const res = resourceOf(s, h);
    const others = t.vertexHexes[t.hexVertices[h][0]].filter(
      (x) => x !== h && s.board.hexes[x].token === 6,
    );
    expect(others).toHaveLength(0);
    expect(out.state.players[1].hand[res]).toBe(0);
    const ev = out.events.find((e) => e.type === 'ResourcesProduced');
    expect(ev && ev.type === 'ResourcesProduced' && ev.blockedHex).toBe(h);
  });

  it('bank shortage: several owed players get nothing', () => {
    let s = blankRoll();
    const h = hexWith(s, (x) => x.token === 9);
    const res = resourceOf(s, h);
    s = withBuilding(s, t.hexVertices[h][0], 1);
    s = withBuilding(s, t.hexVertices[h][3], 2);
    s = edit(s, (d) => {
      d.players[3].hand[res] = d.bank[res] - 1;
      d.bank[res] = 1;
    });
    const out = roll(s, 9);
    expect(out.state.players[1].hand[res]).toBe(0);
    expect(out.state.players[2].hand[res]).toBe(0);
    expect(out.events).toContainEqual(
      expect.objectContaining({ type: 'ProductionShortage', resource: res, paid: null }),
    );
    expect(totalResources(out.state)).toBe(95);
  });

  it('bank shortage: a single owed player gets what remains', () => {
    let s = blankRoll();
    const h = hexWith(s, (x) => x.token === 10);
    const res = resourceOf(s, h);
    s = withBuilding(s, t.hexVertices[h][0], 1, 'citadel');
    s = edit(s, (d) => {
      d.players[3].hand[res] = d.bank[res] - 1;
      d.bank[res] = 1;
    });
    const out = roll(s, 10);
    expect(out.state.players[1].hand[res]).toBe(1);
    expect(out.state.bank[res]).toBe(0);
    expect(out.events).toContainEqual(
      expect.objectContaining({ type: 'ProductionShortage', paid: 1, amount: 1 }),
    );
  });

  it('expectedYield sums pips / 36', () => {
    let s = blankMain();
    const h = hexWith(s, (x) => x.token === 6);
    s = withBuilding(s, t.hexVertices[h][0], 0);
    const y = expectedYield(s, 0);
    expect(y[resourceOf(s, h)]).toBeGreaterThanOrEqual(5 / 36);
  });
});

describe('seven, discard, wraith and steal', () => {
  const seven = (s: GameState) =>
    actEv(edit(s, (d) => (d.rng = rngForTotal(7))), { type: 'RollDice', player: s.currentPlayer });

  it('discard thresholds: 7→0, 8→4, 9→4, 10→5, 15→7', () => {
    let s = blankRoll();
    s = setHand(s, 0, { wood: 7 });
    s = setHand(s, 1, { wood: 4, ore: 4 });
    s = setHand(s, 2, { grain: 9 });
    s = setHand(s, 3, { wool: 10 });
    const out = seven(s);
    expect(out.state.phase).toEqual({ kind: 'discard', pending: [0, 4, 4, 5] });
    expect(handLimitRisk(out.state.players[3])).toBe(5);
    expect(handLimitRisk(out.state.players[0])).toBe(0);
    expect(handLimitRisk({ ...out.state.players[0], hand: { ...emptyCounts(), ore: 15 } })).toBe(7);
  });

  it('discards resolve in order, validate counts, then the Wraith must move', () => {
    let s = blankRoll();
    s = setHand(s, 1, { wood: 4, ore: 4 });
    s = setHand(s, 2, { grain: 9 });
    s = seven(s).state;
    expect(activeActor(s)).toBe(1);
    expectErr(s, { type: 'Discard', player: 0, cards: {} }, 'INVALID');
    expectErr(s, { type: 'Discard', player: 1, cards: { wood: 3 } }, 'INVALID');
    expectErr(s, { type: 'Discard', player: 1, cards: { clay: 4 } }, 'CANNOT_AFFORD');
    expectErr(s, { type: 'Discard', player: 1, cards: { wood: -1, ore: 5 } }, 'INVALID');
    expectErr(s, { type: 'MoveWraith', player: 0, hex: 0 }, 'WRONG_PHASE');
    s = act(s, { type: 'Discard', player: 1, cards: { wood: 2, ore: 2 } });
    expect(activeActor(s)).toBe(2);
    s = act(s, { type: 'Discard', player: 2, cards: { grain: 4 } });
    expect(s.phase).toEqual({ kind: 'move-wraith', reason: 'seven', resume: 'main' });
    expect(s.players[2].hand.grain).toBe(5);
    expect(totalResources(s)).toBe(95);
  });

  it('the Wraith cannot stay on its hex; with no victim the steal is skipped', () => {
    let s = seven(blankRoll()).state;
    expect(s.phase.kind).toBe('move-wraith');
    expectErr(s, { type: 'MoveWraith', player: 0, hex: s.wraithHex }, 'ILLEGAL_SPOT');
    expectErr(s, { type: 'MoveWraith', player: 0, hex: 99 }, 'ILLEGAL_SPOT');
    expectErr(s, { type: 'MoveWraith', player: 1, hex: 0 }, 'NOT_YOUR_TURN');
    const target = s.wraithHex === 0 ? 1 : 0;
    const out = actEv(s, { type: 'MoveWraith', player: 0, hex: target });
    s = out.state;
    expect(s.wraithHex).toBe(target);
    expect(out.events.map((e) => e.type)).toContain('StealSkipped');
    expect(s.phase.kind).toBe('main');
  });

  it('a single victim is robbed automatically; own pieces and empty hands are ignored', () => {
    let s = blankRoll();
    const h = s.wraithHex === 0 ? 1 : 0;
    const vs = t.hexVertices[h];
    s = edit(s, (d) => {
      d.buildings[vs[0]] = { owner: 1, kind: 'outpost' };
      d.buildings[vs[2]] = { owner: 0, kind: 'outpost' };
      d.buildings[vs[4]] = { owner: 2, kind: 'outpost' };
    });
    s = setHand(s, 1, { ore: 2 });
    s = seven(s).state;
    const out = actEv(s, { type: 'MoveWraith', player: 0, hex: h });
    expect(out.state.players[0].hand.ore).toBe(1);
    expect(out.state.players[1].hand.ore).toBe(1);
    expect(out.events).toContainEqual({ type: 'Stolen', thief: 0, victim: 1, resource: 'ore' });
    expect(out.state.phase.kind).toBe('main');
  });

  it('several victims: the roller chooses', () => {
    let s = blankRoll();
    const h = s.wraithHex === 0 ? 1 : 0;
    const vs = t.hexVertices[h];
    s = edit(s, (d) => {
      d.buildings[vs[0]] = { owner: 1, kind: 'outpost' };
      d.buildings[vs[3]] = { owner: 2, kind: 'citadel' };
    });
    s = setHand(s, 1, { ore: 1 });
    s = setHand(s, 2, { wool: 1 });
    s = seven(s).state;
    s = act(s, { type: 'MoveWraith', player: 0, hex: h });
    expect(s.phase).toEqual({ kind: 'steal', candidates: [1, 2], resume: 'main' });
    expectErr(s, { type: 'StealFrom', player: 0, victim: 3 }, 'INVALID');
    s = act(s, { type: 'StealFrom', player: 0, victim: 2 });
    expect(s.players[0].hand.wool).toBe(1);
    expect(s.players[2].hand.wool).toBe(0);
    expect(s.phase.kind).toBe('main');
  });
});

describe('building', () => {
  function withRoad(s: GameState, owner: number) {
    // Outpost + a causeway leading away from it.
    const v = t.vertices.find((x) => t.vertexHexes[x].length === 3)!;
    const e = t.vertexEdges[v][0];
    return {
      s: edit(s, (d) => {
        d.buildings[v] = { owner, kind: 'outpost' };
        d.causeways[e] = owner;
        d.players[owner].supply.outposts--;
        d.players[owner].supply.causeways--;
      }),
      v,
      e,
    };
  }

  it('causeway: pays cost, needs connection and supply', () => {
    const { s: base } = withRoad(blankMain(), 0);
    expectErr(base, { type: 'BuildCauseway', player: 0, edge: legalCausewaySpots(base, 0)[0] }, 'CANNOT_AFFORD');
    let s = setHand(base, 0, { wood: 1, clay: 1 });
    const far = t.edges.find((e) => !legalCausewaySpots(s, 0).includes(e) && s.causeways[e] === undefined)!;
    expectErr(s, { type: 'BuildCauseway', player: 0, edge: far }, 'NOT_CONNECTED');
    const edge = legalCausewaySpots(s, 0)[0];
    s = act(s, { type: 'BuildCauseway', player: 0, edge });
    expect(s.causeways[edge]).toBe(0);
    expect(s.players[0].hand).toEqual(emptyCounts());
    expect(s.players[0].supply.causeways).toBe(13);
    expectErr(s, { type: 'BuildCauseway', player: 0, edge }, 'OCCUPIED');
    const dry = setHand(edit(s, (d) => (d.players[0].supply.causeways = 0)), 0, { wood: 1, clay: 1 });
    expectErr(dry, { type: 'BuildCauseway', player: 0, edge: legalCausewaySpots(dry, 0)[0] }, 'NO_SUPPLY');
  });

  it('causeways cannot extend through an opponent outpost', () => {
    let { s, e } = withRoad(blankMain(), 0);
    const [a, b] = t.edgeVertices[e];
    const tip = s.buildings[a] ? b : a;
    s = edit(s, (d) => (d.buildings[tip] = { owner: 1, kind: 'outpost' }));
    const beyond = t.vertexEdges[tip].filter((x) => x !== e);
    for (const x of beyond) expect(legalCausewaySpots(s, 0)).not.toContain(x);
  });

  it('outpost: must connect to own causeway, respects distance, pays cost', () => {
    let { s, v, e } = withRoad(blankMain(), 0);
    s = setHand(s, 0, { wood: 2, clay: 2, wool: 1, grain: 1 });
    const [a, b] = t.edgeVertices[e];
    const tip = a === v ? b : a;
    expectErr(s, { type: 'BuildOutpost', player: 0, vertex: tip }, 'TOO_CLOSE');
    const lonely = t.vertices.find((x) => legalOutpostSpots(s, 0).includes(x) === false && !s.buildings[x] && t.vertexNeighbors[x].every((n) => !s.buildings[n]))!;
    expectErr(s, { type: 'BuildOutpost', player: 0, vertex: lonely }, 'NOT_CONNECTED');
    const next = t.vertexEdges[tip].find((x) => x !== e)!;
    s = act(s, { type: 'BuildCauseway', player: 0, edge: next });
    const [c, d2] = t.edgeVertices[next];
    const far = c === tip ? d2 : c;
    expect(legalOutpostSpots(s, 0)).toContain(far);
    s = act(s, { type: 'BuildOutpost', player: 0, vertex: far });
    expect(s.buildings[far]).toEqual({ owner: 0, kind: 'outpost' });
    expect(s.players[0].supply.outposts).toBe(3);
    expect(victoryPoints(s, 0)).toBe(2);
  });

  it('citadel replaces an own outpost and returns it to supply', () => {
    let { s, v } = withRoad(blankMain(), 0);
    expect(legalCitadelSpots(s, 0)).toEqual([v]);
    expectErr(s, { type: 'BuildCitadel', player: 0, vertex: v }, 'CANNOT_AFFORD');
    s = setHand(s, 0, { grain: 2, ore: 3 });
    expect(canAfford(s.players[0].hand, 'citadel')).toBe(true);
    expect(missingResources(s.players[0].hand, 'outpost')).toEqual({ wood: 1, clay: 1, wool: 1 });
    expectErr(s, { type: 'BuildCitadel', player: 0, vertex: t.vertices[0] }, 'ILLEGAL_SPOT');
    const supplyBefore = s.players[0].supply.outposts;
    s = act(s, { type: 'BuildCitadel', player: 0, vertex: v });
    expect(s.buildings[v].kind).toBe('citadel');
    expect(s.players[0].supply.outposts).toBe(supplyBefore + 1);
    expect(s.players[0].supply.citadels).toBe(3);
    expect(vpBreakdown(s, 0)).toMatchObject({ citadels: 1, outposts: 0, total: 2 });
    expectErr(setHand(s, 0, { grain: 2, ore: 3 }), { type: 'BuildCitadel', player: 0, vertex: v }, 'ILLEGAL_SPOT');
    const noCit = setHand(edit(s, (d) => {
      d.buildings[t.vertices[0]] = { owner: 0, kind: 'outpost' };
      d.players[0].supply.citadels = 0;
    }), 0, { grain: 2, ore: 3 });
    expectErr(noCit, { type: 'BuildCitadel', player: 0, vertex: t.vertices[0] }, 'NO_SUPPLY');
  });

  it('outpost supply limit', () => {
    let { s, e, v } = withRoad(blankMain(), 0);
    const [a, b] = t.edgeVertices[e];
    const tip = a === v ? b : a;
    const next = t.vertexEdges[tip].find((x) => x !== e)!;
    s = edit(s, (d) => {
      d.causeways[next] = 0;
      d.players[0].supply.outposts = 0;
    });
    s = setHand(s, 0, { wood: 1, clay: 1, wool: 1, grain: 1 });
    const spot = legalOutpostSpots(s, 0)[0];
    expectErr(s, { type: 'BuildOutpost', player: 0, vertex: spot }, 'NO_SUPPLY');
  });
});

describe('victory', () => {
  it('a player wins on their own turn on reaching the target, with Relics counting', () => {
    let s = blankMain({ targetVp: 8 });
    s = edit(s, (d) => {
      const vs = t.vertices.filter((_, i) => i % 9 === 0).slice(0, 4);
      vs.forEach((v) => (d.buildings[v] = { owner: 0, kind: 'citadel' }));
    });
    // 8 VP from citadels but not checked until an action happens on player 0's turn.
    s = setHand(s, 0, { wood: 4 });
    const out = actEv(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore' });
    expect(out.state.phase).toEqual({ kind: 'ended', winner: 0 });
    expect(out.state.winner).toBe(0);
    expect(out.events.at(-1)?.type).toBe('GameWon');
    expectErr(out.state, { type: 'EndTurn', player: 0 }, 'GAME_OVER');
  });

  it('points reached by others do not end the game until their own turn', () => {
    let s = blankMain({ targetVp: 8 });
    s = edit(s, (d) => {
      const vs = t.vertices.filter((_, i) => i % 9 === 0).slice(0, 4);
      vs.forEach((v) => (d.buildings[v] = { owner: 1, kind: 'citadel' }));
    });
    const out = actEv(s, { type: 'EndTurn', player: 0 });
    // Player 1's turn begins: they win at once.
    expect(out.state.winner).toBe(1);
    expect(out.state.phase.kind).toBe('ended');
  });

  it('hidden Relics count toward the win but not public VP', () => {
    let s = blankMain({ targetVp: 8 });
    s = edit(s, (d) => {
      d.players[0].omens = Array.from({ length: 7 }, () => ({ type: 'relic' as const, boughtTurn: 0 }));
    });
    expect(victoryPoints(s, 0, false)).toBe(0);
    expect(victoryPoints(s, 0, true)).toBe(7);
    s = setHand(s, 0, { wool: 1, grain: 1, ore: 1 });
    s = edit(s, (d) => (d.omenDeck = [...d.omenDeck.filter((o) => o !== 'relic'), 'relic']));
    const out = actEv(s, { type: 'BuyOmen', player: 0 });
    expect(out.state.winner).toBe(0);
    const won = out.events.find((e) => e.type === 'GameWon');
    expect(won && won.type === 'GameWon' && won.breakdown[0].relics).toBe(8);
  });
});

describe('hot-seat privacy', () => {
  it('requires a device hand-off between human seats', () => {
    let s = createGame(config({ privacy: true }));
    expect(s.handoff).toBe(0);
    expectErr(s, { type: 'PlaceSetupOutpost', player: 0, vertex: t.vertices[0] }, 'AWAITING_HANDOFF');
    expectErr(s, { type: 'AckPassDevice', player: 1 }, 'AWAITING_HANDOFF');
    s = act(s, { type: 'AckPassDevice', player: 0 });
    expect(s.viewer).toBe(0);
    s = act(s, { type: 'PlaceSetupOutpost', player: 0, vertex: t.vertices[0] });
    expect(s.handoff).toBeNull();
    s = act(s, { type: 'PlaceSetupCauseway', player: 0, edge: legalCausewaySpots(s, 0)[0] });
    expect(s.handoff).toBe(1);
  });

  it('bots never need a hand-off and solo humans keep the view', () => {
    const seats = config().seats.map((x, i) => (i === 0 ? x : { ...x, kind: 'bot' as const }));
    const s = createGame(config({ seats, privacy: undefined }));
    expect(s.handoff).toBeNull();
    expect(s.viewer).toBe(0);
    expect(s.players[1].bot).toBe('warlord');
  });
});
