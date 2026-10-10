import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeMusic } from '../src/audio/MusicAnalyzer';
import { synthesizeDemoTrack } from '../src/audio/demoTrack';
import type { MusicAnalysis } from '../src/audio/analysisTypes';
import { distanceAtSongTime } from '../src/game/runTiming';
import { SAMPLE_FIELDS, SAMPLE_STRIDE, TrackGenerator } from '../src/track/TrackGenerator';
import { VehicleController } from '../src/vehicle/VehicleController';
import { GROUND_LEVEL, generateChunkScenery, type Prop } from '../src/world/SceneryGenerator';
import { buildProgress, paletteAt, planWorld } from '../src/world/WorldPlanner';
import { PALETTES_BY_LEVEL } from '../src/world/palettes';

const { P } = SAMPLE_FIELDS;
const tuning = new VehicleController(16).tuning;
const distanceAt = (t: number) => distanceAtSongTime(t, tuning);

let demo: MusicAnalysis;
beforeAll(() => {
  const track = synthesizeDemoTrack();
  demo = analyzeMusic(track.samples, track.sampleRate);
});

describe('planWorld (§5.4, §5.5)', () => {
  it('is deterministic and gives each section a palette suited to its level', () => {
    const plan = planWorld(demo, 3, distanceAt);
    expect(planWorld(demo, 3, distanceAt)).toEqual(plan);
    expect(plan.palettes).toHaveLength(demo.sections.length);
    plan.palettes.forEach((entry, i) => {
      expect(PALETTES_BY_LEVEL[demo.sections[i].level]).toContain(entry.palette);
      if (i > 0) expect(entry.palette).not.toBe(plan.palettes[i - 1].palette);
    });
    expect(paletteAt(plan, demo.sections[2].start + 1)).toBe(plan.palettes[2].palette);
  });

  it('puts one tunnel ring on each beat at the start of every intense section', () => {
    const plan = planWorld(demo, 3, distanceAt);
    const intense = demo.sections.filter((s, i) => i > 0 && s.level === 'high');
    expect(plan.tunnels).toHaveLength(intense.length);
    const beatTimes = demo.beats.map((b) => b.time);
    for (const tunnel of plan.tunnels) {
      expect(tunnel.rings).toHaveLength(16);
      for (const ring of tunnel.rings) {
        expect(beatTimes).toContain(ring.time);
        expect(ring.distance).toBeCloseTo(distanceAt(ring.time), 9);
      }
    }
  });

  it('places monuments at drops and marks build-ups before intense sections', () => {
    const plan = planWorld(demo, 3, distanceAt);
    expect(plan.monuments.map((m) => m.time)).toEqual(demo.drops);
    expect(plan.builds.length).toBeGreaterThan(0);
    const build = plan.builds[0];
    expect(buildProgress(plan, build.start)).toBe(0);
    expect(buildProgress(plan, (build.start + build.end) / 2)).toBeCloseTo(0.5, 9);
    expect(buildProgress(plan, build.end + 0.1)).toBe(0);
  });
});

describe('generateChunkScenery (§5.1–§5.3, §12.2)', () => {
  const CHUNKS = 60;

  function sceneryFor(seed: number, density: number) {
    const generator = new TrackGenerator(seed);
    generator.ensureChunk(CHUNKS + 8);
    const props: Prop[][] = [];
    for (let i = 0; i <= CHUNKS; i++) props.push(generateChunkScenery(generator, i, seed, density));
    return { generator, props };
  }

  it('is deterministic per seed and chunk', () => {
    const a = sceneryFor(4, 0.6).props;
    const b = sceneryFor(4, 0.6).props;
    expect(b).toEqual(a);
  });

  for (const seed of [1, 2, 3, 42, 777]) {
    it(`never puts a structure on or next to the road (seed ${seed})`, () => {
      const { generator, props } = sceneryFor(seed, 1);
      const roadHalf = generator.roadWidth / 2;
      const centreline: number[][] = [];
      for (let i = 0; i <= CHUNKS + 8; i++) {
        const s = generator.getChunk(i)!.samples;
        for (let o = 0; o < s.length; o += SAMPLE_STRIDE) centreline.push([s[o + P], s[o + P + 2]]);
      }
      for (const prop of props.flat()) {
        if (prop.type === 'post' || prop.type === 'pillar') continue;
        const radius = prop.type === 'tower' ? prop.sx * 0.75 : prop.sx;
        let nearest = Infinity;
        for (const [x, z] of centreline) nearest = Math.min(nearest, Math.hypot(x - prop.x, z - prop.z));
        expect(nearest).toBeGreaterThan(roadHalf + radius);
      }
    });
  }

  it('keeps posts beside the road and pillars below it', () => {
    const { generator, props } = sceneryFor(9, 0.5);
    const roadHalf = generator.roadWidth / 2;
    for (const prop of props.flat()) {
      if (prop.type === 'pillar') {
        expect(prop.y).toBe(GROUND_LEVEL);
        expect(prop.sy).toBeGreaterThan(4);
      }
      if (prop.type === 'post') {
        let nearest = Infinity;
        for (let i = 0; i <= CHUNKS; i++) {
          const s = generator.getChunk(i)!.samples;
          for (let o = 0; o < s.length; o += SAMPLE_STRIDE) nearest = Math.min(nearest, Math.hypot(s[o + P] - prop.x, s[o + P + 2] - prop.z));
        }
        expect(nearest).toBeGreaterThan(roadHalf + 0.5);
      }
    }
  });

  it('builds more and taller structures with higher density', () => {
    const count = (props: Prop[][], type: Prop['type']) => props.flat().filter((p) => p.type === type).length;
    const calm = sceneryFor(5, 0).props;
    const intense = sceneryFor(5, 1).props;
    expect(count(intense, 'tower')).toBeGreaterThan(count(calm, 'tower') * 1.5);
    expect(count(intense, 'crystal')).toBeGreaterThan(count(calm, 'crystal'));
    const meanHeight = (props: Prop[][]) => {
      const towers = props.flat().filter((p) => p.type === 'tower');
      return towers.reduce((a, p) => a + p.sy, 0) / towers.length;
    };
    expect(meanHeight(intense)).toBeGreaterThan(meanHeight(calm));
  });
});
