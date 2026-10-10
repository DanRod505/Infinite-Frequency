/**
 * Maps audio-context time to song position (GDD §3.4: audio is the master
 * clock). Kept free of Web Audio so the arithmetic can be unit tested.
 */
export class PlaybackClock {
  private anchorContextTime = 0;
  private anchorPosition = 0;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  /** Song position `position` is heard at context time `contextTime`. */
  start(contextTime: number, position: number): void {
    this.anchorContextTime = contextTime;
    this.anchorPosition = position;
    this.running = true;
  }

  /** Freezes the position at the given context time. */
  pause(contextTime: number): void {
    if (!this.running) return;
    this.anchorPosition = this.position(contextTime);
    this.running = false;
  }

  /** Song position (seconds) heard at `contextTime`; negative during a lead-in. */
  position(contextTime: number): number {
    return this.running ? this.anchorPosition + (contextTime - this.anchorContextTime) : this.anchorPosition;
  }

  reset(position = 0): void {
    this.running = false;
    this.anchorPosition = position;
  }
}
