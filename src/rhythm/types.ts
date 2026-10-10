/** Rhythm System data (GDD §6). */

export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameMode = 'rhythm' | 'free';

export type NoteKind = 'normal' | 'special';

export interface Note {
  id: number;
  /** Song time at which the vehicle reaches the note. */
  time: number;
  /** Track distance of the note (derived from `time`). */
  distance: number;
  /** Lateral offset on the road; positive = right. */
  lateral: number;
  kind: NoteKind;
  /** Index of the rhythmic sequence (pattern) the note belongs to. */
  group: number;
}

export interface Obstacle {
  id: number;
  time: number;
  distance: number;
  /** Lateral centre of the barrier. */
  lateral: number;
  /** Half of the barrier width. */
  halfWidth: number;
}

export interface Chart {
  notes: Note[];
  obstacles: Obstacle[];
  /** Number of notes in each group, indexed by group id. */
  groupSizes: number[];
  difficulty: Difficulty;
  /** Highest score reachable with this chart (all notes perfect, full combo, all bonuses). */
  maxScore: number;
}

export interface DifficultyPreset {
  /** Fraction of the vehicle's lateral speed patterns may demand (lower = more forgiving). */
  reachFactor: number;
  /** Minimum spacing between notes, in seconds. */
  minNoteGap: number;
  /** Obstacles per bar of four beats in mid/high sections (0 disables them). */
  obstaclesPerBar: number;
  /** Largest lateral amplitude used by patterns, as a fraction of the usable half width. */
  amplitude: number;
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  easy: { reachFactor: 0.4, minNoteGap: 0.42, obstaclesPerBar: 0, amplitude: 0.6 },
  normal: { reachFactor: 0.55, minNoteGap: 0.3, obstaclesPerBar: 0.25, amplitude: 0.8 },
  hard: { reachFactor: 0.7, minNoteGap: 0.2, obstaclesPerBar: 0.5, amplitude: 1 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Fácil',
  normal: 'Normal',
  hard: 'Difícil',
};

/** Scoring rules (GDD §6.3, §6.4). Values are provisional and meant for tuning. */
export const SCORING = {
  perfect: 100,
  good: 70,
  specialPerfect: 250,
  specialGood: 180,
  /** Bonus per note when a whole sequence is collected. */
  sequenceBonusPerNote: 30,
  obstaclePenalty: 150,
  /** Lateral distance for a perfect collection, in metres. */
  perfectRadius: 0.6,
  /** Lateral distance within which a note is collected at all, in metres. */
  collectRadius: 1.7,
  /** Combo thresholds for multipliers x2, x3, x4. */
  multiplierSteps: [10, 25, 50],
} as const;

export function multiplierFor(combo: number): number {
  const steps = SCORING.multiplierSteps;
  let multiplier = 1;
  for (const step of steps) if (combo >= step) multiplier++;
  return multiplier;
}
