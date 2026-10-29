import type { AnalyzeSessionParams } from './index';
import type { AnalysisProgress, SessionAnalysis } from './types';

export interface AnalysisWorkerRun {
  promise: Promise<SessionAnalysis>;
  cancel: () => void;
}

export function runAnalysisInWorker(
  params: Omit<AnalyzeSessionParams, 'onProgress'>,
  onProgress?: (progress: AnalysisProgress) => void,
): AnalysisWorkerRun {
  const worker = new Worker(new URL('../workers/analysis-worker.ts', import.meta.url), { type: 'module' });
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  let settled = false;

  const promise = new Promise<SessionAnalysis>((resolve, reject) => {
    rejectPromise = reject;
    worker.onmessage = (event) => {
      const message = event.data as {
        type: 'progress' | 'result' | 'error';
        progress?: AnalysisProgress;
        result?: SessionAnalysis;
        message?: string;
      };
      if (message.type === 'progress' && message.progress) {
        onProgress?.(message.progress);
      } else if (message.type === 'result' && message.result) {
        settled = true;
        worker.terminate();
        resolve(message.result);
      } else if (message.type === 'error') {
        settled = true;
        worker.terminate();
        reject(new Error(message.message || 'Analysis failed'));
      }
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error(event.message || 'Analysis worker failed'));
    };
    worker.postMessage({ type: 'analyze', params });
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectPromise?.(new DOMException('Analysis cancelled', 'AbortError'));
    },
  };
}
