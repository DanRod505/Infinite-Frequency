/**
 * Short synthesised feedback sounds for collections and collisions.
 * Kept quiet, brief and pitched above the bass so they sit on top of the
 * music instead of competing with it.
 */
export class Sfx {
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.5;

  constructor(private readonly getContext: () => AudioContext | null) {}

  setVolume(volume: number): void {
    this.volume = volume;
    const context = this.getContext();
    if (this.output && context) this.output.gain.setTargetAtTime(volume * 0.5, context.currentTime, 0.02);
  }

  /** Bright blip; higher and cleaner for perfect collections. */
  collect(perfect: boolean): void {
    this.tone(perfect ? 1568 : 1175, 0.07, perfect ? 0.22 : 0.16, 'triangle');
  }

  /** Two-note chime for special notes and completed sequences. */
  special(): void {
    this.tone(1319, 0.09, 0.2, 'triangle');
    this.tone(1976, 0.14, 0.18, 'triangle', 0.07);
  }

  /** Dull thud with a burst of noise. */
  hit(): void {
    const context = this.ready();
    if (!context || !this.output) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain).connect(this.output);
    osc.start(now);
    osc.stop(now + 0.26);

    const noise = context.createBufferSource();
    noise.buffer = this.noiseBuffer(context);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noise.connect(noiseGain).connect(this.output);
    noise.start(now);
    noise.stop(now + 0.16);
  }

  private tone(freq: number, length: number, level: number, type: OscillatorType, delay = 0): void {
    const context = this.ready();
    if (!context || !this.output) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    osc.connect(gain).connect(this.output);
    osc.start(start);
    osc.stop(start + length + 0.01);
  }

  private ready(): AudioContext | null {
    if (this.volume <= 0) return null;
    const context = this.getContext();
    if (!context) return null;
    if (!this.output) {
      this.output = context.createGain();
      this.output.gain.value = this.volume * 0.5;
      this.output.connect(context.destination);
    }
    return context;
  }

  private noiseBuffer(context: AudioContext): AudioBuffer {
    if (!this.noise) {
      this.noise = context.createBuffer(1, Math.round(context.sampleRate * 0.2), context.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 1;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
    }
    return this.noise;
  }
}
