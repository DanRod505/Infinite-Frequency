import {
  AmbientLight,
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
  ShaderMaterial,
  SphereGeometry,
  type Scene,
  type Vector3,
} from 'three';

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
  private readonly gridCell = 20;
  private readonly gridLevel = -45;

  constructor(scene: Scene) {
    this.group.name = 'Environment';
    const fogColor = new Color(0x1a0630);
    scene.background = fogColor;
    scene.fog = new Fog(fogColor, 120, 850);

    this.group.add(new AmbientLight(0x6a4c9c, 0.6));
    this.group.add(new HemisphereLight(0xff6ad5, 0x1a0630, 0.9));
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
          top: { value: new Color(0x090018) },
          middle: { value: new Color(0x3a0b5c) },
          horizon: { value: new Color(0xff3c8e) },
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
    this.group.add(this.grid);

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
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.grid.dispose();
  }
}
