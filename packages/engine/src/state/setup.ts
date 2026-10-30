import { generateBoard } from '../board/generator';
import {
  BANK_START,
  BULLETS,
  MANUP_CARDS,
  MAX_HEALTH,
  OMEN_DECK_COUNTS,
  OMEN_TYPES,
  PLAYER_COLORS,
  SUPPLY,
  emptyCounts,
  fullCounts,
  type OmenType,
} from '../lexicon-keys';
import { Rng } from '../rng';
import { activeActor, privacyEnabled } from './selectors';
import type { GameConfig, GameState, PlayerState } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;
export const MIN_TARGET = 8;
export const MAX_TARGET = 14;

export function validateConfig(config: GameConfig): string | null {
  const n = config.seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return 'Hexfall needs 3 or 4 players';
  if (config.targetVp < MIN_TARGET || config.targetVp > MAX_TARGET) {
    return `Target must be between ${MIN_TARGET} and ${MAX_TARGET}`;
  }
  if (new Set(config.seats.map((s) => s.color)).size !== n) return 'Colors must be unique';
  if (new Set(config.seats.map((s) => s.sigil)).size !== n) return 'Sigils must be unique';
  if (config.seats.some((s) => !PLAYER_COLORS.includes(s.color))) return 'Unknown color';
  if (config.seats.some((s) => !s.name.trim())) return 'Every seat needs a name';
  if (typeof config.firstPlayer === 'number' && (config.firstPlayer < 0 || config.firstPlayer >= n)) {
    return 'Invalid first player';
  }
  return null;
}

export function buildOmenDeck(rng: Rng, pvp = false): OmenType[] {
  const deck: OmenType[] = [];
  for (const t of OMEN_TYPES) for (let i = 0; i < OMEN_DECK_COUNTS[t]; i++) deck.push(t);
  if (pvp) for (let i = 0; i < MANUP_CARDS; i++) deck.push('manup');
  return rng.shuffle(deck);
}

/** Dice roll-off: everyone rolls 2d6, ties for the highest re-roll. */
export function rollOff(rng: Rng, contenders: number[]) {
  const rounds: [number, number, number][][] = [];
  let pool = contenders;
  for (;;) {
    const round = pool.map((p) => [p, rng.die(), rng.die()] as [number, number, number]);
    rounds.push(round);
    const best = Math.max(...round.map((r) => r[1] + r[2]));
    pool = round.filter((r) => r[1] + r[2] === best).map((r) => r[0]);
    if (pool.length === 1) return { winner: pool[0], rounds };
  }
}

export function createGame(config: GameConfig): GameState {
  const err = validateConfig(config);
  if (err) throw new Error(err);
  const board = generateBoard(config.seed, config.layout);
  const rng = Rng.fromSeed(`${config.seed}:game`);
  const n = config.seats.length;

  let firstPlayer: number;
  let rounds: [number, number, number][][] = [];
  if (typeof config.firstPlayer === 'number') {
    firstPlayer = config.firstPlayer;
  } else {
    const r = rollOff(
      rng,
      Array.from({ length: n }, (_, i) => i),
    );
    firstPlayer = r.winner;
    rounds = r.rounds;
  }

  const players: PlayerState[] = config.seats.map((seat, i) => ({
    id: i,
    name: seat.name.trim(),
    color: seat.color,
    sigil: seat.sigil,
    kind: seat.kind,
    ...(seat.kind === 'bot' ? { bot: seat.bot ?? 'warlord' } : {}),
    hand: emptyCounts(),
    omens: [],
    playedWardens: 0,
    playedOmens: [],
    supply: { ...SUPPLY },
  }));

  const forward = Array.from({ length: n }, (_, k) => (firstPlayer + k) % n);
  const setupOrder = [...forward, ...forward.slice().reverse()];
  const omenDeck = buildOmenDeck(rng, !!config.pvp);
  const wraithHex = board.hexes.findIndex((h) => h.terrain === 'waste');

  const state: GameState = {
    schema: 1,
    config: { ...config, firstPlayer: config.firstPlayer ?? 'rolloff' },
    board,
    rng: rng.state,
    players,
    bank: fullCounts(BANK_START),
    omenDeck,
    buildings: {},
    causeways: {},
    wraithHex,
    phase: { kind: 'setup', index: 0, step: 'outpost', lastOutpost: null },
    currentPlayer: setupOrder[0],
    turn: 0,
    round: 0,
    setupOrder,
    rollOff: rounds,
    firstPlayer,
    dice: null,
    hasRolled: false,
    omenPlayedThisTurn: false,
    offersThisTurn: 0,
    longestCauseway: { holder: null, lengths: players.map(() => 0) },
    greatestHost: { holder: null },
    handoff: null,
    viewer: null,
    winner: null,
    nextTradeId: 1,
    stats: {
      rolls: Array<number>(13).fill(0),
      gained: players.map(() => emptyCounts()),
      trades: players.map(() => 0),
      bankTrades: players.map(() => 0),
      stolen: players.map(() => 0),
      discarded: players.map(() => 0),
      omensBought: players.map(() => 0),
    },
    actionCount: 0,
  };
  if (config.arms) {
    state.arms = {
      chest: players.map(() => null),
      starts: players.map(() => []),
      armed: players.map(() => false),
      bullets: players.map(() => BULLETS),
      health: players.map(() => MAX_HEALTH),
      owed: players.map(() => players.map(() => 0)),
      kills: players.map(() => 0),
    };
  }

  if (privacyEnabled(state)) {
    const actor = activeActor(state);
    if (state.players[actor].kind === 'human') state.handoff = actor;
  } else {
    const human = state.players.find((p) => p.kind === 'human');
    state.viewer = human ? human.id : null;
  }
  return state;
}
