import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeActor, decideAction, type GameState } from '@hexfall/engine';
import { defaultSettings, type ServerMsg } from '@hexfall/net';
import { Hub } from '../hub';

function client(hub: Hub) {
  const inbox: ServerMsg[] = [];
  const conn = hub.connect((m) => inbox.push(m));
  const send = (m: object) => conn.onMessage(JSON.stringify(m));
  const last = <T extends ServerMsg['t']>(t: T) =>
    [...inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  return { inbox, send, last, close: conn.onClose };
}

const me = { name: 'Mazen', color: 'crimson', sigil: 'skull' };
const friend = { name: 'Sara', color: 'crimson', sigil: 'moon' };

describe('hub', () => {
  let hub: Hub;
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new Hub({
      botDelay: () => 10,
      autopilotAfter: 1000,
      idleRoomTtl: 5000,
      random: Math.random,
      now: () => Date.now(),
    });
  });
  afterEach(() => vi.useRealTimers());

  it('hosts a room, lets a friend join by code, and seats them', () => {
    const h = client(hub);
    h.send({ t: 'host', profile: me, settings: defaultSettings('s1') });
    const code = h.last('welcome')!.code;
    expect(code).toMatch(/^[A-Z]+-\d{2}$/);

    const f = client(hub);
    f.send({ t: 'join', code: code.toLowerCase().replace('-', ' '), profile: friend });
    expect(f.last('welcome')?.host).toBe(false);
    const lobby = h.last('lobby')!.lobby;
    expect(lobby.seats.map((s) => s.kind)).toEqual(['host', 'remote', 'open', 'open']);
    // Same colour as the host: the joiner gets a free one.
    const seat = lobby.seats[1];
    expect(seat.kind === 'remote' && seat.profile.color).not.toBe('crimson');
  });

  it('rejects unknown codes and only lets the host change the table', () => {
    const f = client(hub);
    f.send({ t: 'join', code: 'NOPE-11', profile: friend });
    expect(f.last('error')?.fatal).toBe(true);

    const h = client(hub);
    h.send({ t: 'host', profile: me, settings: defaultSettings('s1') });
    const g = client(hub);
    g.send({ t: 'join', code: h.last('welcome')!.code, profile: friend });
    g.send({ t: 'fill-bots' });
    expect(h.last('lobby')!.lobby.seats[2].kind).toBe('open');
    h.send({ t: 'start' });
    expect(h.last('error')?.message).toMatch(/Waiting for 2 more/);
  });

  it('plays a game: checks whose move it is, hides cards, runs the bots', () => {
    const h = client(hub);
    h.send({
      t: 'host',
      profile: me,
      settings: { ...defaultSettings('s2'), players: 3, rollOff: false },
    });
    const code = h.last('welcome')!.code;
    const f = client(hub);
    f.send({ t: 'join', code, profile: friend });
    h.send({ t: 'fill-bots' });
    h.send({ t: 'start' });
    const game = h.last('game')!;
    expect(game.full).toBe(true);
    expect(game.seats).toEqual([0]);
    expect(f.last('game')!.seats).toEqual([1]);

    // The friend can't move for the host.
    const s: GameState = game.state;
    expect(activeActor(s)).toBe(0);
    f.send({ t: 'action', action: { ...decideAction(s), player: 0 } });
    expect(f.last('error')?.message).toMatch(/not your move/);

    // Drive both humans with the bot brain until the bot seat has played too.
    let guard = 0;
    while (guard++ < 400) {
      const latest = h.last('game')!.state;
      if (latest.phase.kind === 'roll' || latest.phase.kind === 'main') break;
      const actor = activeActor(latest);
      if (actor === 2) {
        vi.advanceTimersByTime(20);
        continue;
      }
      // Decide on the friend's own (unredacted for them) view.
      const view = actor === 0 ? h.last('game')!.state : f.last('game')!.state;
      (actor === 0 ? h : f).send({ t: 'action', action: decideAction(view) });
    }
    const after = h.last('game')!.state;
    expect(['roll', 'main']).toContain(after.phase.kind);
    // Setup gave everyone buildings; the host can't see the friend's cards.
    expect(Object.keys(after.buildings)).toHaveLength(6);
    const theirs = after.players[1].hand;
    expect(theirs.clay + theirs.wool + theirs.grain + theirs.ore).toBe(0);
  });

  it('lets a player reconnect with their token and plays for them if they stay away', () => {
    const h = client(hub);
    h.send({
      t: 'host',
      profile: me,
      settings: { ...defaultSettings('s3'), players: 3, rollOff: false },
    });
    const code = h.last('welcome')!.code;
    const f = client(hub);
    f.send({ t: 'join', code, profile: friend });
    const token = f.last('welcome')!.token;
    h.send({ t: 'fill-bots' });
    h.send({ t: 'start' });

    // Host places, friend drops out before their turn.
    f.close();
    let guard = 0;
    while (guard++ < 50 && activeActor(h.last('game')!.state) === 0) {
      h.send({ t: 'action', action: decideAction(h.last('game')!.state) });
    }
    expect(activeActor(h.last('game')!.state)).toBe(1);
    const before = h.last('game')!.state.actionCount;
    vi.advanceTimersByTime(1100); // autopilot kicks in for the absent friend
    expect(h.last('game')!.state.actionCount).toBeGreaterThan(before);

    const back = client(hub);
    back.send({ t: 'resume', code, token });
    expect(back.last('game')?.full).toBe(true);
    expect(back.last('game')?.seats).toEqual([1]);
  });

  it('closes a lobby when the host leaves and forgets empty rooms', () => {
    const h = client(hub);
    h.send({ t: 'host', profile: me, settings: defaultSettings('s4') });
    const code = h.last('welcome')!.code;
    const f = client(hub);
    f.send({ t: 'join', code, profile: friend });
    h.send({ t: 'leave' });
    expect(f.last('closed')?.reason).toMatch(/host closed/);
    expect(hub.rooms.has(code)).toBe(false);

    const h2 = client(hub);
    h2.send({ t: 'host', profile: me, settings: defaultSettings('s5') });
    h2.close();
    vi.advanceTimersByTime(6000);
    hub.sweep();
    expect(hub.rooms.size).toBe(0);
  });
});
