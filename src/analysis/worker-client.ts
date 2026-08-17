import { analyzeSession, type AnalyzeSessionParams } from './index';
import type { SessionAnalysis } from './types';
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from './worker-protocol';
import { OperationCancelledError } from '../utils/async';

class AnalysisWorkerUnavailableError extends Error {
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'AnalysisWorkerUnavailableError';
    this.originalError = originalError;
  }
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function runInWorker(
  params: AnalyzeSessionParams,
  signal?: AbortSignal,
): Promise<SessionAnalysis> {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new AnalysisWorkerUnavailableError('Web Workers are unavailable'));
  }

  return new Promise<SessionAnalysis>((resolve, reject) => {
    let settled = false;
    let worker: Worker;

    try {
      worker = new Worker(
        new URL('../workers/analysis.worker.ts', import.meta.url),
        { type: 'module', name: 'poly-pro-analysis' },
      );
    } catch (error) {
      reject(new AnalysisWorkerUnavailableError('Analysis worker could not be created', error));
      return;
    }

    const requestId = createRequestId();
    const { onProgress, ...workerParams } = params;

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const handleAbort = () => {
      finish(() => reject(new OperationCancelledError('session analysis')));
    };

    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== requestId) return;

      if (response.type === 'progress') {
        onProgress?.(response.progress);
        return;
      }
      if (response.type === 'result') {
        finish(() => resolve(response.result));
        return;
      }

      const error = new Error(response.error.message);
      error.name = response.error.name;
      if (response.error.stack) error.stack = response.error.stack;
      finish(() => reject(error));
    };

    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new AnalysisWorkerUnavailableError(
        event.message || 'Analysis worker failed to load',
      )));
    };

    worker.onmessageerror = () => {
      finish(() => reject(new AnalysisWorkerUnavailableError(
        'Analysis worker returned an unreadable result',
      )));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });

    const request: AnalysisWorkerRequest = {
      type: 'analyze',
      requestId,
      params: workerParams,
    };

    try {
      worker.postMessage(request);
    } catch (error) {
      finish(() => reject(new AnalysisWorkerUnavailableError(
        'Analysis data could not be sent to the worker',
        error,
      )));
    }
  });
}

export async function analyzeSessionOffMainThread(
  params: AnalyzeSessionParams,
  signal?: AbortSignal,
): Promise<SessionAnalysis> {
  try {
    return await runInWorker(params, signal);
  } catch (error) {
    if (error instanceof OperationCancelledError) throw error;
    if (!(error instanceof AnalysisWorkerUnavailableError)) throw error;

    console.warn('[analysis] Web Worker unavailable; using main-thread fallback:', error);
    if (signal?.aborted) throw new OperationCancelledError('session analysis');

    const result = await analyzeSession({
      ...params,
      onProgress: (progress) => {
        if (!signal?.aborted) params.onProgress?.(progress);
      },
    });

    if (signal?.aborted) throw new OperationCancelledError('session analysis');
    return result;
  }
}
