import { ACESFilmicToneMapping, Matrix4, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { MusicAnalysis } from '../audio/analysisTypes';
import { MusicTimeline, createMusicFrame } from '../audio/MusicTimeline';
import { ChaseCamera } from '../camera/ChaseCamera';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { clamp, lerp } from '../core/math';
import type { Settings, SettingsData } from '../core/Settings';
import { setUrlSeed } from '../core/url';
import { TrackFrame, TrackGenerator } from '../track/TrackGenerator';
import { TrackRenderer } from '../track/TrackRenderer';
import { Hud } from '../ui/Hud';
import { randomSeed, type RunSummary } from '../ui/Menu';
import { VehicleController, copyVehicleState, createVehicleState } from '../vehicle/VehicleController';
import { VehicleModel } from '../vehicle/VehicleModel';
import { Environment } from '../world/Environment';
import { GameDirector } from './GameDirector';
import { LEAD_IN, songTimeAtDistance } from './runTiming';

export interface MusicSource {
  buffer: AudioBuffer;
  analysis: MusicAnalysis;
  title: string;
}

export interface RunOptions {
  seed: number;
  /** Song to play; without it the run is an endless free drive. */
  music?: MusicSource;
  /** False for the attract mode behind the menu (autopilot, no HUD hints). */
  interactive: boolean;
}

export interface GameEvents {
  /** The player asked to pause (Esc or tab hidden). */
  onPauseRequest(): void;
  /** The player pressed Esc while paused. */
  onResumeRequest(): void;
  /** The song finished. */
  onFinished(summary: RunSummary): void;
}

/** Height of the vehicle origin above the road surface. */
const RIDE_HEIGHT = 0;
/** Delay between the end of the song and the results screen. */
const RESULTS_DELAY = 1.5;

/**
 * Runs the driving session and wires the systems together (GDD §11.2).
 *
 * During a music run the simulation follows the audio clock: the vehicle
 * starts LEAD_IN seconds before the song, and every simulation step maps to
 * a fixed song time, so the distance at a given moment of the song is
 * deterministic (the basis for placing collectibles in Phase 3).
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
  private readonly director: GameDirector;

  private generator: TrackGenerator;
  private readonly trackRenderer: TrackRenderer;
  private vehicle: VehicleController;
  private run: RunOptions = { seed: 0, interactive: false };
  private finishedAt: number | null = null;
  private resultsShown = false;
  private paused = false;
  private autopilotTime = 0;

  private readonly previous = createVehicleState();
  private readonly interpolated = createVehicleState();
  private readonly frame = new TrackFrame();
  private readonly aheadFrame = new TrackFrame();
  private readonly vehiclePosition = new Vector3();
  private readonly aheadPoint = new Vector3();
  private readonly basis = new Matrix4();
  private readonly back = new Vector3();
  private fps = 60;

  constructor(
    private readonly container: HTMLElement,
    private readonly audio: AudioEngine,
    private readonly settings: Settings,
    private readonly events: GameEvents,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.chase = new ChaseCamera(1);
    this.environment = new Environment(this.scene);
    this.generator = new TrackGenerator(0);
    this.trackRenderer = new TrackRenderer(this.generator);
    this.vehicle = new VehicleController(this.generator.roadWidth);
    this.scene.add(this.trackRenderer.group, this.vehicleModel.root);
    this.hud = new Hud(container);

    this.director = new GameDirector(settings.values, {
      onDrop: () => this.chase.addShake(0.7),
      onEnd: () => this.onSongEnd(),
    });
    this.applySettings(settings.values);
    settings.subscribe((values) => this.applySettings(values));
    // The audio clock freezes at the last *heard* instant, which can be just short
    // of the song's end (output latency, manual offset), so the natural end of
    // playback must finish the run too.
    audio.onEnded = () => this.onSongEnd();

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.onResize();
  }

  get currentRun(): Readonly<RunOptions> {
    return this.run;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(): void {
    this.loop.start();
  }

  /** Starts (or restarts) a run on a fresh track. */
  startRun(options: RunOptions): void {
    this.run = options;
    this.paused = false;
    this.loop.paused = false;
    this.finishedAt = null;
    this.resultsShown = false;
    this.autopilotTime = 0;
    this.audio.stop();

    const music = options.music;
    const timeline = music ? new MusicTimeline(music.analysis) : null;
    this.vehicle = new VehicleController(this.generator.roadWidth, this.vehicle.tuning);
    this.generator = new TrackGenerator(options.seed, {}, timeline ? this.intensityProfile(timeline) : null);
    this.trackRenderer.setGenerator(this.generator);
    this.trackRenderer.update(0);
    this.chase.reset();
    copyVehicleState(this.vehicle.state, this.previous);

    if (music && timeline) {
      this.audio.setBuffer(music.buffer);
      this.director.setTimeline(timeline, -LEAD_IN);
      this.loop.reset(-LEAD_IN, () => this.audio.position);
      this.audio.play(-LEAD_IN);
    } else {
      this.audio.setBuffer(null);
      this.director.setTimeline(null);
      this.loop.reset(0);
    }

    this.input.clearPressed();
    this.hud.setVisible(true);
    this.hud.setRun(music ? music.title : null, options.interactive);
  }

  /** Restarts the current run, optionally with another seed. */
  restart(seed = this.run.seed): void {
    this.startRun({ ...this.run, seed });
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.loop.paused = true;
    this.audio.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.input.clearPressed();
    if (this.run.music && this.finishedAt === null) this.audio.resume();
    this.loop.paused = false;
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.trackRenderer.dispose();
    this.vehicleModel.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Fixed-step simulation. */
  private update(dt: number): void {
    copyVehicleState(this.vehicle.state, this.previous);
    let steer: number;
    if (this.run.interactive) {
      steer = this.input.steerAxis();
    } else {
      // Attract mode: gentle autopilot weaving across the road.
      this.autopilotTime += dt;
      const target = Math.sin(this.autopilotTime * 0.35) * this.vehicle.lateralLimit * 0.6;
      steer = clamp((target - this.vehicle.state.lateral) * 0.4, -1, 1);
    }
    this.vehicle.update(dt, steer);
  }

  private render(alpha: number, frameDt: number): void {
    this.handleMetaInput();

    const current = this.vehicle.state;
    const s = this.interpolated;
    s.distance = lerp(this.previous.distance, current.distance, alpha);
    s.lateral = lerp(this.previous.lateral, current.lateral, alpha);
    s.lateralVelocity = lerp(this.previous.lateralVelocity, current.lateralVelocity, alpha);
    s.speed = lerp(this.previous.speed, current.speed, alpha);

    const songTime = this.loop.renderTime;
    const music = this.director.update(songTime, frameDt);

    this.trackRenderer.update(s.distance);
    this.trackRenderer.setGlow(music.beatPulse, music.intensity);

    // Place the vehicle on the road surface, aligned with the road frame.
    this.generator.pointAt(s.distance, s.lateral, RIDE_HEIGHT, this.frame, this.vehiclePosition);
    this.back.copy(this.frame.tangent).negate();
    this.basis.makeBasis(this.frame.right, this.frame.up, this.back);
    this.vehicleModel.root.position.copy(this.vehiclePosition);
    this.vehicleModel.root.quaternion.setFromRotationMatrix(this.basis);
    this.vehicleModel.setPulse(music.beatPulse);
    this.vehicleModel.animate(frameDt, songTime, s.lateralVelocity, s.speed, this.vehicle.tuning.maxLateralSpeed);

    if (current.touchingEdge && frameDt > 0) this.chase.addShake(frameDt * 2);
    this.generator.pointAt(s.distance + this.chase.settings.lookAhead, s.lateral * 0.5, 1.2, this.aheadFrame, this.aheadPoint);
    const fovBoost = 6 * (music.intensity - 0.35) + 2 * music.bass;
    this.chase.update(frameDt, this.vehiclePosition, this.frame, this.aheadPoint, s.speed / this.vehicle.tuning.cruiseSpeed, fovBoost);
    this.environment.update(this.chase.camera.position);
    this.environment.applyMusic(music);
    this.renderer.toneMappingExposure = 1.1 + 0.6 * music.flash;

    this.renderer.render(this.scene, this.chase.camera);

    if (this.finishedAt !== null && !this.resultsShown && songTime - this.finishedAt >= RESULTS_DELAY) {
      this.resultsShown = true;
      this.events.onFinished(this.summary());
    }

    if (frameDt > 0) this.fps = lerp(this.fps, 1 / frameDt, 0.05);
    const info = this.renderer.info.render;
    const tempo = this.run.music?.analysis.tempo;
    this.hud.update({
      speed: s.speed,
      distance: s.distance,
      progress: this.run.music ? music.progress : null,
      beatPulse: music.beatPulse,
      bpm: tempo?.reliable ? tempo.bpm : 0,
      countdown: this.run.music && songTime < 0 ? -songTime : 0,
      debug: {
        seed: String(this.generator.seed),
        fps: this.fps.toFixed(0),
        chunks: String(this.trackRenderer.activeChunkCount),
        draws: String(info.calls),
        triangles: String(info.triangles),
        'song time': this.run.music ? songTime.toFixed(3) : '—',
        tempo: tempo ? `${tempo.bpm.toFixed(1)} (${Math.round(tempo.confidence * 100)}%)` : '—',
        latency: `${this.settings.values.latencyMs} ms`,
        intensity: music.intensity.toFixed(2),
      },
    });
  }

  private handleMetaInput(): void {
    if (this.input.consumePressed('pause') && this.run.interactive && !this.resultsShown) {
      if (this.paused) this.events.onResumeRequest();
      else this.events.onPauseRequest();
    }
    if (this.input.consumePressed('debug')) this.hud.toggleDebug();
    if (this.input.consumePressed('newSeed') && !this.paused && this.run.interactive && !this.run.music) {
      const seed = randomSeed();
      setUrlSeed(seed);
      this.restart(seed);
    }
    for (const [action, delta] of [
      ['latencyDown', -5],
      ['latencyUp', 5],
    ] as const) {
      if (this.input.consumePressed(action) && this.run.music && !this.paused) {
        this.settings.update({ latencyMs: this.settings.values.latencyMs + delta });
        const ms = this.settings.values.latencyMs;
        this.hud.showToast(`Latência ${ms > 0 ? '+' : ''}${ms} ms`);
      }
    }
    // 'special' is reserved for a future mechanic (GDD §2.2); drain it so it never queues up.
    this.input.consumePressed('special');
  }

  private onSongEnd(): void {
    if (this.finishedAt !== null) return;
    this.finishedAt = this.loop.renderTime;
    // Keep driving on real time after the music stops.
    this.loop.detachClock();
  }

  private summary(): RunSummary {
    const music = this.run.music!;
    return {
      title: music.title,
      duration: music.analysis.duration,
      distance: this.vehicle.state.distance,
      bpm: music.analysis.tempo.reliable ? music.analysis.tempo.bpm : 0,
      seed: this.run.seed,
    };
  }

  /** Musical intensity along the track, mapped from distance to song time. */
  private intensityProfile(timeline: MusicTimeline): (distance: number) => number {
    const frame = createMusicFrame();
    const tuning = this.vehicle.tuning;
    return (distance) => {
      const time = songTimeAtDistance(distance, tuning);
      if (time < 0 || time > timeline.duration) return 0.3;
      return timeline.sample(time, frame).sectionIntensity;
    };
  }

  private applySettings(values: Readonly<SettingsData>): void {
    this.audio.setVolume(values.volume);
    this.audio.latencyOffset = values.latencyMs / 1000;
    this.chase.settings.shakeEnabled = values.cameraShake;
    this.director.setSettings(values);
  }

  private onVisibilityChange = (): void => {
    if (document.hidden && this.run.interactive && !this.paused && !this.resultsShown) this.events.onPauseRequest();
  };

  private onResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.chase.setAspect(width / height);
  };
}
