/// <reference lib="webworker" />
import { analyzeSession, type AnalyzeSessionParams } from '../analysis/index';

interface AnalyzeRequest {
  type: 'analyze';
  params: Omit<AnalyzeSessionParams, 'onProgress'>;
}

self.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
  if (event.data.type !== 'analyze') return;
  try {
    const result = await analyzeSession({
      ...event.data.params,
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
};

export {};
