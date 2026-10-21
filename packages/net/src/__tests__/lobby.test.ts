import { describe, expect, it } from 'vitest';
import { createGame } from '@hexfall/engine';
import {
  createLobby,
  defaultSettings,
  fillWithBots,
  lobbyToConfig,
  makeRoomCode,
  normalizeCode,
  redactFor,
  seatRemote,
  seatsOf,
  setSeat,
  startProblem,
} from '../index';

const host = { name: 'Mazen', color: 'frost', sigil: 'moon' } as const;

describe('lobby', () => {
  it('starts with the host and three open seats', () => {
    const l = createLobby('DUSK-42', host, 'h', defaultSettings('seed'));
    expect(l.seats.map((s) => s.kind)).toEqual(['host', 'open', 'open', 'open']);
    expect(startProblem(l)).toMatch(/Waiting for 3 more players/);
  });

  it('seats joiners in the first open chair and keeps colours unique', () => {
    let l = createLobby('DUSK-42', host, 'h', defaultSettings('seed'));
    const r = seatRemote(l, { name: 'Sara', color: 'frost', sigil: 'moon' }, 'c1')!;
    l = r.lobby;
    expect(r.seat).toBe(1);
    const p = l.seats[1].kind === 'remote' ? l.seats[1].profile : null;
    expect(p?.color).not.toBe('frost');
    expect(p?.sigil).not.toBe('moon');
    expect(seatsOf(l, 'c1')).toEqual([1]);
  });

  it('lets the host fill seats with bots and start', () => {
    let l = createLobby('DUSK-42', host, 'h', { ...defaultSettings('seed'), players: 3 });
    l = setSeat(l, 1, { kind: 'local' });
    l = fillWithBots(l);
    expect(startProblem(l)).toBeNull();
    expect(seatsOf(l, 'h')).toEqual([0, 1]);
    const cfg = lobbyToConfig(l);
    expect(cfg.seats.map((s) => s.kind)).toEqual(['human', 'human', 'bot']);
    expect(() => createGame(cfg)).not.toThrow();
  });

  it('refuses joiners when the table is full', () => {
    const l = fillWithBots(createLobby('DUSK-42', host, 'h', defaultSettings('seed')));
    expect(seatRemote(l, host, 'x')).toBeNull();
  });
});

describe('codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeCode(' dusk 42 ')).toBe('DUSK-42');
    expect(normalizeCode('ember-07')).toBe('EMBER-07');
    expect(makeRoomCode(() => 0.5)).toMatch(/^[A-Z]+-\d{2}$/);
  });
});

describe('redaction', () => {
  it("hides opponents' cards but keeps hand sizes", () => {
    const l = fillWithBots(createLobby('DUSK-42', host, 'h', defaultSettings('seed')));
    const s = createGame(lobbyToConfig(l));
    s.players[1].hand = { wood: 2, clay: 1, wool: 0, grain: 3, ore: 0 };
    const r = redactFor(s, [0]);
    expect(r.players[1].hand).toEqual({ wood: 6, clay: 0, wool: 0, grain: 0, ore: 0 });
    expect(r.rng).toBe(0);
    expect(r.players[0]).toBe(s.players[0]);
  });
});
