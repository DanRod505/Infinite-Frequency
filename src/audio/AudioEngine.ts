import { PlaybackClock } from './PlaybackClock';

/**
 * Loading, playback and timing of the selected song (GDD §11.2 Audio Engine).
 *
 * `position` is the song time currently reaching the listener: it accounts
 * for the output latency reported by the browser plus a manual offset, so
 * visuals can be locked to what is actually heard.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private readonly clock = new PlaybackClock();
  private volume = 0.8;
  /** Manual latency correction in seconds; positive delays the visuals. */
  latencyOffset = 0;
  onEnded: (() => void) | null = null;

  /** Lazily creates the AudioContext; call from a user gesture so autoplay policies allow it. */
  getContext(): AudioContext {
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor({ latencyHint: 'interactive' });
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    // decodeAudioData detaches the buffer it receives.
    return this.getContext().decodeAudioData(data.slice(0));
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.clock.isRunning;
  }

  setBuffer(buffer: AudioBuffer | null): void {
    this.stop();
    this.buffer = buffer;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.02);
  }

  /**
   * Starts playback so that song time `position` is heard now. A negative
   * position schedules the song to start after a lead-in of `-position` seconds.
   */
  play(position: number): void {
    if (!this.buffer) throw new Error('No audio loaded');
    const context = this.getContext();
    this.stopSource();

    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain!);
    const now = context.currentTime;
    if (position < 0) source.start(now - position, 0);
    else source.start(now, Math.min(position, this.buffer.duration));
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        this.clock.pause(this.outputTime());
        this.onEnded?.();
      }
    };
    this.source = source;
    this.clock.start(now, position);
  }

  pause(): void {
    if (!this.clock.isRunning) return;
    this.clock.pause(this.outputTime());
    this.stopSource();
  }

  resume(): void {
    if (this.clock.isRunning || !this.buffer) return;
    this.play(this.clock.position(0));
  }

  stop(): void {
    this.stopSource();
    this.clock.reset(0);
  }

  /** Song time currently being heard, in seconds. */
  get position(): number {
    return this.clock.position(this.outputTime()) - this.latencyOffset;
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }

  private stopSource(): void {
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
  }

  private outputLatency(): number {
    const c = this.context;
    if (!c) return 0;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  /**
   * Context time of the audio reaching the speakers right now, which lags
   * `currentTime` by the output latency. Uses the output timestamp when
   * available, extrapolated with the performance clock between audio
   * callbacks for smooth per-frame values.
   */
  private outputTime(): number {
    const c = this.context;
    if (!c) return 0;
    if (typeof c.getOutputTimestamp === 'function') {
      const stamp = c.getOutputTimestamp();
      if (stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.contextTime > 0) {
        return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
      }
    }
    return c.currentTime - this.outputLatency();
  }
}
