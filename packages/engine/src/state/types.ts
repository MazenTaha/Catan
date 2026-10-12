import type { Board, LayoutMode } from '../board/types';
import type { EdgeId, VertexId } from '../board/coords';
import type {
  OmenType,
  PlayerColor,
  Resource,
  ResourceCounts,
  Sigil,
} from '../lexicon-keys';

export type SeatKind = 'human' | 'bot';
export type BotLevel = 'wanderer' | 'warlord' | 'archdemon';

export interface SeatConfig {
  name: string;
  color: PlayerColor;
  sigil: Sigil;
  kind: SeatKind;
  bot?: BotLevel;
}

export interface GameConfig {
  seed: string;
  seats: SeatConfig[];
  /** Victory points needed to win (8–14). */
  targetVp: number;
  layout: LayoutMode;
  /** 'rolloff' (default) rolls dice for the first player; a number fixes it. */
  firstPlayer?: 'rolloff' | number;
  /**
   * Hot-seat privacy: when on, the engine requires an `AckPassDevice` whenever the
   * seat that must act next is a different human than the one holding the device.
   * Defaults to on when there are two or more human seats.
   */
  privacy?: boolean;
}

export interface OwnedOmen {
  type: OmenType;
  /** `state.turn` when bought; cards cannot be played on that same turn. */
  boughtTurn: number;
}

export interface Supply {
  causeways: number;
  outposts: number;
  citadels: number;
}

export interface PlayerState {
  id: number;
  name: string;
  color: PlayerColor;
  sigil: Sigil;
  kind: SeatKind;
  bot?: BotLevel;
  hand: ResourceCounts;
  omens: OwnedOmen[];
  playedWardens: number;
  playedOmens: OmenType[];
  supply: Supply;
}

export type BuildingKind = 'outpost' | 'citadel';

export interface Building {
  owner: number;
  kind: BuildingKind;
}

export interface TradeOffer {
  id: number;
  /** Seat offering the trade. Always the active player or a counter-offering responder. */
  proposer: number;
  /** Seats asked to respond, in order. */
  targets: number[];
  /** Cards the proposer gives. */
  give: ResourceCounts;
  /** Cards the proposer wants in return. */
  want: ResourceCounts;
  declined: number[];
  counterOf: number | null;
}

export type ResumePhase = 'roll' | 'main';

export type Phase =
  | { kind: 'setup'; index: number; step: 'outpost' | 'causeway'; lastOutpost: VertexId | null }
  | { kind: 'roll' }
  | { kind: 'discard'; pending: number[] }
  | { kind: 'move-wraith'; reason: 'seven' | 'warden'; resume: ResumePhase }
  | { kind: 'steal'; candidates: number[]; resume: ResumePhase }
  | { kind: 'main' }
  | { kind: 'decree'; remaining: number; resume: ResumePhase }
  | { kind: 'trade'; offer: TradeOffer }
  | { kind: 'ended'; winner: number };

export type PhaseKind = Phase['kind'];

export interface GameStats {
  /** Histogram of dice totals, index 0..12. */
  rolls: number[];
  /** Resources gained from production/setup/omens per player. */
  gained: ResourceCounts[];
  trades: number[];
  bankTrades: number[];
  stolen: number[];
  discarded: number[];
  omensBought: number[];
}

export interface GameState {
  schema: 1;
  config: GameConfig;
  board: Board;
  /** Serialized RNG state (mulberry32). */
  rng: number;
  players: PlayerState[];
  bank: ResourceCounts;
  /** Remaining Omen deck; the last element is drawn next. */
  omenDeck: OmenType[];
  buildings: Record<VertexId, Building>;
  causeways: Record<EdgeId, number>;
  wraithHex: number;
  phase: Phase;
  currentPlayer: number;
  /** 0 during setup, then increments on every EndTurn (starting at 1). */
  turn: number;
  /** 0 during setup, then 1-based round count. */
  round: number;
  setupOrder: number[];
  /** Roll-off rounds for first player: each entry lists [seat, die1, die2]. */
  rollOff: [number, number, number][][];
  firstPlayer: number;
  dice: [number, number] | null;
  hasRolled: boolean;
  omenPlayedThisTurn: boolean;
  longestCauseway: { holder: number | null; lengths: number[] };
  greatestHost: { holder: number | null };
  /** Seat the device must be passed to (hot-seat privacy) or null. */
  handoff: number | null;
  /** Seat currently holding the device in hot-seat mode. */
  viewer: number | null;
  winner: number | null;
  nextTradeId: number;
  stats: GameStats;
  actionCount: number;
}

// ---------------------------------------------------------------- Actions

type A<T extends string, P = object> = { type: T; player: number } & P;

export type Action =
  | A<'RollDice'>
  | A<'PlaceSetupOutpost', { vertex: VertexId }>
  | A<'PlaceSetupCauseway', { edge: EdgeId }>
  | A<'Discard', { cards: Partial<ResourceCounts> }>
  | A<'MoveWraith', { hex: number }>
  | A<'StealFrom', { victim: number }>
  | A<'BuildCauseway', { edge: EdgeId }>
  | A<'BuildOutpost', { vertex: VertexId }>
  | A<'BuildCitadel', { vertex: VertexId }>
  | A<'BuyOmen'>
  | A<'PlayWarden'>
  | A<'PlayDecree'>
  | A<'PlayHarvestPact', { resources: Resource[] }>
  | A<'PlayBloodTithe', { resource: Resource }>
  | A<
      'ProposeTrade',
      { give: Partial<ResourceCounts>; want: Partial<ResourceCounts>; to: number[] | 'all' }
    >
  | A<
      'RespondTrade',
      {
        response: 'accept' | 'decline' | 'counter';
        /** For counters: what the responder gives / wants. */
        give?: Partial<ResourceCounts>;
        want?: Partial<ResourceCounts>;
      }
    >
  | A<'CancelTrade'>
  | A<'BankTrade', { give: Resource; receive: Resource; count?: number }>
  | A<'EndTurn'>
  | A<'AckPassDevice'>;

export type ActionType = Action['type'];

// ---------------------------------------------------------------- Events

export interface VpBreakdown {
  outposts: number;
  citadels: number;
  longest: number;
  host: number;
  relics: number;
  total: number;
  publicTotal: number;
}

export type GameEvent =
  | { type: 'GameStarted'; firstPlayer: number }
  | { type: 'DevicePassed'; player: number }
  | { type: 'SetupOutpostPlaced'; player: number; vertex: VertexId; round: 1 | 2 }
  | { type: 'SetupResourcesGranted'; player: number; gains: ResourceCounts }
  | { type: 'SetupComplete' }
  | { type: 'CausewayBuilt'; player: number; edge: EdgeId; free: boolean }
  | { type: 'OutpostBuilt'; player: number; vertex: VertexId }
  | { type: 'CitadelBuilt'; player: number; vertex: VertexId }
  | { type: 'DiceRolled'; player: number; dice: [number, number]; total: number }
  | {
      type: 'ResourcesProduced';
      roll: number;
      /** Gains per player index. */
      gains: ResourceCounts[];
      /** Hexes that actually paid out. */
      hexes: number[];
      /** Hex with the rolled number blocked by the Wraith, if any. */
      blockedHex: number | null;
    }
  | {
      type: 'ProductionShortage';
      resource: Resource;
      owed: number[];
      /** Player who received the remainder, or null if nobody was paid. */
      paid: number | null;
      amount: number;
    }
  | { type: 'DiscardRequired'; pending: number[] }
  | { type: 'Discarded'; player: number; cards: ResourceCounts }
  | { type: 'WraithMoved'; player: number; from: number; to: number }
  | { type: 'Stolen'; thief: number; victim: number; resource: Resource }
  | { type: 'StealSkipped'; player: number }
  | { type: 'OmenBought'; player: number; omen: OmenType }
  | { type: 'OmenPlayed'; player: number; omen: OmenType }
  | { type: 'HarvestTaken'; player: number; resources: ResourceCounts }
  | { type: 'TitheTaken'; player: number; resource: Resource; total: number; from: number[] }
  | { type: 'TradeProposed'; offer: TradeOffer }
  | { type: 'TradeDeclined'; player: number; offerId: number }
  | { type: 'TradeCountered'; player: number; offer: TradeOffer }
  | {
      type: 'TradeCompleted';
      proposer: number;
      accepter: number;
      gave: ResourceCounts;
      got: ResourceCounts;
    }
  | { type: 'TradeClosed'; reason: 'cancelled' | 'all-declined' }
  | {
      type: 'BankTraded';
      player: number;
      give: Resource;
      giveCount: number;
      receive: Resource;
      receiveCount: number;
      rate: number;
    }
  | { type: 'LongestCausewayChanged'; holder: number | null; previous: number | null; length: number }
  | { type: 'GreatestHostChanged'; holder: number | null; previous: number | null; count: number }
  | { type: 'TurnEnded'; player: number }
  | { type: 'TurnStarted'; player: number; turn: number; round: number }
  | { type: 'GameWon'; player: number; vp: number; breakdown: VpBreakdown[] };

export type GameEventType = GameEvent['type'];

// ---------------------------------------------------------------- Errors

export type GameErrorCode =
  | 'GAME_OVER'
  | 'AWAITING_HANDOFF'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'MUST_ROLL'
  | 'ILLEGAL_SPOT'
  | 'TOO_CLOSE'
  | 'NOT_CONNECTED'
  | 'OCCUPIED'
  | 'CANNOT_AFFORD'
  | 'NO_SUPPLY'
  | 'BANK_EMPTY'
  | 'DECK_EMPTY'
  | 'NO_CARD'
  | 'CARD_LOCKED'
  | 'OMEN_LIMIT'
  | 'INVALID';

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface ActionOutcome {
  state: GameState;
  events: GameEvent[];
}
