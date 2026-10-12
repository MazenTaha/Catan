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

export const GAME_NAME = 'Hexfall';

export const RESOURCE_NAME: Record<Resource, string> = {
  wood: 'Blackwood',
  clay: 'Cinderclay',
  wool: 'Ghostwool',
  grain: 'Wraithgrain',
  ore: 'Soul-iron',
};

export const TERRAIN_NAME: Record<Terrain, string> = {
  witchwood: 'Witchwood',
  ashen: 'Ashen Hills',
  moors: 'Gloom Moors',
  fields: 'Blighted Fields',
  peaks: 'Obsidian Peaks',
  waste: 'The Dead Waste',
};

export const PIECE_NAME = {
  causeway: 'Causeway',
  outpost: 'Outpost',
  citadel: 'Citadel',
  omen: 'Omen card',
} as const;

export const PIECE_PLURAL = {
  causeway: 'Causeways',
  outpost: 'Outposts',
  citadel: 'Citadels',
  omen: 'Omen cards',
} as const;

export const OMEN_NAME: Record<OmenType, string> = {
  warden: 'Warden',
  relic: 'Relic',
  decree: "Pathmaker's Decree",
  harvest: 'Harvest Pact',
  tithe: 'Blood Tithe',
};

export const OMEN_TEXT: Record<OmenType, string> = {
  warden: 'Move the Wraith and rob a neighbour of its new haunt. Counts toward your Host.',
  relic: 'A buried relic of the old kings. Worth 1 victory point, revealed only when you triumph.',
  decree: 'Lay 2 Causeways at no cost.',
  harvest: 'Take any 2 resources from the bank.',
  tithe: 'Name a resource. Every other player surrenders all of it to you.',
};

export const OMEN_FLAVOR: Record<OmenType, string> = {
  warden: 'Iron-masked, oath-bound, never sleeping.',
  relic: 'Cold to the touch. Warm in the dark.',
  decree: 'By order of the drowned throne, let the road be laid.',
  harvest: 'The soil remembers what was promised.',
  tithe: 'Blood is owed. Blood is paid.',
};

export const WRAITH = 'the Wraith';
export const WRAITH_TITLE = 'The Wraith';
export const LONGEST = 'Longest Causeway';
export const HOST = 'Greatest Host';
export const ISLE = 'the Isle';
export const NEW_ISLE = 'New isle';

export const HARBOR_NAME: Record<HarborKind, string> = {
  any: "Smugglers' Cove",
  wood: 'Blackwood Wharf',
  clay: 'Cinderclay Quay',
  wool: 'Ghostwool Landing',
  grain: 'Wraithgrain Pier',
  ore: 'Soul-iron Dock',
};

export const COLOR_NAME: Record<PlayerColor, string> = {
  crimson: 'Crimson',
  frost: 'Frost-blue',
  bone: 'Bone-white',
  violet: 'Arcane-violet',
};

export const COLOR_HEX: Record<PlayerColor, string> = {
  crimson: '#c4302b',
  frost: '#3f7fd4',
  bone: '#e8e2d0',
  violet: '#8f55d6',
};

/** Darker outline tone per player color. */
export const COLOR_DARK: Record<PlayerColor, string> = {
  crimson: '#4a0f0d',
  frost: '#0f2647',
  bone: '#4a4436',
  violet: '#2d1349',
};

export const SIGIL_NAME: Record<Sigil, string> = {
  skull: 'Skull',
  moon: 'Moon',
  eye: 'Eye',
  thorn: 'Thorn',
};

export const BOT_NAME: Record<BotLevel, string> = {
  wanderer: 'Wanderer',
  warlord: 'Warlord',
  archdemon: 'Archdemon',
};

export const BOT_BLURB: Record<BotLevel, string> = {
  wanderer: 'Easy · drifts and builds on whim',
  warlord: 'Medium · counts pips, hoards wisely',
  archdemon: 'Hard · plans, blocks and schemes',
};

export const DEFAULT_NAMES = ['Ashwyn', 'Morrow', 'Isolde', 'Vex'];

export const LAYOUT_NAME = {
  balanced: 'Balanced',
  random: 'Fully random',
  beginner: 'Beginner isle',
} as const;
