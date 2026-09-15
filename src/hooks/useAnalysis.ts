import { useState, useCallback, useRef } from 'react';
import type { AnalysisProgress, SessionAnalysis } from '../analysis/types';
import type { ScheduledBeat } from '../audio/types';
import { runAnalysisInWorker } from '../analysis/worker-client';
import { persistAnalysisResult } from '../analysis/persistence';
import { useSessionStore } from '../store/session-store';
import { useSettingsStore } from '../store/settings-store';
import { useInstrumentStore } from '../store/instrument-store';
import { useProjectStore } from '../store/project-store';
import { beginCriticalActivity } from '../utils/critical-activity';
import * as db from '../store/db';

const AUTO_ADVANCE_MIN_HITS = 8;

export interface AnalysisState {
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  result: SessionAnalysis | null;
  error: string | null;
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ isAnalyzing: false, progress: null, result: null, error: null });
  const cancelWorkerRef = useRef<(() => void) | null>(null);

  const analyze = useCallback(async (
    sessionId: string,
    params: {
      bpm: number;
      meterNumerator: number;
      meterDenominator: number;
      subdivision: number;
      durationMs: number;
      scheduledBeats: ScheduledBeat[];
      recordingStartTime: number;
      recordingEndTime: number;
    },
  ): Promise<SessionAnalysis | null> => {
    cancelWorkerRef.current?.();
    const releaseCritical = beginCriticalActivity('analysis');
    setState({ isAnalyzing: true, progress: null, result: null, error: null });

    try {
      const pcmBlob = await db.getRecording(sessionId);
      if (!pcmBlob) throw new Error('No recording found for session');
      const sessionRecord = useSessionStore.getState().sessions.find((session) => session.id === sessionId);
      if (!sessionRecord) throw new Error('Session metadata is missing');
      const settings = useSettingsStore.getState();

      const run = runAnalysisInWorker({
        pcmBlob,
        bpm: params.bpm,
        meterNumerator: params.meterNumerator,
        meterDenominator: params.meterDenominator,
        subdivision: params.subdivision,
        durationMs: params.durationMs,
        scheduledBeats: params.scheduledBeats,
        recordingStartTime: params.recordingStartTime,
        recordingEndTime: params.recordingEndTime,
        config: {
          sampleRate: sessionRecord.recordingSampleRate ?? 48000,
          scoringWindowPct: settings.scoringWindowPct,
          flamMergePct: settings.flamMergePct,
          noiseGate: settings.noiseGate,
          accentThreshold: settings.accentThreshold,
          highPassHz: settings.highPassHz,
          latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment,
          noiseFloorMultiplier: settings.noiseFloorMultiplier,
          minOnsetIntervalMs: settings.minOnsetIntervalMs,
          postHitMaskingMs: settings.postHitMaskingMs,
          postHitMaskingStrength: settings.postHitMaskingStrength,
          fluxThresholdOffset: settings.fluxThresholdOffset,
        },
      }, (progress) => setState((current) => ({ ...current, progress })));
      cancelWorkerRef.current = run.cancel;
      const result = await run.promise;
      cancelWorkerRef.current = null;

      const instrumentStore = useInstrumentStore.getState();
      if (instrumentStore.isClassifierReady()) {
        const features = result.scoredOnsets.map((onset) => onset.spectralFeatures).filter((feature): feature is NonNullable<typeof feature> => feature !== null);
        if (features.length > 0) {
          const classifications = instrumentStore.classifyOnsets(features);
          let index = 0;
          for (const onset of result.scoredOnsets) {
            if (!onset.spectralFeatures || index >= classifications.length) continue;
            const classification = classifications[index++];
            onset.instrumentLabel = classification.label;
            onset.instrumentConfidence = classification.confidence;
            onset.instrumentCandidates = classification.topCandidates;
          }
        }
      }

      if (sessionRecord.projectId && result.totalScored >= AUTO_ADVANCE_MIN_HITS) {
        try {
          const advancement = await useProjectStore.getState().recordSessionResult(sessionRecord.projectId, result.score, params.bpm);
          if (advancement.advanced && advancement.newBpm !== null) {
            result.headlines.unshift({ text: `Project advanced to ${advancement.newBpm} BPM` });
          }
        } catch (error) {
          console.warn('Auto-advance check failed:', error);
        }
      }

      await persistAnalysisResult(sessionRecord, result);
      try {
        const count = (await db.getSetting<number>('sessionsSinceBackup')) ?? 0;
        await db.setSetting('sessionsSinceBackup', count + 1);
      } catch {}

      setState({ isAnalyzing: false, progress: { stage: 'complete', progress: 1 }, result, error: null });
      return result;
    } catch (error) {
      cancelWorkerRef.current = null;
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState({ isAnalyzing: false, progress: null, result: null, error: null });
        return null;
      }
      const message = error instanceof Error ? error.message : 'Analysis failed';
      console.error('Analysis error:', error);
      setState({ isAnalyzing: false, progress: null, result: null, error: message });
      return null;
    } finally {
      releaseCritical();
    }
  }, []);

  const abort = useCallback(() => {
    cancelWorkerRef.current?.();
    cancelWorkerRef.current = null;
  }, []);

  return { ...state, analyze, abort };
}
