/// <reference lib="webworker" />

import { analyzeSession } from '../analysis';
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from '../analysis/worker-protocol';

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<AnalysisWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'analyze') return;

  try {
    const result = await analyzeSession({
      ...request.params,
      onProgress: (progress) => {
        const response: AnalysisWorkerResponse = {
          type: 'progress',
          requestId: request.requestId,
          progress,
        };
        workerScope.postMessage(response);
      },
    });

    const response: AnalysisWorkerResponse = {
      type: 'result',
      requestId: request.requestId,
      result,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const normalized = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : {
          name: 'Error',
          message: String(error),
        };

    const response: AnalysisWorkerResponse = {
      type: 'error',
      requestId: request.requestId,
      error: normalized,
    };
    workerScope.postMessage(response);
  }
};

export {};
