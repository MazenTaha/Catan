/**
 * Online play: the lobby model and the messages exchanged between the browser and the game
 * server. Everything here is plain data and pure functions, shared by both sides (and by the
 * browser on its own when no server can be reached).
 */
import {
  MAX_TARGET,
  MIN_TARGET,
  PLAYER_COLORS,
  SIGILS,
  type Action,
  type BotLevel,
  type GameConfig,
  type GameEvent,
  type GameState,
  type LayoutMode,
  type PlayerColor,
  type Sigil,
  type Weapon,
  WEAPONS,
} from '@hexfall/engine';

// ------------------------------------------------------------------ lobby model

export interface Profile {
  name: string;
  color: PlayerColor;
  sigil: Sigil;
  /** How the player's character looks in the 3D walk (Character screen). */
  look?: CharacterLook;
  /** What stands inside the player's settlements and cities (My kingdom screen). */
  decor?: KingdomDecor;
}

// ------------------------------------------------------------------ character and kingdom

/** Each field picks one option by index; LOOK_OPTIONS says how many each has. */
export interface CharacterLook {
  skin: number;
  hair: number;
  hairColor: number;
  beard: number;
  /** Tunic colour; the seat colour still shows on the shoulders and the sash. */
  outfit: number;
  hat: number;
  cape: number;
}

export const LOOK_OPTIONS: Record<keyof CharacterLook, number> = {
  skin: 6,
  hair: 6,
  hairColor: 7,
  beard: 4,
  outfit: 8,
  hat: 5,
  cape: 3,
};

export const DEFAULT_LOOK: CharacterLook = {
  skin: 1,
  hair: 1,
  hairColor: 1,
  beard: 0,
  outfit: 0,
  hat: 0,
  cape: 1,
};

/** Furnishings for the player's own buildings in the 3D walk. */
export const DECOR_ITEMS = [
  'rug',
  'banner',
  'tapestry',
  'antlers',
  'chandelier',
  'bookshelf',
  'plants',
  'armor',
  'candles',
  'shield',
] as const;
export type DecorItem = (typeof DECOR_ITEMS)[number];

export interface KingdomDecor {
  cottage: DecorItem[];
  hall: DecorItem[];
  /** Banner and rug colour (index into the kingdom palette). */
  tint: number;
}

export const DECOR_TINTS = 6;
export const DEFAULT_DECOR: KingdomDecor = {
  cottage: ['rug', 'candles', 'plants'],
  hall: ['rug', 'banner', 'chandelier', 'shield'],
  tint: 0,
};

export function cleanLook(l: Partial<CharacterLook> | undefined): CharacterLook {
  const out = { ...DEFAULT_LOOK };
  for (const k of Object.keys(LOOK_OPTIONS) as (keyof CharacterLook)[]) {
    const v = Math.round(Number(l?.[k]));
    if (Number.isFinite(v) && v >= 0 && v < LOOK_OPTIONS[k]) out[k] = v;
  }
  return out;
}

export function cleanDecor(d: Partial<KingdomDecor> | undefined): KingdomDecor {
  const pick = (list: unknown, fallback: DecorItem[]): DecorItem[] =>
    Array.isArray(list) ? DECOR_ITEMS.filter((x) => list.includes(x)) : [...fallback];
  const tint = Math.round(Number(d?.tint));
  return {
    cottage: pick(d?.cottage, DEFAULT_DECOR.cottage),
    hall: pick(d?.hall, DEFAULT_DECOR.hall),
    tint: Number.isFinite(tint) && tint >= 0 && tint < DECOR_TINTS ? tint : 0,
  };
}

/**
 * One chair at the table:
 * - `host` / `remote`: a person, on the host's device or joined with the room code
 * - `local`: a friend playing on the host's device (pass and play)
 * - `bot`: played by the computer
 * - `open`: waiting for someone to join
 */
export type Seat =
  | { kind: 'host'; profile: Profile; client: string; connected: boolean }
  | { kind: 'remote'; profile: Profile; client: string; connected: boolean }
  | { kind: 'local'; profile: Profile }
  | { kind: 'bot'; profile: Profile; bot: BotLevel }
  | { kind: 'open' };

export interface LobbySettings {
  players: 3 | 4;
  layout: LayoutMode;
  seed: string;
  targetVp: number;
  rollOff: boolean;
}

export interface Lobby {
  code: string;
  settings: LobbySettings;
  /** Always `MAX_SEATS` long; seats past `settings.players` are ignored. */
  seats: Seat[];
}

export const MAX_SEATS = 4;
/** Default names for seats the host fills (bots and pass-and-play friends). */
export const SEAT_NAMES = ['Morrow', 'Isolde', 'Vex', 'Ashwyn', 'Bramble', 'Corwin'];

export function defaultSettings(seed: string): LobbySettings {
  return { players: 4, layout: 'balanced', seed, targetVp: 10, rollOff: true };
}

export function seatProfile(s: Seat): Profile | null {
  return s.kind === 'open' ? null : s.profile;
}

export function activeSeats(lobby: Lobby): Seat[] {
  return lobby.seats.slice(0, lobby.settings.players);
}

/** Seats still waiting for a player. */
export function openSeats(lobby: Lobby): number {
  return activeSeats(lobby).filter((s) => s.kind === 'open').length;
}

/** People who joined from another device (the game needs the server only if there are any). */
export function remoteCount(lobby: Lobby): number {
  return activeSeats(lobby).filter((s) => s.kind === 'remote').length;
}

export function createLobby(
  code: string,
  host: Profile,
  client: string,
  settings: LobbySettings,
): Lobby {
  const seats: Seat[] = [{ kind: 'host', profile: cleanProfile(host), client, connected: true }];
  while (seats.length < MAX_SEATS) seats.push({ kind: 'open' });
  return { code, settings: clampSettings(settings), seats };
}

export function clampSettings(s: LobbySettings): LobbySettings {
  return {
    players: s.players === 3 ? 3 : 4,
    layout: (['balanced', 'random', 'beginner'] as const).includes(s.layout)
      ? s.layout
      : 'balanced',
    seed: String(s.seed ?? '').slice(0, 40) || 'hexfall',
    targetVp: Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(Number(s.targetVp) || 10))),
    rollOff: !!s.rollOff,
  };
}

export function cleanProfile(p: Profile): Profile {
  return {
    name:
      String(p?.name ?? '')
        .trim()
        .slice(0, 16) || 'Player',
    color: PLAYER_COLORS.includes(p?.color) ? p.color : 'crimson',
    sigil: SIGILS.includes(p?.sigil) ? p.sigil : 'skull',
    look: cleanLook(p?.look),
    decor: cleanDecor(p?.decor),
  };
}

/**
 * Keeps colours and sigils unique among the active seats. Earlier seats keep their choice;
 * later ones that clash take the first free colour or sigil.
 */
export function withUniqueLooks(lobby: Lobby): Lobby {
  const usedC = new Set<PlayerColor>();
  const usedS = new Set<Sigil>();
  const seats = lobby.seats.map((s, i) => {
    if (s.kind === 'open' || i >= lobby.settings.players) return s;
    let { color, sigil } = s.profile;
    if (usedC.has(color)) color = PLAYER_COLORS.find((c) => !usedC.has(c))!;
    if (usedS.has(sigil)) sigil = SIGILS.find((g) => !usedS.has(g))!;
    usedC.add(color);
    usedS.add(sigil);
    return { ...s, profile: { ...s.profile, color, sigil } } as Seat;
  });
  return { ...lobby, seats };
}

function freshName(lobby: Lobby, pool: string[]): string {
  const taken = new Set(activeSeats(lobby).map((s) => seatProfile(s)?.name.toLowerCase()));
  return pool.find((n) => !taken.has(n.toLowerCase())) ?? `Player ${taken.size + 1}`;
}

/** What the host can turn an empty or non-person seat into. */
export type SeatChoice =
  { kind: 'open' } | { kind: 'bot'; bot: BotLevel } | { kind: 'local'; name?: string };

export function setSeat(lobby: Lobby, index: number, choice: SeatChoice): Lobby {
  const cur = lobby.seats[index];
  if (!cur || index === 0 || cur.kind === 'host' || cur.kind === 'remote') return lobby;
  const seats = [...lobby.seats];
  const look = (): Profile => ({ name: '', color: PLAYER_COLORS[index], sigil: SIGILS[index] });
  // Switching between bot and pass-and-play keeps the seat's name and look.
  const keep = cur.kind === 'bot' || cur.kind === 'local' ? cur.profile : null;
  if (choice.kind === 'open') seats[index] = { kind: 'open' };
  else if (choice.kind === 'bot') {
    seats[index] = {
      kind: 'bot',
      bot: choice.bot,
      profile: keep ?? { ...look(), name: freshName(lobby, SEAT_NAMES) },
    };
  } else {
    const name =
      (choice.name ?? '').trim().slice(0, 16) || keep?.name || freshName(lobby, SEAT_NAMES);
    seats[index] = { kind: 'local', profile: { ...(keep ?? look()), name } };
  }
  return withUniqueLooks({ ...lobby, seats });
}

/** Every open seat becomes a Medium bot. */
export function fillWithBots(lobby: Lobby): Lobby {
  let l = lobby;
  activeSeats(l).forEach((s, i) => {
    if (s.kind === 'open') l = setSeat(l, i, { kind: 'bot', bot: 'warlord' });
  });
  return l;
}

/** Seats a newly joined player in the first open chair; null when the table is full. */
export function seatRemote(
  lobby: Lobby,
  profile: Profile,
  client: string,
): { lobby: Lobby; seat: number } | null {
  const seat = activeSeats(lobby).findIndex((s) => s.kind === 'open');
  if (seat < 0) return null;
  const seats = [...lobby.seats];
  seats[seat] = { kind: 'remote', profile: cleanProfile(profile), client, connected: true };
  return { lobby: withUniqueLooks({ ...lobby, seats }), seat };
}

export function removeClient(lobby: Lobby, client: string): Lobby {
  const seats = lobby.seats.map((s) =>
    s.kind === 'remote' && s.client === client ? ({ kind: 'open' } as Seat) : s,
  );
  return { ...lobby, seats };
}

export function setConnected(lobby: Lobby, client: string, connected: boolean): Lobby {
  const seats = lobby.seats.map((s) =>
    (s.kind === 'remote' || s.kind === 'host') && s.client === client ? { ...s, connected } : s,
  );
  return { ...lobby, seats };
}

/** Seats a client controls: their own, plus pass-and-play seats for the host. */
export function seatsOf(lobby: Lobby, client: string): number[] {
  const out: number[] = [];
  const hostClient = lobby.seats[0].kind === 'host' ? lobby.seats[0].client : null;
  activeSeats(lobby).forEach((s, i) => {
    if ((s.kind === 'host' || s.kind === 'remote') && s.client === client) out.push(i);
    else if (s.kind === 'local' && client === hostClient) out.push(i);
  });
  return out;
}

/** Why the game can't start yet, or null when it can. */
export function startProblem(lobby: Lobby): string | null {
  const open = openSeats(lobby);
  if (open > 0)
    return `Waiting for ${open} more player${open > 1 ? 's' : ''} — or make the open seat${open > 1 ? 's' : ''} bots`;
  return null;
}

export function lobbyToConfig(lobby: Lobby): GameConfig {
  const l = withUniqueLooks(lobby);
  const seats = activeSeats(l).map((s) => {
    if (s.kind === 'open') throw new Error('Every seat needs a player');
    return {
      name: s.profile.name,
      color: s.profile.color,
      sigil: s.profile.sigil,
      kind: s.kind === 'bot' ? ('bot' as const) : ('human' as const),
      ...(s.kind === 'bot' ? { bot: s.bot } : {}),
    };
  });
  // Players on their own devices can fight each other in the 3D walk (DECISIONS #40).
  const people = activeSeats(l).filter((s) => s.kind === 'host' || s.kind === 'remote').length;
  return {
    seed: l.settings.seed.trim() || 'hexfall',
    seats,
    targetVp: l.settings.targetVp,
    layout: l.settings.layout,
    firstPlayer: l.settings.rollOff ? 'rolloff' : 0,
    // Online, each person has their own screen: no pass-the-device curtains.
    privacy: false,
    arms: true,
    pvp: people >= 2,
  };
}

// ------------------------------------------------------------------ room codes

const CODE_WORDS = [
  'DUSK',
  'EMBER',
  'AMBER',
  'BARN',
  'WOOL',
  'MOOR',
  'FERN',
  'OAK',
  'KILN',
  'REED',
  'COVE',
  'HEARTH',
  'MEADOW',
  'HARBOR',
  'LANTERN',
  'THATCH',
];

export function makeRoomCode(random: () => number = Math.random): string {
  const word = CODE_WORDS[Math.floor(random() * CODE_WORDS.length)];
  return `${word}-${String(10 + Math.floor(random() * 90))}`;
}

/** Accepts "dusk 42", "dusk42", " DUSK-42 " … and returns "DUSK-42". */
export function normalizeCode(input: string): string {
  const m = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .match(/^([A-Z]+)(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : input.trim().toUpperCase();
}

// ------------------------------------------------------------------ privacy

/**
 * What one client may see: opponents' hands keep their size but not their contents,
 * face-down development cards and the draw pile are masked, and the dice seed is hidden.
 * After the game ends everything is revealed.
 */
export function redactFor(state: GameState, mine: number[]): GameState {
  if (state.phase.kind === 'ended') return state;
  const players = state.players.map((p, i) => {
    if (mine.includes(i)) return p;
    const total = p.hand.wood + p.hand.clay + p.hand.wool + p.hand.grain + p.hand.ore;
    return {
      ...p,
      hand: { wood: total, clay: 0, wool: 0, grain: 0, ore: 0 },
      omens: p.omens.map((o) => ({ ...o, type: 'warden' as const })),
    };
  });
  // Where the others' weapon chests are hidden stays their secret.
  const arms = state.arms && {
    ...state.arms,
    chest: state.arms.chest.map((v, i) => (mine.includes(i) ? v : null)),
    starts: state.arms.starts.map((v, i) => (mine.includes(i) ? v : [])),
  };
  return {
    ...state,
    players,
    omenDeck: state.omenDeck.map(() => 'warden' as const),
    rng: 0,
    ...(arms ? { arms } : {}),
  };
}

/** Events carry the same secrets: who got which card is only shown to the people involved. */
export function redactEvents(events: GameEvent[], mine: number[], ended: boolean): GameEvent[] {
  if (ended) return events;
  return events.map((e) => {
    if (e.type === 'Stolen' && !mine.includes(e.thief) && !mine.includes(e.victim))
      return { ...e, resource: 'wood' as const };
    if (e.type === 'OmenBought' && !mine.includes(e.player))
      return { ...e, omen: 'warden' as const };
    if (e.type === 'Slain' && e.resource && !mine.includes(e.killer) && !mine.includes(e.victim))
      return { ...e, resource: 'wood' as const };
    if (e.type === 'DebtPaid' && !mine.includes(e.from) && !mine.includes(e.to))
      return { ...e, resource: 'wood' as const };
    return e;
  });
}

// ------------------------------------------------------------------ the 3D walk, live

/** A player's avatar in the 3D walk, sent about ten times a second while they are in it. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Walking speed (m/s), for the gait. */
  speed: number;
  weapon: Weapon;
  /** Counts attacks, so others replay each swing or shot once. */
  attacks: number;
  /** Holding the right mouse button: a sword parries blows and bullets from the front. */
  block: boolean;
  riding: boolean;
}

/** Reach of each weapon (m), used by the browser to aim and by the server to check hits. */
export const REACH: Record<Weapon, number> = { fist: 1.9, sword: 2.6, revolver: 26 };

export function cleanPose(p: Partial<Pose> | null | undefined): Pose | null {
  if (!p || typeof p !== 'object') return null;
  const n = (v: unknown, lim: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.max(-lim, Math.min(lim, x)) : 0;
  };
  return {
    x: n(p.x, 500),
    y: n(p.y, 100),
    z: n(p.z, 500),
    yaw: n(p.yaw, 1e4),
    speed: n(p.speed, 40),
    weapon: WEAPONS.includes(p.weapon as Weapon) ? (p.weapon as Weapon) : 'fist',
    attacks: Math.max(0, Math.floor(n(p.attacks, 1e9))),
    block: !!p.block,
    riding: !!p.riding,
  };
}

/**
 * Whether a blow from `from` is parried by `to`: the defender holds up a sword (right mouse
 * button) and faces the attacker, within 75 degrees either side.
 */
export function parries(to: Pose, from: Pose): boolean {
  if (!to.block || to.weapon !== 'sword' || to.riding) return false;
  const dx = from.x - to.x;
  const dz = from.z - to.z;
  const d = Math.hypot(dx, dz) || 1;
  return (-Math.sin(to.yaw) * dx - Math.cos(to.yaw) * dz) / d > Math.cos((75 * Math.PI) / 180);
}

// ------------------------------------------------------------------ messages

export type ClientMsg =
  | { t: 'host'; profile: Profile; settings: LobbySettings }
  | { t: 'join'; code: string; profile: Profile }
  | { t: 'resume'; code: string; token: string }
  | { t: 'settings'; settings: LobbySettings }
  | { t: 'seat'; index: number; choice: SeatChoice }
  | { t: 'fill-bots' }
  | { t: 'kick'; index: number }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'leave' }
  /** Where the player is in the 3D walk; null when they go back to the board. */
  | { t: 'pose'; pose: Pose | null }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; code: string; token: string; client: string; host: boolean }
  | { t: 'lobby'; lobby: Lobby }
  | {
      t: 'game';
      lobby: Lobby;
      seats: number[];
      state: GameState;
      events: GameEvent[];
      full: boolean;
    }
  | { t: 'error'; message: string; fatal?: boolean }
  | { t: 'closed'; reason: string }
  /** Everyone's avatar by seat (null: not in the 3D walk), about ten times a second. */
  | { t: 'poses'; poses: (Pose | null)[] }
  | { t: 'pong' };
