import type { Action, GameConfig, GameRecord, GameState, PlayerColor, Sigil } from '@hexfall/engine';
import { makeRecord, parseRecord, replay } from '@hexfall/engine';

export type BotSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type HandPrivacy = 'curtain' | 'off';
export type Effects = 'auto' | 'full' | 'lite';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  reduceMotion: boolean;
  colorblind: boolean;
  handPrivacy: HandPrivacy;
  hideHandUntilHold: boolean;
  showWhy: boolean;
  botSpeed: BotSpeed;
  uiScale: 0.9 | 1 | 1.1 | 1.25;
  turnTimer: 0 | 30 | 60 | 90;
  rookieTips: boolean;
  dismissedTips: string[];
  theme: 'hexfall' | 'frostbound';
  /** Ambient animation level; 'auto' drops to lite when frames are slow. */
  effects: Effects;
  /** Set by the frame watchdog when 'auto' found this device too slow for full effects. */
  autoLite: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  muted: false,
  reduceMotion: false,
  colorblind: false,
  handPrivacy: 'curtain',
  hideHandUntilHold: false,
  showWhy: false,
  botSpeed: 'normal',
  uiScale: 1,
  turnTimer: 0,
  rookieTips: true,
  dismissedTips: [],
  theme: 'hexfall',
  effects: 'auto',
  autoLite: false,
};

const SETTINGS_KEY = 'hexfall.settings';
const PROFILE_KEY = 'hexfall.profile';

export interface PlayerProfile {
  name: string;
  color: PlayerColor;
  sigil: Sigil;
}

export const DEFAULT_PROFILE: PlayerProfile = { name: 'Ashwyn', color: 'crimson', sigil: 'skull' };

/** The player's own name and look, used whenever they host or join. */
export function loadProfile(): PlayerProfile {
  try {
    const raw = storage()?.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<PlayerProfile>) } : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: PlayerProfile): void {
  try {
    storage()?.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* kept in memory only */
  }
}
const SAVE_KEY = 'hexfall.save';
export const SAVE_SCHEMA = 1;

interface SaveFileV1 {
  schema: 1;
  savedAt: number;
  config: GameConfig;
  actions: Action[];
  state: GameState;
}

type AnySave = SaveFileV1;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: settings stay in memory */
  }
}

/** Migration stub: upgrades older save files to the current schema. */
function migrate(data: { schema?: number } & Record<string, unknown>): AnySave | null {
  switch (data.schema) {
    case 1:
      return data as unknown as SaveFileV1;
    default:
      return null;
  }
}

let pendingSave: SaveFileV1 | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Writes the queued autosave now (also runs when the page is hidden or closed). */
export function flushAutosave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  const file = pendingSave;
  pendingSave = null;
  if (!file) return;
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    /* ignore quota errors */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAutosave);
  document.addEventListener('visibilitychange', () => document.hidden && flushAutosave());
}

/**
 * Queues an autosave. Serialising the whole game on every action stalled bot turns, so
 * writes are coalesced (at most one per 400 ms) and flushed when the page goes away.
 */
export function writeAutosave(config: GameConfig, actions: Action[], state: GameState): void {
  pendingSave = { schema: SAVE_SCHEMA, savedAt: Date.now(), config, actions, state };
  if (saveTimer === null) saveTimer = setTimeout(flushAutosave, 400);
}

export function clearAutosave(): void {
  pendingSave = null;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function peekAutosave(): { savedAt: number; config: GameConfig; state: GameState } | null {
  flushAutosave();
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = migrate(JSON.parse(raw));
    if (!data || data.state.phase.kind === 'ended') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Loads the autosave. The action log is replayed from the seed to rebuild events (for the
 * log) and to verify the stored state; the stored state wins if the replay ever differs.
 */
export function readAutosave(): { config: GameConfig; actions: Action[]; state: GameState } | null {
  flushAutosave();
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = migrate(JSON.parse(raw));
    if (!data) return null;
    return { config: data.config, actions: data.actions, state: data.state };
  } catch {
    return null;
  }
}

export function exportRecord(config: GameConfig, actions: Action[]): string {
  return JSON.stringify(makeRecord(config, actions), null, 2);
}

export function importRecord(json: string): { record: GameRecord; state: GameState } {
  const record = parseRecord(json);
  const { state } = replay(record);
  return { record, state };
}
