import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeMusic } from '../src/audio/MusicAnalyzer';
import { synthesizeDemoTrack } from '../src/audio/demoTrack';
import type { MusicAnalysis } from '../src/audio/analysisTypes';
import { Rng } from '../src/core/rng';
import { LEAD_IN } from '../src/game/runTiming';
import { generateChart, type ChartOptions } from '../src/rhythm/ChartGenerator';
import { RhythmSystem, type RhythmEvent } from '../src/rhythm/RhythmSystem';
import { ScoreKeeper, computeMaxScore, rankFor } from '../src/rhythm/ScoreKeeper';
import { autopilotSteer } from '../src/rhythm/autopilot';
import { DIFFICULTY_PRESETS, SCORING, multiplierFor, type Chart, type Difficulty, type Note } from '../src/rhythm/types';
import { VehicleController, copyVehicleState, createVehicleState } from '../src/vehicle/VehicleController';

const ROAD_WIDTH = 16;
const DT = 1 / 120;
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function options(difficulty: Difficulty, seed = 1, obstacles = true): ChartOptions {
  const vehicle = new VehicleController(ROAD_WIDTH);
  return { seed, difficulty, obstacles, tuning: vehicle.tuning, roadWidth: ROAD_WIDTH, lateralLimit: vehicle.lateralLimit };
}

/** Plays a whole chart with the fixed-step simulation, like the game does. */
function play(chart: Chart, duration: number, steering: 'analog' | 'digital') {
  const vehicle = new VehicleController(ROAD_WIDTH);
  const rhythm = new RhythmSystem(chart, vehicle.tuning.halfWidth);
  const previous = createVehicleState();
  const events: RhythmEvent[] = [];
  for (let t = -LEAD_IN; t < duration + 1; t += DT) {
    copyVehicleState(vehicle.state, previous);
    let steer = autopilotSteer(vehicle.state, chart, vehicle.tuning, rhythm.upcomingNoteIndex);
    // Keyboard: full left, full right or nothing, with a small dead band.
    if (steering === 'digital') steer = Math.abs(steer) < 0.15 ? 0 : Math.sign(steer);
    vehicle.update(DT, steer);
    rhythm.step(previous, vehicle.state, (e) => events.push(e));
  }
  return { result: rhythm.score.result(), events, finished: rhythm.finished };
}

function clickAnalysis(bpm: number, seconds: number): MusicAnalysis {
  const rate = 44100;
  const samples = new Float32Array(seconds * rate);
  for (let t = 0.2, i = 0; t < seconds - 0.2; t += 60 / bpm, i++) {
    const start = Math.round(t * rate);
    for (let k = 0; k < 0.06 * rate; k++) samples[start + k] += (i % 4 === 0 ? 0.9 : 0.6) * Math.sin((2 * Math.PI * 80 * k) / rate) * Math.exp(-k / 880);
  }
  return analyzeMusic(samples, rate);
}

let demo: MusicAnalysis;
beforeAll(() => {
  const track = synthesizeDemoTrack();
  demo = analyzeMusic(track.samples, track.sampleRate);
});

describe('chart generation', () => {
  it('is deterministic for the same seed and differs between seeds', () => {
    const a = generateChart(demo, options('normal', 5));
    const b = generateChart(demo, options('normal', 5));
    const c = generateChart(demo, options('normal', 6));
    expect(b).toEqual(a);
    expect(c.notes.map((n) => n.lateral)).not.toEqual(a.notes.map((n) => n.lateral));
    // Timing comes from the music, not the seed.
    expect(c.notes.map((n) => n.time)).toEqual(a.notes.map((n) => n.time));
  });

  it('places notes on detected beats, denser with difficulty', () => {
    const counts = DIFFICULTIES.map((d) => generateChart(demo, options(d)).notes.length);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    const normal = generateChart(demo, options('normal'));
    const beatTimes = demo.beats.map((b) => b.time);
    for (const note of normal.notes) expect(beatTimes).toContain(note.time);
  });

  for (const difficulty of DIFFICULTIES) {
    it(`keeps every ${difficulty} note reachable and on the road (§6.2)`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const chart = generateChart(demo, options(difficulty, seed));
        const opts = options(difficulty, seed);
        const speed = opts.tuning.maxLateralSpeed * DIFFICULTY_PRESETS[difficulty].reachFactor;
        let prev = { time: 0, lateral: 0 };
        for (const note of chart.notes) {
          expect(Math.abs(note.lateral)).toBeLessThanOrEqual(opts.lateralLimit);
          expect(note.time - prev.time).toBeGreaterThanOrEqual(DIFFICULTY_PRESETS[difficulty].minNoteGap - 1e-9);
          expect(Math.abs(note.lateral - prev.lateral)).toBeLessThanOrEqual(speed * (note.time - prev.time) + 1e-9);
          prev = note;
        }
      }
    });
  }

  it('marks drops and intense section starts as special notes', () => {
    const chart = generateChart(demo, options('normal'));
    for (const drop of demo.drops) {
      const note = chart.notes.find((n) => n.time >= drop - 0.05)!;
      expect(note.kind).toBe('special');
    }
  });

  it('keeps obstacles on the road, off the note path and away from the intro', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const chart = generateChart(demo, options('hard', seed));
      expect(chart.obstacles.length).toBeGreaterThan(0);
      for (const obstacle of chart.obstacles) {
        expect(Math.abs(obstacle.lateral) + obstacle.halfWidth).toBeLessThanOrEqual(ROAD_WIDTH / 2 + 1e-9);
        expect(obstacle.time).toBeGreaterThanOrEqual(4);
        const before = [...chart.notes].reverse().find((n) => n.time < obstacle.time)!;
        const after = chart.notes.find((n) => n.time > obstacle.time)!;
        const lo = Math.min(before.lateral, after.lateral);
        const hi = Math.max(before.lateral, after.lateral);
        const gap = Math.max(obstacle.lateral - obstacle.halfWidth - hi, lo - (obstacle.lateral + obstacle.halfWidth));
        expect(gap).toBeGreaterThanOrEqual(2 - 1e-9);
      }
    }
  });

  it('has no obstacles on easy or when disabled', () => {
    expect(generateChart(demo, options('easy')).obstacles).toEqual([]);
    expect(generateChart(demo, options('hard', 1, false)).obstacles).toEqual([]);
  });

  it('falls back to onsets when the pulse is unreliable, and survives silence', () => {
    const rng = new Rng(9);
    const noisy = new Float32Array(44100 * 15);
    for (let t = 0.5; t < 14; t += 0.3 + rng.next() * 0.9) {
      const s = Math.round(t * 44100);
      for (let k = 0; k < 2000; k++) noisy[s + k] += Math.sin(k * 0.02) * Math.exp(-k / 600);
    }
    const analysis = analyzeMusic(noisy, 44100);
    if (!analysis.tempo.reliable) expect(generateChart(analysis, options('normal')).notes.length).toBeGreaterThan(5);
    const silent = analyzeMusic(new Float32Array(44100 * 12), 44100);
    const chart = generateChart(silent, options('normal'));
    expect(chart.notes).toEqual([]);
    expect(chart.maxScore).toBe(0);
  });
});

describe('playability (§12.1): a bot can collect everything', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: analog steering collects 100% without hitting obstacles`, () => {
      for (const seed of [1, 2, 3]) {
        const chart = generateChart(demo, options(difficulty, seed));
        const { result, finished } = play(chart, demo.duration, 'analog');
        expect(finished).toBe(true);
        expect(result.collected).toBe(result.totalNotes);
        expect(result.obstaclesHit).toBe(0);
      }
    });

    it(`${difficulty}: keyboard-style steering collects 100% without hitting obstacles`, () => {
      for (const seed of [1, 2, 3]) {
        const chart = generateChart(demo, options(difficulty, seed));
        const { result } = play(chart, demo.duration, 'digital');
        expect(result.collected).toBe(result.totalNotes);
        expect(result.obstaclesHit).toBe(0);
        expect(result.rank === 'S' || result.rank === 'A').toBe(true);
      }
    });
  }

  it('works on other tempos too', () => {
    for (const bpm of [90, 150]) {
      const analysis = clickAnalysis(bpm, 30);
      const chart = generateChart(analysis, options('hard', 3));
      const { result } = play(chart, analysis.duration, 'digital');
      expect(result.totalNotes).toBeGreaterThan(20);
      expect(result.collected).toBe(result.totalNotes);
    }
  });

  it('gives the same score for the same inputs (§13 Fase 3)', () => {
    const chart = generateChart(demo, options('normal', 4));
    expect(play(chart, demo.duration, 'digital').result).toEqual(play(chart, demo.duration, 'digital').result);
  });

  it('misses every note when not steering away from the centre', () => {
    const chart = generateChart(demo, options('normal', 2));
    const vehicle = new VehicleController(ROAD_WIDTH);
    const rhythm = new RhythmSystem(chart, vehicle.tuning.halfWidth);
    const previous = createVehicleState();
    for (let t = -LEAD_IN; t < demo.duration + 1; t += DT) {
      copyVehicleState(vehicle.state, previous);
      vehicle.update(DT, 0);
      rhythm.step(previous, vehicle.state, () => {});
    }
    const result = rhythm.score.result();
    const centred = chart.notes.filter((n) => Math.abs(n.lateral) <= SCORING.collectRadius).length;
    expect(result.collected).toBe(centred);
    expect(result.collected).toBeLessThan(result.totalNotes);
  });
});

describe('scoring (§6.3, §6.4)', () => {
  const note = (id: number, group: number, kind: Note['kind'] = 'normal'): Note => ({ id, time: id, distance: id, lateral: 0, kind, group });

  it('follows the combo multiplier table', () => {
    expect([0, 9, 10, 24, 25, 49, 50, 500].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('scores perfect, good and special notes with the multiplier', () => {
    const notes = Array.from({ length: 12 }, (_, i) => note(i, i));
    const keeper = new ScoreKeeper({ notes, groupSizes: notes.map(() => 1), maxScore: 0 });
    // Single-note groups: every collected note also earns its sequence bonus.
    const first = keeper.collect(notes[0], 0.1);
    expect(first).toEqual({ quality: 'perfect', points: 100, multiplier: 1, bonus: 30 });
    expect(keeper.collect(notes[1], 1.2).quality).toBe('good');
    for (let i = 2; i < 9; i++) keeper.collect(notes[i], 0);
    const tenth = keeper.collect(notes[9], 0);
    expect(tenth.multiplier).toBe(2);
    expect(tenth.points).toBe(200);
  });

  it('awards the sequence bonus only for a complete sequence', () => {
    const notes = [note(0, 0), note(1, 0), note(2, 1), note(3, 1)];
    const keeper = new ScoreKeeper({ notes, groupSizes: [2, 2], maxScore: 0 });
    expect(keeper.collect(notes[0], 0).bonus).toBe(0);
    expect(keeper.collect(notes[1], 0).bonus).toBe(60);
    keeper.collect(notes[2], 0);
    expect(keeper.miss(notes[3])).toBe(true);
    expect(keeper.combo).toBe(0);
    expect(keeper.maxCombo).toBe(3);
  });

  it('penalises obstacles without going negative and resets the combo', () => {
    const notes = [note(0, 0, 'special')];
    const keeper = new ScoreKeeper({ notes, groupSizes: [1], maxScore: 0 });
    expect(keeper.hitObstacle()).toBe(0);
    keeper.collect(notes[0], 0);
    expect(keeper.score).toBe(250 + 30);
    expect(keeper.hitObstacle()).toBe(150);
    expect(keeper.score).toBe(130);
    expect(keeper.combo).toBe(0);
  });

  it('ranks by fraction of the maximum score', () => {
    expect([1, 0.95, 0.9, 0.75, 0.6, 0.1].map(rankFor)).toEqual(['S', 'S', 'A', 'B', 'C', 'D']);
    const chart = generateChart(demo, options('normal'));
    expect(computeMaxScore(chart)).toBe(chart.maxScore);
  });
});

describe('RhythmSystem collisions (§6.6)', () => {
  const chart = (): Chart => ({
    notes: [],
    obstacles: [{ id: 0, time: 1, distance: 50, lateral: 0, halfWidth: 1.5 }],
    groupSizes: [],
    difficulty: 'hard',
    maxScore: 0,
  });

  function drive(lateral: number): RhythmEvent[] {
    const rhythm = new RhythmSystem(chart(), 1);
    const events: RhythmEvent[] = [];
    const prev = { ...createVehicleState(), distance: 49, lateral };
    const cur = { ...createVehicleState(), distance: 51, lateral };
    rhythm.step(prev, cur, (e) => events.push(e));
    return events;
  }

  it('hits an obstacle the vehicle overlaps, once', () => {
    const events = drive(0.5);
    expect(events.map((e) => e.type)).toEqual(['obstacle']);
  });

  it('clears an obstacle the vehicle passes beside', () => {
    expect(drive(3)).toEqual([]);
    expect(drive(-3)).toEqual([]);
  });
});
