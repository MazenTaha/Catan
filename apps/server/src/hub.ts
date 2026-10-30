import { randomBytes } from 'node:crypto';
import {
  activeActor,
  applyAction,
  createGame,
  decideAction,
  type Action,
  type GameEvent,
  type GameState,
} from '@hexfall/engine';
import {
  REACH,
  cleanPose,
  cleanProfile,
  clampSettings,
  createLobby,
  fillWithBots,
  lobbyToConfig,
  makeRoomCode,
  normalizeCode,
  parries,
  redactEvents,
  redactFor,
  removeClient,
  seatRemote,
  seatsOf,
  setConnected,
  setSeat,
  startProblem,
  type ClientMsg,
  type Lobby,
  type Pose,
  type ServerMsg,
} from '@hexfall/net';

export type Send = (msg: ServerMsg) => void;

export interface HubOptions {
  /** How long a bot "thinks" before it moves (ms). */
  botDelay: () => number;
  /** How long a disconnected player's turn waits before the computer plays it for them (ms). */
  autopilotAfter: number;
  /** How long an empty room is kept for people to reconnect (ms). */
  idleRoomTtl: number;
  random: () => number;
  now: () => number;
  /** How often everyone's 3D-walk positions go out (ms). */
  poseEvery: number;
  /** How long a duellist may stay out of the 3D walk before yielding (ms). */
  duelAbsence: number;
}

export const DEFAULT_OPTIONS: HubOptions = {
  botDelay: () => 700 + Math.random() * 700,
  autopilotAfter: 45_000,
  idleRoomTtl: 15 * 60_000,
  random: Math.random,
  now: Date.now,
  poseEvery: 100,
  duelAbsence: 90_000,
};

/** A position counts as current for this long (ms); hits need both fighters current. */
const POSE_FRESH = 1500;
/** Latency slack on top of a weapon's reach (m). */
const REACH_SLACK = 1.5;
/** Fastest repeat of any blow (ms): the sword's swing is 580 ms. */
const STRIKE_GAP = 300;

const id = (bytes = 9) => randomBytes(bytes).toString('base64url');

class Room {
  lobby: Lobby;
  state: GameState | null = null;
  /** client id → reconnect token */
  readonly tokens = new Map<string, string>();
  /** client id → live connection */
  readonly conns = new Map<string, Send>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  emptySince: number | null = null;
  /** Each seat's avatar in the 3D walk, with when it was last heard. */
  readonly poses: ({ pose: Pose; at: number } | null)[] = [];
  private poseTimer: ReturnType<typeof setInterval> | null = null;
  private lastStrike: number[] = [];
  /** When each seat last fired, so a revolver hit needs a shot just before it. */
  private shotAt: number[] = [];
  /** Duel watchdog: how long each duellist has been away from the 3D walk (ms). */
  private away: number[] = [];

  constructor(
    readonly code: string,
    readonly host: string,
    lobby: Lobby,
    private opts: HubOptions,
  ) {
    this.lobby = lobby;
  }

  get started() {
    return this.state !== null;
  }

  send(client: string, msg: ServerMsg) {
    this.conns.get(client)?.(msg);
  }

  broadcastLobby() {
    for (const client of this.conns.keys()) this.send(client, { t: 'lobby', lobby: this.lobby });
  }

  broadcastGame(events: GameEvent[], full = false) {
    const state = this.state!;
    const ended = state.phase.kind === 'ended';
    for (const client of this.conns.keys()) this.sendGame(client, events, full, ended);
  }

  sendGame(
    client: string,
    events: GameEvent[],
    full: boolean,
    ended = this.state!.phase.kind === 'ended',
  ) {
    const mine = seatsOf(this.lobby, client);
    this.send(client, {
      t: 'game',
      lobby: this.lobby,
      seats: mine,
      state: redactFor(this.state!, mine),
      events: redactEvents(events, mine, ended),
      full,
    });
  }

  start() {
    this.state = createGame(lobbyToConfig(this.lobby));
    this.broadcastGame([{ type: 'GameStarted', firstPlayer: this.state.firstPlayer }], true);
    this.pump();
  }

  /** A seat's avatar moved (or left the 3D walk); positions go out on a short timer. */
  setPose(seat: number, pose: Pose | null) {
    this.poses[seat] = pose ? { pose, at: this.opts.now() } : null;
    if (!this.poseTimer && this.poses.some(Boolean)) {
      this.poseTimer = setInterval(() => this.sendPoses(), this.opts.poseEvery);
    }
  }

  private sendPoses() {
    const now = this.opts.now();
    const poses = this.lobby.seats.map((_, i) => {
      const p = this.poses[i];
      return p && now - p.at < POSE_FRESH * 4 ? p.pose : null;
    });
    if (!poses.some(Boolean) && this.poseTimer && this.state?.phase.kind !== 'duel') {
      clearInterval(this.poseTimer);
      this.poseTimer = null;
    }
    for (const client of this.conns.keys()) this.send(client, { t: 'poses', poses });
    this.watchDuel(now);
  }

  /**
   * Hits are found in the attacker's browser; the server checks they are possible: both
   * fighters are in the 3D walk, within reach, not striking too fast, and a revolver hit
   * follows a shot. It decides parries itself, from the defender's guard and facing.
   */
  checkStrike(a: Extract<Action, { type: 'Strike' }>): string | Action {
    const now = this.opts.now();
    // Each shot can land once, whether or not this hit is accepted.
    const shot = this.shotAt[a.player] ?? -Infinity;
    if (a.weapon === 'revolver') this.shotAt[a.player] = -Infinity;
    const me = this.poses[a.player];
    const them = this.poses[a.victim];
    if (!me || !them || now - me.at > POSE_FRESH || now - them.at > POSE_FRESH)
      return 'Both fighters must be in the 3D walk';
    const d = Math.hypot(me.pose.x - them.pose.x, me.pose.z - them.pose.z);
    if (d > (REACH[a.weapon] ?? 0) + REACH_SLACK) return 'Out of reach';
    if (now - (this.lastStrike[a.player] ?? -Infinity) < STRIKE_GAP) return 'Too fast';
    if (a.weapon === 'revolver' && now - shot > 1500) return 'No shot was fired';
    this.lastStrike[a.player] = now;
    return { ...a, parried: parries(them.pose, me.pose) };
  }

  noteShot(seat: number) {
    this.shotAt[seat] = this.opts.now();
  }

  /** A duellist who stays out of the 3D walk (or offline) too long yields the duel. */
  private watchDuel(now: number) {
    const s = this.state;
    if (!s || s.phase.kind !== 'duel') {
      this.away = [];
      return;
    }
    for (const seat of [s.phase.challenger, s.phase.target]) {
      const p = this.poses[seat];
      const here = !!p && now - p.at < POSE_FRESH;
      this.away[seat] = here ? 0 : (this.away[seat] ?? 0) + this.opts.poseEvery;
      if (this.away[seat] >= this.opts.duelAbsence) {
        this.away = [];
        this.act({ type: 'YieldDuel', player: seat });
        return;
      }
    }
  }

  /** Applies one move, tells everyone, and lines up the next computer move if any. */
  act(action: Parameters<typeof applyAction>[1]): string | null {
    if (!this.state) return 'The game has not started';
    const r = applyAction(this.state, action);
    if (!r.ok) return r.error.message;
    this.state = r.value.state;
    this.broadcastGame(r.value.events);
    this.pump();
    return null;
  }

  /** Who sits in the chair that must act now, and is anyone there to act? */
  private pump() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    if (!s || s.phase.kind === 'ended') return;
    // A duel pauses the board; the watchdog (driven by the position timer) ends a stalled one.
    if (s.phase.kind === 'duel') {
      if (!this.poseTimer) this.poseTimer = setInterval(() => this.sendPoses(), this.opts.poseEvery);
      return;
    }
    const seat = this.lobby.seats[activeActor(s)];
    let delay: number | null = null;
    if (seat.kind === 'bot') delay = this.opts.botDelay();
    else if ((seat.kind === 'host' || seat.kind === 'remote') && !seat.connected)
      delay = this.opts.autopilotAfter;
    else if (seat.kind === 'local') {
      const host = this.lobby.seats[0];
      if (host.kind === 'host' && !host.connected) delay = this.opts.autopilotAfter;
    }
    if (delay === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state !== s) return;
      this.act(decideAction(s));
    }, delay);
  }

  connected(client: string, send: Send) {
    this.conns.set(client, send);
    this.lobby = setConnected(this.lobby, client, true);
    this.emptySince = null;
    if (this.started) {
      this.sendGame(client, [], true);
      // Others see the player is back; a waiting autopilot is cancelled.
      for (const c of this.conns.keys()) if (c !== client) this.sendGame(c, [], false);
      this.pump();
    } else this.broadcastLobby();
  }

  disconnected(client: string) {
    this.conns.delete(client);
    for (const seat of seatsOf(this.lobby, client)) this.poses[seat] = null;
    this.lobby = setConnected(this.lobby, client, false);
    if (this.conns.size === 0) this.emptySince = this.opts.now();
    if (this.started) {
      for (const c of this.conns.keys()) this.sendGame(c, [], false);
      this.pump();
    } else this.broadcastLobby();
  }

  close(reason: string) {
    if (this.timer) clearTimeout(this.timer);
    if (this.poseTimer) clearInterval(this.poseTimer);
    this.poseTimer = null;
    for (const client of this.conns.keys()) this.send(client, { t: 'closed', reason });
    this.conns.clear();
  }
}

/** All rooms on this server. Socket-agnostic: each connection is just a `send` function. */
export class Hub {
  readonly rooms = new Map<string, Room>();
  private byToken = new Map<string, { code: string; client: string }>();

  constructor(private opts: HubOptions = DEFAULT_OPTIONS) {}

  /** Returns the handlers for one new connection. */
  connect(send: Send) {
    let room: Room | null = null;
    let client: string | null = null;
    const fail = (message: string, fatal = false) => send({ t: 'error', message, fatal });

    const attach = (r: Room, c: string, token: string) => {
      room = r;
      client = c;
      send({ t: 'welcome', code: r.code, token, client: c, host: c === r.host });
      r.connected(c, send);
    };

    const onMessage = (raw: string) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw) as ClientMsg;
      } catch {
        return fail('That message could not be read');
      }
      if (msg.t === 'ping') return send({ t: 'pong' });

      if (!room || !client) {
        if (msg.t === 'host') {
          const code = this.freeCode();
          const c = id();
          const token = id(18);
          const lobby = createLobby(
            code,
            cleanProfile(msg.profile),
            c,
            clampSettings(msg.settings),
          );
          const r = new Room(code, c, lobby, this.opts);
          r.tokens.set(c, token);
          this.rooms.set(code, r);
          this.byToken.set(token, { code, client: c });
          return attach(r, c, token);
        }
        if (msg.t === 'join') {
          const r = this.rooms.get(normalizeCode(msg.code));
          if (!r) return fail('No game with that code. Check the code with your host.', true);
          if (r.started) return fail('That game has already started.', true);
          const c = id();
          const seated = seatRemote(r.lobby, cleanProfile(msg.profile), c);
          if (!seated) return fail('That table is full.', true);
          r.lobby = seated.lobby;
          const token = id(18);
          r.tokens.set(c, token);
          this.byToken.set(token, { code: r.code, client: c });
          return attach(r, c, token);
        }
        if (msg.t === 'resume') {
          const t = this.byToken.get(msg.token);
          const r = t && this.rooms.get(t.code);
          if (!t || !r || t.code !== normalizeCode(msg.code))
            return fail('That game is no longer available.', true);
          return attach(r, t.client, msg.token);
        }
        return fail('Host or join a game first');
      }

      const r: Room = room;
      const c: string = client;
      const isHost = c === r.host;
      switch (msg.t) {
        case 'settings':
          if (!isHost || r.started) return;
          r.lobby = { ...r.lobby, settings: clampSettings(msg.settings) };
          // Dropping to 3 players can't remove someone who joined.
          if (r.lobby.settings.players === 3 && r.lobby.seats[3].kind === 'remote') {
            r.lobby = { ...r.lobby, settings: { ...r.lobby.settings, players: 4 } };
            fail('Someone is sitting in seat 4 — remove them first to play with 3.');
          }
          return r.broadcastLobby();
        case 'seat':
          if (!isHost || r.started) return;
          r.lobby = setSeat(r.lobby, msg.index, msg.choice);
          return r.broadcastLobby();
        case 'fill-bots':
          if (!isHost || r.started) return;
          r.lobby = fillWithBots(r.lobby);
          return r.broadcastLobby();
        case 'kick': {
          if (!isHost || r.started) return;
          const seat = r.lobby.seats[msg.index];
          if (seat?.kind !== 'remote') return;
          r.send(seat.client, { t: 'closed', reason: 'The host removed you from the table.' });
          this.forget(r, seat.client);
          r.lobby = removeClient(r.lobby, seat.client);
          return r.broadcastLobby();
        }
        case 'start': {
          if (!isHost || r.started) return;
          const problem = startProblem(r.lobby);
          if (problem) return fail(problem);
          return r.start();
        }
        case 'action': {
          if (!r.started) return fail('The game has not started');
          if (!seatsOf(r.lobby, c).includes(msg.action.player)) return fail('It is not your move');
          let action: Action = msg.action;
          if (action.type === 'Strike') {
            const checked = r.checkStrike(action);
            // A blow that can't have landed is dropped quietly: it was a near miss.
            if (typeof checked === 'string') return;
            action = checked;
          }
          const err = r.act(action);
          if (err) fail(err);
          else if (action.type === 'Fire') r.noteShot(action.player);
          return;
        }
        case 'pose': {
          if (!r.started) return;
          const seat = seatsOf(r.lobby, c)[0];
          if (seat !== undefined) r.setPose(seat, cleanPose(msg.pose));
          return;
        }
        case 'leave':
          if (!r.started) {
            if (isHost) {
              r.close('The host closed the room.');
              this.drop(r);
            } else {
              this.forget(r, c);
              r.lobby = removeClient(r.lobby, c);
              r.disconnected(c);
            }
          } else {
            // Mid-game: the seat stays and the computer plays it until the game ends.
            this.forget(r, c);
            r.disconnected(c);
          }
          room = null;
          client = null;
          return;
        default:
          return fail('Unknown message');
      }
    };

    const onClose = () => {
      if (room && client) room.disconnected(client);
      room = null;
      client = null;
    };

    return { onMessage, onClose };
  }

  /** Drops rooms nobody has been connected to for a while. */
  sweep() {
    const now = this.opts.now();
    for (const r of this.rooms.values()) {
      if (r.emptySince !== null && now - r.emptySince > this.opts.idleRoomTtl) this.drop(r);
    }
  }

  private freeCode(): string {
    for (let i = 0; i < 50; i++) {
      const code = makeRoomCode(this.opts.random);
      if (!this.rooms.has(code)) return code;
    }
    return `ROOM-${id(3).toUpperCase()}`;
  }

  private forget(r: Room, client: string) {
    const token = r.tokens.get(client);
    if (token) this.byToken.delete(token);
    r.tokens.delete(client);
  }

  private drop(r: Room) {
    r.close('This game has ended.');
    for (const token of r.tokens.values()) this.byToken.delete(token);
    this.rooms.delete(r.code);
  }
}
