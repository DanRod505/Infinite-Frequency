import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, lerp } from '../core/math';
import type { TrackFrame } from '../track/TrackGenerator';

export interface ChaseCameraSettings {
  distance: number;
  height: number;
  /** How far ahead along the track the camera looks. */
  lookAhead: number;
  /** Position follow sharpness (1/s). */
  followSharpness: number;
  /** Vertical follow sharpness (1/s); lower values damp bumps more. */
  verticalSharpness: number;
  baseFov: number;
  /** Extra FOV at full speed. */
  speedFov: number;
  /** How much of the road bank the camera follows (0..1). */
  bankFollow: number;
  /** Enables camera shake (GDD §12.4 — can be disabled). */
  shakeEnabled: boolean;
}

export const DEFAULT_CHASE_CAMERA: ChaseCameraSettings = {
  distance: 9,
  height: 3.4,
  lookAhead: 14,
  followSharpness: 10,
  verticalSharpness: 6,
  baseFov: 62,
  speedFov: 14,
  bankFollow: 0.6,
  shakeEnabled: true,
};

const WORLD_UP = new Vector3(0, 1, 0);

/** Third-person camera behind and above the vehicle (GDD §2.4). */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  readonly settings: ChaseCameraSettings;
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly desired = new Vector3();
  private readonly desiredUp = new Vector3();
  private shake = 0;
  private initialised = false;

  constructor(aspect: number, settings: Partial<ChaseCameraSettings> = {}) {
    this.settings = { ...DEFAULT_CHASE_CAMERA, ...settings };
    this.camera = new PerspectiveCamera(this.settings.baseFov, aspect, 0.1, 3000);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Adds a short shake impulse (e.g. scraping the edge). */
  addShake(amount: number): void {
    if (this.settings.shakeEnabled) this.shake = Math.min(1, this.shake + amount);
  }

  /** Snaps to the target on the next update (after teleports or resets). */
  reset(): void {
    this.initialised = false;
  }

  /**
   * @param vehiclePosition world position of the vehicle
   * @param frame road frame at the vehicle
   * @param aheadPoint world point ahead on the road the camera should look at
   * @param speedRatio current speed / cruise speed, in [0, 1]
   */
  update(
    dt: number,
    vehiclePosition: Vector3,
    frame: TrackFrame,
    aheadPoint: Vector3,
    speedRatio: number,
    /** Extra field of view in degrees (music intensity). */
    fovBoost = 0,
  ): void {
    const s = this.settings;

    this.desired
      .copy(vehiclePosition)
      .addScaledVector(frame.tangent, -s.distance)
      .addScaledVector(WORLD_UP, s.height);
    this.desiredUp.copy(WORLD_UP).lerp(frame.up, s.bankFollow).normalize();

    if (!this.initialised || dt <= 0) {
      if (!this.initialised) {
        this.position.copy(this.desired);
        this.target.copy(aheadPoint);
        this.up.copy(this.desiredUp);
        this.initialised = true;
      }
    } else {
      const k = damp(s.followSharpness, dt);
      const kv = damp(s.verticalSharpness, dt);
      this.position.x = lerp(this.position.x, this.desired.x, k);
      this.position.z = lerp(this.position.z, this.desired.z, k);
      this.position.y = lerp(this.position.y, this.desired.y, kv);
      this.target.lerp(aheadPoint, damp(s.followSharpness * 1.5, dt));
      this.up.lerp(this.desiredUp, damp(4, dt)).normalize();
      this.shake = Math.max(0, this.shake - dt * 3);
    }

    this.camera.position.copy(this.position);
    if (this.shake > 0 && dt > 0) {
      const a = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.target);

    const fov = s.baseFov + s.speedFov * clamp(speedRatio, 0, 1) + fovBoost;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
