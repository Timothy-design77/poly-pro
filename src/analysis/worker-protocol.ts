import type { AnalyzeSessionParams } from './index';
import type { AnalysisProgress, SessionAnalysis } from './types';

export type WorkerAnalyzeSessionParams = Omit<AnalyzeSessionParams, 'onProgress'>;

export interface AnalysisWorkerRequest {
  type: 'analyze';
  requestId: string;
  params: WorkerAnalyzeSessionParams;
}

export type AnalysisWorkerResponse =
  | {
      type: 'progress';
      requestId: string;
      progress: AnalysisProgress;
    }
  | {
      type: 'result';
      requestId: string;
      result: SessionAnalysis;
    }
  | {
      type: 'error';
      requestId: string;
      error: {
        name: string;
        message: string;
        stack?: string;
      };
    };
