/// <reference lib="webworker" />
import { analyzeMusic } from './MusicAnalyzer';
import { synthesizeDemoTrack } from './demoTrack';
import type { WorkerRequest, WorkerResponse } from './analysisProtocol';

declare const self: DedicatedWorkerGlobalScope;

/** Runs the analysis off the main thread so the menu stays responsive. */
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer);
  try {
    let samples: Float32Array;
    let sampleRate: number;
    if (request.type === 'demo') {
      const demo = synthesizeDemoTrack(request.sampleRate);
      samples = demo.samples;
      sampleRate = demo.sampleRate;
    } else {
      samples = request.samples;
      sampleRate = request.sampleRate;
    }
    const analysis = analyzeMusic(samples, sampleRate, {
      onProgress: (progress) => post({ type: 'progress', id: request.id, progress }),
    });
    if (request.type === 'demo') {
      post({ type: 'result', id: request.id, analysis, samples, sampleRate }, [samples.buffer as ArrayBuffer]);
    } else {
      post({ type: 'result', id: request.id, analysis });
    }
  } catch (error) {
    post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
};
