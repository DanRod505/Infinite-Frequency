import type { MusicAnalysis } from '../audio/analysisTypes';
import { sampleAt } from '../audio/MusicAnalyzer';
import { clamp } from '../core/math';
import { Rng, mixSeed } from '../core/rng';
import { distanceAtSongTime } from '../game/runTiming';
import type { VehicleTuning } from '../vehicle/VehicleController';
import { computeMaxScore } from './ScoreKeeper';
import { DIFFICULTY_PRESETS, type Chart, type Difficulty, type Note, type Obstacle } from './types';

export interface ChartOptions {
  seed: number;
  difficulty: Difficulty;
  obstacles: boolean;
  tuning: VehicleTuning;
  roadWidth: number;
  /** Largest lateral offset the vehicle can reach (VehicleController.lateralLimit). */
  lateralLimit: number;
}

/** Time the player needs to react before changing direction, in seconds. */
const REACTION_TIME = 0.08;
/** Notes are kept this far inside the vehicle's lateral limit. */
const NOTE_EDGE_MARGIN = 0.3;
/** Lateral clearance between the safe path and an obstacle, beyond the vehicle half width. */
const OBSTACLE_CLEARANCE = 1.0;
const MIN_OBSTACLE_WIDTH = 3;
const MAX_OBSTACLE_WIDTH = 5;
/** No notes in the very first and last moments of the song. */
const START_TIME = 1;
const END_MARGIN = 0.3;
const FIRST_OBSTACLE_TIME = 4;

type PatternKind = 'line' | 'zigzag' | 'sweep' | 'wave' | 'stairs';
/** Weighted pattern pool: straight lines are the least interesting, so they are rarer. */
const PATTERNS: PatternKind[] = ['line', 'zigzag', 'zigzag', 'sweep', 'sweep', 'wave', 'wave', 'stairs', 'stairs'];

interface Candidate {
  time: number;
  downbeat: boolean;
}

/**
 * Builds the collectible and obstacle layout for a song (GDD §6.1, §6.2, §6.5).
 *
 * Notes follow the detected beats, thinned or densified by difficulty and
 * section intensity, and are arranged in rhythmic sequences (patterns).
 * A validator then guarantees every note is reachable from the previous
 * one with the vehicle's lateral speed, and obstacles are only placed where
 * the path through the notes stays clear. Deterministic for a given
 * analysis, seed and options.
 */
export function generateChart(analysis: MusicAnalysis, options: ChartOptions): Chart {
  const preset = DIFFICULTY_PRESETS[options.difficulty];
  const rng = new Rng(mixSeed(options.seed, 0x6e07e5));
  const candidates = pickNoteTimes(analysis, options.difficulty);

  // --- Groups (rhythmic sequences) -------------------------------------------
  const groupOf: number[] = [];
  let group = -1;
  let groupSize = 0;
  candidates.forEach((c, i) => {
    const gap = i === 0 ? Infinity : c.time - candidates[i - 1].time;
    if (group < 0 || gap > 1.5 || groupSize >= 12 || (c.downbeat && groupSize >= 4) || (!analysis.tempo.reliable && groupSize >= 6)) {
      group++;
      groupSize = 0;
    }
    groupOf.push(group);
    groupSize++;
  });
  const groupSizes = new Array<number>(group + 1).fill(0);
  for (const g of groupOf) groupSizes[g]++;

  // --- Lateral patterns -------------------------------------------------------
  const noteLimit = Math.max(0, options.lateralLimit - NOTE_EDGE_MARGIN);
  const reach = noteLimit * preset.amplitude;
  const laterals: number[] = [];
  let previous = 0;
  for (let start = 0; start < candidates.length; ) {
    const g = groupOf[start];
    const n = groupSizes[g];
    const kind = PATTERNS[rng.int(0, PATTERNS.length - 1)];
    const centre = clamp(previous + rng.range(-5, 5), -reach * 0.7, reach * 0.7);
    const amplitude = rng.range(2, 4.5) * preset.amplitude;
    const direction = rng.sign();
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? k / (n - 1) : 0.5;
      let lateral: number;
      switch (kind) {
        case 'line':
          lateral = centre;
          break;
        case 'zigzag':
          lateral = centre + amplitude * (k % 2 === 0 ? -1 : 1) * direction;
          break;
        case 'sweep':
          lateral = centre + amplitude * direction * (2 * u - 1);
          break;
        case 'wave':
          lateral = centre + amplitude * Math.sin(2 * Math.PI * u) * direction;
          break;
        case 'stairs':
          lateral = centre + amplitude * direction * (2 * (Math.floor(k / 2) / Math.max(1, Math.ceil(n / 2) - 1)) - 1);
          break;
      }
      laterals.push(clamp(lateral, -reach, reach));
    }
    previous = laterals[laterals.length - 1];
    start += n;
  }

  // --- Reachability validator (§6.2) ------------------------------------------
  const speed = options.tuning.maxLateralSpeed * preset.reachFactor;
  let prevLateral = 0;
  let prevTime = 0;
  for (let i = 0; i < candidates.length; i++) {
    const maxMove = speed * Math.max(0, candidates[i].time - prevTime - REACTION_TIME);
    laterals[i] = clamp(laterals[i], prevLateral - maxMove, prevLateral + maxMove);
    prevLateral = laterals[i];
    prevTime = candidates[i].time;
  }

  // --- Notes and specials -----------------------------------------------------
  const specialTimes = specialMoments(analysis);
  const notes: Note[] = candidates.map((c, i) => ({
    id: i,
    time: c.time,
    distance: distanceAtSongTime(c.time, options.tuning),
    lateral: laterals[i],
    kind: 'normal',
    group: groupOf[i],
  }));
  for (const time of specialTimes) {
    const note = notes.find((n) => n.time >= time - 0.05);
    if (note) note.kind = 'special';
  }
  for (const note of notes) {
    if (note.kind === 'normal' && levelAt(analysis, note.time) === 'high' && isDownbeat(candidates[note.id]) && rng.chance(0.1)) {
      note.kind = 'special';
    }
  }

  const obstacles = options.obstacles && preset.obstaclesPerBar > 0 ? placeObstacles(analysis, notes, options, preset.obstaclesPerBar, rng) : [];

  const chart: Chart = { notes, obstacles, groupSizes, difficulty: options.difficulty, maxScore: 0 };
  chart.maxScore = computeMaxScore(chart);
  return chart;
}

/** Note times from beats (or onsets when the pulse is unreliable), by difficulty and section. */
function pickNoteTimes(analysis: MusicAnalysis, difficulty: Difficulty): Candidate[] {
  const preset = DIFFICULTY_PRESETS[difficulty];
  const raw: Candidate[] = [];
  const end = analysis.duration - END_MARGIN;

  if (analysis.tempo.reliable) {
    const beats = analysis.beats;
    beats.forEach((beat, i) => {
      const level = levelAt(analysis, beat.time);
      let keep: boolean;
      if (difficulty === 'easy') keep = beat.downbeat || (i % 2 === 0 && level !== 'low');
      else if (difficulty === 'normal') keep = level !== 'low' || i % 2 === 0;
      else keep = true;
      if (keep) raw.push({ time: beat.time, downbeat: beat.downbeat });

      // Hard: add strong off-beats in intense sections.
      const next = beats[i + 1];
      if (difficulty === 'hard' && next && level === 'high') {
        const mid = (beat.time + next.time) / 2;
        if (sampleAt(analysis.onsetStrength, mid, analysis.frameRate) >= 0.45) raw.push({ time: mid, downbeat: false });
      }
    });
  } else {
    for (const time of analysis.onsets) {
      if (sampleAt(analysis.onsetStrength, time, analysis.frameRate) >= 0.3) raw.push({ time, downbeat: false });
    }
  }

  const out: Candidate[] = [];
  for (const c of raw) {
    if (c.time < START_TIME || c.time > end) continue;
    const last = out[out.length - 1];
    if (last && c.time - last.time < preset.minNoteGap) continue;
    out.push(c);
  }
  return out;
}

/** Drops and starts of intense sections deserve a special note. */
function specialMoments(analysis: MusicAnalysis): number[] {
  const times = new Set<number>(analysis.drops);
  analysis.sections.forEach((section, i) => {
    if (i > 0 && section.level === 'high') times.add(section.start);
  });
  return [...times].sort((a, b) => a - b);
}

function placeObstacles(analysis: MusicAnalysis, notes: Note[], options: ChartOptions, perBar: number, rng: Rng): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const roadHalf = options.roadWidth / 2;
  const vehicleHalf = options.tuning.halfWidth;
  const beatPeriod = analysis.tempo.reliable && analysis.tempo.bpm > 0 ? 60 / analysis.tempo.bpm : 0.5;
  const spacing = (4 * beatPeriod) / perBar;
  let lastTime = -Infinity;

  for (let i = 0; i + 1 < notes.length; i++) {
    const a = notes[i];
    const b = notes[i + 1];
    const time = (a.time + b.time) / 2;
    if (time < FIRST_OBSTACLE_TIME || time - lastTime < spacing || b.time - a.time < 0.35) continue;
    if (levelAt(analysis, time) === 'low' || !rng.chance(0.6)) continue;

    // Everything the player may cross between the two notes must stay clear.
    const clear = vehicleHalf + OBSTACLE_CLEARANCE;
    const safeLow = Math.min(a.lateral, b.lateral) - clear;
    const safeHigh = Math.max(a.lateral, b.lateral) + clear;
    const leftRoom = safeLow + roadHalf;
    const rightRoom = roadHalf - safeHigh;
    const useLeft = leftRoom > rightRoom ? true : leftRoom < rightRoom ? false : rng.chance(0.5);
    const room = useLeft ? leftRoom : rightRoom;
    if (room < MIN_OBSTACLE_WIDTH) continue;

    const width = Math.min(room, rng.range(MIN_OBSTACLE_WIDTH, MAX_OBSTACLE_WIDTH));
    // Sit right next to the safe path, where it actually matters.
    const lateral = useLeft ? safeLow - width / 2 : safeHigh + width / 2;
    obstacles.push({
      id: obstacles.length,
      time,
      distance: distanceAtSongTime(time, options.tuning),
      lateral,
      halfWidth: width / 2,
    });
    lastTime = time;
  }
  return obstacles;
}

function levelAt(analysis: MusicAnalysis, time: number): 'low' | 'mid' | 'high' {
  let level: 'low' | 'mid' | 'high' = analysis.sections[0]?.level ?? 'mid';
  for (const section of analysis.sections) {
    if (section.start <= time) level = section.level;
    else break;
  }
  return level;
}

function isDownbeat(candidate: Candidate | undefined): boolean {
  return candidate?.downbeat ?? false;
}
