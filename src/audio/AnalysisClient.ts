import type { AnalysisProgress, MusicAnalysis } from './analysisTypes';
import type { WorkerRequest, WorkerResponse } from './analysisProtocol';
import { analyzeMusic } from './MusicAnalyzer';
import { synthesizeDemoTrack } from './demoTrack';

type Pending = {
  resolve: (value: { analysis: MusicAnalysis; samples?: Float32Array; sampleRate?: number }) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: AnalysisProgress) => void;
};

/**
 * Promise-based front end for the analysis worker, with a main-thread
 * fallback when workers are unavailable.
 */
export class AnalysisClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.onMessage(event.data);
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.failAll(new Error(event.message || 'Falha no worker de análise'));
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  /** Analyses mono samples. The array is transferred to the worker and must not be reused. */
  analyze(samples: Float32Array, sampleRate: number, onProgress?: (p: AnalysisProgress) => void): Promise<MusicAnalysis> {
    if (!this.worker) return Promise.resolve(analyzeMusic(samples, sampleRate, { onProgress }));
    return this.send({ type: 'analyze', id: this.nextId++, samples, sampleRate }, [samples.buffer as ArrayBuffer], onProgress).then(
      (r) => r.analysis,
    );
  }

  /** Synthesises and analyses the demo song. */
  demo(sampleRate: number, onProgress?: (p: AnalysisProgress) => void): Promise<{ analysis: MusicAnalysis; samples: Float32Array; sampleRate: number }> {
    if (!this.worker) {
      const demo = synthesizeDemoTrack(sampleRate);
      return Promise.resolve({ analysis: analyzeMusic(demo.samples, demo.sampleRate, { onProgress }), samples: demo.samples, sampleRate });
    }
    return this.send({ type: 'demo', id: this.nextId++, sampleRate }, [], onProgress).then((r) => ({
      analysis: r.analysis,
      samples: r.samples!,
      sampleRate: r.sampleRate!,
    }));
  }

  dispose(): void {
    this.failAll(new Error('Análise cancelada'));
    this.worker?.terminate();
    this.worker = null;
  }

  private send(request: WorkerRequest, transfer: Transferable[], onProgress?: (p: AnalysisProgress) => void) {
    return new Promise<{ analysis: MusicAnalysis; samples?: Float32Array; sampleRate?: number }>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, onProgress });
      this.worker!.postMessage(request, transfer);
    });
  }

  private onMessage(message: WorkerResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === 'progress') {
      pending.onProgress?.(message.progress);
      return;
    }
    this.pending.delete(message.id);
    if (message.type === 'error') pending.reject(new Error(message.message));
    else pending.resolve({ analysis: message.analysis, samples: message.samples, sampleRate: message.sampleRate });
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
