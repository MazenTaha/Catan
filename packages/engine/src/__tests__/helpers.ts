import { expect } from 'vitest';
import { getTopology } from '../board/topology';
import { RESOURCES, TERRAIN_RESOURCE, type Resource, type ResourceCounts, toCounts } from '../lexicon-keys';
import { Rng } from '../rng';
import { applyAction, applyOrThrow } from '../rules/reducer';
import { activeActor, legalCausewaySpots, legalOutpostSpots } from '../state/selectors';
import { createGame } from '../state/setup';
import type { Action, GameConfig, GameEvent, GameState, SeatConfig } from '../state/types';
import { deepClone } from '../clone';

export const SEATS: SeatConfig[] = [
  { name: 'Ash', color: 'crimson', sigil: 'skull', kind: 'human' },
  { name: 'Frost', color: 'frost', sigil: 'moon', kind: 'human' },
  { name: 'Bone', color: 'bone', sigil: 'eye', kind: 'human' },
  { name: 'Vex', color: 'violet', sigil: 'thorn', kind: 'human' },
];

export function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 'test-seed',
    seats: SEATS.slice(0, over.seats?.length ?? 4),
    targetVp: 10,
    layout: 'balanced',
    firstPlayer: 0,
    privacy: false,
    ...over,
  };
}

export function newGame(over: Partial<GameConfig> = {}): GameState {
  return createGame(config(over));
}

export function act(s: GameState, a: Action): GameState {
  return applyOrThrow(s, a).state;
}

export function actEv(s: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  return applyOrThrow(s, a);
}

export function expectErr(s: GameState, a: Action, code: string): void {
  const r = applyAction(s, a);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe(code);
}

/** Plays the setup phase by taking the first legal spot each time. */
export function autoSetup(s: GameState): GameState {
  while (s.phase.kind === 'setup') {
    const p = activeActor(s);
    if (s.handoff !== null) {
      s = act(s, { type: 'AckPassDevice', player: s.handoff });
      continue;
    }
    if (s.phase.step === 'outpost') {
      s = act(s, { type: 'PlaceSetupOutpost', player: p, vertex: legalOutpostSpots(s, p)[0] });
    } else {
      s = act(s, { type: 'PlaceSetupCauseway', player: p, edge: legalCausewaySpots(s, p)[0] });
    }
  }
  return s;
}

/** An RNG state that makes the next two dice sum to `total`. */
export function rngForTotal(total: number, skip = 0): number {
  let found = 0;
  for (let x = 1; x < 1e6; x++) {
    const r = new Rng(x);
    if (r.die() + r.die() === total && found++ === skip) return x;
  }
  throw new Error('no rng');
}

/** Clone with direct edits (tests only). Keeps the bank consistent when hands change. */
export function edit(s: GameState, fn: (d: GameState) => void): GameState {
  const d = deepClone(s);
  fn(d);
  return d;
}

export function setHand(s: GameState, p: number, hand: Partial<ResourceCounts>): GameState {
  return edit(s, (d) => {
    const next = toCounts(hand);
    for (const r of RESOURCES) {
      d.bank[r] += d.players[p].hand[r] - next[r];
    }
    d.players[p].hand = next;
  });
}

/** Empty board in main phase with player 0 to act (rolled). */
export function blankMain(over: Partial<GameConfig> = {}): GameState {
  return edit(newGame(over), (d) => {
    d.phase = { kind: 'main' };
    d.turn = 1;
    d.round = 1;
    d.hasRolled = true;
    d.currentPlayer = 0;
  });
}

export function blankRoll(over: Partial<GameConfig> = {}): GameState {
  return edit(blankMain(over), (d) => {
    d.phase = { kind: 'roll' };
    d.hasRolled = false;
  });
}

export function hexWith(s: GameState, pred: (h: GameState['board']['hexes'][number]) => boolean): number {
  const h = s.board.hexes.find(pred);
  if (!h) throw new Error('no hex');
  return h.id;
}

export function resourceOf(s: GameState, hex: number): Resource {
  return TERRAIN_RESOURCE[s.board.hexes[hex].terrain]!;
}

/** A vertex of `hex` touching only that hex among hexes with the same token. */
export function vertexOf(hex: number, k = 0): string {
  return getTopology().hexVertices[hex][k];
}

export function totalResources(s: GameState): number {
  let n = 0;
  for (const r of RESOURCES) {
    n += s.bank[r];
    for (const p of s.players) n += p.hand[r];
  }
  return n;
}
