import type { VehicleState } from '../vehicle/VehicleController';
import { ScoreKeeper, type CollectResult } from './ScoreKeeper';
import { SCORING, type Chart, type Note, type Obstacle } from './types';

export type RhythmEvent =
  | { type: 'collect'; note: Note; result: CollectResult }
  | { type: 'miss'; note: Note; comboLost: boolean }
  | { type: 'obstacle'; obstacle: Obstacle; penalty: number };

/**
 * Judges notes and obstacles as the vehicle passes them (GDD §11.2 Rhythm
 * System). Runs inside the fixed simulation step: a note is judged at the
 * exact step in which the vehicle crosses its distance, using the lateral
 * position interpolated at the crossing, so results do not depend on the
 * frame rate.
 */
export class RhythmSystem {
  readonly score: ScoreKeeper;
  private nextNote = 0;
  private nextObstacle = 0;

  constructor(
    readonly chart: Chart,
    /** Half of the vehicle width, for obstacle overlap. */
    private readonly vehicleHalfWidth: number,
  ) {
    this.score = new ScoreKeeper(chart);
  }

  /** Index of the first note not yet judged. */
  get upcomingNoteIndex(): number {
    return this.nextNote;
  }

  get finished(): boolean {
    return this.nextNote >= this.chart.notes.length && this.nextObstacle >= this.chart.obstacles.length;
  }

  step(previous: VehicleState, current: VehicleState, emit: (event: RhythmEvent) => void): void {
    const notes = this.chart.notes;
    while (this.nextNote < notes.length && notes[this.nextNote].distance <= current.distance) {
      const note = notes[this.nextNote++];
      const offset = lateralAt(previous, current, note.distance) - note.lateral;
      if (Math.abs(offset) <= SCORING.collectRadius) {
        emit({ type: 'collect', note, result: this.score.collect(note, offset) });
      } else {
        emit({ type: 'miss', note, comboLost: this.score.miss(note) });
      }
    }

    const obstacles = this.chart.obstacles;
    while (this.nextObstacle < obstacles.length && obstacles[this.nextObstacle].distance <= current.distance) {
      const obstacle = obstacles[this.nextObstacle++];
      const lateral = lateralAt(previous, current, obstacle.distance);
      // A little forgiveness on the vehicle's corners.
      if (Math.abs(lateral - obstacle.lateral) < obstacle.halfWidth + this.vehicleHalfWidth * 0.85) {
        emit({ type: 'obstacle', obstacle, penalty: this.score.hitObstacle() });
      }
    }
  }
}

function lateralAt(previous: VehicleState, current: VehicleState, distance: number): number {
  const span = current.distance - previous.distance;
  if (span <= 0) return current.lateral;
  const t = Math.min(1, Math.max(0, (distance - previous.distance) / span));
  return previous.lateral + (current.lateral - previous.lateral) * t;
}
