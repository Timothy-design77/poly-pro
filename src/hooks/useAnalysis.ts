import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzeSessionOffMainThread } from '../analysis/worker-client';
import type { AnalysisProgress, SessionAnalysis } from '../analysis/types';
import type { ScheduledBeat } from '../audio/types';
import { useSessionStore } from '../store/session-store';
import { useSettingsStore } from '../store/settings-store';
import { useInstrumentStore } from '../store/instrument-store';
import { useProjectStore } from '../store/project-store';
import { acquireCriticalActivity } from '../utils/appActivity';
import { OperationCancelledError } from '../utils/async';
import * as db from '../store/db';

const AUTO_ADVANCE_MIN_HITS = 8;

export interface AnalysisState {
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  result: SessionAnalysis | null;
  error: string | null;
}

interface RecordingAnalysisParams {
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  subdivision: number;
  durationMs: number;
  scheduledBeats: ScheduledBeat[];
  recordingStartTime: number;
  recordingEndTime: number;
}

const INITIAL_STATE: AnalysisState = {
  isAnalyzing: false,
  progress: null,
  result: null,
  error: null,
};

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(INITIAL_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  const analyze = useCallback(async (
    sessionId: string,
    params: RecordingAnalysisParams,
  ): Promise<SessionAnalysis | null> => {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const releaseActivity = acquireCriticalActivity('analysis');

    setState({
      isAnalyzing: true,
      progress: null,
      result: null,
      error: null,
    });

    try {
      const pcmBlob = await db.getRecording(sessionId);
      if (!pcmBlob) throw new Error('No recording found for session');
      if (abortController.signal.aborted) throw new OperationCancelledError('session analysis');

      const settings = useSettingsStore.getState();
      const result = await analyzeSessionOffMainThread({
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
        onProgress: (progress) => {
          if (!abortController.signal.aborted) {
            setState((current) => ({ ...current, progress }));
          }
        },
      }, abortController.signal);

      if (abortController.signal.aborted) {
        throw new OperationCancelledError('session analysis');
      }

      const instrumentStore = useInstrumentStore.getState();
      if (instrumentStore.isClassifierReady()) {
        const features = result.scoredOnsets
          .map((onset) => onset.spectralFeatures)
          .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

        if (features.length > 0) {
          const classifications = instrumentStore.classifyOnsets(features);
          let classificationIndex = 0;
          for (const onset of result.scoredOnsets) {
            if (onset.spectralFeatures !== null && classificationIndex < classifications.length) {
              const classification = classifications[classificationIndex];
              onset.instrumentLabel = classification.label;
              onset.instrumentConfidence = classification.confidence;
              onset.instrumentCandidates = classification.topCandidates;
              classificationIndex += 1;
            }
          }
        }
      }

      const sessionRecord = useSessionStore.getState().sessions.find(
        (session) => session.id === sessionId,
      );
      if (sessionRecord?.projectId && result.totalScored >= AUTO_ADVANCE_MIN_HITS) {
        try {
          const advancement = await useProjectStore.getState().recordSessionResult(
            sessionRecord.projectId,
            result.score,
            params.bpm,
          );
          if (advancement.advanced && advancement.newBpm !== null) {
            result.headlines.unshift({
              text: `Project advanced to ${advancement.newBpm} BPM`,
            });
          }
        } catch (error) {
          console.warn('Auto-advance check failed:', error);
        }
      }

      if (abortController.signal.aborted) {
        throw new OperationCancelledError('session analysis');
      }

      await useSessionStore.getState().updateSession(sessionId, {
        analyzed: true,
        score: result.score,
        sigma: result.sigma,
        meanOffset: result.meanOffset,
        hitRate: result.hitRate,
        totalHits: result.totalScored,
        avgDelta: result.meanOffset,
        stdDev: result.sigma,
        perfectPct: result.perfectPct,
        goodPct: result.goodPct,
        totalDetected: result.totalDetected,
        totalScored: result.totalScored,
        totalExpected: result.totalExpected,
        scoringWindowMs: result.scoringWindowMs,
        flamMergeMs: result.flamMergeMs,
        noiseFloor: result.noiseFloor,
        autoLatencyMs: result.autoLatencyMs,
        sigmaLevel: result.sigmaLevel,
        fatigueRatio: result.fatigueRatio,
        maxDrift: result.maxDrift,
        headlines: result.headlines,
        swingRatio: result.swingRatio,
        swingSigma: result.swingSigma,
        hasSwing: result.hasSwing,
        grooveConsistency: result.grooveConsistency,
        accentAdherence: result.accentAdherence,
        dynamicRange: result.dynamicRange,
        velocityDecaySlope: result.velocityDecaySlope,
        velocityDecayLabel: result.velocityDecayLabel,
      });

      await db.putHitEvents({
        sessionId,
        scoredOnsets: result.scoredOnsets.map((onset) => ({
          time: onset.time,
          delta: onset.delta,
          absDelta: onset.absDelta,
          peak: onset.peak,
          matchedBeatTime: onset.matchedBeatTime,
          matchedBeatIndex: onset.matchedBeatIndex,
          scored: onset.scored,
          measurePosition: onset.measurePosition,
          spectralFeatures: onset.spectralFeatures ?? null,
          instrumentLabel: onset.instrumentLabel,
          instrumentConfidence: onset.instrumentConfidence,
          instrumentCandidates: onset.instrumentCandidates,
        })),
        rawOnsets: result.rawOnsets.map((onset) => ({
          time: onset.time,
          peak: onset.peak,
          flux: onset.flux,
          isFlam: onset.isFlam,
        })),
        gridBeats: result.gridBeats,
      });

      try {
        const count = (await db.getSetting<number>('sessionsSinceBackup')) ?? 0;
        await db.setSetting('sessionsSinceBackup', count + 1);
      } catch {
        // Backup reminders are non-critical to a successfully analyzed session.
      }

      setState({
        isAnalyzing: false,
        progress: { stage: 'complete', progress: 1 },
        result,
        error: null,
      });
      return result;
    } catch (error) {
      if (error instanceof OperationCancelledError) {
        setState(INITIAL_STATE);
        return null;
      }

      const message = error instanceof Error ? error.message : 'Analysis failed';
      console.error('Analysis error:', error);
      setState({
        isAnalyzing: false,
        progress: null,
        result: null,
        error: message,
      });
      return null;
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      releaseActivity();
    }
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    ...state,
    analyze,
    abort,
  };
}
