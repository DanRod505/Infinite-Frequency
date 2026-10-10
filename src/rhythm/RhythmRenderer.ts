import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import { TrackFrame, type TrackGenerator } from '../track/TrackGenerator';
import type { RhythmEvent } from './RhythmSystem';
import type { Chart } from './types';

/** How far ahead notes and obstacles are drawn, in metres. */
const VIEW_AHEAD = 460;
/** How far behind the vehicle judged items stay visible. */
const VIEW_BEHIND = 12;
const NOTE_HEIGHT = 1.1;
const MAX_NOTES = 160;
const MAX_OBSTACLES = 40;
const BURST_COUNT = 16;
const BURST_DURATION = 0.3;

const enum NoteState {
  Pending,
  Collected,
  Missed,
}

/**
 * Draws the chart along the track with instanced meshes and plays feedback
 * bursts (GDD §6.1, §6.5, §11.4). Purely visual: judging happens in
 * RhythmSystem.
 */
export class RhythmRenderer {
  readonly group = new Group();
  private chart: Chart | null = null;
  private noteState = new Uint8Array(0);
  private obstacleHit = new Uint8Array(0);
  private firstNote = 0;
  private firstObstacle = 0;

  private readonly normalNotes: InstancedMesh;
  private readonly specialNotes: InstancedMesh;
  private readonly obstacles: InstancedMesh;
  /** Camera-facing glows behind notes: the main legibility cue at a distance. */
  private readonly normalHalos: InstancedMesh;
  private readonly specialHalos: InstancedMesh;
  private readonly cameraRotation = new Quaternion();
  private readonly bursts: { mesh: Mesh<RingGeometry, MeshBasicMaterial>; age: number }[] = [];
  private nextBurst = 0;

  private readonly frame = new TrackFrame();
  private readonly position = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly basis = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly scale = new Vector3();
  private readonly back = new Vector3();
  private readonly yAxis = new Vector3(0, 1, 0);

  constructor() {
    this.group.name = 'Rhythm';
    // White-hot gems stand apart from the cyan lane dashes and magenta edges.
    const gem = new OctahedronGeometry(0.75, 0);
    this.normalNotes = this.instanced(
      gem,
      new MeshStandardMaterial({ color: 0x223344, emissive: 0xd8fbff, emissiveIntensity: 1.8, roughness: 0.3, metalness: 0.2 }),
      MAX_NOTES,
    );
    this.specialNotes = this.instanced(
      new OctahedronGeometry(1.05, 0),
      new MeshStandardMaterial({ color: 0x33220a, emissive: 0xffc23f, emissiveIntensity: 2, roughness: 0.3, metalness: 0.4 }),
      MAX_NOTES,
    );
    const hazard = createHazardTexture();
    this.obstacles = this.instanced(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ map: hazard, emissiveMap: hazard, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6 }),
      MAX_OBSTACLES,
    );

    const glow = createGlowTexture();
    const haloMaterial = (color: number) =>
      new MeshBasicMaterial({ map: glow, color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    this.normalHalos = this.instanced(new PlaneGeometry(1, 1), haloMaterial(0x6ff6ff), MAX_NOTES);
    this.specialHalos = this.instanced(new PlaneGeometry(1, 1), haloMaterial(0xffb02a), MAX_NOTES);

    const ring = new RingGeometry(0.5, 0.75, 32);
    for (let i = 0; i < BURST_COUNT; i++) {
      const mesh = new Mesh(
        ring,
        new MeshBasicMaterial({ color: 0x3ff2ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.bursts.push({ mesh, age: BURST_DURATION });
    }
  }

  setChart(chart: Chart | null): void {
    this.chart = chart;
    this.noteState = new Uint8Array(chart?.notes.length ?? 0);
    this.obstacleHit = new Uint8Array(chart?.obstacles.length ?? 0);
    this.firstNote = 0;
    this.firstObstacle = 0;
    for (const burst of this.bursts) {
      burst.age = BURST_DURATION;
      burst.mesh.visible = false;
    }
    this.group.visible = chart !== null;
  }

  /** Visual reaction to a judgement from the rhythm system. */
  handleEvent(event: RhythmEvent, generator: TrackGenerator): void {
    if (event.type === 'collect') {
      this.noteState[event.note.id] = NoteState.Collected;
      const special = event.note.kind === 'special';
      const color = special ? 0xffc23f : event.result.quality === 'perfect' ? 0xd8fbff : 0x9b8cff;
      this.spawnBurst(generator, event.note.distance, event.note.lateral, NOTE_HEIGHT, color, special ? 1.3 : 0.9);
    } else if (event.type === 'miss') {
      this.noteState[event.note.id] = NoteState.Missed;
    } else {
      this.obstacleHit[event.obstacle.id] = 1;
      this.spawnBurst(generator, event.obstacle.distance, event.obstacle.lateral, 0.6, 0xff2a4a, 1.6);
    }
  }

  update(dt: number, distance: number, time: number, beatPulse: number, generator: TrackGenerator, camera: Camera): void {
    const chart = this.chart;
    if (!chart) return;

    // Notes ------------------------------------------------------------------
    const notes = chart.notes;
    while (this.firstNote < notes.length && notes[this.firstNote].distance < distance - VIEW_BEHIND) this.firstNote++;
    let normal = 0;
    let special = 0;
    const pulse = 1 + 0.18 * beatPulse;
    this.spin.setFromAxisAngle(this.yAxis, time * 2.2);
    this.cameraRotation.copy(camera.quaternion);
    for (let i = this.firstNote; i < notes.length; i++) {
      const note = notes[i];
      if (note.distance > distance + VIEW_AHEAD) break;
      // Judged notes disappear: a missed note lingering between the car and the camera only distracts.
      if (this.noteState[i] !== NoteState.Pending) continue;
      const bob = 0.12 * Math.sin(time * 3 + note.id * 0.7);
      this.placeOnTrack(generator, note.distance, note.lateral, NOTE_HEIGHT + bob);
      this.rotation.multiply(this.spin);
      if (note.kind === 'special') {
        if (special < MAX_NOTES) {
          this.setInstance(this.specialNotes, special, pulse);
          this.setHalo(this.specialHalos, special++, 4.2 * pulse);
        }
      } else if (normal < MAX_NOTES) {
        this.setInstance(this.normalNotes, normal, pulse);
        this.setHalo(this.normalHalos, normal++, 3.6 * pulse);
      }
    }
    this.commit(this.normalNotes, normal);
    this.commit(this.specialNotes, special);
    this.commit(this.normalHalos, normal);
    this.commit(this.specialHalos, special);

    // Obstacles --------------------------------------------------------------
    const obstacles = chart.obstacles;
    while (this.firstObstacle < obstacles.length && obstacles[this.firstObstacle].distance < distance - VIEW_BEHIND) {
      this.firstObstacle++;
    }
    let count = 0;
    for (let i = this.firstObstacle; i < obstacles.length && count < MAX_OBSTACLES; i++) {
      const obstacle = obstacles[i];
      if (obstacle.distance > distance + VIEW_AHEAD) break;
      const height = this.obstacleHit[i] ? 0.5 : 1.1;
      this.placeOnTrack(generator, obstacle.distance, obstacle.lateral, height / 2);
      this.scale.set(obstacle.halfWidth * 2, height, 0.8);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.obstacles.setMatrixAt(count++, this.matrix);
    }
    this.commit(this.obstacles, count);

    // Bursts -----------------------------------------------------------------
    for (const burst of this.bursts) {
      if (burst.age >= BURST_DURATION) continue;
      burst.age += dt;
      const t = Math.min(1, burst.age / BURST_DURATION);
      const size = burst.mesh.userData.size as number;
      // The burst is born right at the vehicle, close to the camera: keep it small and brief.
      burst.mesh.scale.setScalar(size * (0.6 + 0.9 * t));
      burst.mesh.material.opacity = 0.75 * (1 - t);
      burst.mesh.quaternion.copy(camera.quaternion);
      burst.mesh.visible = t < 1;
    }
  }

  dispose(): void {
    for (const mesh of [this.normalNotes, this.specialNotes, this.obstacles, this.normalHalos, this.specialHalos]) {
      mesh.geometry.dispose();
      const material = mesh.material as MeshStandardMaterial | MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      mesh.dispose();
    }
    this.bursts[0]?.mesh.geometry.dispose();
    for (const burst of this.bursts) burst.mesh.material.dispose();
  }

  /** Sets `position` and `rotation` to a point on the road surface, aligned with the road. */
  private placeOnTrack(generator: TrackGenerator, distance: number, lateral: number, height: number): void {
    generator.pointAt(distance, lateral, height, this.frame, this.position);
    this.back.copy(this.frame.tangent).negate();
    this.basis.makeBasis(this.frame.right, this.frame.up, this.back);
    this.rotation.setFromRotationMatrix(this.basis);
  }

  private setInstance(mesh: InstancedMesh, index: number, scale: number): void {
    this.scale.setScalar(scale);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }

  /** Camera-facing glow at the current `position`. */
  private setHalo(mesh: InstancedMesh, index: number, size: number): void {
    this.scale.setScalar(size);
    this.matrix.compose(this.position, this.cameraRotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }

  private commit(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private spawnBurst(generator: TrackGenerator, distance: number, lateral: number, height: number, color: number, size: number): void {
    const burst = this.bursts[this.nextBurst];
    this.nextBurst = (this.nextBurst + 1) % this.bursts.length;
    generator.pointAt(distance, lateral, height, this.frame, burst.mesh.position);
    burst.mesh.material.color.setHex(color);
    burst.mesh.userData.size = size;
    burst.age = 0;
    burst.mesh.visible = true;
  }

  private instanced(
    geometry: BoxGeometry | OctahedronGeometry | PlaneGeometry,
    material: MeshStandardMaterial | MeshBasicMaterial,
    count: number,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    // Instances move every frame along the track; per-instance culling is not worth it.
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }
}

/** Red and dark diagonal stripes: unmistakably "do not touch". */
function createHazardTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1a0006';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ff2a4a';
    for (let x = -size; x < size * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 + size, size);
      ctx.lineTo(x + size, size);
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Soft radial gradient used for the note halos. */
function createGlowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}
