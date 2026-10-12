import { describe, expect, it } from 'vitest';
import { getTopology } from '../board/topology';
import { RESOURCES } from '../lexicon-keys';
import { activeActor, bankRates, bestBankRate } from '../state/selectors';
import { createGame } from '../state/setup';
import type { GameState } from '../state/types';
import { act, actEv, blankMain, config, edit, expectErr, setHand, totalResources } from './helpers';

const t = getTopology();

function trading(): GameState {
  let s = blankMain();
  s = setHand(s, 0, { wood: 3, clay: 1 });
  s = setHand(s, 1, { ore: 2 });
  s = setHand(s, 2, { ore: 1, wool: 1 });
  s = setHand(s, 3, {});
  return s;
}

describe('domestic trade', () => {
  it('offers to all go round in order; all declining closes the offer', () => {
    let s = trading();
    const out = actEv(s, { type: 'ProposeTrade', player: 0, give: { wood: 1 }, want: { ore: 1 }, to: 'all' });
    s = out.state;
    expect(s.phase.kind).toBe('trade');
    expect(activeActor(s)).toBe(1);
    expectErr(s, { type: 'RespondTrade', player: 2, response: 'decline' }, 'NOT_YOUR_TURN');
    expectErr(s, { type: 'BuildCauseway', player: 0, edge: t.edges[0] }, 'WRONG_PHASE');
    expectErr(s, { type: 'EndTurn', player: 0 }, 'WRONG_PHASE');
    s = act(s, { type: 'RespondTrade', player: 1, response: 'decline' });
    expect(activeActor(s)).toBe(2);
    s = act(s, { type: 'RespondTrade', player: 2, response: 'decline' });
    const last = actEv(s, { type: 'RespondTrade', player: 3, response: 'decline' });
    expect(last.state.phase.kind).toBe('main');
    expect(last.events.at(-1)).toEqual({ type: 'TradeClosed', reason: 'all-declined' });
  });

  it('accept swaps atomically and is logged', () => {
    let s = trading();
    s = act(s, { type: 'ProposeTrade', player: 0, give: { wood: 2 }, want: { ore: 1 }, to: [2] });
    expect(activeActor(s)).toBe(2);
    const out = actEv(s, { type: 'RespondTrade', player: 2, response: 'accept' });
    s = out.state;
    expect(s.players[0].hand).toMatchObject({ wood: 1, ore: 1 });
    expect(s.players[2].hand).toMatchObject({ wood: 2, ore: 0 });
    expect(s.stats.trades).toEqual([1, 0, 1, 0]);
    expect(out.events[0]).toMatchObject({ type: 'TradeCompleted', proposer: 0, accepter: 2 });
    expect(totalResources(s)).toBe(95);
  });

  it('a responder cannot accept without the requested cards', () => {
    let s = trading();
    s = act(s, { type: 'ProposeTrade', player: 0, give: { wood: 1 }, want: { ore: 1 }, to: [3] });
    expectErr(s, { type: 'RespondTrade', player: 3, response: 'accept' }, 'CANNOT_AFFORD');
  });

  it('counter-offers go back to the active player, who can accept', () => {
    let s = trading();
    s = act(s, { type: 'ProposeTrade', player: 0, give: { wood: 1 }, want: { ore: 2 }, to: 'all' });
    const out = actEv(s, {
      type: 'RespondTrade',
      player: 1,
      response: 'counter',
      give: { ore: 1 },
      want: { wood: 2 },
    });
    s = out.state;
    expect(out.events[0].type).toBe('TradeCountered');
    expect(s.phase.kind === 'trade' && s.phase.offer).toMatchObject({ proposer: 1, targets: [0], counterOf: 1 });
    expect(activeActor(s)).toBe(0);
    s = act(s, { type: 'RespondTrade', player: 0, response: 'accept' });
    expect(s.players[0].hand).toMatchObject({ wood: 1, ore: 1 });
    expect(s.players[1].hand).toMatchObject({ wood: 2, ore: 1 });
  });

  it('counter declined returns to the active player', () => {
    let s = trading();
    s = act(s, { type: 'ProposeTrade', player: 0, give: { wood: 1 }, want: { ore: 2 }, to: [1] });
    s = act(s, { type: 'RespondTrade', player: 1, response: 'counter', give: { ore: 1 }, want: { wood: 1 } });
    expectErr(
      s,
      { type: 'RespondTrade', player: 1, response: 'counter', give: { ore: 9 }, want: { wood: 1 } },
      'NOT_YOUR_TURN',
    );
    s = act(s, { type: 'RespondTrade', player: 0, response: 'decline' });
    expect(s.phase.kind).toBe('main');
  });

  it('rejects invalid offers', () => {
    const s = trading();
    const P = (give: object, want: object, to: number[] | 'all' = 'all') =>
      ({ type: 'ProposeTrade', player: 0, give, want, to }) as const;
    expectErr(s, P({}, { ore: 1 }), 'INVALID');
    expectErr(s, P({ wood: 1 }, {}), 'INVALID');
    expectErr(s, P({ wood: 1 }, { wood: 1, ore: 1 }), 'INVALID');
    expectErr(s, P({ ore: 1 }, { wood: 1 }), 'CANNOT_AFFORD');
    expectErr(s, P({ wood: 1 }, { ore: 1 }, [0]), 'INVALID');
    expectErr(s, P({ wood: 1 }, { ore: 1 }, []), 'INVALID');
    expectErr(s, P({ wood: 1.5 }, { ore: 1 }), 'INVALID');
    expectErr(s, P({ gold: 1 }, { ore: 1 }), 'INVALID');
    expectErr(s, { type: 'ProposeTrade', player: 1, give: { ore: 1 }, want: { wood: 1 }, to: [0] }, 'NOT_YOUR_TURN');
    const pre = edit(s, (d) => (d.phase = { kind: 'roll' }));
    expectErr(pre, P({ wood: 1 }, { ore: 1 }), 'MUST_ROLL');
    let open = act(s, P({ wood: 1 }, { ore: 1 }, [1]));
    expectErr(open, { type: 'RespondTrade', player: 1, response: 'counter', give: { ore: 5 }, want: { wood: 1 } }, 'CANNOT_AFFORD');
    expectErr(open, { type: 'CancelTrade', player: 1 }, 'NOT_YOUR_TURN');
    open = act(open, { type: 'CancelTrade', player: 0 });
    expect(open.phase.kind).toBe('main');
    expectErr(open, { type: 'CancelTrade', player: 0 }, 'WRONG_PHASE');
  });

  it('the proposer must still hold the cards when accepted', () => {
    let s = trading();
    s = act(s, { type: 'ProposeTrade', player: 0, give: { wood: 3 }, want: { ore: 1 }, to: [1] });
    s = edit(s, (d) => (d.players[0].hand.wood = 0));
    expectErr(s, { type: 'RespondTrade', player: 1, response: 'accept' }, 'CANNOT_AFFORD');
  });

  it('hot-seat: responders get the device, and the proposer may cancel while it is passed', () => {
    let s = createGame(config({ privacy: true }));
    s = edit(s, (d) => {
      d.phase = { kind: 'main' };
      d.turn = 1;
      d.hasRolled = true;
      d.handoff = null;
      d.viewer = 0;
      d.players[0].hand.wood = 2;
      d.bank.wood -= 2;
    });
    s = act(s, { type: 'ProposeTrade', player: 0, give: { wood: 1 }, want: { ore: 1 }, to: [2] });
    expect(s.handoff).toBe(2);
    expectErr(s, { type: 'RespondTrade', player: 2, response: 'decline' }, 'AWAITING_HANDOFF');
    const cancelled = act(s, { type: 'CancelTrade', player: 0 });
    expect(cancelled.handoff).toBeNull();
    s = act(s, { type: 'AckPassDevice', player: 2 });
    s = act(s, { type: 'RespondTrade', player: 2, response: 'decline' });
    expect(s.handoff).toBe(0);
  });
});

describe('maritime trade', () => {
  function harborState(kind: 'any' | 'wood' | 'ore') {
    const s = blankMain();
    const hb = s.board.harbors.find((h) => h.kind === kind)!;
    return edit(s, (d) => {
      d.buildings[hb.vertices[0]] = { owner: 0, kind: 'outpost' };
    });
  }

  it('4:1 with no harbor', () => {
    let s = setHand(blankMain(), 0, { wood: 5 });
    expect(bestBankRate(s, 0, 'wood')).toBe(4);
    const out = actEv(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore' });
    s = out.state;
    expect(s.players[0].hand).toMatchObject({ wood: 1, ore: 1 });
    expect(out.events[0]).toMatchObject({ type: 'BankTraded', rate: 4, giveCount: 4 });
    expect(totalResources(s)).toBe(95);
    expectErr(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore' }, 'CANNOT_AFFORD');
  });

  it('3:1 with a generic harbor', () => {
    const s = setHand(harborState('any'), 0, { clay: 3 });
    expect(bankRates(s, 0)).toEqual({ wood: 3, clay: 3, wool: 3, grain: 3, ore: 3 });
    const n = act(s, { type: 'BankTrade', player: 0, give: 'clay', receive: 'grain' });
    expect(n.players[0].hand).toMatchObject({ clay: 0, grain: 1 });
  });

  it('2:1 only for the matching resource of a specific harbor', () => {
    const s = setHand(harborState('wood'), 0, { wood: 4, ore: 2 });
    expect(bestBankRate(s, 0, 'wood')).toBe(2);
    expect(bestBankRate(s, 0, 'ore')).toBe(4);
    const n = act(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'wool', count: 2 });
    expect(n.players[0].hand).toMatchObject({ wood: 0, wool: 2 });
    expectErr(s, { type: 'BankTrade', player: 0, give: 'ore', receive: 'wool' }, 'CANNOT_AFFORD');
  });

  it('harbor access needs a building on a harbor vertex (not just nearby)', () => {
    const s = blankMain();
    const hb = s.board.harbors[0];
    const near = t.vertexNeighbors[hb.vertices[0]].find((v) => !hb.vertices.includes(v))!;
    const n = edit(s, (d) => (d.buildings[near] = { owner: 0, kind: 'outpost' }));
    for (const r of RESOURCES) expect(bestBankRate(n, 0, r)).toBe(4);
    const own = edit(s, (d) => (d.buildings[hb.vertices[1]] = { owner: 1, kind: 'citadel' }));
    expect(bestBankRate(own, 0, 'wood')).toBe(4);
    expect(bestBankRate(own, 1, hb.kind === 'any' ? 'wood' : hb.kind)).toBeLessThan(4);
  });

  it('rejects invalid bank trades', () => {
    const s = setHand(blankMain(), 0, { wood: 8 });
    expectErr(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'wood' }, 'INVALID');
    expectErr(s, { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore', count: 0 }, 'INVALID');
    // @ts-expect-error bad resource
    expectErr(s, { type: 'BankTrade', player: 0, give: 'gold', receive: 'ore' }, 'INVALID');
    const dry = edit(s, (d) => {
      d.players[1].hand.ore = d.bank.ore;
      d.bank.ore = 0;
    });
    expectErr(dry, { type: 'BankTrade', player: 0, give: 'wood', receive: 'ore' }, 'BANK_EMPTY');
  });
});
