/**
 * Seeded, serializable RNG. The whole generator state is a single uint32 so it can live
 * inside `GameState` and make every game exactly replayable from `seed + actions`.
 */

/** cyrb53-style string hash folded to uint32. Stable across platforms. */
export function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** One mulberry32 step: returns the next state and a float in [0, 1). */
export function mulberry32(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: next, value };
}

/**
 * A small mutable cursor over the serializable state, used inside a single pure reducer
 * call. Create it from `state.rng`, draw, then write `rng.state` back into the new state.
 */
export class Rng {
  constructor(public state: number) {}

  static fromSeed(seed: string): Rng {
    return new Rng(hashSeed(seed));
  }

  next(): number {
    const r = mulberry32(this.state);
    this.state = r.state;
    return r.value;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [min, max] inclusive. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  die(): number {
    return this.range(1, 6);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty list');
    return items[this.int(items.length)];
  }

  /** Fisher–Yates; returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

const SEED_WORDS = [
  'ash', 'bone', 'crow', 'dusk', 'ember', 'fen', 'gloam', 'hollow', 'iron', 'jade', 'knell',
  'lich', 'mire', 'night', 'omen', 'pyre', 'quill', 'rot', 'shade', 'thorn', 'umbra', 'vigil',
  'wraith', 'yew', 'cinder', 'rune', 'veil', 'barrow', 'grave', 'moth',
];

/** Human-friendly random seed, e.g. "pyre-thorn-417". Uses Math.random (UI only). */
export function randomSeed(random: () => number = Math.random): string {
  const w = () => SEED_WORDS[Math.floor(random() * SEED_WORDS.length)];
  return `${w()}-${w()}-${Math.floor(random() * 900 + 100)}`;
}
