import { SCORING, multiplierFor, type Chart, type Note } from './types';

export type Quality = 'perfect' | 'good';
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

export interface CollectResult {
  quality: Quality;
  points: number;
  multiplier: number;
  /** Sequence bonus awarded by this note (0 unless it completed a full sequence). */
  bonus: number;
}

export interface RunScore {
  score: number;
  maxScore: number;
  maxCombo: number;
  collected: number;
  perfects: number;
  totalNotes: number;
  obstaclesHit: number;
  /** Mean lateral precision of collected notes in [0, 1] (1 = dead centre). */
  precision: number;
  rank: Rank;
}

/**
 * Score, combo and multiplier bookkeeping (GDD §6.3, §6.4, §6.6).
 * Pure and deterministic: the same sequence of judgements always yields
 * the same score.
 */
export class ScoreKeeper {
  score = 0;
  combo = 0;
  maxCombo = 0;
  collected = 0;
  perfects = 0;
  missed = 0;
  obstaclesHit = 0;
  private precisionSum = 0;
  private readonly groupJudged: number[];
  private readonly groupCollected: number[];

  constructor(private readonly chart: Pick<Chart, 'groupSizes' | 'notes' | 'maxScore'>) {
    this.groupJudged = new Array<number>(chart.groupSizes.length).fill(0);
    this.groupCollected = new Array<number>(chart.groupSizes.length).fill(0);
  }

  get multiplier(): number {
    return multiplierFor(this.combo);
  }

  /** The vehicle passed through `note` at `offset` metres from its centre. */
  collect(note: Note, offset: number): CollectResult {
    const quality: Quality = Math.abs(offset) <= SCORING.perfectRadius ? 'perfect' : 'good';
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.collected++;
    if (quality === 'perfect') this.perfects++;
    this.precisionSum += Math.max(0, 1 - Math.abs(offset) / SCORING.collectRadius);

    const multiplier = this.multiplier;
    const base =
      note.kind === 'special'
        ? quality === 'perfect'
          ? SCORING.specialPerfect
          : SCORING.specialGood
        : quality === 'perfect'
          ? SCORING.perfect
          : SCORING.good;
    const points = base * multiplier;
    this.score += points;

    this.groupCollected[note.group]++;
    const bonus = this.judgeGroup(note.group);
    this.score += bonus;
    return { quality, points, multiplier, bonus };
  }

  /** The vehicle passed a note without collecting it. Returns whether a combo was lost. */
  miss(note: Note): boolean {
    this.missed++;
    this.judgeGroup(note.group);
    const lost = this.combo > 0;
    this.combo = 0;
    return lost;
  }

  /** The vehicle hit an obstacle: combo lost and a score penalty, but the run goes on. */
  hitObstacle(): number {
    this.obstaclesHit++;
    this.combo = 0;
    const penalty = Math.min(this.score, SCORING.obstaclePenalty);
    this.score -= penalty;
    return penalty;
  }

  result(): RunScore {
    const maxScore = this.chart.maxScore;
    return {
      score: this.score,
      maxScore,
      maxCombo: this.maxCombo,
      collected: this.collected,
      perfects: this.perfects,
      totalNotes: this.chart.notes.length,
      obstaclesHit: this.obstaclesHit,
      precision: this.collected > 0 ? this.precisionSum / this.collected : 0,
      rank: rankFor(maxScore > 0 ? this.score / maxScore : 0),
    };
  }

  /** Counts a judged note and returns the sequence bonus if it completed a full sequence. */
  private judgeGroup(group: number): number {
    this.groupJudged[group]++;
    const size = this.chart.groupSizes[group];
    if (this.groupJudged[group] === size && this.groupCollected[group] === size) {
      return SCORING.sequenceBonusPerNote * size;
    }
    return 0;
  }
}

export function rankFor(ratio: number): Rank {
  if (ratio >= 0.95) return 'S';
  if (ratio >= 0.85) return 'A';
  if (ratio >= 0.7) return 'B';
  if (ratio >= 0.5) return 'C';
  return 'D';
}

/** Score of a flawless run: every note perfect, never losing the combo. */
export function computeMaxScore(chart: Pick<Chart, 'groupSizes' | 'notes'>): number {
  const keeper = new ScoreKeeper({ ...chart, maxScore: 0 });
  for (const note of chart.notes) keeper.collect(note, 0);
  return keeper.score;
}
