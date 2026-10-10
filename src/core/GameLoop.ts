/**
 * Fixed-timestep simulation loop with variable-rate rendering (GDD §3.4:
 * gameplay must not depend on the frame rate).
 *
 * The simulation chases a clock. By default that is real time; during a
 * music run it is the audio position, so the simulation is locked to what
 * the player hears and never drifts from the song.
 */
export interface LoopCallbacks {
  /** Advances the simulation by exactly `dt` seconds. */
  update(dt: number): void;
  /**
   * Renders a frame. `alpha` in [0, 1] is how far the clock is between the
   * last two simulation steps; `frameDt` is the real elapsed time of this
   * frame (0 while paused).
   */
  render(alpha: number, frameDt: number): void;
}

/** Simulation steps allowed per frame before the rest is deferred to later frames. */
const MAX_STEPS_PER_FRAME = 240;

export class GameLoop {
  readonly step: number;
  /** Time of the latest simulation step. */
  simTime = 0;
  /** Clock time of the frame being rendered (between two simulation steps). */
  renderTime = 0;
  paused = false;

  private externalClock: (() => number) | null = null;
  private internalTime = 0;
  private lastFrame = 0;
  private handle = 0;
  private running = false;

  constructor(
    private readonly callbacks: LoopCallbacks,
    stepsPerSecond = 120,
    private readonly maxFrameTime = 0.25,
  ) {
    this.step = 1 / stepsPerSecond;
  }

  /**
   * Restarts the simulation at `startTime`. With a clock, the simulation
   * follows it (waiting while it is behind `startTime`); without one it
   * follows real time.
   */
  reset(startTime: number, clock: (() => number) | null = null): void {
    this.simTime = startTime;
    this.renderTime = startTime;
    this.internalTime = startTime;
    this.externalClock = clock;
  }

  /** Switches to real time from the current simulation time (e.g. after the song ends). */
  detachClock(): void {
    this.internalTime = this.renderTime;
    this.externalClock = null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.lastFrame) / 1000, this.maxFrameTime);
    this.lastFrame = now;

    if (!this.paused) {
      let target: number;
      if (this.externalClock) {
        target = this.externalClock();
      } else {
        this.internalTime += frameDt;
        target = this.internalTime;
      }

      let steps = 0;
      while (this.simTime + this.step <= target && steps < MAX_STEPS_PER_FRAME) {
        this.callbacks.update(this.step);
        this.simTime += this.step;
        steps++;
      }
      // Real time can be dropped after a long stall; an external clock must be caught up.
      if (!this.externalClock && steps === MAX_STEPS_PER_FRAME) this.internalTime = this.simTime;
      this.renderTime = Math.min(Math.max(target, this.simTime), this.simTime + this.step);
    }

    const alpha = (this.renderTime - this.simTime) / this.step;
    this.callbacks.render(Math.min(1, Math.max(0, alpha)), this.paused ? 0 : frameDt);
    this.handle = requestAnimationFrame(this.tick);
  };
}
