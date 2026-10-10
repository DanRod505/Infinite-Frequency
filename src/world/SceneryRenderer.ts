import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  TetrahedronGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { TrackGenerator } from '../track/TrackGenerator';
import type { MusicVisualState } from '../game/GameDirector';
import type { Palette } from './palettes';
import { generateChunkScenery, type Prop, type PropType } from './SceneryGenerator';

const CAPACITY: Record<PropType, number> = { post: 220, pillar: 64, tower: 200, mountain: 120, crystal: 120 };

/**
 * Streams the procedural scenery with the track chunks and draws it with one
 * instanced mesh per element type (GDD §4.5, §11.4). Colours follow the
 * active palette and react to the music.
 */
export class SceneryRenderer {
  readonly group = new Group();
  private generator: TrackGenerator | null = null;
  private seed = 0;
  private densityAt: (distance: number) => number = () => 0.6;
  private readonly chunks = new Map<number, Prop[]>();
  private activeKey = '';
  private crystals: Prop[] = [];

  private readonly posts: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly pillars: InstancedMesh;
  private readonly towers: InstancedMesh;
  private readonly mountains: InstancedMesh;
  private readonly mountainEdges: InstancedMesh;
  private readonly crystalMesh: InstancedMesh;

  private readonly lampMaterial: MeshBasicMaterial;
  private readonly towerMaterial: MeshStandardMaterial;
  private readonly edgeMaterial: MeshBasicMaterial;
  private readonly crystalMaterial: MeshStandardMaterial;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly euler = new Euler();

  constructor() {
    this.group.name = 'Scenery';
    const base = <T extends BufferGeometry>(geometry: T): T => {
      geometry.translate(0, 0.5, 0); // base at y = 0
      this.geometries.push(geometry);
      return geometry;
    };

    const metal = this.track(new MeshStandardMaterial({ color: 0x14102a, metalness: 0.7, roughness: 0.35 }));
    this.posts = this.instanced(base(new BoxGeometry(0.22, 1, 0.22)), metal, CAPACITY.post);
    this.lampMaterial = this.track(new MeshBasicMaterial({ color: 0x3ff2ff }));
    this.lamps = this.instanced(base(new BoxGeometry(0.5, 0.18, 1.6)), this.lampMaterial, CAPACITY.post);

    this.pillars = this.instanced(
      base(new BoxGeometry(1, 1, 1)),
      this.track(new MeshStandardMaterial({ color: 0x0b0718, emissive: 0x140626, roughness: 0.8 })),
      CAPACITY.pillar,
    );

    const windows = createWindowTexture();
    this.towerMaterial = this.track(
      new MeshStandardMaterial({ color: 0x0a0716, emissive: 0xff3fd2, emissiveMap: windows, emissiveIntensity: 1.2, roughness: 0.5, metalness: 0.4 }),
    );
    this.towers = this.instanced(base(new BoxGeometry(1, 1, 1)), this.towerMaterial, CAPACITY.tower);

    // Synthwave mountains: dark solid plus a neon wireframe drawn on top.
    const cone = base(new ConeGeometry(1, 1, 4, 3));
    this.mountains = this.instanced(cone, this.track(new MeshBasicMaterial({ color: 0x07020f })), CAPACITY.mountain);
    this.edgeMaterial = this.track(new MeshBasicMaterial({ color: 0xff2ad4, wireframe: true }));
    this.mountainEdges = this.instanced(cone, this.edgeMaterial, CAPACITY.mountain);

    this.crystalMaterial = this.track(
      new MeshStandardMaterial({ color: 0x1a0a2a, emissive: 0x3ff2ff, emissiveIntensity: 1.4, flatShading: true, roughness: 0.2 }),
    );
    const tetra = new TetrahedronGeometry(1, 0);
    this.geometries.push(tetra);
    this.crystalMesh = this.instanced(tetra, this.crystalMaterial, CAPACITY.crystal);
  }

  /** Starts streaming scenery for a new track. */
  setSource(generator: TrackGenerator, seed: number, densityAt: (distance: number) => number): void {
    this.generator = generator;
    this.seed = seed;
    this.densityAt = densityAt;
    this.chunks.clear();
    this.activeKey = '';
  }

  /** Keeps scenery for exactly the chunks the track renderer shows. */
  update(firstChunk: number, lastChunk: number): void {
    const generator = this.generator;
    if (!generator) return;
    for (const index of this.chunks.keys()) {
      if (index < firstChunk || index > lastChunk) this.chunks.delete(index);
    }
    for (let index = firstChunk; index <= lastChunk; index++) {
      if (this.chunks.has(index) || !generator.getChunk(index)) continue;
      const density = Math.min(1, Math.max(0, this.densityAt((index + 0.5) * generator.chunkLength)));
      this.chunks.set(index, generateChunkScenery(generator, index, this.seed, density));
    }
    const key = `${firstChunk}:${lastChunk}:${this.chunks.size}`;
    if (key !== this.activeKey) {
      this.activeKey = key;
      this.rebuild();
    }
  }

  /** Per-frame colours, pulses and crystal spin. */
  animate(time: number, music: MusicVisualState, palette: Palette, build: number): void {
    // Lamps pulse on the beat and brighten through build-ups.
    this.lampMaterial.color.copy(palette.accentB).multiplyScalar(0.55 + 0.6 * music.beatPulse + 0.5 * build);
    this.towerMaterial.emissive.copy(palette.accentA);
    this.towerMaterial.emissiveIntensity = 0.6 + 0.8 * music.mid + 0.4 * build;
    this.edgeMaterial.color.copy(palette.gridMain).multiplyScalar(0.55 + 0.45 * music.bass);
    this.crystalMaterial.emissive.copy(palette.accentB);
    this.crystalMaterial.emissiveIntensity = 0.8 + 1.4 * music.high;

    let n = 0;
    for (const prop of this.crystals) {
      if (n >= CAPACITY.crystal) break;
      this.euler.set(time * 0.6 + prop.yaw, time * 0.9 + prop.yaw, 0);
      this.rotation.setFromEuler(this.euler);
      this.position.set(prop.x, prop.y + Math.sin(time * 0.8 + prop.yaw) * 0.8, prop.z);
      this.scale.set(prop.sx, prop.sy, prop.sz);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.crystalMesh.setMatrixAt(n++, this.matrix);
    }
    this.crystalMesh.count = n;
    this.crystalMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) {
      (m as MeshStandardMaterial).emissiveMap?.dispose();
      m.dispose();
    }
  }

  private rebuild(): void {
    const counts: Record<PropType, number> = { post: 0, pillar: 0, tower: 0, mountain: 0, crystal: 0 };
    this.crystals = [];
    const indices = [...this.chunks.keys()].sort((a, b) => a - b);
    for (const index of indices) {
      for (const prop of this.chunks.get(index)!) {
        if (prop.type === 'crystal') {
          this.crystals.push(prop);
          continue;
        }
        if (counts[prop.type] >= CAPACITY[prop.type]) continue;
        const i = counts[prop.type]++;
        this.rotation.setFromAxisAngle(UP, prop.yaw);
        this.position.set(prop.x, prop.y, prop.z);
        this.scale.set(prop.sx, prop.sy, prop.sz);
        this.matrix.compose(this.position, this.rotation, this.scale);
        switch (prop.type) {
          case 'post':
            this.posts.setMatrixAt(i, this.matrix);
            this.position.y += prop.sy;
            this.scale.set(1, 1, 1);
            this.matrix.compose(this.position, this.rotation, this.scale);
            this.lamps.setMatrixAt(i, this.matrix);
            break;
          case 'pillar':
            this.pillars.setMatrixAt(i, this.matrix);
            break;
          case 'tower':
            this.towers.setMatrixAt(i, this.matrix);
            break;
          case 'mountain':
            this.mountains.setMatrixAt(i, this.matrix);
            this.mountainEdges.setMatrixAt(i, this.matrix);
            break;
        }
      }
    }
    this.commit(this.posts, counts.post);
    this.commit(this.lamps, counts.post);
    this.commit(this.pillars, counts.pillar);
    this.commit(this.towers, counts.tower);
    this.commit(this.mountains, counts.mountain);
    this.commit(this.mountainEdges, counts.mountain);
  }

  private commit(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private instanced(geometry: BufferGeometry, material: Material, count: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}

const UP = new Vector3(0, 1, 0);

/** Grid of lit and dark windows for the towers (used as emissive map). */
function createWindowTexture(): CanvasTexture {
  const width = 64;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 4; y < height - 4; y += 8) {
      for (let x = 4; x < width - 4; x += 8) {
        const lit = random();
        if (lit < 0.45) continue;
        const v = Math.round(120 + 135 * random());
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Bright crown line at the top.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
