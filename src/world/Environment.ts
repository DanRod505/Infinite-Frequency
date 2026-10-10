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
import { PALETTES, clonePalette, lerpPalette, type Palette } from './palettes';

const SPARKLE_COUNT = 500;
const SPARKLE_BOX = { x: 160, y: 50, z: 260 };

/**
 * Sky, sun, fog, grid, lights and ambient sparkles of the Neon Dreams biome
 * (GDD §5.2, §9.2). Colours come from the active palette; changes between
 * palettes are interpolated over time (§5.5), instant only when asked.
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
  private readonly gridMaterials: { opacity: number; color: Color }[];
  private readonly current = clonePalette(PALETTES.sunset);
  private readonly from = clonePalette(PALETTES.sunset);
  private to: Palette = PALETTES.sunset;
  private transition = 1;
  private transitionSeconds = 1;
  private intensity = 0.35;
  private readonly gridCell = 20;
  private readonly gridLevel = -45;

  constructor(scene: Scene) {
    this.group.name = 'Environment';
    this.fog = new Fog(this.current.fog.clone(), 120, 850);
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
          top: { value: this.current.skyTop.clone() },
          middle: { value: this.current.skyMiddle.clone() },
          horizon: { value: this.current.skyHorizon.clone() },
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
        uniforms: {
          sunTop: { value: this.current.sunTop.clone() },
          sunBottom: { value: this.current.sunBottom.clone() },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 sunTop;
          uniform vec3 sunBottom;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float r = length(p);
            if (r > 0.5) discard;
            // Retro sun: vertical gradient cut by horizontal bands near the bottom.
            vec3 color = mix(sunBottom, sunTop, vUv.y);
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

    // White/grey lines tinted by the palette through the material colour.
    this.grid = new GridHelper(2400, 2400 / this.gridCell, 0xffffff, 0x8a8a8a);
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

  /** Draws only a fraction of the ambient sparkles (graphics quality). */
  setSparkleFraction(fraction: number): void {
    this.sparkles.geometry.setDrawRange(0, Math.round(SPARKLE_COUNT * Math.min(1, Math.max(0, fraction))));
  }

  /** Current (possibly mid-transition) palette, shared with the other world systems. */
  get palette(): Palette {
    return this.current;
  }

  /** Blends to `palette` over `seconds` (0 = instant, for high-impact moments). */
  transitionTo(palette: Palette, seconds: number): void {
    if (palette === this.to && this.transition >= 1) return;
    lerpPalette(this.current, this.current, 0, this.from);
    this.to = palette;
    this.transitionSeconds = Math.max(0, seconds);
    this.transition = seconds > 0 ? 0 : 1;
    if (seconds <= 0) lerpPalette(palette, palette, 0, this.current);
  }

  /** Keeps background elements centred on the camera and advances palette transitions. */
  update(cameraPosition: Vector3, dt = 0): void {
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionSeconds);
      const t = this.transition * this.transition * (3 - 2 * this.transition);
      lerpPalette(this.from, this.to, t, this.current);
    }
    this.applyPalette();

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

  /** Applies the music-driven state (pulses, particles, horizon glow). */
  applyMusic(music: MusicVisualState): void {
    this.intensity = music.intensity;
    this.applyPalette();

    this.sun.scale.setScalar(1 + 0.1 * music.bass + 0.04 * music.beatPulse);
    const gridOpacity = Math.min(1, 0.3 + 0.35 * music.bass + 0.35 * music.beatPulse);
    for (const material of this.gridMaterials) material.opacity = gridOpacity;
    this.hemisphere.intensity = 0.7 + 0.6 * music.mid;

    const sparkle = this.sparkles.material;
    sparkle.opacity = Math.min(1, 0.15 + 0.85 * music.high);
    sparkle.size = 0.35 + 0.6 * music.high;
  }

  private applyPalette(): void {
    const p = this.current;
    const u = this.sky.material.uniforms;
    (u.top.value as Color).copy(p.skyTop);
    (u.middle.value as Color).copy(p.skyMiddle);
    // The horizon glows brighter with musical intensity.
    (u.horizon.value as Color).copy(p.skyHorizon).multiplyScalar(0.8 + 0.4 * this.intensity);
    this.fog.color.copy(p.fog);
    const sun = this.sun.material.uniforms;
    (sun.sunTop.value as Color).copy(p.sunTop);
    (sun.sunBottom.value as Color).copy(p.sunBottom);
    for (const material of this.gridMaterials) material.color.copy(p.gridMain);
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
