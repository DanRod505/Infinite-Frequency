import type { AnalysisProgress, MusicAnalysis } from './analysisTypes';

export type WorkerRequest =
  | { type: 'analyze'; id: number; samples: Float32Array; sampleRate: number }
  | { type: 'demo'; id: number; sampleRate: number };

export type WorkerResponse =
  | { type: 'progress'; id: number; progress: AnalysisProgress }
  | { type: 'result'; id: number; analysis: MusicAnalysis; samples?: Float32Array; sampleRate?: number }
  | { type: 'error'; id: number; message: string };
