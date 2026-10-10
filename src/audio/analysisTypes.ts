/**
 * Result of the pre-race music analysis (GDD §3.2, §3.3).
 *
 * Fields are split between values measured directly from the signal and
 * interpretations that are only estimates (tempo, beats, sections, drops),
 * which carry a confidence so the game can fall back gracefully (§15.1).
 */
export interface MusicAnalysis {
  /** Analyzer version; cached results with another version are discarded. */
  version: number;
  /** Duration in seconds. */
  duration: number;
  /** Feature frames per second (all Float32Array features share this rate). */
  frameRate: number;

  // --- Measured -----------------------------------------------------------
  /** Overall loudness, normalised to [0, 1] relative to the track. */
  energy: Float32Array;
  /** Low band (bass, ~20–150 Hz), normalised to [0, 1]. */
  low: Float32Array;
  /** Mid band (~150–2000 Hz), normalised to [0, 1]. */
  mid: Float32Array;
  /** High band (~2–11 kHz), normalised to [0, 1]. */
  high: Float32Array;
  /** Onset strength envelope (spectral flux), normalised to [0, 1]. */
  onsetStrength: Float32Array;
  /** Detected transients, in seconds. */
  onsets: number[];

  // --- Estimated ----------------------------------------------------------
  tempo: TempoEstimate;
  /** Beat positions; from the beat tracker, or from onsets when the tempo is unreliable. */
  beats: Beat[];
  /** Structural sections by intensity. */
  sections: Section[];
  /** Estimated drops: abrupt rises into a high-intensity section, in seconds. */
  drops: number[];
}

export interface TempoEstimate {
  /** Estimated tempo in beats per minute (0 when unknown). */
  bpm: number;
  /** Confidence in [0, 1]. */
  confidence: number;
  /** Whether the beat grid is reliable enough to drive gameplay. */
  reliable: boolean;
}

export interface Beat {
  /** Time in seconds. */
  time: number;
  /** Onset strength at the beat, in [0, 1]. */
  strength: number;
  /** First beat of an (estimated) bar of four. */
  downbeat: boolean;
}

export type IntensityLevel = 'low' | 'mid' | 'high';

export interface Section {
  start: number;
  end: number;
  /** Mean smoothed energy in the section, in [0, 1]. */
  intensity: number;
  level: IntensityLevel;
}

export interface AnalysisProgress {
  /** Fraction completed in [0, 1]. */
  progress: number;
  stage: 'spectrum' | 'onsets' | 'tempo' | 'beats' | 'structure';
}
