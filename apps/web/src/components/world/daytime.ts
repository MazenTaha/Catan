import type { GameState } from '@hexfall/engine';

/**
 * The island's time of day (DECISIONS #40). It follows the game, so everyone online shares it:
 * each round is a stretch of the day (sunrise, morning, midday, afternoon, sunset, dusk,
 * midnight, the small hours) and every turn within the round moves the clock on a little.
 * No three.js here: the board and the title block read the clock too.
 */
export const DAY_STAGES = [
  { hour: 6, name: 'Sunrise' },
  { hour: 9, name: 'Morning' },
  { hour: 12, name: 'Midday' },
  { hour: 15, name: 'Afternoon' },
  { hour: 18.3, name: 'Sunset' },
  { hour: 20.2, name: 'Dusk' },
  { hour: 0, name: 'Midnight' },
  { hour: 3.5, name: 'Small hours' },
] as const;

/** Hours since midnight for a game position (setup is a bright morning). */
export function hourOf(s: Pick<GameState, 'round' | 'currentPlayer' | 'firstPlayer' | 'players'>): number {
  if (s.round <= 0) return 9;
  const n = s.players.length;
  const within = ((s.currentPlayer - s.firstPlayer + n) % n) / n;
  const i = (s.round - 1) % DAY_STAGES.length;
  const a = DAY_STAGES[i].hour;
  let b: number = DAY_STAGES[(i + 1) % DAY_STAGES.length].hour;
  if (b < a) b += 24;
  return (a + (b - a) * within) % 24;
}

export function stageName(hour: number): string {
  let best: string = DAY_STAGES[0].name;
  let bestD = Infinity;
  for (const s of DAY_STAGES) {
    const d = Math.min(Math.abs(s.hour - hour), 24 - Math.abs(s.hour - hour));
    if (d < bestD) {
      bestD = d;
      best = s.name;
    }
  }
  return best;
}

/** 1 in full daylight, 0 in deep night. */
export function daylight(hour: number): number {
  const sunUp = Math.sin(((hour - 6) / 12) * Math.PI);
  return Math.min(1, Math.max(0, sunUp * 1.6 + 0.25));
}
