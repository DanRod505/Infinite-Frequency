import type { MusicAnalysis } from '../audio/analysisTypes';
import { Rng, mixSeed } from '../core/rng';
import { PALETTES_BY_LEVEL, type PaletteName } from './palettes';

/**
 * Environmental events planned from the analysis before the race (GDD §5.4):
 * every event is tied to a musical moment and, through the deterministic
 * time → distance mapping, to a fixed place on the track.
 */
export interface WorldPlan {
  /** Palette variation per section, by song time. */
  palettes: { start: number; palette: PaletteName }[];
  /** Light tunnels at the start of intense sections: one ring per beat. */
  tunnels: { start: number; rings: { time: number; distance: number }[] }[];
  /** Monumental gates at drops. */
  monuments: { time: number; distance: number }[];
  /** Build-ups: medium sections that lead into an intense one. */
  builds: { start: number; end: number }[];
}

/** Bars of four beats covered by a light tunnel. */
const TUNNEL_BARS = 4;
/** Above this tempo, rings go on every other beat so they do not blur together. */
const DENSE_TEMPO = 140;

export function planWorld(analysis: MusicAnalysis, seed: number, distanceAt: (time: number) => number): WorldPlan {
  const rng = new Rng(mixSeed(seed, 0x3070d));
  const sections = analysis.sections;

  // Palettes: pick a variation suited to each section, avoiding immediate repeats.
  const palettes: WorldPlan['palettes'] = [];
  let previous: PaletteName | null = null;
  for (const section of sections) {
    const options = PALETTES_BY_LEVEL[section.level].filter((p) => p !== previous);
    const choice = options[rng.int(0, options.length - 1)];
    palettes.push({ start: section.start, palette: choice });
    previous = choice;
  }

  // Tunnels: rings on the beats at the start of every intense section.
  const tunnels: WorldPlan['tunnels'] = [];
  if (analysis.tempo.reliable) {
    const step = analysis.tempo.bpm > DENSE_TEMPO ? 2 : 1;
    sections.forEach((section, i) => {
      if (i === 0 || section.level !== 'high') return;
      const beats = analysis.beats.filter((b) => b.time >= section.start - 0.01 && b.time < section.end);
      const rings = beats
        .slice(0, TUNNEL_BARS * 4)
        .filter((_, k) => k % step === 0)
        .map((b) => ({ time: b.time, distance: distanceAt(b.time) }));
      if (rings.length > 0) tunnels.push({ start: section.start, rings });
    });
  }

  const monuments = analysis.drops.map((time) => ({ time, distance: distanceAt(time) }));

  const builds: WorldPlan['builds'] = [];
  sections.forEach((section, i) => {
    const next = sections[i + 1];
    if (section.level === 'mid' && next?.level === 'high') builds.push({ start: section.start, end: section.end });
  });

  return { palettes, tunnels, monuments, builds };
}

/** Palette scheduled at a song time. */
export function paletteAt(plan: WorldPlan, time: number): PaletteName {
  let current = plan.palettes[0]?.palette ?? 'sunset';
  for (const entry of plan.palettes) {
    if (entry.start <= time) current = entry.palette;
    else break;
  }
  return current;
}

/** Progress in [0, 1] through a build-up at `time`, or 0 outside one. */
export function buildProgress(plan: WorldPlan, time: number): number {
  for (const build of plan.builds) {
    if (time >= build.start && time < build.end) return (time - build.start) / (build.end - build.start);
  }
  return 0;
}
