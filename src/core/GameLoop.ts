/**
 * Fixed-timestep simulation loop with variable-rate rendering (GDD §3.4:
 * gameplay must not depend on the frame rate).
 */
export interface LoopCallbacks {
  /** Advances the simulation by exactly `dt` seconds. */
  update(dt: number): void;
  /**
   * Renders a frame. `alpha` in [0, 1) is how far we are between the last two
   * simulation steps; `frameDt` is the real elapsed time of this frame.
   */
  render(alpha: number, frameDt: number): void;
}

export class GameLoop {
  readonly step: number;
  private accumulator = 0;
  private lastTime = 0;
  private handle = 0;
  private running = false;
  paused = false;

  constructor(
    private readonly callbacks: LoopCallbacks,
    stepsPerSecond = 120,
    private readonly maxFrameTime = 0.25,
  ) {
    this.step = 1 / stepsPerSecond;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.lastTime) / 1000, this.maxFrameTime);
    this.lastTime = now;

    if (!this.paused) {
      this.accumulator += frameDt;
      while (this.accumulator >= this.step) {
        this.callbacks.update(this.step);
        this.accumulator -= this.step;
      }
    }

    this.callbacks.render(this.paused ? 1 : this.accumulator / this.step, this.paused ? 0 : frameDt);
    this.handle = requestAnimationFrame(this.tick);
  };
}
