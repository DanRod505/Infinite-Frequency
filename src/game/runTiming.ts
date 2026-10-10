import type { VehicleTuning } from '../vehicle/VehicleController';

/**
 * Seconds of lead-in before the song starts. The vehicle starts at rest at
 * song time -LEAD_IN and is already cruising when the music begins, so the
 * distance reached at any song time is deterministic.
 */
export const LEAD_IN = 3;

/** Distance travelled at a song time (analytic version of the simulation). */
export function distanceAtSongTime(time: number, tuning: VehicleTuning): number {
  const tau = Math.max(0, time + LEAD_IN);
  const accelTime = tuning.cruiseSpeed / tuning.acceleration;
  if (tau <= accelTime) return 0.5 * tuning.acceleration * tau * tau;
  return 0.5 * tuning.cruiseSpeed * accelTime + tuning.cruiseSpeed * (tau - accelTime);
}

/** Inverse of {@link distanceAtSongTime}. */
export function songTimeAtDistance(distance: number, tuning: VehicleTuning): number {
  const accelTime = tuning.cruiseSpeed / tuning.acceleration;
  const accelDistance = 0.5 * tuning.cruiseSpeed * accelTime;
  const tau =
    distance <= accelDistance
      ? Math.sqrt((2 * Math.max(0, distance)) / tuning.acceleration)
      : accelTime + (distance - accelDistance) / tuning.cruiseSpeed;
  return tau - LEAD_IN;
}
