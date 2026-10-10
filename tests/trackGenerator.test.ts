import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SAMPLE_FIELDS, SAMPLE_STRIDE, TrackFrame, TrackGenerator } from '../src/track/TrackGenerator';

const { P, T, R, U, K, PITCH } = SAMPLE_FIELDS;
const CHUNKS = 80;

function vec(s: Float64Array, offset: number): Vector3 {
  return new Vector3(s[offset], s[offset + 1], s[offset + 2]);
}

describe('TrackGenerator', () => {
  it('is deterministic for the same seed (GDD §4.4)', () => {
    const a = new TrackGenerator(99);
    const b = new TrackGenerator(99);
    a.ensureChunk(CHUNKS);
    b.ensureChunk(CHUNKS);
    for (let i = 0; i <= CHUNKS; i++) {
      expect(Array.from(a.getChunk(i)!.samples)).toEqual(Array.from(b.getChunk(i)!.samples));
    }
  });

  it('produces different tracks for different seeds', () => {
    const a = new TrackGenerator(1);
    const b = new TrackGenerator(2);
    a.ensureChunk(10);
    b.ensureChunk(10);
    expect(Array.from(a.getChunk(10)!.samples)).not.toEqual(Array.from(b.getChunk(10)!.samples));
  });

  it('does not depend on how generation is batched', () => {
    const batched = new TrackGenerator(5);
    batched.ensureChunk(30);
    const streamed = new TrackGenerator(5);
    for (let i = 0; i <= 30; i++) {
      streamed.ensureChunk(i);
      streamed.pruneBefore(Math.max(0, i - 1) * streamed.chunkLength);
    }
    expect(Array.from(streamed.getChunk(30)!.samples)).toEqual(Array.from(batched.getChunk(30)!.samples));
  });

  for (const seed of [1, 7, 42, 1337, 0xdeadbeef]) {
    describe(`seed ${seed}`, () => {
      const gen = new TrackGenerator(seed);
      gen.ensureChunk(CHUNKS);
      const c = gen.config;

      it('has no gaps between chunks (GDD §12.2)', () => {
        for (let i = 0; i < CHUNKS; i++) {
          const prev = gen.getChunk(i)!;
          const next = gen.getChunk(i + 1)!;
          const last = (prev.sampleCount - 1) * SAMPLE_STRIDE;
          for (let f = 0; f < SAMPLE_STRIDE; f++) {
            expect(next.samples[f]).toBe(prev.samples[last + f]);
          }
        }
      });

      it('keeps sample spacing, curvature, pitch and bank within limits (GDD §4.3)', () => {
        const maxTurnPerSample = c.maxCurvature * c.sampleSpacing + 1e-9;
        for (let i = 0; i <= CHUNKS; i++) {
          const s = gen.getChunk(i)!.samples;
          for (let j = 0; j < c.segmentsPerChunk; j++) {
            const a = j * SAMPLE_STRIDE;
            const b = a + SAMPLE_STRIDE;
            expect(vec(s, a + P).distanceTo(vec(s, b + P))).toBeCloseTo(c.sampleSpacing, 3);
            expect(vec(s, a + T).angleTo(vec(s, b + T))).toBeLessThanOrEqual(maxTurnPerSample + c.maxPitchRate * c.sampleSpacing);
            expect(Math.abs(s[b + K] - s[a + K])).toBeLessThanOrEqual(c.maxCurvatureRate * c.sampleSpacing + 1e-12);
            expect(Math.abs(s[b + PITCH] - s[a + PITCH])).toBeLessThanOrEqual(c.maxPitchRate * c.sampleSpacing + 1e-12);
          }
          for (let j = 0; j < gen.getChunk(i)!.sampleCount; j++) {
            const o = j * SAMPLE_STRIDE;
            expect(Math.abs(s[o + K])).toBeLessThanOrEqual(c.maxCurvature + 1e-12);
            expect(Math.abs(s[o + PITCH])).toBeLessThanOrEqual(c.maxPitch + 1e-12);
            // Bank = angle between the surface normal and the unbanked vertical plane.
            const right = vec(s, o + R);
            expect(Math.abs(Math.asin(right.y))).toBeLessThanOrEqual(c.maxBank + 1e-9);
          }
        }
      });

      it('stores orthonormal frames', () => {
        for (let i = 0; i <= CHUNKS; i += 7) {
          const s = gen.getChunk(i)!.samples;
          for (let j = 0; j < gen.getChunk(i)!.sampleCount; j += 5) {
            const o = j * SAMPLE_STRIDE;
            const t = vec(s, o + T);
            const r = vec(s, o + R);
            const u = vec(s, o + U);
            expect(t.length()).toBeCloseTo(1, 9);
            expect(r.length()).toBeCloseTo(1, 9);
            expect(u.length()).toBeCloseTo(1, 9);
            expect(t.dot(r)).toBeCloseTo(0, 9);
            expect(t.dot(u)).toBeCloseTo(0, 9);
            expect(r.dot(u)).toBeCloseTo(0, 9);
            expect(u.y).toBeGreaterThan(0.9); // road surface always faces up
          }
        }
      });

      it('stays within the elevation band and keeps heading forward', () => {
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i <= CHUNKS; i++) {
          const s = gen.getChunk(i)!.samples;
          for (let j = 0; j < gen.getChunk(i)!.sampleCount; j++) {
            const o = j * SAMPLE_STRIDE;
            minY = Math.min(minY, s[o + P + 1]);
            maxY = Math.max(maxY, s[o + P + 1]);
            // Never heading backwards (would allow the road to loop over itself).
            expect(s[o + T + 2]).toBeLessThan(0);
          }
        }
        expect(minY).toBeGreaterThan(c.minElevation - 15);
        expect(maxY).toBeLessThan(c.maxElevation + 15);
      });
    });
  }

  it('starts on a straight, flat section', () => {
    const gen = new TrackGenerator(3);
    const frame = gen.sampleFrame(0, new TrackFrame());
    expect(frame.position.length()).toBe(0);
    expect(frame.tangent.z).toBeCloseTo(-1, 9);
    expect(frame.up.y).toBeCloseTo(1, 9);
  });

  it('samples continuous frames across chunk boundaries', () => {
    const gen = new TrackGenerator(11);
    const before = new TrackFrame();
    const after = new TrackFrame();
    for (let i = 1; i < 20; i++) {
      const boundary = i * gen.chunkLength;
      gen.sampleFrame(boundary - 1e-6, before);
      gen.sampleFrame(boundary + 1e-6, after);
      expect(before.position.distanceTo(after.position)).toBeLessThan(1e-4);
      expect(before.tangent.angleTo(after.tangent)).toBeLessThan(1e-4);
    }
  });

  it('prunes old chunks and refuses to sample them', () => {
    const gen = new TrackGenerator(8);
    gen.ensureChunk(10);
    gen.pruneBefore(5 * gen.chunkLength);
    expect(gen.oldestChunkIndex).toBe(5);
    expect(gen.getChunk(4)).toBeUndefined();
    expect(gen.getChunk(5)).toBeDefined();
    expect(() => gen.sampleFrame(10, new TrackFrame())).toThrow();
  });
});

describe('TrackGenerator with musical intensity', () => {
  const maxAbsCurvature = (gen: TrackGenerator, chunks: number) => {
    let mean = 0;
    let n = 0;
    for (let i = 1; i <= chunks; i++) {
      const s = gen.getChunk(i)!.samples;
      for (let j = 0; j < gen.getChunk(i)!.sampleCount; j++, n++) mean += Math.abs(s[j * SAMPLE_STRIDE + K]);
    }
    return mean / n;
  };

  it('stays deterministic and within limits, with calmer curves at low intensity', () => {
    const calm = new TrackGenerator(21, {}, () => 0);
    const intense = new TrackGenerator(21, {}, () => 1);
    const again = new TrackGenerator(21, {}, () => 0);
    calm.ensureChunk(CHUNKS);
    intense.ensureChunk(CHUNKS);
    again.ensureChunk(CHUNKS);
    expect(Array.from(again.getChunk(CHUNKS)!.samples)).toEqual(Array.from(calm.getChunk(CHUNKS)!.samples));
    expect(maxAbsCurvature(calm, CHUNKS)).toBeLessThan(maxAbsCurvature(intense, CHUNKS) * 0.8);
    for (const gen of [calm, intense]) {
      for (let i = 0; i <= CHUNKS; i++) {
        const s = gen.getChunk(i)!.samples;
        for (let j = 0; j < gen.getChunk(i)!.sampleCount; j++) {
          expect(Math.abs(s[j * SAMPLE_STRIDE + K])).toBeLessThanOrEqual(gen.config.maxCurvature + 1e-12);
        }
      }
    }
  });
});
