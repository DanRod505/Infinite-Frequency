import { damp } from '../core/math';
import type { SettingsData } from '../core/Settings';
import { MusicTimeline, createMusicFrame, type MusicEvent } from '../audio/MusicTimeline';

/** Music-driven parameters consumed by the visual systems, all in [0, 1]. */
export interface MusicVisualState {
  /** Whether a song is driving the visuals. */
  active: boolean;
  /** Decaying pulse on each beat, stronger on downbeats. */
  beatPulse: number;
  bass: number;
  mid: number;
  high: number;
  /** Slowly varying overall intensity (section + energy). */
  intensity: number;
  /** Full-screen flash on drops; always 0 with reduced flashes. */
  flash: number;
  progress: number;
}

export interface DirectorListener {
  onBeat?(event: Extract<MusicEvent, { type: 'beat' }>): void;
  onSection?(event: Extract<MusicEvent, { type: 'section' }>): void;
  onDrop?(event: Extract<MusicEvent, { type: 'drop' }>): void;
  onEnd?(): void;
}

/** Neutral values used without music and as the centre for effect scaling. */
const NEUTRAL = { beatPulse: 0, bass: 0.3, mid: 0.3, high: 0.2, intensity: 0.35 };

/**
 * Coordinates the music timeline and the game (GDD §11.2 Game Director):
 * turns analysis data and events into parameters and notifications for the
 * other systems, without taking over their responsibilities.
 */
export class GameDirector {
  readonly state: MusicVisualState = { active: false, ...NEUTRAL, flash: 0, progress: 0 };
  private timeline: MusicTimeline | null = null;
  private readonly frame = createMusicFrame();
  private readonly raw = { ...NEUTRAL };
  private flash = 0;
  private idleTime = 0;

  constructor(
    private settings: Readonly<SettingsData>,
    private readonly listener: DirectorListener = {},
  ) {}

  get musicTimeline(): MusicTimeline | null {
    return this.timeline;
  }

  setSettings(settings: Readonly<SettingsData>): void {
    this.settings = settings;
  }

  setTimeline(timeline: MusicTimeline | null, startTime = 0): void {
    this.timeline = timeline;
    timeline?.seek(startTime);
    this.flash = 0;
  }

  /** Updates the visual state for the song time being rendered. */
  update(songTime: number, dt: number): MusicVisualState {
    const s = this.state;
    const raw = this.raw;
    const timeline = this.timeline;

    if (timeline) {
      timeline.advance(songTime, (event) => this.dispatch(event));
      const f = timeline.sample(songTime, this.frame);
      const pulseDecay = this.settings.reduceFlashes ? 5 : 8;
      const beatPulse = Number.isFinite(f.sinceBeat) ? Math.exp(-f.sinceBeat * pulseDecay) * (0.5 + 0.5 * f.lastBeatStrength) : 0;
      const downbeatPulse = Number.isFinite(f.sinceDownbeat) ? Math.exp(-f.sinceDownbeat * pulseDecay) : 0;
      raw.beatPulse = Math.min(1, Math.max(beatPulse, downbeatPulse));
      // Fast attack, slower release keeps reactions readable without flicker.
      raw.bass = follow(raw.bass, f.low, dt, 25, 6);
      raw.mid = follow(raw.mid, f.mid, dt, 15, 4);
      raw.high = follow(raw.high, f.high, dt, 25, 5);
      raw.intensity += (0.7 * f.sectionIntensity + 0.3 * f.energy - raw.intensity) * damp(1.2, dt);
      s.progress = f.progress;
    } else {
      // Idle "breathing" so the attract mode is not static.
      this.idleTime += dt;
      raw.beatPulse = 0.25 * Math.max(0, Math.sin(this.idleTime * 2));
      raw.bass = NEUTRAL.bass;
      raw.mid = NEUTRAL.mid;
      raw.high = NEUTRAL.high;
      raw.intensity += (NEUTRAL.intensity - raw.intensity) * damp(1, dt);
      s.progress = 0;
    }

    const k = this.settings.effects;
    const scale = (value: number, neutral: number) => neutral + (value - neutral) * k;
    s.active = timeline !== null;
    s.beatPulse = scale(raw.beatPulse, NEUTRAL.beatPulse) * (this.settings.reduceFlashes ? 0.5 : 1);
    s.bass = scale(raw.bass, NEUTRAL.bass);
    s.mid = scale(raw.mid, NEUTRAL.mid);
    s.high = scale(raw.high, NEUTRAL.high);
    s.intensity = scale(raw.intensity, NEUTRAL.intensity);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    s.flash = this.settings.reduceFlashes ? 0 : this.flash * k;
    return s;
  }

  private dispatch(event: MusicEvent): void {
    switch (event.type) {
      case 'beat':
        this.listener.onBeat?.(event);
        break;
      case 'section':
        this.listener.onSection?.(event);
        break;
      case 'drop':
        this.flash = 1;
        this.listener.onDrop?.(event);
        break;
      case 'end':
        this.listener.onEnd?.();
        break;
    }
  }
}

function follow(current: number, target: number, dt: number, attack: number, release: number): number {
  return current + (target - current) * damp(target > current ? attack : release, dt);
}
