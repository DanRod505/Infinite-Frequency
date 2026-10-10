import type { Beat, MusicAnalysis, Section } from './analysisTypes';
import { sampleAt } from './MusicAnalyzer';

export type MusicEvent =
  | { type: 'beat'; time: number; index: number; beat: Beat }
  | { type: 'section'; time: number; index: number; section: Section }
  | { type: 'drop'; time: number; index: number }
  | { type: 'end'; time: number };

/** Instantaneous musical state at a given song time. */
export interface MusicFrame {
  time: number;
  /** Song progress in [0, 1]. */
  progress: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
  onset: number;
  sectionIndex: number;
  /** Intensity of the current section in [0, 1]. */
  sectionIntensity: number;
  /** Seconds since the last beat (Infinity before the first). */
  sinceBeat: number;
  /** Seconds since the last downbeat (Infinity before the first). */
  sinceDownbeat: number;
  /** Strength of the last beat. */
  lastBeatStrength: number;
}

export function createMusicFrame(): MusicFrame {
  return {
    time: 0,
    progress: 0,
    energy: 0,
    low: 0,
    mid: 0,
    high: 0,
    onset: 0,
    sectionIndex: 0,
    sectionIntensity: 0,
    sinceBeat: Infinity,
    sinceDownbeat: Infinity,
    lastBeatStrength: 0,
  };
}

/**
 * Time-indexed view of an analysis (GDD §3.3, §11.3): continuous features
 * sampled at any time, and discrete events delivered exactly once as time
 * advances, independent of the frame rate.
 */
export class MusicTimeline {
  private readonly events: MusicEvent[];
  private readonly downbeats: number[];
  private cursor = 0;
  private lastTime = -Infinity;

  constructor(readonly analysis: MusicAnalysis) {
    const events: MusicEvent[] = [];
    analysis.beats.forEach((beat, index) => events.push({ type: 'beat', time: beat.time, index, beat }));
    analysis.sections.forEach((section, index) => {
      if (index > 0) events.push({ type: 'section', time: section.start, index, section });
    });
    analysis.drops.forEach((time, index) => events.push({ type: 'drop', time, index }));
    events.push({ type: 'end', time: analysis.duration });
    // Stable order at equal times: sections and drops before the beat they land on.
    const priority = { section: 0, drop: 1, beat: 2, end: 3 } as const;
    events.sort((a, b) => a.time - b.time || priority[a.type] - priority[b.type]);
    this.events = events;
    this.downbeats = analysis.beats.filter((b) => b.downbeat).map((b) => b.time);
  }

  get duration(): number {
    return this.analysis.duration;
  }

  /**
   * Delivers every event with `previous < time <= now`. Moving backwards
   * (restart or seek) rewinds the cursor without emitting anything.
   */
  advance(now: number, emit: (event: MusicEvent) => void): void {
    if (now < this.lastTime) this.seek(now);
    while (this.cursor < this.events.length && this.events[this.cursor].time <= now) {
      emit(this.events[this.cursor++]);
    }
    this.lastTime = now;
  }

  /** Positions the event cursor so the next `advance` emits events after `time`. */
  seek(time: number): void {
    this.cursor = upperBound(this.events, time, (e) => e.time);
    this.lastTime = time;
  }

  sample(time: number, out: MusicFrame): MusicFrame {
    const a = this.analysis;
    const rate = a.frameRate;
    out.time = time;
    out.progress = a.duration > 0 ? Math.min(1, Math.max(0, time / a.duration)) : 0;
    const inSong = time >= 0 && time <= a.duration;
    out.energy = inSong ? sampleAt(a.energy, time, rate) : 0;
    out.low = inSong ? sampleAt(a.low, time, rate) : 0;
    out.mid = inSong ? sampleAt(a.mid, time, rate) : 0;
    out.high = inSong ? sampleAt(a.high, time, rate) : 0;
    out.onset = inSong ? sampleAt(a.onsetStrength, time, rate) : 0;

    const sectionIndex = Math.max(0, upperBound(a.sections, time, (s) => s.start) - 1);
    out.sectionIndex = sectionIndex;
    out.sectionIntensity = inSong ? (a.sections[sectionIndex]?.intensity ?? 0) : 0;

    const beatIndex = upperBound(a.beats, time, (b) => b.time) - 1;
    out.sinceBeat = beatIndex >= 0 ? time - a.beats[beatIndex].time : Infinity;
    out.lastBeatStrength = beatIndex >= 0 ? a.beats[beatIndex].strength : 0;
    const downbeatIndex = upperBound(this.downbeats, time, (t) => t) - 1;
    out.sinceDownbeat = downbeatIndex >= 0 ? time - this.downbeats[downbeatIndex] : Infinity;
    return out;
  }
}

/** Index of the first element whose key is greater than `value`. */
function upperBound<T>(items: readonly T[], value: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
