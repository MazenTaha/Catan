import { create } from 'zustand';
import {
  RESOURCES,
  activeActor,
  applyAction,
  createGame,
  emptyCounts,
  isUndoable,
  privacyEnabled,
  replay,
  type Action,
  type GameConfig,
  type GameError,
  type GameEvent,
  type GameState,
  type ResourceCounts,
} from '@hexfall/engine';
import { audio, type SfxName } from '../audio/engine';
import { RESOURCE_NAME, TERRAIN_NAME, WRAITH_TITLE } from '../lexicon';
import { describeEvent, lineText, type LogItem } from './log';
import {
  clearAutosave,
  importRecord,
  loadSettings,
  readAutosave,
  saveSettings,
  writeAutosave,
  type Settings,
} from './persistence';

export type Screen = 'title' | 'setup' | 'game';
export type PlaceMode = 'causeway' | 'outpost' | 'citadel';
export type Tab = 'build' | 'cards' | 'trade';
export type ModalKind =
  | 'rules'
  | 'settings'
  | 'log'
  | 'harvest'
  | 'tithe'
  | 'credits'
  | 'confirm-new'
  | 'import'
  | null;

export interface Session {
  config: GameConfig;
  actions: Action[];
  state: GameState;
  /** States before each undoable action, newest last. */
  undo: { state: GameState; actions: number; log: number }[];
  log: LogItem[];
  seq: number;
  /** Per-player cards gained since the current turn began (for +N badges). */
  turnGains: ResourceCounts[];
}

export interface Fx {
  roll: { seq: number; dice: [number, number]; total: number; player: number } | null;
  production: {
    seq: number;
    roll: number;
    hexes: number[];
    gains: ResourceCounts[];
    blockedHex: number | null;
  } | null;
  placed: { seq: number; key: string } | null;
  wraith: { seq: number; from: number; to: number } | null;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'gold';
}

interface StoreState {
  screen: Screen;
  session: Session | null;
  settings: Settings;
  mode: PlaceMode | null;
  tab: Tab;
  modal: ModalKind;
  hoverPlayer: number | null;
  hoverHex: number | null;
  fx: Fx;
  toast: Toast | null;
  announce: string;
  showRollOff: boolean;
  timerDeadline: number | null;

  go(screen: Screen): void;
  setTimerDeadline(t: number | null): void;
  startGame(config: GameConfig): void;
  continueGame(): boolean;
  importGame(json: string): string | null;
  rematch(): void;
  dispatch(action: Action): GameError | null;
  undo(): void;
  setMode(mode: PlaceMode | null): void;
  setTab(tab: Tab): void;
  openModal(m: ModalKind): void;
  closeModal(): void;
  setHoverPlayer(p: number | null): void;
  setHoverHex(h: number | null): void;
  pushToast(text: string, tone?: Toast['tone']): void;
  dismissToast(): void;
  updateSettings(patch: Partial<Settings>): void;
  dismissTip(id: string): void;
  dismissRollOff(): void;
}

let toastId = 0;
let fxSeq = 0;

const SOUND_FOR: Partial<Record<GameEvent['type'], SfxName>> = {
  DiceRolled: 'dice',
  CausewayBuilt: 'causeway',
  OutpostBuilt: 'outpost',
  SetupOutpostPlaced: 'outpost',
  CitadelBuilt: 'citadel',
  WraithMoved: 'wraith',
  Stolen: 'steal',
  TradeCompleted: 'trade',
  BankTraded: 'trade',
  OmenBought: 'omen',
  Discarded: 'discard',
  TurnStarted: 'turn',
  GameWon: 'victory',
  TradeProposed: 'card',
};

function soundsFor(events: GameEvent[]): SfxName[] {
  const out: SfxName[] = [];
  for (const e of events) {
    if (e.type === 'OmenPlayed') {
      out.push(e.omen === 'warden' ? 'warden' : e.omen === 'tithe' ? 'tithe' : 'omen');
      continue;
    }
    if (e.type === 'ResourcesProduced') {
      if (e.gains.some((g) => RESOURCES.some((r) => g[r] > 0))) out.push('collect');
      continue;
    }
    const s = SOUND_FOR[e.type];
    if (s) out.push(s);
  }
  return out;
}

function countsText(c: ResourceCounts): string {
  return RESOURCES.filter((r) => c[r] > 0)
    .map((r) => `+${c[r]} ${RESOURCE_NAME[r]}`)
    .join(', ');
}

/** Builds the under-board toast explaining the latest production / Wraith outcome. */
function toastFor(events: GameEvent[], state: GameState): Toast | null {
  const name = (p: number) => state.players[p].name;
  let text: string | null = null;
  let tone: Toast['tone'] = 'info';
  for (const e of events) {
    if (e.type === 'ResourcesProduced') {
      const parts = e.gains
        .map((g, p) => (RESOURCES.some((r) => g[r] > 0) ? `${name(p)} ${countsText(g)}` : null))
        .filter(Boolean);
      if (parts.length) {
        text = `${e.roll} — ${parts.join(' · ')}`;
        tone = 'good';
      } else if (e.blockedHex !== null) {
        text = `${WRAITH_TITLE} smothers the ${e.roll} on ${TERRAIN_NAME[state.board.hexes[e.blockedHex].terrain]}. Nothing paid out.`;
        tone = 'bad';
      } else {
        text = `${e.roll} — no outpost stands on a ${e.roll}. Nothing paid out.`;
        tone = 'info';
      }
      if (e.blockedHex !== null && parts.length) text += ` (${WRAITH_TITLE} blocks one ${e.roll})`;
    }
    if (e.type === 'ProductionShortage') {
      text =
        (text ? text + ' · ' : '') +
        (e.paid === null
          ? `The bank lacks ${RESOURCE_NAME[e.resource]} for everyone — nobody gets it`
          : `Bank short on ${RESOURCE_NAME[e.resource]}: ${name(e.paid)} takes the last ${e.amount}`);
      tone = 'bad';
    }
    if (e.type === 'DiscardRequired') {
      text = 'A 7! The Wraith stirs — hoarders discard half their hands.';
      tone = 'bad';
    }
    if (e.type === 'DiceRolled' && e.total === 7 && !text) {
      text = 'A 7! The Wraith stirs.';
      tone = 'bad';
    }
    if (e.type === 'Stolen') {
      text = `${name(e.thief)} robs ${name(e.victim)}.`;
      tone = 'bad';
    }
    if (e.type === 'LongestCausewayChanged' && e.holder !== null) {
      text = `${name(e.holder)} claims the Longest Causeway!`;
      tone = 'gold';
    }
    if (e.type === 'GreatestHostChanged' && e.holder !== null) {
      text = `${name(e.holder)} commands the Greatest Host!`;
      tone = 'gold';
    }
    if (e.type === 'TradeCompleted') {
      text = `${name(e.proposer)} and ${name(e.accepter)} strike a bargain.`;
      tone = 'good';
    }
    if (e.type === 'TitheTaken') {
      text = `${name(e.player)} exacts ${e.total} ${RESOURCE_NAME[e.resource]} in blood.`;
      tone = 'bad';
    }
  }
  return text ? { id: ++toastId, text, tone } : null;
}

function makeLog(events: GameEvent[], state: GameState, startSeq: number): LogItem[] {
  return events.map((event, i) => ({
    seq: startSeq + i,
    turn: state.turn,
    round: state.round,
    event,
  }));
}

function applyVolumes(s: Settings) {
  audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
}

function applyDocumentSettings(s: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(s.uiScale));
  const reduce =
    s.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.classList.toggle('reduce-motion', reduce);
  root.classList.toggle('colorblind', s.colorblind);
  if (s.theme === 'frostbound') root.setAttribute('data-theme', 'frostbound');
  else root.removeAttribute('data-theme');
}

export function prefersReducedMotion(s: Settings): boolean {
  return (
    s.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

const initialSettings = loadSettings();
applyVolumes(initialSettings);
applyDocumentSettings(initialSettings);

const emptyFx: Fx = { roll: null, production: null, placed: null, wraith: null };

export const useStore = create<StoreState>((set, get) => ({
  screen: 'title',
  session: null,
  settings: initialSettings,
  mode: null,
  tab: 'build',
  modal: null,
  hoverPlayer: null,
  hoverHex: null,
  fx: emptyFx,
  toast: null,
  announce: '',
  showRollOff: false,
  timerDeadline: null,

  setTimerDeadline(timerDeadline) {
    set({ timerDeadline });
  },

  go(screen) {
    set({ screen, mode: null, modal: null });
  },

  startGame(config) {
    const cfg: GameConfig = {
      ...config,
      privacy:
        get().settings.handPrivacy === 'curtain'
          ? config.seats.filter((s) => s.kind === 'human').length >= 2
          : false,
    };
    const state = createGame(cfg);
    const startEv: GameEvent[] = [{ type: 'GameStarted', firstPlayer: state.firstPlayer }];
    clearAutosave();
    writeAutosave(cfg, [], state);
    set({
      screen: 'game',
      session: {
        config: cfg,
        actions: [],
        state,
        undo: [],
        log: makeLog(startEv, state, 0),
        seq: startEv.length,
        turnGains: state.players.map(() => emptyCounts()),
      },
      mode: null,
      modal: null,
      tab: 'build',
      fx: emptyFx,
      toast: null,
      showRollOff: cfg.firstPlayer === 'rolloff',
      announce: `A new isle rises. ${state.players[state.firstPlayer].name} goes first.`,
    });
  },

  continueGame() {
    const save = readAutosave();
    if (!save) return false;
    let events: GameEvent[] = [];
    let state = save.state;
    try {
      const r = replay({ config: save.config, actions: save.actions });
      events = [{ type: 'GameStarted', firstPlayer: r.state.firstPlayer }, ...r.events];
      if (JSON.stringify(r.state) === JSON.stringify(save.state)) state = r.state;
    } catch {
      events = [];
    }
    set({
      screen: 'game',
      session: {
        config: save.config,
        actions: save.actions,
        state,
        undo: [],
        log: makeLog(events, state, 0),
        seq: events.length,
        turnGains: state.players.map(() => emptyCounts()),
      },
      mode: null,
      modal: null,
      fx: emptyFx,
      toast: null,
      showRollOff: false,
    });
    return true;
  },

  importGame(json) {
    try {
      const { record, state } = importRecord(json);
      const r = replay(record);
      const events: GameEvent[] = [{ type: 'GameStarted', firstPlayer: state.firstPlayer }, ...r.events];
      writeAutosave(record.config, record.actions, state);
      set({
        screen: 'game',
        session: {
          config: record.config,
          actions: record.actions,
          state,
          undo: [],
          log: makeLog(events, state, 0),
          seq: events.length,
          turnGains: state.players.map(() => emptyCounts()),
        },
        mode: null,
        modal: null,
        fx: emptyFx,
        toast: { id: ++toastId, text: 'Game record loaded and replayed.', tone: 'gold' },
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not read that record';
    }
  },

  rematch() {
    const s = get().session;
    if (s) get().startGame(s.config);
  },

  dispatch(action) {
    const session = get().session;
    if (!session) return { code: 'INVALID', message: 'No game in progress' };
    const prev = session.state;
    const r = applyAction(prev, action);
    if (!r.ok) {
      audio.play('error');
      set({ toast: { id: ++toastId, text: r.error.message, tone: 'bad' } });
      return r.error;
    }
    const { state, events } = r.value;
    const undoable = isUndoable(prev, action, state, events);
    const undo = undoable
      ? [...session.undo, { state: prev, actions: session.actions.length, log: session.log.length }]
      : [];
    const actions = [...session.actions, action];

    // +N badges: positive hand deltas since the turn began.
    let turnGains = session.turnGains;
    if (events.some((e) => e.type === 'TurnStarted')) {
      turnGains = state.players.map(() => emptyCounts());
    } else {
      turnGains = turnGains.map((g, p) => {
        const out = { ...g };
        for (const res of RESOURCES) {
          const d = state.players[p].hand[res] - prev.players[p].hand[res];
          if (d > 0) out[res] += d;
        }
        return out;
      });
    }

    const fx: Fx = { ...get().fx };
    let announce = get().announce;
    for (const e of events) {
      if (e.type === 'DiceRolled') fx.roll = { seq: ++fxSeq, dice: e.dice, total: e.total, player: e.player };
      if (e.type === 'ResourcesProduced') {
        fx.production = { seq: ++fxSeq, roll: e.roll, hexes: e.hexes, gains: e.gains, blockedHex: e.blockedHex };
      }
      if (e.type === 'CausewayBuilt') fx.placed = { seq: ++fxSeq, key: e.edge };
      if (e.type === 'OutpostBuilt' || e.type === 'CitadelBuilt' || e.type === 'SetupOutpostPlaced') {
        fx.placed = { seq: ++fxSeq, key: e.vertex };
      }
      if (e.type === 'WraithMoved') fx.wraith = { seq: ++fxSeq, from: e.from, to: e.to };
      if (e.type === 'TurnStarted') fx.production = null;
    }

    const viewer = privacyEnabled(state) ? state.viewer : activeActor(state);
    const ctx = {
      players: state.players,
      viewer,
      terrainName: (h: number) => TERRAIN_NAME[state.board.hexes[h].terrain],
    };
    const spoken = events
      .filter((e) =>
        ['DiceRolled', 'ResourcesProduced', 'WraithMoved', 'Stolen', 'TurnStarted', 'GameWon', 'TradeCompleted'].includes(
          e.type,
        ),
      )
      .map((e) => describeEvent(e, ctx))
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .map((l) => lineText(l, state.players));
    if (spoken.length) announce = spoken.join('. ');

    for (const s of soundsFor(events)) audio.play(s);
    if (state.phase.kind === 'ended') audio.duck(false);

    const toast = toastFor(events, state) ?? get().toast;
    const log = [...session.log, ...makeLog(events, state, session.seq)];
    writeAutosave(session.config, actions, state);

    // Leave placement mode when the action consumed it or the phase changed.
    let mode = get().mode;
    if (mode && (state.phase.kind !== 'main' || events.some((e) => e.type.endsWith('Built')))) mode = null;

    set({
      session: { ...session, state, actions, undo, log, seq: session.seq + events.length, turnGains },
      fx,
      toast,
      announce,
      mode,
    });
    return null;
  },

  undo() {
    const session = get().session;
    if (!session || session.undo.length === 0) return;
    const last = session.undo[session.undo.length - 1];
    const actions = session.actions.slice(0, last.actions);
    writeAutosave(session.config, actions, last.state);
    audio.play('card');
    set({
      session: {
        ...session,
        state: last.state,
        actions,
        undo: session.undo.slice(0, -1),
        log: session.log.slice(0, last.log),
      },
      mode: null,
      toast: { id: ++toastId, text: 'Taken back.', tone: 'info' },
    });
  },

  setMode(mode) {
    set({ mode });
  },
  setTab(tab) {
    set({ tab });
  },
  openModal(modal) {
    audio.duck(true);
    set({ modal });
  },
  closeModal() {
    audio.duck(false);
    set({ modal: null });
  },
  setHoverPlayer(hoverPlayer) {
    set({ hoverPlayer });
  },
  setHoverHex(hoverHex) {
    set({ hoverHex });
  },
  pushToast(text, tone = 'info') {
    set({ toast: { id: ++toastId, text, tone } });
  },
  dismissToast() {
    set({ toast: null });
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    applyVolumes(settings);
    applyDocumentSettings(settings);
    set({ settings });
  },
  dismissTip(id) {
    const s = get().settings;
    if (!s.dismissedTips.includes(id)) get().updateSettings({ dismissedTips: [...s.dismissedTips, id] });
  },
  dismissRollOff() {
    set({ showRollOff: false });
  },
}));

/** The seat whose hand/cards the UI shows. */
export function displaySeat(state: GameState): number {
  if (privacyEnabled(state)) return state.viewer ?? activeActor(state);
  const humans = state.players.filter((p) => p.kind === 'human');
  if (humans.length === 1) return humans[0].id;
  if (humans.length === 0) return activeActor(state);
  const actor = activeActor(state);
  return state.players[actor].kind === 'human' ? actor : (state.viewer ?? humans[0].id);
}

// Debug/test handle (dev and e2e only).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __hexfall: typeof useStore }).__hexfall = useStore;
}
