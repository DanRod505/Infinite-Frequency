import { describe, expect, it } from 'vitest';
import { Rng, hashSeed, mixSeed } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces values in [0, 1)', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('hashes and mixes seeds stably', () => {
    expect(hashSeed('neon')).toBe(hashSeed('neon'));
    expect(hashSeed('neon')).not.toBe(hashSeed('cyber'));
    expect(mixSeed(7, 0)).not.toBe(mixSeed(7, 1));
  });
});
