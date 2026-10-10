import { Vector3 } from 'three';
import { Rng, mixSeed } from '../core/rng';
import { approach, clamp } from '../core/math';
import { DEFAULT_TRACK_CONFIG, chunkLength, type TrackConfig } from './TrackConfig';

/**
 * Per-sample data layout inside a chunk's Float64Array.
 * position(3) tangent(3) right(3) up(3) curvature(1) pitch(1)
 */
export const SAMPLE_STRIDE = 14;
const P = 0;
const T = 3;
const R = 6;
const U = 9;
const K = 12;
const PITCH = 13;

export interface TrackChunk {
  readonly index: number;
  /** Track distance at the first sample. */
  readonly startDistance: number;
  /** segmentsPerChunk + 1 samples; sample 0 equals the previous chunk's last sample. */
  readonly samples: Float64Array;
  readonly sampleCount: number;
}

/** Orthonormal frame on the road centreline. */
export class TrackFrame {
  readonly position = new Vector3();
  /** Forward direction. */
  readonly tangent = new Vector3();
  /** Points to the driver's right, including banking. */
  readonly right = new Vector3();
  /** Road surface normal. */
  readonly up = new Vector3();
  curvature = 0;
}

/** Integration state carried from one chunk to the next. */
interface GeneratorState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  curvature: number;
}

/** Intent that steers the generation of a chunk. */
interface ChunkPlan {
  targetCurvature: number;
  targetPitch: number;
}

/**
 * Generates an endless, continuous road centreline in chunks (GDD §4).
 *
 * Instead of fitting independent splines per chunk, the centreline is
 * integrated from curvature and pitch whose rates of change are bounded.
 * This guarantees position, tangent and curvature continuity across chunk
 * boundaries and makes the constraints of §4.3 hold by construction.
 *
 * Generation is deterministic for a given seed and config (§4.4): each chunk
 * draws from its own RNG derived from (seed, chunkIndex), and the state is
 * carried forward sequentially.
 */
export class TrackGenerator {
  readonly config: TrackConfig;
  readonly seed: number;
  readonly chunkLength: number;

  private readonly chunks = new Map<number, TrackChunk>();
  private nextIndex = 0;
  private firstIndex = 0;
  private state: GeneratorState = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curvature: 0 };

  /**
   * @param intensityAt optional musical intensity in [0, 1] along the track.
   * It only scales how lively curves are; every geometric limit still holds,
   * so the music can never produce a dangerous curve (GDD §4.3).
   */
  constructor(
    seed: number,
    config: Partial<TrackConfig> = {},
    private readonly intensityAt: ((distance: number) => number) | null = null,
  ) {
    this.seed = seed >>> 0;
    this.config = { ...DEFAULT_TRACK_CONFIG, ...config };
    this.chunkLength = chunkLength(this.config);
  }

  get roadWidth(): number {
    return this.config.roadWidth;
  }

  /** Index of the first chunk still held in memory. */
  get oldestChunkIndex(): number {
    return this.firstIndex;
  }

  /** Index one past the newest generated chunk. */
  get generatedChunkCount(): number {
    return this.nextIndex;
  }

  chunkIndexAt(distance: number): number {
    return Math.floor(Math.max(0, distance) / this.chunkLength);
  }

  getChunk(index: number): TrackChunk | undefined {
    return this.chunks.get(index);
  }

  /** Generates chunks until `distance` is covered. */
  ensureDistance(distance: number): void {
    this.ensureChunk(this.chunkIndexAt(distance));
  }

  ensureChunk(index: number): void {
    while (this.nextIndex <= index) this.generateNext();
  }

  /** Releases chunk data that lies entirely before `distance` (GDD §4.5). */
  pruneBefore(distance: number): void {
    const keepFrom = this.chunkIndexAt(distance);
    while (this.firstIndex < keepFrom && this.firstIndex < this.nextIndex) {
      this.chunks.delete(this.firstIndex);
      this.firstIndex++;
    }
  }

  /** Writes the interpolated centreline frame at `distance` into `out`. */
  sampleFrame(distance: number, out: TrackFrame): TrackFrame {
    const d = Math.max(0, distance);
    const index = this.chunkIndexAt(d);
    this.ensureChunk(index);
    const chunk = this.chunks.get(index);
    if (!chunk) {
      throw new Error(`Track chunk ${index} was pruned; cannot sample distance ${distance.toFixed(1)}`);
    }

    const local = (d - chunk.startDistance) / this.config.sampleSpacing;
    const i = Math.min(Math.floor(local), this.config.segmentsPerChunk - 1);
    const t = local - i;
    const s = chunk.samples;
    const a = i * SAMPLE_STRIDE;
    const b = a + SAMPLE_STRIDE;

    out.position.set(
      s[a + P] + (s[b + P] - s[a + P]) * t,
      s[a + P + 1] + (s[b + P + 1] - s[a + P + 1]) * t,
      s[a + P + 2] + (s[b + P + 2] - s[a + P + 2]) * t,
    );
    lerpDirection(s, a + T, b + T, t, out.tangent);
    lerpDirection(s, a + U, b + U, t, out.up);
    // Re-orthonormalise: right = tangent x up, up = right x tangent.
    out.right.crossVectors(out.tangent, out.up).normalize();
    out.up.crossVectors(out.right, out.tangent).normalize();
    out.curvature = s[a + K] + (s[b + K] - s[a + K]) * t;
    return out;
  }

  /** World-space point on the road surface at a lateral offset (positive = right). */
  pointAt(distance: number, lateral: number, height: number, frame: TrackFrame, out: Vector3): Vector3 {
    this.sampleFrame(distance, frame);
    return out
      .copy(frame.position)
      .addScaledVector(frame.right, lateral)
      .addScaledVector(frame.up, height);
  }

  private planChunk(rng: Rng): ChunkPlan {
    const c = this.config;
    const st = this.state;

    // Calm music favours straights and gentle curves; intense music livelier ones.
    const intensity = this.intensityAt
      ? clamp(this.intensityAt((this.nextIndex + 0.5) * this.chunkLength), 0, 1)
      : 1;
    const straightProbability = Math.min(0.9, c.straightProbability + 0.3 * (1 - intensity));
    const liveliness = 0.5 + 0.5 * intensity;

    let targetCurvature = 0;
    if (!rng.chance(straightProbability)) {
      // Prefer gentle curves; tight curves are rarer.
      const magnitude = c.maxCurvature * liveliness * (0.25 + 0.75 * rng.next() * rng.next());
      targetCurvature = magnitude * rng.sign();
    }

    // Keep the road heading roughly forward so it never loops back on itself.
    // Curvature can only change slowly, so steer by the heading predicted at
    // the end of this chunk rather than the current one.
    const predictedYaw = st.yaw + st.curvature * this.chunkLength;
    const deviation = predictedYaw / c.maxHeadingDeviation;
    if (Math.abs(deviation) > 0.5 && rng.chance(Math.min(1, Math.abs(deviation)))) {
      targetCurvature = -Math.sign(predictedYaw) * Math.abs(targetCurvature);
    }
    if (Math.abs(deviation) > 0.8) {
      targetCurvature = -Math.sign(predictedYaw) * Math.max(Math.abs(targetCurvature), c.maxCurvature * 0.6);
    }

    let targetPitch = 0;
    if (rng.chance(0.6)) targetPitch = rng.range(-c.maxPitch, c.maxPitch);
    // Softly keep elevation within bounds.
    const span = c.maxElevation - c.minElevation;
    const mid = (c.maxElevation + c.minElevation) / 2;
    const elevationBias = (st.y - mid) / (span / 2);
    if (elevationBias > 0.6) targetPitch = -Math.abs(targetPitch) - c.maxPitch * 0.4;
    if (elevationBias < -0.6) targetPitch = Math.abs(targetPitch) + c.maxPitch * 0.4;
    targetPitch = clamp(targetPitch, -c.maxPitch, c.maxPitch);

    return { targetCurvature, targetPitch };
  }

  private generateNext(): void {
    const c = this.config;
    const index = this.nextIndex;
    const rng = new Rng(mixSeed(this.seed, index));
    // The first chunk starts straight and flat so the player can settle in.
    const plan: ChunkPlan = index === 0 ? { targetCurvature: 0, targetPitch: 0 } : this.planChunk(rng);

    const count = c.segmentsPerChunk + 1;
    const samples = new Float64Array(count * SAMPLE_STRIDE);
    const st = this.state;
    const ds = c.sampleSpacing;

    this.writeSample(samples, 0);
    for (let i = 1; i < count; i++) {
      const prevCurvature = st.curvature;
      const prevPitch = st.pitch;
      const prevYaw = st.yaw;
      st.curvature = approach(st.curvature, plan.targetCurvature, c.maxCurvatureRate * ds);
      st.pitch = approach(st.pitch, plan.targetPitch, c.maxPitchRate * ds);
      st.yaw += 0.5 * (prevCurvature + st.curvature) * ds;
      // Midpoint direction for second-order accurate integration.
      const yaw = 0.5 * (prevYaw + st.yaw);
      const pitch = 0.5 * (prevPitch + st.pitch);
      const cp = Math.cos(pitch);
      st.x += Math.sin(yaw) * cp * ds;
      st.y += Math.sin(pitch) * ds;
      st.z += -Math.cos(yaw) * cp * ds;
      this.writeSample(samples, i);
    }

    this.chunks.set(index, {
      index,
      startDistance: index * this.chunkLength,
      samples,
      sampleCount: count,
    });
    this.nextIndex++;
  }

  private writeSample(out: Float64Array, i: number): void {
    const c = this.config;
    const st = this.state;
    const o = i * SAMPLE_STRIDE;

    const cp = Math.cos(st.pitch);
    const tx = Math.sin(st.yaw) * cp;
    const ty = Math.sin(st.pitch);
    const tz = -Math.cos(st.yaw) * cp;

    // Unbanked right = normalize(tangent x worldUp); up = right x tangent.
    let rx = -tz;
    let rz = tx;
    const rl = Math.hypot(rx, rz);
    rx /= rl;
    rz /= rl;
    const ux0 = -rz * ty;
    const uy0 = rz * tx - rx * tz;
    const uz0 = rx * ty;

    // Bank into the curve: positive curvature turns right, so the right edge drops.
    const bank = clamp(st.curvature * c.bankPerCurvature, -c.maxBank, c.maxBank);
    const cb = Math.cos(bank);
    const sb = Math.sin(bank);

    out[o + P] = st.x;
    out[o + P + 1] = st.y;
    out[o + P + 2] = st.z;
    out[o + T] = tx;
    out[o + T + 1] = ty;
    out[o + T + 2] = tz;
    out[o + R] = rx * cb - ux0 * sb;
    out[o + R + 1] = -uy0 * sb;
    out[o + R + 2] = rz * cb - uz0 * sb;
    out[o + U] = ux0 * cb + rx * sb;
    out[o + U + 1] = uy0 * cb;
    out[o + U + 2] = uz0 * cb + rz * sb;
    out[o + K] = st.curvature;
    out[o + PITCH] = st.pitch;
  }
}

function lerpDirection(s: Float64Array, a: number, b: number, t: number, out: Vector3): void {
  out
    .set(s[a] + (s[b] - s[a]) * t, s[a + 1] + (s[b + 1] - s[a + 1]) * t, s[a + 2] + (s[b + 2] - s[a + 2]) * t)
    .normalize();
}

/** Offsets of the per-sample fields, for renderers that read chunk data directly. */
export const SAMPLE_FIELDS = { P, T, R, U, K, PITCH } as const;
