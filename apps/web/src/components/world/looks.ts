import type { DecorItem } from '@hexfall/net';

/**
 * Names and colours for the Character and My kingdom screens (index = the option stored in
 * the profile). Kept free of three.js so the menus don't load the 3D walk's code.
 */
export const SKIN = ['#f1d0b4', '#d9a77f', '#c08a62', '#9b6a45', '#7a4c30', '#5b3622'];
export const HAIR_COLOR = ['#1f1a17', '#4a2f1f', '#7b4a26', '#b07a3c', '#d9b46c', '#a8432a', '#cfcac2'];
export const OUTFIT = ['#3f5f8a', '#5c7a3c', '#7a3434', '#6b5136', '#4d4f58', '#8a6a2c', '#2f6b6b', '#e6dcc6'];
export const HAIR_NAMES = ['Bald', 'Short', 'Long', 'Braid', 'Top knot', 'Curls'];
export const BEARD_NAMES = ['None', 'Stubble', 'Full', 'Braided'];
export const HAT_NAMES = ['None', 'Hood', 'Leather cap', 'Iron helm', 'Circlet'];
export const CAPE_NAMES = ['None', 'Short', 'Long'];

/** Banner and rug colours of the My kingdom screen (index = KingdomDecor.tint). */
export const DECOR_TINT = ['#8a2433', '#1f4f8a', '#2f6b3a', '#5c2f78', '#b8862c', '#2a2d33'];
export const DECOR_TINT_NAMES = ['Crimson', 'Royal blue', 'Forest', 'Purple', 'Gold', 'Night'];
export const DECOR_NAMES: Record<DecorItem, string> = {
  rug: 'Woven rug',
  banner: 'Banners',
  tapestry: 'Tapestry',
  antlers: 'Antler trophy',
  chandelier: 'Candle wheel',
  bookshelf: 'Bookshelf',
  plants: 'Potted plants',
  armor: 'Armour stand',
  candles: 'Candles',
  shield: 'Crossed shields',
};
