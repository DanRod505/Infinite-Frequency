import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
} from 'three';

/**
 * Placeholder stylised vehicle built from primitives (GDD §8.1, §9.1).
 * The root follows the road frame; `body` carries lean and suspension motion.
 */
export class VehicleModel {
  readonly root = new Group();
  readonly body = new Group();
  private readonly wheels: Mesh[] = [];
  private readonly underglow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private pulse = 0;

  constructor() {
    this.root.name = 'Vehicle';
    this.root.add(this.body);

    const paint = this.track(new MeshStandardMaterial({ color: 0x3a2f6b, metalness: 0.6, roughness: 0.3 }));
    const trim = this.track(
      new MeshStandardMaterial({ color: 0x0a0a12, emissive: 0x00e5ff, emissiveIntensity: 1.6, roughness: 0.4 }),
    );
    const glass = this.track(new MeshStandardMaterial({ color: 0x0b1030, metalness: 0.9, roughness: 0.05 }));
    const tail = this.track(new MeshBasicMaterial({ color: 0xff2a6d }));
    const head = this.track(new MeshBasicMaterial({ color: 0xe8faff }));
    const tyre = this.track(new MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }));
    const rim = this.track(new MeshStandardMaterial({ color: 0x111111, emissive: 0xff2ad4, emissiveIntensity: 0.8 }));

    // Body: low wedge built from boxes. Forward is -Z.
    this.addBox(2.0, 0.45, 4.4, 0, 0.55, 0, paint);
    this.addBox(1.9, 0.18, 1.3, 0, 0.66, -1.75, paint).rotation.x = 0.12;
    this.addBox(1.5, 0.42, 1.9, 0, 0.98, 0.25, glass);
    this.addBox(2.04, 0.06, 4.44, 0, 0.36, 0, trim);
    this.addBox(2.1, 0.08, 0.5, 0, 1.0, 2.05, paint); // spoiler
    this.addBox(1.8, 0.1, 0.06, 0, 0.62, 2.21, tail);
    this.addBox(0.5, 0.08, 0.06, -0.65, 0.62, -2.21, head);
    this.addBox(0.5, 0.08, 0.06, 0.65, 0.62, -2.21, head);

    const wheelGeometry = this.trackGeometry(new CylinderGeometry(0.36, 0.36, 0.3, 18));
    wheelGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = this.trackGeometry(new CylinderGeometry(0.22, 0.22, 0.32, 12));
    rimGeometry.rotateZ(Math.PI / 2);
    for (const [x, z] of [
      [-0.98, -1.4],
      [0.98, -1.4],
      [-0.98, 1.35],
      [0.98, 1.35],
    ] as const) {
      const wheel = new Mesh(wheelGeometry, tyre);
      wheel.add(new Mesh(rimGeometry, rim));
      wheel.position.set(x, 0.36, z);
      this.root.add(wheel); // wheels stay on the road while the body leans
      this.wheels.push(wheel);
    }

    const glowMaterial = this.track(
      new MeshBasicMaterial({ color: 0xff2ad4, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }),
    );
    this.underglow = new Mesh(this.trackGeometry(new PlaneGeometry(3.2, 5.6)), glowMaterial);
    this.underglow.rotation.x = -Math.PI / 2;
    this.underglow.position.y = 0.04;
    this.root.add(this.underglow);
  }

  /**
   * Animates purely visual motion.
   * @param lateralVelocity sideways speed (m/s), drives lean and yaw
   * @param speed forward speed (m/s), drives wheel spin
   */
  animate(dt: number, time: number, lateralVelocity: number, speed: number, maxLateralSpeed: number): void {
    const lean = lateralVelocity / maxLateralSpeed;
    // Lean and yaw into the steer direction for an arcade feel.
    this.body.rotation.z = -lean * 0.09;
    this.body.rotation.y = -lean * 0.12;
    this.body.position.y = Math.sin(time * 13) * 0.015 + Math.sin(time * 5.3) * 0.02;
    this.body.rotation.x = Math.sin(time * 7.1) * 0.006;

    const spin = (speed / 0.36) * dt;
    for (const wheel of this.wheels) wheel.rotation.x -= spin;
    this.underglow.material.opacity = 0.25 + 0.06 * Math.sin(time * 4) + 0.3 * this.pulse;
  }

  /** Music pulse in [0, 1] for the underglow. */
  setPulse(pulse: number): void {
    this.pulse = pulse;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }

  private addBox(w: number, h: number, d: number, x: number, y: number, z: number, material: Material): Mesh {
    const mesh = new Mesh(this.trackGeometry(new BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y, z);
    this.body.add(mesh);
    return mesh;
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private trackGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
}
