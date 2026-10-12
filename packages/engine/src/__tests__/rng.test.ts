import { describe, expect, it } from 'vitest';
import { Rng, hashSeed, mulberry32, randomSeed } from '../rng';

describe('rng', () => {
  it('hashes seeds deterministically', () => {
    expect(hashSeed('pyre-thorn-417')).toBe(hashSeed('pyre-thorn-417'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('mulberry32 is a pure step function', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
  });

  it('produces identical sequences for identical seeds', () => {
    const a = Rng.fromSeed('x');
    const b = Rng.fromSeed('x');
    const sa = Array.from({ length: 50 }, () => a.die());
    const sb = Array.from({ length: 50 }, () => b.die());
    expect(sa).toEqual(sb);
    expect(a.state).toBe(b.state);
  });

  it('dice are roughly uniform and in range', () => {
    const r = Rng.fromSeed('dice');
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) counts[r.die()]++;
    expect(counts[0]).toBe(0);
    for (let f = 1; f <= 6; f++) expect(Math.abs(counts[f] - 10000)).toBeLessThan(500);
  });

  it('shuffle keeps elements and does not mutate input', () => {
    const r = Rng.fromSeed('s');
    const src = [1, 2, 3, 4, 5, 6, 7];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([...out].sort()).toEqual(src);
  });

  it('pick throws on empty and range is inclusive', () => {
    const r = Rng.fromSeed('p');
    expect(() => r.pick([])).toThrow();
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(r.range(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('randomSeed produces word-word-number', () => {
    expect(randomSeed(() => 0.5)).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
  });
});
