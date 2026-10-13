/**
 * Every player-facing name lives here so the whole game can be renamed in one place.
 * Engine keys stay neutral (wood/clay/wool/grain/ore…).
 */
import type {
  BotLevel,
  HarborKind,
  OmenType,
  PlayerColor,
  Resource,
  Sigil,
  Terrain,
} from '@hexfall/engine';

export const GAME_NAME = 'Catan Night';

export const RESOURCE_NAME: Record<Resource, string> = {
  wood: 'Lumber',
  clay: 'Brick',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

export const TERRAIN_NAME: Record<Terrain, string> = {
  witchwood: 'Forest',
  ashen: 'Hills',
  moors: 'Pasture',
  fields: 'Fields',
  peaks: 'Mountains',
  waste: 'Desert',
};

export const PIECE_NAME = {
  causeway: 'Road',
  outpost: 'Settlement',
  citadel: 'City',
  omen: 'Development card',
} as const;

export const PIECE_PLURAL = {
  causeway: 'Roads',
  outpost: 'Settlements',
  citadel: 'Cities',
  omen: 'Development cards',
} as const;

export const OMEN_NAME: Record<OmenType, string> = {
  warden: 'Knight',
  relic: 'Victory Point',
  decree: 'Road Building',
  harvest: 'Year of Plenty',
  tithe: 'Monopoly',
};

export const OMEN_TEXT: Record<OmenType, string> = {
  warden: 'Move the robber and steal 1 resource from a player with a building on its new hex. Counts toward Largest Army.',
  relic: 'Worth 1 victory point. Kept hidden until it wins you the game.',
  decree: 'Place 2 roads for free.',
  harvest: 'Take any 2 resources from the bank.',
  tithe: 'Name a resource. Every other player gives you all of theirs.',
};

export const OMEN_FLAVOR: Record<OmenType, string> = {
  warden: 'The knights ride out under the moon.',
  relic: 'A chapel, a library, a market — your island prospers.',
  decree: 'Two roads, laid by lantern light.',
  harvest: 'A bountiful year fills the storehouses.',
  tithe: 'Corner the market before dawn.',
};

export const WRAITH = 'the robber';
export const WRAITH_TITLE = 'The robber';
export const LONGEST = 'Longest Road';
export const HOST = 'Largest Army';
export const ISLE = 'the island';
export const NEW_ISLE = 'New game';

export const HARBOR_NAME: Record<HarborKind, string> = {
  any: '3:1 harbor',
  wood: 'Lumber harbor',
  clay: 'Brick harbor',
  wool: 'Wool harbor',
  grain: 'Grain harbor',
  ore: 'Ore harbor',
};

export const COLOR_NAME: Record<PlayerColor, string> = {
  crimson: 'Red',
  frost: 'Blue',
  bone: 'White',
  violet: 'Orange',
};

export const COLOR_HEX: Record<PlayerColor, string> = {
  crimson: '#c4302b',
  frost: '#3f7fd4',
  bone: '#e8e2d0',
  violet: '#e8842c',
};

/** Darker outline tone per player color. */
export const COLOR_DARK: Record<PlayerColor, string> = {
  crimson: '#4a0f0d',
  frost: '#0f2647',
  bone: '#4a4436',
  violet: '#4d2508',
};

export const SIGIL_NAME: Record<Sigil, string> = {
  skull: 'Skull',
  moon: 'Moon',
  eye: 'Eye',
  thorn: 'Thorn',
};

export const BOT_NAME: Record<BotLevel, string> = {
  wanderer: 'Easy',
  warlord: 'Medium',
  archdemon: 'Hard',
};

export const BOT_BLURB: Record<BotLevel, string> = {
  wanderer: 'Builds where it likes',
  warlord: 'Counts pips, trades sensibly',
  archdemon: 'Plans ahead, blocks and steals',
};

export const DEFAULT_NAMES = ['Ashwyn', 'Morrow', 'Isolde', 'Vex'];

export const LAYOUT_NAME = {
  balanced: 'Balanced',
  random: 'Fully random',
  beginner: 'Beginner board',
} as const;
