import { describe, expect, it } from 'vitest';
import { VehicleController } from '../src/vehicle/VehicleController';

const DT = 1 / 120;

function run(controller: VehicleController, seconds: number, steer: number): void {
  for (let t = 0; t < seconds; t += DT) controller.update(DT, steer);
}

describe('VehicleController', () => {
  it('accelerates to cruise speed automatically', () => {
    const v = new VehicleController(16);
    run(v, 5, 0);
    expect(v.state.speed).toBeCloseTo(v.tuning.cruiseSpeed, 6);
    expect(v.state.distance).toBeGreaterThan(0);
  });

  it('steers continuously, not in fixed lanes', () => {
    const v = new VehicleController(16);
    run(v, 0.12, 1);
    const partial = v.state.lateral;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(v.lateralLimit);
    run(v, 1, 0);
    // Releasing the input settles at an arbitrary offset between lanes.
    expect(Math.abs(v.state.lateralVelocity)).toBeLessThan(0.01);
    expect(v.state.lateral).toBeGreaterThan(partial);
  });

  it('never leaves the road', () => {
    const v = new VehicleController(16);
    run(v, 3, 1);
    expect(v.state.lateral).toBeCloseTo(v.lateralLimit, 9);
    expect(v.state.touchingEdge).toBe(true);
    run(v, 3, -1);
    expect(v.state.lateral).toBeCloseTo(-v.lateralLimit, 9);
  });

  it('can cross the full road quickly enough to react', () => {
    const v = new VehicleController(16);
    run(v, 3, -1);
    let time = 0;
    while (v.state.lateral < v.lateralLimit && time < 5) {
      v.update(DT, 1);
      time += DT;
    }
    expect(time).toBeLessThan(1.2);
  });

  it('is independent of the simulation step size', () => {
    const coarse = new VehicleController(16);
    const fine = new VehicleController(16);
    for (let i = 0; i < 60; i++) coarse.update(1 / 60, i < 30 ? 1 : 0);
    for (let i = 0; i < 240; i++) fine.update(1 / 240, i < 120 ? 1 : 0);
    expect(coarse.state.distance).toBeCloseTo(fine.state.distance, 0);
    expect(Math.abs(coarse.state.lateral - fine.state.lateral)).toBeLessThan(0.15);
  });
});
