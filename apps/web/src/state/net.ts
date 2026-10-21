import { create } from 'zustand';
import type { ClientMsg, Lobby, LobbySettings, Profile, ServerMsg } from '@hexfall/net';

/**
 * The connection to the game server. Hosting and joining go through here; once a game
 * starts, `game` messages are handed to the game store (see `onGame`).
 *
 * Status:
 * - idle: not connected (offline play needs nothing else)
 * - connecting / online: talking to the server
 * - reconnecting: the link dropped mid-game; retrying with the saved token
 * - offline: the server could not be reached (hosting falls back to playing on this device)
 */
export type NetStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

interface NetState {
  status: NetStatus;
  code: string | null;
  client: string | null;
  isHost: boolean;
  lobby: Lobby | null;
  /** Last problem worth showing (bad code, table full, …). */
  error: string | null;
  /** Set when the server ended our part in the room (host closed it, we were removed). */
  closed: string | null;

  host(profile: Profile, settings: LobbySettings): void;
  join(code: string, profile: Profile): void;
  resume(code: string, token: string): void;
  send(msg: ClientMsg): void;
  leave(): void;
  clearError(): void;
}

const SAVED_KEY = 'hexfall.online';

export interface SavedSeat {
  code: string;
  token: string;
}

export function savedOnlineSeat(): SavedSeat | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedSeat) : null;
  } catch {
    return null;
  }
}

function saveSeat(s: SavedSeat | null) {
  try {
    if (s) localStorage.setItem(SAVED_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    /* private mode: rejoining after a reload just won't be offered */
  }
}

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (typeof location === 'undefined') return 'ws://localhost:8787/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** Hook for the game store: called with every `game` message. */
let gameHandler: ((msg: Extract<ServerMsg, { t: 'game' }>) => void) | null = null;
export function onGame(fn: typeof gameHandler) {
  gameHandler = fn;
}

let ws: WebSocket | null = null;
let token: string | null = null;
let wantOpen = false;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

export const useNet = create<NetState>((set, get) => {
  const handle = (msg: ServerMsg) => {
    switch (msg.t) {
      case 'welcome':
        token = msg.token;
        retry = 0;
        saveSeat({ code: msg.code, token: msg.token });
        set({
          status: 'online',
          code: msg.code,
          client: msg.client,
          isHost: msg.host,
          error: null,
          closed: null,
        });
        return;
      case 'lobby':
        set({ lobby: msg.lobby });
        return;
      case 'game':
        started = true;
        set({ lobby: msg.lobby, status: 'online' });
        gameHandler?.(msg);
        return;
      case 'error':
        set({ error: msg.message });
        if (msg.fatal) {
          // A wrong code, a full table, a game that no longer exists: nothing to reconnect to.
          saveSeat(null);
          token = null;
          shutdown(started ? 'offline' : 'idle');
        }
        return;
      case 'closed':
        saveSeat(null);
        set({ closed: msg.reason, lobby: null });
        shutdown('idle');
        return;
      case 'pong':
        return;
    }
  };

  const shutdown = (status: NetStatus) => {
    wantOpen = false;
    if (retryTimer) clearTimeout(retryTimer);
    if (pingTimer) clearInterval(pingTimer);
    retryTimer = null;
    pingTimer = null;
    const old = ws;
    ws = null;
    old?.close();
    set({ status });
  };

  /** Opens the socket and sends `first` once connected. */
  const open = (first: ClientMsg) => {
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
    wantOpen = true;
    let opened = false;
    let sock: WebSocket;
    try {
      sock = new WebSocket(serverUrl());
    } catch {
      set({ status: 'offline' });
      return;
    }
    ws = sock;
    const giveUp = setTimeout(() => {
      if (!opened && ws === sock) {
        sock.close();
        if (!started) shutdown('offline');
      }
    }, 4000);
    sock.onopen = () => {
      opened = true;
      clearTimeout(giveUp);
      sock.send(JSON.stringify(first));
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(
        () => sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify({ t: 'ping' })),
        25_000,
      );
    };
    sock.onmessage = (e) => {
      try {
        handle(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* ignore malformed frames */
      }
    };
    sock.onclose = () => {
      clearTimeout(giveUp);
      if (ws !== sock) return;
      ws = null;
      if (!wantOpen) return;
      const { code } = get();
      if (token && code && (opened || started)) {
        // Dropped mid-session: keep trying with the reconnect token, backing off up to 8 s.
        set({ status: 'reconnecting' });
        const t = token;
        retryTimer = setTimeout(
          () => open({ t: 'resume', code, token: t }),
          Math.min(8000, 500 * 2 ** retry++),
        );
      } else {
        shutdown('offline');
      }
    };
  };

  return {
    status: 'idle',
    code: null,
    client: null,
    isHost: false,
    lobby: null,
    error: null,
    closed: null,

    host(profile, settings) {
      started = false;
      token = null;
      set({
        status: 'connecting',
        lobby: null,
        code: null,
        error: null,
        closed: null,
        isHost: true,
      });
      open({ t: 'host', profile, settings });
    },
    join(code, profile) {
      started = false;
      token = null;
      set({
        status: 'connecting',
        lobby: null,
        code: null,
        error: null,
        closed: null,
        isHost: false,
      });
      open({ t: 'join', code, profile });
    },
    resume(code, saved) {
      started = true;
      token = saved;
      set({ status: 'connecting', code, error: null, closed: null });
      open({ t: 'resume', code, token: saved });
    },
    send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      else set({ error: 'Not connected to the game server' });
    },
    leave() {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'leave' }));
      saveSeat(null);
      started = false;
      token = null;
      shutdown('idle');
      set({ lobby: null, code: null, client: null, isHost: false });
    },
    clearError() {
      set({ error: null });
    },
  };
});
