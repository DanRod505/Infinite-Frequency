import type { VehicleState, VehicleTuning } from '../vehicle/VehicleController';
import type { Chart } from './types';

/**
 * Steering that follows the chart: heads for the next note so that it is
 * reached just in time. Used by tests to prove every chart is playable and
 * obstacle-free along the note path; also handy as an attract-mode driver.
 */
export function autopilotSteer(state: VehicleState, chart: Chart, tuning: VehicleTuning, fromIndex = 0): number {
  const notes = chart.notes;
  let i = fromIndex;
  while (i < notes.length && notes[i].distance <= state.distance) i++;
  const next = notes[i];
  if (!next) return clampUnit(-state.lateral * 0.3);
  const speed = Math.max(1, state.speed);
  const timeToNote = Math.max(0.05, (next.distance - state.distance) / speed);
  const desiredVelocity = (next.lateral - state.lateral) / timeToNote;
  return clampUnit(desiredVelocity / tuning.maxLateralSpeed);
}

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
