import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/rng';
import { TrackFrame, type TrackGenerator } from '../track/TrackGenerator';
import type { MusicVisualState } from '../game/GameDirector';
import type { Palette } from './palettes';

const STREAK_COUNT = 90;
const STREAK_RANGE = 180;
const BURST_PARTICLES = 420;
const BURST_LIFE = 1.8;

/**
 * Music-driven particle effects with fixed budgets (GDD §5.4, §11.4):
 * speed streaks that appear in intense passages, and a radial burst when a
 * drop hits.
 */
export class Particles {
  readonly group = new Group();
  private readonly streaks: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly streakOffsets: { lateral: number; height: number; ahead: number }[] = [];
  private readonly burst: Points<BufferGeometry, PointsMaterial>;
  private readonly burstVelocities = new Float32Array(BURST_PARTICLES * 3);
  private readonly burstOrigin = new Vector3();
  private burstAge = BURST_LIFE;
  /** Speed streaks can be turned off by the graphics quality. */
  streaksEnabled = true;

  private readonly frame = new TrackFrame();
  private readonly position = new Vector3();
  private readonly basis = new Matrix4();
  private readonly back = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();

  constructor() {
    this.group.name = 'Particles';
    const rng = new Rng(0x9a271c);

    this.streaks = new InstancedMesh(
      new BoxGeometry(0.06, 0.06, 1),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
      STREAK_COUNT,
    );
    this.streaks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakOffsets.push({
        lateral: rng.sign() * rng.range(10, 34),
        height: rng.range(0.5, 16),
        ahead: rng.range(0, STREAK_RANGE),
      });
    }
    this.group.add(this.streaks);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(BURST_PARTICLES * 3), 3).setUsage(DynamicDrawUsage));
    for (let i = 0; i < BURST_PARTICLES; i++) {
      // Uniform directions on a sphere, flattened a little so the burst spreads along the horizon.
      const u = rng.range(-1, 1);
      const theta = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      const speed = rng.range(14, 46);
      this.burstVelocities[i * 3] = r * Math.cos(theta) * speed;
      this.burstVelocities[i * 3 + 1] = Math.abs(u) * speed * 0.6; // upward half: keep the road clear
      this.burstVelocities[i * 3 + 2] = r * Math.sin(theta) * speed;
    }
    this.burst = new Points(
      geometry,
      new PointsMaterial({ color: 0xffffff, size: 1.1, map: createDotTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );
    this.burst.frustumCulled = false;
    this.burst.visible = false;
    this.group.add(this.burst);
  }

  /** Starts a burst at a world position (drops). */
  triggerBurst(origin: Vector3, color: Color): void {
    this.burstOrigin.copy(origin);
    this.burst.material.color.copy(color);
    this.burstAge = 0;
    this.burst.visible = true;
  }

  update(dt: number, distance: number, speed: number, music: MusicVisualState, palette: Palette, generator: TrackGenerator, effects: number): void {
    // Speed streaks: only in intense passages, scaled by the effects setting.
    const visibility = this.streaksEnabled ? Math.min(1, Math.max(0, (music.intensity - 0.55) * 3)) * effects : 0;
    let count = 0;
    if (visibility > 0.01) {
      const travel = speed * 1.8 * dt;
      for (const o of this.streakOffsets) {
        o.ahead -= travel;
        if (o.ahead < -10) o.ahead += STREAK_RANGE;
        generator.sampleFrame(distance + o.ahead, this.frame);
        this.position.copy(this.frame.position).addScaledVector(this.frame.right, o.lateral).addScaledVector(this.frame.up, o.height);
        this.back.copy(this.frame.tangent).negate();
        this.basis.makeBasis(this.frame.right, this.frame.up, this.back);
        this.rotation.setFromRotationMatrix(this.basis);
        this.scale.set(1, 1, 4 + 10 * visibility);
        this.matrix.compose(this.position, this.rotation, this.scale);
        this.streaks.setMatrixAt(count++, this.matrix);
      }
      this.streaks.material.color.copy(palette.accentB);
      this.streaks.material.opacity = 0.6 * visibility;
    }
    this.streaks.count = count;
    this.streaks.instanceMatrix.needsUpdate = true;

    // Drop burst.
    if (this.burstAge < BURST_LIFE) {
      this.burstAge += dt;
      const t = this.burstAge;
      const positions = this.burst.geometry.getAttribute('position') as BufferAttribute;
      const drag = (1 - Math.exp(-t * 1.6)) / 1.6; // decelerating expansion
      for (let i = 0; i < BURST_PARTICLES; i++) {
        positions.setXYZ(
          i,
          this.burstOrigin.x + this.burstVelocities[i * 3] * drag,
          this.burstOrigin.y + this.burstVelocities[i * 3 + 1] * drag - 2 * t * t,
          this.burstOrigin.z + this.burstVelocities[i * 3 + 2] * drag,
        );
      }
      positions.needsUpdate = true;
      this.burst.material.opacity = 0.8 * Math.max(0, 1 - t / BURST_LIFE) * Math.max(0.3, effects);
      this.burst.visible = this.burstAge < BURST_LIFE;
    }
  }

  dispose(): void {
    this.streaks.geometry.dispose();
    this.streaks.material.dispose();
    this.burst.geometry.dispose();
    this.burst.material.map?.dispose();
    this.burst.material.dispose();
  }
}

function createDotTexture(): CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}
