import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { TrackFrame, type TrackGenerator } from '../track/TrackGenerator';
import type { MusicVisualState } from '../game/GameDirector';
import type { Palette } from './palettes';
import type { WorldPlan } from './WorldPlanner';

const VIEW_AHEAD = 800;
const VIEW_BEHIND = 30;
const MAX_RINGS = 64;
const RING_RADIUS = 11.5;
/** Ring centre above the road: the road passes through the lower part of the ring. */
const RING_LIFT = 2.5;
const MONUMENT_RADIUS = 30;
const MONUMENT_POOL = 2;

interface Monument {
  group: Group;
  outer: Mesh<BufferGeometry, MeshBasicMaterial>;
  inner: Mesh<BufferGeometry, MeshBasicMaterial>;
  pylons: Mesh<BufferGeometry, MeshBasicMaterial>[];
}

/**
 * Planned environmental events (GDD §5.4, §5.5): light tunnels whose rings
 * sit exactly on the beats (the car crosses one per beat) and monumental
 * gates that light up as the car passes through them at a drop.
 */
export class EventRenderer {
  readonly group = new Group();
  private plan: WorldPlan | null = null;
  private readonly ringDistances: number[] = [];
  private readonly rings: InstancedMesh;
  private readonly monuments: Monument[] = [];

  private readonly frame = new TrackFrame();
  private readonly position = new Vector3();
  private readonly basis = new Matrix4();
  private readonly back = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly matrix = new Matrix4();
  private readonly unitScale = new Vector3(1, 1, 1);
  private readonly color = new Color();

  constructor() {
    this.group.name = 'WorldEvents';
    this.rings = new InstancedMesh(
      new TorusGeometry(RING_RADIUS, 0.3, 8, 72),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }),
      MAX_RINGS,
    );
    this.rings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.group.add(this.rings);

    const outerGeometry = new TorusGeometry(MONUMENT_RADIUS, 1.1, 10, 96);
    const innerGeometry = new TorusGeometry(MONUMENT_RADIUS * 0.78, 0.45, 8, 6); // hexagonal inner frame
    const pylonGeometry = new BoxGeometry(3, 1, 3);
    pylonGeometry.translate(0, 0.5, 0);
    for (let i = 0; i < MONUMENT_POOL; i++) {
      const make = (geometry: BufferGeometry): Mesh<BufferGeometry, MeshBasicMaterial> =>
        new Mesh(geometry, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      const group = new Group();
      const outer = make(outerGeometry);
      const inner = make(innerGeometry);
      const pylons = [make(pylonGeometry), make(pylonGeometry)];
      pylons.forEach((pylon, k) => {
        pylon.position.set((k === 0 ? -1 : 1) * (MONUMENT_RADIUS + 6), -MONUMENT_RADIUS - 20, 0);
        pylon.scale.set(1, MONUMENT_RADIUS * 2 + 40, 1);
      });
      group.add(outer, inner, ...pylons);
      group.visible = false;
      this.group.add(group);
      this.monuments.push({ group, outer, inner, pylons });
    }
  }

  setPlan(plan: WorldPlan | null): void {
    this.plan = plan;
    this.ringDistances.length = 0;
    for (const tunnel of plan?.tunnels ?? []) for (const ring of tunnel.rings) this.ringDistances.push(ring.distance);
    this.ringDistances.sort((a, b) => a - b);
  }

  update(distance: number, time: number, music: MusicVisualState, palette: Palette, generator: TrackGenerator, effects: number): void {
    // Tunnel rings ------------------------------------------------------------
    let count = 0;
    for (const ringDistance of this.ringDistances) {
      if (ringDistance < distance - VIEW_BEHIND) continue;
      if (ringDistance > distance + VIEW_AHEAD || count >= MAX_RINGS) break;
      this.place(generator, ringDistance, RING_LIFT);
      this.matrix.compose(this.position, this.rotation, this.unitScale);
      this.rings.setMatrixAt(count, this.matrix);
      // Each ring flares as the car crosses it, which happens exactly on its beat.
      const gap = (ringDistance - distance) / 14;
      const flare = Math.exp(-gap * gap);
      const brightness = 0.3 + 0.2 * music.beatPulse + 1.1 * flare * Math.max(0.3, effects);
      this.color.copy(palette.accentA).lerp(palette.accentB, flare).multiplyScalar(brightness);
      this.rings.setColorAt(count, this.color);
      count++;
    }
    this.rings.count = count;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;

    // Monuments ---------------------------------------------------------------
    let used = 0;
    for (const monument of this.plan?.monuments ?? []) {
      if (monument.distance < distance - VIEW_BEHIND * 3 || monument.distance > distance + VIEW_AHEAD) continue;
      if (used >= this.monuments.length) break;
      const m = this.monuments[used++];
      this.place(generator, monument.distance, MONUMENT_RADIUS - 6);
      m.group.position.copy(this.position);
      m.group.quaternion.copy(this.rotation);
      m.group.visible = true;
      // Dim while approaching, blazing once the drop hits, then fading.
      const since = time - monument.time;
      const lit = since < 0 ? 0.25 + 0.15 * music.beatPulse : 0.35 + 0.9 * Math.exp(-since * 0.8);
      m.outer.material.color.copy(palette.accentB).multiplyScalar(lit);
      m.inner.material.color.copy(palette.accentA).multiplyScalar(lit * 0.9);
      m.inner.rotation.z = time * 0.4;
      for (const pylon of m.pylons) pylon.material.color.copy(palette.accentA).multiplyScalar(lit * 0.6);
    }
    for (let i = used; i < this.monuments.length; i++) this.monuments[i].group.visible = false;
  }

  dispose(): void {
    this.rings.geometry.dispose();
    (this.rings.material as MeshBasicMaterial).dispose();
    const first = this.monuments[0];
    if (first) {
      first.outer.geometry.dispose();
      first.inner.geometry.dispose();
      first.pylons[0].geometry.dispose();
    }
    for (const m of this.monuments) {
      m.outer.material.dispose();
      m.inner.material.dispose();
      for (const pylon of m.pylons) pylon.material.dispose();
    }
  }

  /** Sets `position`/`rotation` on the centreline at `distance`, facing along the road. */
  private place(generator: TrackGenerator, distance: number, lift: number): void {
    generator.sampleFrame(distance, this.frame);
    this.position.copy(this.frame.position).addScaledVector(this.frame.up, lift);
    this.back.copy(this.frame.tangent).negate();
    this.basis.makeBasis(this.frame.right, this.frame.up, this.back);
    this.rotation.setFromRotationMatrix(this.basis);
  }
}
