/** Graphics quality presets and automatic adjustment (GDD §11.4, Fase 5 "otimização inicial"). */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Upper bound for the device pixel ratio. */
  pixelRatio: number;
  bloom: boolean;
  /** Multiplier on the procedural scenery density. */
  sceneryDensity: number;
  /** Fraction of ambient sparkles drawn. */
  sparkles: number;
  /** Speed streaks in intense passages. */
  streaks: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 1, bloom: false, sceneryDensity: 0.45, sparkles: 0.3, streaks: false },
  medium: { pixelRatio: 1.5, bloom: true, sceneryDensity: 0.75, sparkles: 0.6, streaks: true },
  high: { pixelRatio: 2, bloom: true, sceneryDensity: 1, sparkles: 1, streaks: true },
};

export const QUALITY_LABELS: Record<QualityLevel | 'auto', string> = {
  auto: 'Automática',
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};

const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

/**
 * Watches the frame rate and steps quality down when it stays low.
 * Never steps back up during a session, so it cannot oscillate.
 */
export class AdaptiveQuality {
  private window: number[] = [];
  private windowTime = 0;
  private grace: number;

  constructor(
    public level: QualityLevel = 'high',
    private readonly targetFps = 45,
    private readonly windowSeconds = 3,
    private readonly graceSeconds = 2,
  ) {
    this.grace = graceSeconds;
  }

  /** Feeds one frame; returns the new level when it should change, else null. */
  sample(frameDt: number): QualityLevel | null {
    // Ignore pauses and hitches (tab switches, loading).
    if (frameDt <= 0 || frameDt > 0.25) return null;
    if (this.grace > 0) {
      this.grace -= frameDt;
      return null;
    }
    this.window.push(frameDt);
    this.windowTime += frameDt;
    if (this.windowTime < this.windowSeconds) return null;
    const fps = this.window.length / this.windowTime;
    this.window = [];
    this.windowTime = 0;
    const index = ORDER.indexOf(this.level);
    if (fps < this.targetFps && index > 0) {
      this.level = ORDER[index - 1];
      this.grace = this.graceSeconds;
      return this.level;
    }
    return null;
  }

  reset(level: QualityLevel): void {
    this.level = level;
    this.window = [];
    this.windowTime = 0;
    this.grace = this.graceSeconds;
  }
}
