import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { SAMPLE_FIELDS, SAMPLE_STRIDE, type TrackChunk, type TrackGenerator } from './TrackGenerator';

const { P, R, U } = SAMPLE_FIELDS;

/** Number of vertices across the road surface. */
const COLUMNS = 9;
/** Depth of the side skirts below the road surface. */
const SKIRT_DEPTH = 1.2;
/** Road texture covers this many metres along the road per repeat. */
const TEXTURE_LENGTH = 16;

/**
 * Turns generated chunks into meshes, keeping only a window of chunks alive
 * and recycling their geometry (GDD §4.5, §11.4).
 */
export class TrackRenderer {
  readonly group = new Group();
  private readonly active = new Map<number, ChunkMesh>();
  private readonly pool: ChunkMesh[] = [];
  private readonly roadMaterial: MeshStandardMaterial;
  private readonly skirtMaterial: MeshStandardMaterial;

  constructor(
    private generator: TrackGenerator,
    /** Chunks kept behind the vehicle. */
    private readonly chunksBehind = 1,
    /** Chunks kept ahead of the vehicle. */
    private readonly chunksAhead = 7,
  ) {
    this.group.name = 'Track';
    const texture = createRoadTexture();
    this.roadMaterial = new MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 1.1,
      roughness: 0.45,
      metalness: 0.3,
    });
    this.skirtMaterial = new MeshStandardMaterial({
      color: 0x14051f,
      emissive: 0x2a0a44,
      roughness: 0.8,
      side: DoubleSide,
    });
  }

  get activeChunkCount(): number {
    return this.active.size;
  }

  /** Switches to a different generator (e.g. new seed), recycling all meshes. */
  setGenerator(generator: TrackGenerator): void {
    for (const [index, mesh] of this.active) this.release(index, mesh);
    this.generator = generator;
  }

  /** Streams chunks around the given distance. */
  update(distance: number): void {
    const current = this.generator.chunkIndexAt(distance);
    const first = Math.max(0, current - this.chunksBehind);
    const last = current + this.chunksAhead;

    for (const [index, mesh] of this.active) {
      if (index < first || index > last) this.release(index, mesh);
    }

    this.generator.ensureChunk(last);
    for (let index = first; index <= last; index++) {
      if (this.active.has(index)) continue;
      const chunk = this.generator.getChunk(index);
      if (!chunk) continue;
      const mesh = this.pool.pop() ?? new ChunkMesh(chunk.sampleCount, this.roadMaterial, this.skirtMaterial);
      mesh.build(chunk, this.generator.roadWidth, this.generator.config.sampleSpacing);
      this.group.add(mesh.object);
      this.active.set(index, mesh);
    }

    // Chunk data behind the rendered window is no longer needed.
    this.generator.pruneBefore(first * this.generator.chunkLength);
  }

  dispose(): void {
    for (const mesh of [...this.active.values(), ...this.pool]) mesh.dispose();
    this.active.clear();
    this.pool.length = 0;
    this.roadMaterial.map?.dispose();
    this.roadMaterial.dispose();
    this.skirtMaterial.dispose();
  }

  private release(index: number, mesh: ChunkMesh): void {
    this.group.remove(mesh.object);
    this.active.delete(index);
    this.pool.push(mesh);
  }
}

/** Reusable mesh for one chunk: road surface plus side skirts. */
class ChunkMesh {
  readonly object = new Group();
  private readonly road: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly skirts: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly sampleCount: number;

  constructor(sampleCount: number, roadMaterial: MeshStandardMaterial, skirtMaterial: MeshStandardMaterial) {
    this.sampleCount = sampleCount;
    this.road = new Mesh(createGridGeometry(sampleCount, COLUMNS, true), roadMaterial);
    this.skirts = new Mesh(createGridGeometry(sampleCount, 4, false), skirtMaterial);
    this.road.receiveShadow = false;
    this.object.add(this.road, this.skirts);
    this.object.matrixAutoUpdate = false;
  }

  build(chunk: TrackChunk, roadWidth: number, sampleSpacing: number): void {
    if (chunk.sampleCount !== this.sampleCount) throw new Error('Chunk sample count mismatch');
    const s = chunk.samples;
    const half = roadWidth / 2;
    // Texture V is continuous along the track; the offset is reduced modulo one
    // repeat to keep float32 UVs precise far from the origin. Neighbouring
    // chunks then differ by a whole number of repeats, which is seamless.
    const vOffset = (chunk.startDistance % TEXTURE_LENGTH) / TEXTURE_LENGTH;
    const vStep = sampleSpacing / TEXTURE_LENGTH;

    const roadPos = this.road.geometry.getAttribute('position') as BufferAttribute;
    const roadNormal = this.road.geometry.getAttribute('normal') as BufferAttribute;
    const roadUv = this.road.geometry.getAttribute('uv') as BufferAttribute;
    const skirtPos = this.skirts.geometry.getAttribute('position') as BufferAttribute;
    const skirtNormal = this.skirts.geometry.getAttribute('normal') as BufferAttribute;

    for (let i = 0; i < this.sampleCount; i++) {
      const o = i * SAMPLE_STRIDE;
      const px = s[o + P], py = s[o + P + 1], pz = s[o + P + 2];
      const rx = s[o + R], ry = s[o + R + 1], rz = s[o + R + 2];
      const ux = s[o + U], uy = s[o + U + 1], uz = s[o + U + 2];
      const tv = vOffset + i * vStep;

      for (let c = 0; c < COLUMNS; c++) {
        const u = c / (COLUMNS - 1);
        const lateral = (u - 0.5) * roadWidth;
        const v = i * COLUMNS + c;
        roadPos.setXYZ(v, px + rx * lateral, py + ry * lateral, pz + rz * lateral);
        roadNormal.setXYZ(v, ux, uy, uz);
        roadUv.setXY(v, u, tv);
      }

      // Skirts: left top, left bottom, right bottom, right top.
      const lx = px - rx * half, ly = py - ry * half, lz = pz - rz * half;
      const qx = px + rx * half, qy = py + ry * half, qz = pz + rz * half;
      const b = i * 4;
      skirtPos.setXYZ(b, lx, ly, lz);
      skirtPos.setXYZ(b + 1, lx - ux * SKIRT_DEPTH, ly - uy * SKIRT_DEPTH, lz - uz * SKIRT_DEPTH);
      skirtPos.setXYZ(b + 2, qx - ux * SKIRT_DEPTH, qy - uy * SKIRT_DEPTH, qz - uz * SKIRT_DEPTH);
      skirtPos.setXYZ(b + 3, qx, qy, qz);
      skirtNormal.setXYZ(b, -rx, -ry, -rz);
      skirtNormal.setXYZ(b + 1, -rx, -ry, -rz);
      skirtNormal.setXYZ(b + 2, rx, ry, rz);
      skirtNormal.setXYZ(b + 3, rx, ry, rz);
    }

    roadPos.needsUpdate = true;
    roadNormal.needsUpdate = true;
    roadUv.needsUpdate = true;
    skirtPos.needsUpdate = true;
    skirtNormal.needsUpdate = true;
    this.road.geometry.computeBoundingSphere();
    this.skirts.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.road.geometry.dispose();
    this.skirts.geometry.dispose();
  }
}

/**
 * Creates a strip geometry of `rows` x `columns` vertices with preallocated
 * attributes. When `surface` is false the 4-column skirt profile is used
 * (quads between columns 0-1 and 2-3 only, no UVs).
 */
function createGridGeometry(rows: number, columns: number, surface: boolean): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = rows * columns;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  if (surface) geometry.setAttribute('uv', new BufferAttribute(new Float32Array(vertexCount * 2), 2));

  const indices: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    const a = i * columns;
    const b = (i + 1) * columns;
    for (let c = 0; c < columns - 1; c++) {
      if (!surface && c === 1) continue; // no quad across the road for skirts
      // Winding gives normals pointing along +up for the surface when viewed from above.
      indices.push(a + c, a + c + 1, b + c, a + c + 1, b + c + 1, b + c);
    }
  }
  geometry.setIndex(indices);
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = geometry.getAttribute(name) as BufferAttribute | undefined;
    attribute?.setUsage(DynamicDrawUsage);
  }
  return geometry;
}

/** Procedural neon road texture: dark asphalt, glowing edges and lane dashes. */
function createRoadTexture(): Texture {
  const width = 256;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');

  const base = ctx.createLinearGradient(0, 0, width, 0);
  base.addColorStop(0, '#120320');
  base.addColorStop(0.5, '#07020f');
  base.addColorStop(1, '#120320');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Faint grid across the asphalt.
  ctx.strokeStyle = 'rgba(120, 40, 200, 0.18)';
  ctx.lineWidth = 2;
  for (let y = 0; y < height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y + 1);
    ctx.lineTo(width, y + 1);
    ctx.stroke();
  }

  // Edge lines (magenta) with a soft glow.
  const edge = (x: number, dir: 1 | -1) => {
    const glow = ctx.createLinearGradient(x, 0, x + dir * 24, 0);
    glow.addColorStop(0, 'rgba(255, 40, 200, 0.55)');
    glow.addColorStop(1, 'rgba(255, 40, 200, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(Math.min(x, x + dir * 24), 0, 24, height);
    ctx.fillStyle = '#ff4fd8';
    ctx.fillRect(dir === 1 ? x : x - 6, 0, 6, height);
  };
  edge(4, 1);
  edge(width - 4, -1);

  // Lane dashes (cyan) dividing the road in four.
  ctx.fillStyle = '#3ff2ff';
  for (const fraction of [0.25, 0.5, 0.75]) {
    const x = Math.round(width * fraction) - 2;
    ctx.fillRect(x, 0, 4, height * 0.45);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
