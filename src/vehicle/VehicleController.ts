import { approach, clamp, damp } from '../core/math';

/** Tuning for the arcade controller (GDD §2.2, §2.3). */
export interface VehicleTuning {
  /** Cruise speed set by the game mode, in m/s. */
  cruiseSpeed: number;
  /** Longitudinal acceleration toward the cruise speed, in m/s². */
  acceleration: number;
  /** Maximum sideways speed while steering, in m/s. */
  maxLateralSpeed: number;
  /** How quickly lateral speed follows the input (1/s). Higher = snappier. */
  steerResponse: number;
  /** How quickly lateral speed bleeds off without input (1/s). */
  steerRelease: number;
  /** Half the vehicle width, used to keep it fully on the road. */
  halfWidth: number;
  /** Extra space kept between the vehicle and the road edge. */
  edgeMargin: number;
}

export const DEFAULT_VEHICLE_TUNING: VehicleTuning = {
  cruiseSpeed: 55,
  acceleration: 22,
  maxLateralSpeed: 15,
  steerResponse: 11,
  steerRelease: 9,
  halfWidth: 1.0,
  edgeMargin: 0.35,
};

export interface VehicleState {
  /** Distance travelled along the track centreline. */
  distance: number;
  /** Longitudinal speed. */
  speed: number;
  /** Lateral offset from the centreline; positive = right. */
  lateral: number;
  /** Lateral velocity. */
  lateralVelocity: number;
  /** True while the vehicle is pressed against a road edge. */
  touchingEdge: boolean;
}

export function createVehicleState(): VehicleState {
  return { distance: 0, speed: 0, lateral: 0, lateralVelocity: 0, touchingEdge: false };
}

export function copyVehicleState(from: VehicleState, to: VehicleState): VehicleState {
  to.distance = from.distance;
  to.speed = from.speed;
  to.lateral = from.lateral;
  to.lateralVelocity = from.lateralVelocity;
  to.touchingEdge = from.touchingEdge;
  return to;
}

/**
 * Arcade vehicle controller: automatic longitudinal motion along the track
 * and continuous, responsive lateral steering. No tyre or suspension physics.
 */
export class VehicleController {
  readonly state = createVehicleState();
  readonly tuning: VehicleTuning;

  constructor(
    private readonly roadWidth: number,
    tuning: Partial<VehicleTuning> = {},
  ) {
    this.tuning = { ...DEFAULT_VEHICLE_TUNING, ...tuning };
  }

  /** Maximum absolute lateral offset that keeps the vehicle on the road. */
  get lateralLimit(): number {
    return this.roadWidth / 2 - this.tuning.halfWidth - this.tuning.edgeMargin;
  }

  reset(): void {
    copyVehicleState(createVehicleState(), this.state);
  }

  /**
   * Advances the simulation.
   * @param steer steering input in [-1, 1]; positive steers right.
   */
  update(dt: number, steer: number): void {
    const t = this.tuning;
    const s = this.state;
    const input = clamp(steer, -1, 1);

    s.speed = approach(s.speed, t.cruiseSpeed, t.acceleration * dt);

    const targetLateralVelocity = input * t.maxLateralSpeed;
    const sharpness = input === 0 ? t.steerRelease : t.steerResponse;
    s.lateralVelocity += (targetLateralVelocity - s.lateralVelocity) * damp(sharpness, dt);
    s.lateral += s.lateralVelocity * dt;

    const limit = this.lateralLimit;
    s.touchingEdge = false;
    if (s.lateral > limit) {
      s.lateral = limit;
      s.lateralVelocity = Math.min(0, s.lateralVelocity);
      s.touchingEdge = true;
    } else if (s.lateral < -limit) {
      s.lateral = -limit;
      s.lateralVelocity = Math.max(0, s.lateralVelocity);
      s.touchingEdge = true;
    }

    s.distance += s.speed * dt;
  }
}
