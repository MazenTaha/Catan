/**
 * Neutral internal keys. Display names live in the web app's `lexicon.ts`.
 */

export const RESOURCES = ['wood', 'clay', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceCounts = Record<Resource, number>;

export const TERRAINS = ['witchwood', 'ashen', 'moors', 'fields', 'peaks', 'waste'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  witchwood: 'wood',
  ashen: 'clay',
  moors: 'wool',
  fields: 'grain',
  peaks: 'ore',
  waste: null,
};

export const TERRAIN_COUNTS: Record<Terrain, number> = {
  witchwood: 4,
  moors: 4,
  fields: 4,
  ashen: 3,
  peaks: 3,
  waste: 1,
};

export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;

export const OMEN_TYPES = ['warden', 'relic', 'decree', 'harvest', 'tithe', 'manup'] as const;
export type OmenType = (typeof OMEN_TYPES)[number];

export const OMEN_DECK_COUNTS: Record<OmenType, number> = {
  warden: 14,
  relic: 5,
  decree: 2,
  harvest: 2,
  tithe: 2,
  /** Man up: only in live-combat games, which add MANUP_CARDS of them (see buildOmenDeck). */
  manup: 0,
};

export const MANUP_CARDS = 6;

/** Live combat in the 3D walk (DECISIONS #40). */
export const MAX_HEALTH = 100;
export const BULLETS = 5;
export const WEAPONS = ['fist', 'sword', 'revolver'] as const;
export type Weapon = (typeof WEAPONS)[number];
export const DAMAGE: Record<Weapon, number> = { fist: 10, sword: 25, revolver: 50 };

export const PLAYER_COLORS = ['crimson', 'frost', 'bone', 'violet'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const SIGILS = ['skull', 'moon', 'eye', 'thorn'] as const;
export type Sigil = (typeof SIGILS)[number];

export const BANK_START = 19;
export const TOTAL_RESOURCES = BANK_START * RESOURCES.length; // 95

export const SUPPLY = { causeways: 15, outposts: 5, citadels: 4 } as const;

export type CostKey = 'causeway' | 'outpost' | 'citadel' | 'omen';

export const COSTS: Record<CostKey, Partial<ResourceCounts>> = {
  causeway: { wood: 1, clay: 1 },
  outpost: { wood: 1, clay: 1, wool: 1, grain: 1 },
  citadel: { grain: 2, ore: 3 },
  omen: { wool: 1, grain: 1, ore: 1 },
};

export const LONGEST_MIN = 5;
export const HOST_MIN = 3;
export const BONUS_VP = 2;
export const HAND_LIMIT = 7;

/** Pip count (ways to roll the number with 2d6). */
export function pips(n: number | null | undefined): number {
  if (!n || n === 7) return 0;
  return 6 - Math.abs(7 - n);
}

export function emptyCounts(): ResourceCounts {
  return { wood: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
}

export function fullCounts(n: number): ResourceCounts {
  return { wood: n, clay: n, wool: n, grain: n, ore: n };
}

export function totalCards(c: Partial<ResourceCounts>): number {
  let t = 0;
  for (const r of RESOURCES) t += c[r] ?? 0;
  return t;
}

export function toCounts(c: Partial<ResourceCounts>): ResourceCounts {
  return {
    wood: c.wood ?? 0,
    clay: c.clay ?? 0,
    wool: c.wool ?? 0,
    grain: c.grain ?? 0,
    ore: c.ore ?? 0,
  };
}

export function addCounts(a: ResourceCounts, b: Partial<ResourceCounts>, sign = 1): ResourceCounts {
  const out = { ...a };
  for (const r of RESOURCES) out[r] += sign * (b[r] ?? 0);
  return out;
}

export function hasAtLeast(have: ResourceCounts, need: Partial<ResourceCounts>): boolean {
  return RESOURCES.every((r) => have[r] >= (need[r] ?? 0));
}

export function isResource(x: unknown): x is Resource {
  return typeof x === 'string' && (RESOURCES as readonly string[]).includes(x);
}
