import type { Difficulty, GameMode } from '../rhythm/types';

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';

/** Garage options (GDD §8.2): cosmetic only, never a competitive advantage. */
export const BODY_COLORS = [0x3a2f6b, 0xb0102a, 0xd8d8e8, 0x0f8fa8, 0xb08a2a, 0x18181f] as const;
export const GLOW_COLORS = [0xff2ad4, 0x3ff2ff, 0xffc23f, 0x7dff4f, 0x9b5cff, 0xff3355] as const;

/**
 * Player settings persisted in localStorage (GDD §3.4, §12.4).
 */
export interface SettingsData {
  /** Master volume in [0, 1]. */
  volume: number;
  /** Manual audio/visual sync correction in milliseconds; positive delays the visuals. */
  latencyMs: number;
  /** Scales every music-reactive visual effect, in [0, 1]. */
  effects: number;
  /** Removes full-screen flashes and limits strobing. */
  reduceFlashes: boolean;
  cameraShake: boolean;
  /** Volume of collection and collision sounds in [0, 1]. */
  sfxVolume: number;
  /** Graphics quality; 'auto' starts high and steps down when the frame rate drops. */
  quality: QualitySetting;
  /** Steering responsiveness multiplier in [0.6, 1.4] (§12.4). */
  steering: number;
  bodyColor: number;
  glowColor: number;
  /** Whether the "how to play" screen was already shown before a first Rhythm Run. */
  seenTutorial: boolean;
  /** Last chosen game mode, difficulty and obstacle option (ready screen). */
  mode: GameMode;
  difficulty: Difficulty;
  obstacles: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  volume: 0.8,
  latencyMs: 0,
  effects: 1,
  reduceFlashes: false,
  cameraShake: true,
  sfxVolume: 0.5,
  quality: 'auto',
  steering: 1,
  bodyColor: BODY_COLORS[0],
  glowColor: GLOW_COLORS[0],
  seenTutorial: false,
  mode: 'rhythm',
  difficulty: 'normal',
  obstacles: true,
};

export const LATENCY_LIMIT_MS = 300;
export const STEERING_RANGE = [0.6, 1.4] as const;
const STORAGE_KEY = 'infinite-frequency.settings.v1';

export class Settings {
  private data: SettingsData;
  private readonly listeners = new Set<(data: Readonly<SettingsData>) => void>();

  constructor(private readonly storage: Storage | null = safeLocalStorage()) {
    this.data = { ...DEFAULT_SETTINGS, ...this.load() };
  }

  get values(): Readonly<SettingsData> {
    return this.data;
  }

  update(patch: Partial<SettingsData>): void {
    this.data = sanitise({ ...this.data, ...patch });
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage may be full or disabled; settings still apply for this session.
    }
    for (const listener of this.listeners) listener(this.data);
  }

  subscribe(listener: (data: Readonly<SettingsData>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Partial<SettingsData> {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return raw ? sanitise({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }) : {};
    } catch {
      return {};
    }
  }
}

function sanitise(data: SettingsData): SettingsData {
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    volume: num(data.volume, DEFAULT_SETTINGS.volume, 0, 1),
    latencyMs: Math.round(num(data.latencyMs, 0, -LATENCY_LIMIT_MS, LATENCY_LIMIT_MS)),
    effects: num(data.effects, DEFAULT_SETTINGS.effects, 0, 1),
    reduceFlashes: typeof data.reduceFlashes === 'boolean' ? data.reduceFlashes : DEFAULT_SETTINGS.reduceFlashes,
    cameraShake: typeof data.cameraShake === 'boolean' ? data.cameraShake : DEFAULT_SETTINGS.cameraShake,
    sfxVolume: num(data.sfxVolume, DEFAULT_SETTINGS.sfxVolume, 0, 1),
    quality: ['auto', 'low', 'medium', 'high'].includes(data.quality) ? data.quality : DEFAULT_SETTINGS.quality,
    steering: num(data.steering, DEFAULT_SETTINGS.steering, STEERING_RANGE[0], STEERING_RANGE[1]),
    bodyColor: (BODY_COLORS as readonly number[]).includes(data.bodyColor) ? data.bodyColor : DEFAULT_SETTINGS.bodyColor,
    glowColor: (GLOW_COLORS as readonly number[]).includes(data.glowColor) ? data.glowColor : DEFAULT_SETTINGS.glowColor,
    seenTutorial: typeof data.seenTutorial === 'boolean' ? data.seenTutorial : DEFAULT_SETTINGS.seenTutorial,
    mode: data.mode === 'free' || data.mode === 'rhythm' ? data.mode : DEFAULT_SETTINGS.mode,
    difficulty: ['easy', 'normal', 'hard'].includes(data.difficulty) ? data.difficulty : DEFAULT_SETTINGS.difficulty,
    obstacles: typeof data.obstacles === 'boolean' ? data.obstacles : DEFAULT_SETTINGS.obstacles,
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
