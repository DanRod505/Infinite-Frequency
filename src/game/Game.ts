import { ACESFilmicToneMapping, Matrix4, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { lerp } from '../core/math';
import { hashSeed } from '../core/rng';
import { ChaseCamera } from '../camera/ChaseCamera';
import { TrackFrame, TrackGenerator } from '../track/TrackGenerator';
import { TrackRenderer } from '../track/TrackRenderer';
import { Hud } from '../ui/Hud';
import { VehicleController, copyVehicleState, createVehicleState } from '../vehicle/VehicleController';
import { VehicleModel } from '../vehicle/VehicleModel';
import { Environment } from '../world/Environment';

/** Height of the vehicle origin above the road surface. */
const RIDE_HEIGHT = 0;

/**
 * Phase 1 driving prototype (GDD §13): continuous procedural road, lateral
 * arcade steering, chase camera, chunk streaming. Coordinates the systems
 * without taking over their responsibilities.
 */
export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly chase: ChaseCamera;
  private readonly environment: Environment;
  private readonly vehicleModel = new VehicleModel();
  private readonly hud: Hud;

  private generator: TrackGenerator;
  private readonly trackRenderer: TrackRenderer;
  private vehicle: VehicleController;

  private readonly previous = createVehicleState();
  private readonly interpolated = createVehicleState();
  private readonly frame = new TrackFrame();
  private readonly aheadFrame = new TrackFrame();
  private readonly vehiclePosition = new Vector3();
  private readonly aheadPoint = new Vector3();
  private readonly basis = new Matrix4();
  private readonly back = new Vector3();

  private time = 0;
  private fps = 60;

  constructor(private readonly container: HTMLElement, seed: number) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.chase = new ChaseCamera(1);
    this.environment = new Environment(this.scene);
    this.generator = new TrackGenerator(seed);
    this.trackRenderer = new TrackRenderer(this.generator);
    this.vehicle = new VehicleController(this.generator.roadWidth);
    this.scene.add(this.trackRenderer.group, this.vehicleModel.root);
    this.hud = new Hud(container);

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.trackRenderer.update(0);
  }

  get seed(): number {
    return this.generator.seed;
  }

  start(): void {
    this.loop.start();
  }

  /** Restarts the run on a new procedural track. */
  restart(seed: number): void {
    this.generator = new TrackGenerator(seed);
    this.trackRenderer.setGenerator(this.generator);
    this.vehicle = new VehicleController(this.generator.roadWidth, this.vehicle.tuning);
    copyVehicleState(this.vehicle.state, this.previous);
    this.trackRenderer.update(0);
    this.chase.reset();
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState(null, '', url);
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    window.removeEventListener('resize', this.onResize);
    this.trackRenderer.dispose();
    this.vehicleModel.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Fixed-step simulation. */
  private update(dt: number): void {
    copyVehicleState(this.vehicle.state, this.previous);
    this.vehicle.update(dt, this.input.steerAxis());
    this.time += dt;
  }

  private render(alpha: number, frameDt: number): void {
    this.handleMetaInput();

    const current = this.vehicle.state;
    const s = this.interpolated;
    s.distance = lerp(this.previous.distance, current.distance, alpha);
    s.lateral = lerp(this.previous.lateral, current.lateral, alpha);
    s.lateralVelocity = lerp(this.previous.lateralVelocity, current.lateralVelocity, alpha);
    s.speed = lerp(this.previous.speed, current.speed, alpha);

    this.trackRenderer.update(s.distance);

    // Place the vehicle on the road surface, aligned with the road frame.
    this.generator.pointAt(s.distance, s.lateral, RIDE_HEIGHT, this.frame, this.vehiclePosition);
    this.back.copy(this.frame.tangent).negate();
    this.basis.makeBasis(this.frame.right, this.frame.up, this.back);
    this.vehicleModel.root.position.copy(this.vehiclePosition);
    this.vehicleModel.root.quaternion.setFromRotationMatrix(this.basis);
    this.vehicleModel.animate(frameDt, this.time, s.lateralVelocity, s.speed, this.vehicle.tuning.maxLateralSpeed);

    if (current.touchingEdge && frameDt > 0) this.chase.addShake(frameDt * 2);
    this.generator.pointAt(
      s.distance + this.chase.settings.lookAhead,
      s.lateral * 0.5,
      1.2,
      this.aheadFrame,
      this.aheadPoint,
    );
    this.chase.update(frameDt, this.vehiclePosition, this.frame, this.aheadPoint, s.speed / this.vehicle.tuning.cruiseSpeed);
    this.environment.update(this.chase.camera.position);

    this.renderer.render(this.scene, this.chase.camera);

    if (frameDt > 0) this.fps = lerp(this.fps, 1 / frameDt, 0.05);
    const info = this.renderer.info.render;
    this.hud.update({
      speed: s.speed,
      distance: s.distance,
      seed: this.generator.seed,
      fps: this.fps,
      chunks: this.trackRenderer.activeChunkCount,
      drawCalls: info.calls,
      triangles: info.triangles,
    });
  }

  private handleMetaInput(): void {
    if (this.input.consumePressed('pause')) {
      this.loop.paused = !this.loop.paused;
      this.hud.setPaused(this.loop.paused);
    }
    if (this.input.consumePressed('debug')) this.hud.toggleDebug();
    if (this.input.consumePressed('newSeed') && !this.loop.paused) {
      this.restart(hashSeed(`${Date.now()}-${Math.random()}`));
    }
    // 'special' is reserved for a future mechanic (GDD §2.2); drain it so it never queues up.
    this.input.consumePressed('special');
  }

  private onResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.chase.setAspect(width / height);
  };
}
