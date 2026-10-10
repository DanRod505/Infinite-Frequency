import { FFT } from './fft';
import type { AnalysisProgress, Beat, IntensityLevel, MusicAnalysis, Section, TempoEstimate } from './analysisTypes';

/** Bump whenever the analysis output changes, to invalidate cached results. */
export const ANALYZER_VERSION = 1;

/** Analysis runs on audio resampled to roughly this rate. */
const TARGET_RATE = 22050;
const FRAME_SIZE = 1024;
const HOP_SIZE = 512;

const LOW_BAND: [number, number] = [20, 150];
const MID_BAND: [number, number] = [150, 2000];
const HIGH_BAND: [number, number] = [2000, 11025];

const MIN_BPM = 60;
const MAX_BPM = 200;
/** Tempo prior centre; halves octave errors on typical music. */
const PRIOR_BPM = 120;
const PRIOR_OCTAVES = 1;
/** Beat tracker tightness: how strongly beats are kept on the tempo grid. */
const TIGHTNESS = 100;
/** Beats at least this fraction of the strong-beat level anchor the grid. */
const ANCHOR_STRENGTH = 0.5;

const SECTION_SMOOTHING_SECONDS = 3;
const MIN_SECTION_SECONDS = 6;
const LOW_LEVEL_THRESHOLD = 0.35;
const HIGH_LEVEL_THRESHOLD = 0.65;
const DROP_MIN_RISE = 0.25;

export interface AnalyzeOptions {
  onProgress?: (progress: AnalysisProgress) => void;
}

/**
 * Analyses a mono signal ahead of the race (GDD §3.3).
 *
 * Pipeline: STFT → band energies and spectral flux → onset envelope →
 * autocorrelation tempo estimate → dynamic-programming beat tracking
 * (Ellis 2007) → intensity sections and drop estimates.
 */
export function analyzeMusic(samples: Float32Array, sampleRate: number, options: AnalyzeOptions = {}): MusicAnalysis {
  const report = options.onProgress ?? (() => {});
  const { signal, rate } = downsample(samples, sampleRate);
  const duration = samples.length / sampleRate;
  const frameRate = rate / HOP_SIZE;

  const spectral = computeSpectralFeatures(signal, rate, (p) => report({ stage: 'spectrum', progress: p * 0.8 }));
  report({ stage: 'onsets', progress: 0.8 });

  const energy = normaliseDb(spectral.rms, true);
  const low = normaliseDb(spectral.low, false);
  const mid = normaliseDb(spectral.mid, false);
  const high = normaliseDb(spectral.high, false);
  const onsetStrength = onsetEnvelope(spectral.flux, frameRate);
  const onsets = pickOnsets(onsetStrength, frameRate);

  report({ stage: 'tempo', progress: 0.85 });
  const period = estimatePeriod(onsetStrength, frameRate);

  report({ stage: 'beats', progress: 0.9 });
  let tempo: TempoEstimate = { bpm: 0, confidence: 0, reliable: false };
  let beats: Beat[] = [];
  if (period) {
    let tracked = trackBeats(onsetStrength, period.lag, energy, frameRate);
    // Second pass with the period measured from the tracked beats themselves.
    if (tracked.length >= 8) {
      const measured = regressionPeriod(tracked) * frameRate;
      if (Math.abs(measured / period.lag - 1) < 0.05) tracked = trackBeats(onsetStrength, measured, energy, frameRate);
    }
    if (tracked.length >= 2) {
      const intervals = tracked.slice(1).map((t, i) => t - tracked[i]);
      const meanInterval = mean(intervals);
      const cv = Math.sqrt(mean(intervals.map((d) => (d - meanInterval) ** 2))) / meanInterval;
      const bpm = 60 / (tracked.length >= 8 ? regressionPeriod(tracked) : median(intervals));
      const confidence = clamp01(period.strength / 0.3) * clamp01(1 - (cv - 0.02) / 0.12);
      tempo = { bpm, confidence, reliable: confidence >= 0.35 && tracked.length >= 8 };
      beats = tracked.map((time) => ({ time, strength: sampleAt(onsetStrength, time, frameRate), downbeat: false }));
    }
  }
  if (!tempo.reliable) {
    // Fallback for music without a clear pulse (§15.1): use raw transients.
    beats = onsets.map((time) => ({ time, strength: sampleAt(onsetStrength, time, frameRate), downbeat: false }));
  }

  report({ stage: 'structure', progress: 0.95 });
  const sections = segmentSections(energy, frameRate, duration, tempo.reliable ? beats : []);
  if (tempo.reliable) labelDownbeats(beats, sections, low, mid, frameRate);
  const drops = findDrops(sections);
  report({ stage: 'structure', progress: 1 });

  return {
    version: ANALYZER_VERSION,
    duration,
    frameRate,
    energy,
    low,
    mid,
    high,
    onsetStrength,
    onsets,
    tempo,
    beats,
    sections,
    drops,
  };
}

/** Mixes any number of channels down to mono. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0].slice();
  const length = channels[0].length;
  const out = new Float32Array(length);
  const gain = 1 / channels.length;
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += channel[i] * gain;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spectral features

function downsample(samples: Float32Array, sampleRate: number): { signal: Float32Array; rate: number } {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  if (factor === 1) return { signal: samples, rate: sampleRate };
  const length = Math.floor(samples.length / factor);
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    const o = i * factor;
    for (let k = 0; k < factor; k++) sum += samples[o + k];
    signal[i] = sum / factor;
  }
  return { signal, rate: sampleRate / factor };
}

interface SpectralFeatures {
  rms: Float32Array;
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  flux: Float32Array;
}

function computeSpectralFeatures(signal: Float32Array, rate: number, progress: (p: number) => void): SpectralFeatures {
  const frameCount = Math.max(1, Math.floor(Math.max(0, signal.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const bins = FRAME_SIZE / 2;
  const fft = new FFT(FRAME_SIZE);
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  const window = new Float64Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME_SIZE);
  const prevLog = new Float64Array(bins);
  const binOf = (hz: number) => Math.min(bins, Math.max(1, Math.round((hz * FRAME_SIZE) / rate)));
  const bands = [LOW_BAND, MID_BAND, HIGH_BAND].map(([a, b]) => [binOf(a), binOf(b)] as const);

  const out: SpectralFeatures = {
    rms: new Float32Array(frameCount),
    low: new Float32Array(frameCount),
    mid: new Float32Array(frameCount),
    high: new Float32Array(frameCount),
    flux: new Float32Array(frameCount),
  };
  const reportEvery = Math.max(1, Math.floor(frameCount / 50));

  for (let f = 0; f < frameCount; f++) {
    const offset = f * HOP_SIZE;
    let sumSquares = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const x = offset + i < signal.length ? signal[offset + i] : 0;
      sumSquares += x * x;
      re[i] = x * window[i];
      im[i] = 0;
    }
    out.rms[f] = Math.sqrt(sumSquares / FRAME_SIZE);
    fft.transform(re, im);

    let flux = 0;
    const bandSums = [0, 0, 0];
    for (let k = 1; k < bins; k++) {
      const power = re[k] * re[k] + im[k] * im[k];
      const logMagnitude = Math.log1p(100 * Math.sqrt(power) / FRAME_SIZE);
      const rise = logMagnitude - prevLog[k];
      if (rise > 0 && f > 0) flux += rise;
      prevLog[k] = logMagnitude;
      for (let b = 0; b < 3; b++) {
        if (k >= bands[b][0] && k < bands[b][1]) bandSums[b] += power;
      }
    }
    out.low[f] = bandSums[0];
    out.mid[f] = bandSums[1];
    out.high[f] = bandSums[2];
    out.flux[f] = flux;
    if (f % reportEvery === 0) progress(f / frameCount);
  }
  return out;
}

/**
 * Converts a power-like feature to decibels and maps the track's own
 * 5th–98th percentile range to [0, 1], so features are relative to the song.
 */
function normaliseDb(values: Float32Array, amplitude: boolean): Float32Array {
  const db = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const power = amplitude ? values[i] * values[i] : values[i];
    db[i] = 10 * Math.log10(power + 1e-12);
  }
  const silenceDb = amplitude ? -70 : -90;
  const audible = Array.from(db).filter((v) => v > silenceDb);
  const out = new Float32Array(values.length);
  if (audible.length === 0) return out;
  const lo = Math.max(percentile(audible, 0.05), silenceDb);
  const hi = percentile(audible, 0.98);
  if (hi - lo < 1e-6) return out;
  for (let i = 0; i < db.length; i++) out[i] = clamp01((db[i] - lo) / (hi - lo));
  return out;
}

// ---------------------------------------------------------------------------
// Onsets

/** High-passed, rectified and normalised spectral flux. */
function onsetEnvelope(flux: Float32Array, frameRate: number): Float32Array {
  const localMean = movingAverage(flux, Math.max(1, Math.round(0.35 * frameRate)));
  const out = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) out[i] = Math.max(0, flux[i] - localMean[i]);
  const scale = percentile(Array.from(out), 0.99);
  if (scale > 0) for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i] / scale);
  return out;
}

function pickOnsets(envelope: Float32Array, frameRate: number): number[] {
  const radius = 3;
  const minGap = Math.max(1, Math.round(0.07 * frameRate));
  const localMean = movingAverage(envelope, Math.max(1, Math.round(0.25 * frameRate)));
  const onsets: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < envelope.length - 1; i++) {
    const v = envelope[i];
    if (v < Math.max(0.1, localMean[i] * 1.5 + 0.03)) continue;
    let isPeak = true;
    for (let k = Math.max(0, i - radius); k <= Math.min(envelope.length - 1, i + radius); k++) {
      if (envelope[k] > v || (envelope[k] === v && k < i)) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak || i - last < minGap) continue;
    onsets.push(frameToTime(i + parabolicOffset(envelope, i), frameRate));
    last = i;
  }
  return onsets;
}

// ---------------------------------------------------------------------------
// Tempo and beats

/** Autocorrelation tempo estimate; returns the beat period in frames. */
function estimatePeriod(envelope: Float32Array, frameRate: number): { lag: number; strength: number } | null {
  const n = envelope.length;
  const minLag = Math.floor((60 * frameRate) / MAX_BPM);
  const maxLag = Math.ceil((60 * frameRate) / MIN_BPM);
  if (n < maxLag * 4) return null;

  // Widen sharp onset peaks so periods between whole frames still correlate.
  const smoothed = gaussianSmooth(envelope, 1);
  const m = mean(Array.from(smoothed));
  const centred = new Float64Array(n);
  for (let i = 0; i < n; i++) centred[i] = smoothed[i] - m;
  let zeroLag = 0;
  for (let i = 0; i < n; i++) zeroLag += centred[i] * centred[i];
  if (zeroLag <= 0) return null;

  const multiples = 4;
  const acf = new Float64Array(maxLag * multiples + 3);
  for (let lag = minLag - 1; lag < acf.length; lag++) {
    let sum = 0;
    for (let i = lag; i < n; i++) sum += centred[i] * centred[i - lag];
    acf[lag] = sum / zeroLag;
  }

  const priorLag = (60 * frameRate) / PRIOR_BPM;
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (acf[lag] < acf[lag - 1] || acf[lag] < acf[lag + 1]) continue;
    const octaves = Math.log2(lag / priorLag) / PRIOR_OCTAVES;
    const a = acf[lag - 1];
    const c = acf[lag + 1];
    const denom = a - 2 * acf[lag] + c;
    const peak = denom < 0 ? acf[lag] - ((a - c) * (a - c)) / (8 * denom) : acf[lag];
    const score = peak * Math.exp(-0.5 * octaves * octaves);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || acf[bestLag] <= 0) return null;

  // Sub-frame refinement: the peaks at multiples of the true period line up
  // only for the exact lag, which gives far more precision than one peak.
  const interpolated = (x: number) => {
    const i = Math.floor(x);
    if (i + 1 >= acf.length) return 0;
    return acf[i] + (acf[i + 1] - acf[i]) * (x - i);
  };
  let refined = bestLag;
  let refinedScore = -Infinity;
  for (let lag = bestLag - 1; lag <= bestLag + 1; lag += 0.005) {
    let score = 0;
    for (let k = 1; k <= multiples; k++) score += interpolated(lag * k);
    if (score > refinedScore) {
      refinedScore = score;
      refined = lag;
    }
  }
  return { lag: refined, strength: acf[bestLag] };
}

/** Least-squares slope of beat times against their index (seconds per beat). */
function regressionPeriod(times: number[]): number {
  const n = times.length;
  const meanIndex = (n - 1) / 2;
  const meanTime = mean(times);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanIndex) * (times[i] - meanTime);
    den += (i - meanIndex) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Dynamic-programming beat tracker (D. Ellis, "Beat Tracking by Dynamic
 * Programming", 2007). Follows local tempo drift instead of assuming a
 * perfectly rigid grid. Returns beat times in seconds.
 */
function trackBeats(envelope: Float32Array, period: number, energy: Float32Array, frameRate: number): number[] {
  const n = envelope.length;
  const local = gaussianSmooth(envelope, Math.max(0.5, period / 32));
  const cumulative = new Float64Array(n);
  const backlink = new Int32Array(n).fill(-1);
  const minBack = Math.round(period / 2);
  const maxBack = Math.round(period * 2);

  for (let t = 0; t < n; t++) {
    let best = -Infinity;
    let bestFrom = -1;
    for (let back = minBack; back <= maxBack; back++) {
      const from = t - back;
      if (from < 0) break;
      const penalty = Math.log(back / period);
      const score = cumulative[from] - TIGHTNESS * penalty * penalty;
      if (score > best) {
        best = score;
        bestFrom = from;
      }
    }
    cumulative[t] = local[t] + (bestFrom >= 0 ? Math.max(0, best) : 0);
    backlink[t] = bestFrom >= 0 && best > 0 ? bestFrom : -1;
  }

  // Start backtracking from the last strong local maximum of the cumulative score.
  const maxima: number[] = [];
  for (let t = 1; t < n - 1; t++) {
    if (cumulative[t] >= cumulative[t - 1] && cumulative[t] > cumulative[t + 1]) maxima.push(t);
  }
  if (maxima.length === 0) return [];
  const threshold = 0.5 * median(maxima.map((t) => cumulative[t]));
  let end = maxima[maxima.length - 1];
  for (let i = maxima.length - 1; i >= 0; i--) {
    if (cumulative[maxima[i]] > threshold) {
      end = maxima[i];
      break;
    }
  }

  const frames: number[] = [];
  for (let t = end; t >= 0; t = backlink[t]) frames.push(t);
  frames.reverse();

  // Drop beats placed in silence at the very start or end of the track.
  const audible = (frame: number) => energy[Math.min(energy.length - 1, frame)] > 0.08;
  let first = 0;
  let last = frames.length - 1;
  while (first <= last && !audible(frames[first])) first++;
  while (last >= first && !audible(frames[last])) last--;

  const kept = frames.slice(first, last + 1);
  const times = kept.map((f) => frameToTime(f + parabolicOffset(local, f), frameRate));
  return regulariseWeakBeats(times, kept.map((f) => local[f]), period / frameRate);
}

/**
 * Where the onset evidence is weak (breakdowns, sparse intros) the tracker can
 * only place beats on whole frames, which slowly drifts off the true grid.
 * Beats between two strong "anchor" beats are re-spaced evenly between them.
 */
function regulariseWeakBeats(times: number[], strengths: number[], period: number): number[] {
  const strongest = percentile(strengths, 0.9);
  if (strongest <= 0) return times;
  const anchors: number[] = [];
  strengths.forEach((s, i) => {
    if (s >= strongest * ANCHOR_STRENGTH) anchors.push(i);
  });
  const out = times.slice();
  for (let a = 0; a < anchors.length - 1; a++) {
    const i = anchors[a];
    const j = anchors[a + 1];
    if (j - i < 2) continue;
    const step = (times[j] - times[i]) / (j - i);
    if (Math.abs(step / period - 1) > 0.1) continue;
    for (let k = i + 1; k < j; k++) out[k] = times[i] + step * (k - i);
  }
  return out;
}

/**
 * Estimates the bar phase (bars of four). Section changes almost always land
 * on a downbeat, so each boundary votes for its beat's phase; ties are broken
 * by strong bass and weak backbeat (snare) energy on the downbeat.
 */
function labelDownbeats(beats: Beat[], sections: Section[], low: Float32Array, mid: Float32Array, frameRate: number): void {
  if (beats.length < 4) return;
  const score = [0, 0, 0, 0];
  beats.forEach((beat, i) => {
    score[i % 4] += 0.01 * (sampleAt(low, beat.time, frameRate) - sampleAt(mid, beat.time, frameRate));
  });
  for (const section of sections.slice(1)) {
    const index = nearestBeatIndex(beats, section.start);
    if (Math.abs(beats[index].time - section.start) < 0.05) score[index % 4] += 1;
  }
  const phase = score.indexOf(Math.max(...score));
  beats.forEach((beat, i) => {
    beat.downbeat = i % 4 === phase;
  });
}

function nearestBeatIndex(beats: Beat[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (beats[m].time < time) lo = m + 1;
    else hi = m;
  }
  if (lo > 0 && Math.abs(beats[lo - 1].time - time) <= Math.abs(beats[lo].time - time)) return lo - 1;
  return lo;
}

// ---------------------------------------------------------------------------
// Structure

function segmentSections(energy: Float32Array, frameRate: number, duration: number, beats: Beat[]): Section[] {
  if (energy.length === 0) return [{ start: 0, end: duration, intensity: 0, level: 'low' }];
  const smooth = movingAverage(energy, Math.max(1, Math.round((SECTION_SMOOTHING_SECONDS / 2) * frameRate)));
  const hysteresis = 0.05;

  // Per-frame level with hysteresis.
  const levels: IntensityLevel[] = new Array(smooth.length);
  let level = classify(smooth[0]);
  for (let i = 0; i < smooth.length; i++) {
    const v = smooth[i];
    if (level === 'low' && v > LOW_LEVEL_THRESHOLD + hysteresis) level = v > HIGH_LEVEL_THRESHOLD ? 'high' : 'mid';
    else if (level === 'mid' && v > HIGH_LEVEL_THRESHOLD + hysteresis) level = 'high';
    else if (level === 'mid' && v < LOW_LEVEL_THRESHOLD - hysteresis) level = 'low';
    else if (level === 'high' && v < HIGH_LEVEL_THRESHOLD - hysteresis) level = v < LOW_LEVEL_THRESHOLD ? 'low' : 'mid';
    levels[i] = level;
  }

  // Run-length segments in frames.
  let segments: { start: number; end: number; level: IntensityLevel }[] = [];
  let start = 0;
  for (let i = 1; i <= levels.length; i++) {
    if (i === levels.length || levels[i] !== levels[start]) {
      segments.push({ start, end: i, level: levels[start] });
      start = i;
    }
  }

  // Merge sections that are too short into the neighbour with the closest intensity.
  const minFrames = MIN_SECTION_SECONDS * frameRate;
  const segmentMean = (s: { start: number; end: number }) => mean(Array.from(smooth.subarray(s.start, s.end)));
  for (let changed = true; changed && segments.length > 1; ) {
    changed = false;
    let shortest = -1;
    for (let i = 0; i < segments.length; i++) {
      const length = segments[i].end - segments[i].start;
      if (length < minFrames && (shortest < 0 || length < segments[shortest].end - segments[shortest].start)) shortest = i;
    }
    if (shortest < 0) break;
    const s = segments[shortest];
    const m = segmentMean(s);
    const prev = segments[shortest - 1];
    const next = segments[shortest + 1];
    const target =
      !prev ? next : !next ? prev : Math.abs(segmentMean(prev) - m) <= Math.abs(segmentMean(next) - m) ? prev : next;
    target.start = Math.min(target.start, s.start);
    target.end = Math.max(target.end, s.end);
    segments.splice(shortest, 1);
    changed = true;
    // Merge neighbours that ended up with the same level.
    segments = segments.reduce<typeof segments>((acc, seg) => {
      const last = acc[acc.length - 1];
      if (last && last.level === seg.level) last.end = seg.end;
      else acc.push({ ...seg });
      return acc;
    }, []);
  }

  // Coarse boundaries come from smoothed energy; move each one to the sharpest
  // energy step nearby, then onto the nearest beat.
  const prefix = new Float64Array(energy.length + 1);
  for (let i = 0; i < energy.length; i++) prefix[i + 1] = prefix[i] + energy[i];
  const windowMean = (a: number, b: number) => (prefix[b] - prefix[a]) / Math.max(1, b - a);
  const w = Math.max(1, Math.round(frameRate));
  const search = Math.round(2.5 * frameRate);
  const refine = (boundary: number, direction: number) => {
    let best = boundary;
    let bestStep = -Infinity;
    for (let f = Math.max(w, boundary - search); f <= Math.min(energy.length - w, boundary + search); f++) {
      const step = direction * (windowMean(f, f + w) - windowMean(f - w, f));
      if (step > bestStep) {
        bestStep = step;
        best = f;
      }
    }
    return best;
  };
  const snap = (time: number) => {
    if (beats.length === 0) return time;
    const beat = beats[nearestBeatIndex(beats, time)];
    return Math.abs(beat.time - time) < 0.6 ? beat.time : time;
  };

  const means = segments.map(segmentMean);
  return segments.map((s, i) => {
    const boundaryTime = (index: number) =>
      snap(frameToTime(refine(segments[index].start, Math.sign(means[index] - means[index - 1])), frameRate));
    return {
      start: i === 0 ? 0 : boundaryTime(i),
      end: i === segments.length - 1 ? duration : boundaryTime(i + 1),
      intensity: means[i],
      level: s.level,
    };
  });
}

function classify(v: number): IntensityLevel {
  return v < LOW_LEVEL_THRESHOLD ? 'low' : v > HIGH_LEVEL_THRESHOLD ? 'high' : 'mid';
}

/** Drops: entries into a high-intensity section with a large energy rise. */
function findDrops(sections: Section[]): number[] {
  const drops: number[] = [];
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1];
    const next = sections[i];
    if (next.level === 'high' && prev.level !== 'high' && next.intensity - prev.intensity >= DROP_MIN_RISE) {
      drops.push(next.start);
    }
  }
  return drops;
}

// ---------------------------------------------------------------------------
// Helpers

/** Time of a (fractional) frame index: frames are referenced at their window centre. */
function frameToTime(frame: number, frameRate: number): number {
  return frame / frameRate + FRAME_SIZE / 2 / (frameRate * HOP_SIZE);
}

/** Linearly interpolated feature value at a time in seconds. */
export function sampleAt(feature: Float32Array, time: number, frameRate: number): number {
  if (feature.length === 0) return 0;
  const x = (time - FRAME_SIZE / 2 / (frameRate * HOP_SIZE)) * frameRate;
  if (x <= 0) return feature[0];
  const i = Math.floor(x);
  if (i >= feature.length - 1) return feature[feature.length - 1];
  const t = x - i;
  return feature[i] + (feature[i + 1] - feature[i]) * t;
}

function parabolicOffset(values: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= values.length - 1) return 0;
  const a = values[i - 1];
  const b = values[i];
  const c = values[i + 1];
  const denom = a - 2 * b + c;
  if (denom >= 0) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
}

/** Centred moving average with the given half-width, using prefix sums. */
function movingAverage(values: ArrayLike<number>, halfWidth: number): Float32Array {
  const n = values.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - halfWidth);
    const b = Math.min(n, i + halfWidth + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

function gaussianSmooth(values: Float32Array, sigma: number): Float32Array {
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  let total = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-0.5 * (k / sigma) ** 2);
    kernel.push(w);
    total += w;
  }
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < values.length) sum += values[j] * kernel[k + radius];
    }
    out[i] = sum / total;
  }
  return out;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
