import { describe, expect, it } from 'vitest';
import { LEAD_IN, distanceAtSongTime, songTimeAtDistance } from '../src/game/runTiming';
import { VehicleController } from '../src/vehicle/VehicleController';

describe('run timing', () => {
  it('matches the fixed-step vehicle simulation', () => {
    const vehicle = new VehicleController(16);
    const dt = 1 / 120;
    let time = -LEAD_IN;
    while (time < 30) {
      vehicle.update(dt, 0);
      time += dt;
      if (Math.abs(time - Math.round(time)) < dt / 2) {
        expect(Math.abs(vehicle.state.distance - distanceAtSongTime(time, vehicle.tuning))).toBeLessThan(0.5);
      }
    }
  });

  it('round-trips between time and distance', () => {
    const tuning = new VehicleController(16).tuning;
    for (const t of [-3, -2.5, -1, 0, 0.5, 10, 123.4]) {
      expect(songTimeAtDistance(distanceAtSongTime(t, tuning), tuning)).toBeCloseTo(t, 9);
    }
  });
});
