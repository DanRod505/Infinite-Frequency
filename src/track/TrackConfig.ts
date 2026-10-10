/**
 * Geometric constraints for procedural track generation (GDD §4.3).
 * All lengths are in metres, angles in radians.
 */
export interface TrackConfig {
  /** Distance between two consecutive centreline samples. */
  sampleSpacing: number;
  /** Number of segments (samples - 1) in each chunk. */
  segmentsPerChunk: number;
  /** Full road width. */
  roadWidth: number;
  /** Maximum curvature (1 / minimum radius). */
  maxCurvature: number;
  /** Maximum change of curvature per metre (clothoid-like transitions). */
  maxCurvatureRate: number;
  /** Maximum road pitch (grade angle). */
  maxPitch: number;
  /** Maximum change of pitch per metre (avoids abrupt crests and dips). */
  maxPitchRate: number;
  /** Bank angle applied per unit of curvature. */
  bankPerCurvature: number;
  /** Absolute bank limit. */
  maxBank: number;
  /** Probability that a chunk is planned as a straight. */
  straightProbability: number;
  /** Heading deviation from the main direction after which curves are biased back. */
  maxHeadingDeviation: number;
  /** Elevation range the road is softly kept within. */
  minElevation: number;
  maxElevation: number;
}

export const DEFAULT_TRACK_CONFIG: TrackConfig = {
  sampleSpacing: 2,
  segmentsPerChunk: 60,
  roadWidth: 16,
  maxCurvature: 1 / 160,
  maxCurvatureRate: 1 / 160 / 90,
  maxPitch: 0.07,
  maxPitchRate: 0.0006,
  bankPerCurvature: 22,
  maxBank: 0.14,
  straightProbability: 0.25,
  maxHeadingDeviation: (60 * Math.PI) / 180,
  minElevation: -25,
  maxElevation: 35,
};

export function chunkLength(config: TrackConfig): number {
  return config.sampleSpacing * config.segmentsPerChunk;
}
