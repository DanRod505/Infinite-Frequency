import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  type Scene,
  type Vector3,
} from 'three';
import { Rng } from '../core/rng';
import type { MusicVisualState } from '../game/GameDirector';

/** Sky and fog palettes blended by musical intensity (GDD §5.3, §9.2). */
const CALM = {
  top: new Color(0x090018),
  middle: new Color(0x3a0b5c),
  horizon: new Color(0xff3c8e),
  fog: new Color(0x1a0630),
};
const INTENSE = {
  top: new Color(0x16002e),
  middle: new Color(0x7a0f74),
  horizon: new Color(0xff7a45),
  fog: new Color(0x2e0a3c),
};

const SPARKLE_COUNT = 500;
const SPARKLE_BOX = { x: 160, y: 50, z: 260 };

/**
 * Minimal Neon Dreams-style atmosphere for the driving prototype (GDD §5.2).
 * Only enough to read speed and depth; full biome work belongs to Phase 4.
 */
export class Environment {
  readonly group = new Group();
  private readonly sky: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly sun: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly grid: GridHelper;
  private readonly floor: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly sparkles: Points<BufferGeometry, PointsMaterial>;
  private readonly sparkleOffsets: Float32Array;
  private readonly hemisphere: HemisphereLight;
  private readonly fog: Fog;
  private readonly gridMaterials: { opacity: number }[];
  private readonly gridCell = 20;
  private readonly gridLevel = -45;

  constructor(scene: Scene) {
    this.group.name = 'Environment';
    this.fog = new Fog(CALM.fog.clone(), 120, 850);
    scene.background = this.fog.color;
    scene.fog = this.fog;

    this.group.add(new AmbientLight(0x6a4c9c, 0.6));
    this.hemisphere = new HemisphereLight(0xff6ad5, 0x1a0630, 0.9);
    this.group.add(this.hemisphere);
    const key = new DirectionalLight(0xffd1f5, 1.2);
    key.position.set(-30, 80, 40);
    this.group.add(key);

    this.sky = new Mesh(
      new SphereGeometry(1500, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: CALM.top.clone() },
          middle: { value: CALM.middle.clone() },
          horizon: { value: CALM.horizon.clone() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 middle;
          uniform vec3 horizon;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 color = mix(horizon, middle, smoothstep(-0.02, 0.18, h));
            color = mix(color, top, smoothstep(0.18, 0.7, h));
            gl_FragColor = vec4(color, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    this.sun = new Mesh(
      new PlaneGeometry(520, 520),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float r = length(p);
            if (r > 0.5) discard;
            // Retro sun: warm gradient cut by horizontal bands near the bottom.
            vec3 color = mix(vec3(1.0, 0.18, 0.55), vec3(1.0, 0.85, 0.3), vUv.y);
            float bands = step(0.5, fract(vUv.y * 14.0));
            float cut = vUv.y < 0.45 ? bands : 1.0;
            float edge = smoothstep(0.5, 0.47, r);
            gl_FragColor = vec4(color, edge * cut);
          }`,
      }),
    );
    this.sun.renderOrder = -1;
    this.sun.frustumCulled = false;
    this.group.add(this.sun);

    this.floor = new Mesh(
      new PlaneGeometry(4000, 4000),
      new MeshBasicMaterial({ color: 0x0b0216 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.group.add(this.floor);

    this.grid = new GridHelper(2400, 2400 / this.gridCell, 0xff2ad4, 0x7a1fd0);
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.55;
    }
    this.gridMaterials = gridMaterials;
    this.group.add(this.grid);

    // Floating sparkles around the camera, driven by high frequencies.
    const rng = new Rng(0xc0ffee);
    this.sparkleOffsets = new Float32Array(SPARKLE_COUNT * 3);
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      this.sparkleOffsets[i * 3] = rng.range(-1, 1) * SPARKLE_BOX.x;
      this.sparkleOffsets[i * 3 + 1] = rng.range(0.08, 1) * SPARKLE_BOX.y;
      this.sparkleOffsets[i * 3 + 2] = rng.range(-1, 1) * SPARKLE_BOX.z;
    }
    const sparkleGeometry = new BufferGeometry();
    sparkleGeometry.setAttribute('position', new BufferAttribute(new Float32Array(SPARKLE_COUNT * 3), 3));
    this.sparkles = new Points(
      sparkleGeometry,
      new PointsMaterial({
        color: 0x9ff8ff,
        map: createGlowTexture(),
        size: 0.5,
        transparent: true,
        opacity: 0.4,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.sparkles.frustumCulled = false;
    this.group.add(this.sparkles);

    scene.add(this.group);
  }

  /** Keeps background elements centred on the camera. */
  update(cameraPosition: Vector3): void {
    this.sky.position.copy(cameraPosition);
    // The sun sits on the horizon in the track's main direction (-Z).
    this.sun.position.set(cameraPosition.x, 130, cameraPosition.z - 1300);
    this.sun.lookAt(cameraPosition.x, 130, cameraPosition.z);

    // Snap the grid to whole cells so it appears static while following the camera.
    const snap = (value: number) => Math.round(value / this.gridCell) * this.gridCell;
    this.grid.position.set(snap(cameraPosition.x), this.gridLevel, snap(cameraPosition.z));
    this.floor.position.set(cameraPosition.x, this.gridLevel - 0.5, cameraPosition.z);

    // Sparkles live in a box that wraps around the camera, so they stream past endlessly.
    const positions = this.sparkles.geometry.getAttribute('position') as BufferAttribute;
    const wrap = (value: number, size: number) => ((((value + size) % (2 * size)) + 2 * size) % (2 * size)) - size;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const o = i * 3;
      positions.setXYZ(
        i,
        cameraPosition.x + wrap(this.sparkleOffsets[o] - cameraPosition.x, SPARKLE_BOX.x),
        cameraPosition.y + this.sparkleOffsets[o + 1],
        cameraPosition.z + wrap(this.sparkleOffsets[o + 2] - cameraPosition.z, SPARKLE_BOX.z),
      );
    }
    positions.needsUpdate = true;
  }

  /** Applies the music-driven state (palette, pulses, particles). */
  applyMusic(music: MusicVisualState): void {
    const t = Math.min(1, Math.max(0, (music.intensity - 0.3) / 0.6));
    const u = this.sky.material.uniforms;
    (u.top.value as Color).lerpColors(CALM.top, INTENSE.top, t);
    (u.middle.value as Color).lerpColors(CALM.middle, INTENSE.middle, t);
    (u.horizon.value as Color).lerpColors(CALM.horizon, INTENSE.horizon, t);
    this.fog.color.lerpColors(CALM.fog, INTENSE.fog, t);

    this.sun.scale.setScalar(1 + 0.1 * music.bass + 0.04 * music.beatPulse);
    const gridOpacity = Math.min(1, 0.3 + 0.35 * music.bass + 0.35 * music.beatPulse);
    for (const material of this.gridMaterials) material.opacity = gridOpacity;
    this.hemisphere.intensity = 0.7 + 0.6 * music.mid;

    const sparkle = this.sparkles.material;
    sparkle.opacity = Math.min(1, 0.15 + 0.85 * music.high);
    sparkle.size = 0.35 + 0.6 * music.high;
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.grid.dispose();
    this.sparkles.geometry.dispose();
    this.sparkles.material.map?.dispose();
    this.sparkles.material.dispose();
  }
}

/** Soft round sprite so points read as glowing dots rather than squares. */
function createGlowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}
