/**
 * useAnalysis hook — orchestrates post-processing analysis.
 *
 * Called after recording stops to run the full pipeline:
 * 1. Load raw PCM from IDB
 * 2. Run onset detection + scoring
 * 3. Save analysis results to session record + hit events
 * 4. Show progress via AnalyzingOverlay
 */

import { useState, useCallback, useRef } from 'react';
import { analyzeSession } from '../analysis/index';
import type { AnalysisProgress, SessionAnalysis } from '../analysis/types';
import type { ScheduledBeat } from '../audio/types';
import { useSessionStore } from '../store/session-store';
import { useSettingsStore } from '../store/settings-store';
import { useInstrumentStore } from '../store/instrument-store';
import * as db from '../store/db';

export interface AnalysisState {
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  result: SessionAnalysis | null;
  error: string | null;
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    isAnalyzing: false,
    progress: null,
    result: null,
    error: null,
  });

  const abortRef = useRef(false);

  /**
   * Run analysis on a recorded session.
   *
   * @param sessionId - ID of the session to analyze
   * @param params - Recording parameters needed for analysis
   */
  const analyze = useCallback(
    async (
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
      abortRef.current = false;

      setState({
        isAnalyzing: true,
        progress: null,
        result: null,
        error: null,
      });

      try {
        // Load raw PCM from IDB
        const pcmBlob = await db.getRecording(sessionId);
        if (!pcmBlob) {
          throw new Error('No recording found for session');
        }

        // Read detection config from settings store
        const settings = useSettingsStore.getState();

        // Run analysis
        const result = await analyzeSession({
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
          },
          onProgress: (progress) => {
            if (!abortRef.current) {
              setState((s) => ({ ...s, progress }));
            }
          },
        });

        if (abortRef.current) return null;

        // Run instrument classification if profiles are available (Phase 8)
        const instrumentStore = useInstrumentStore.getState();
        if (instrumentStore.isClassifierReady()) {
          const featuresForClassification = result.scoredOnsets
            .map((o) => o.spectralFeatures)
            .filter((f): f is NonNullable<typeof f> => f !== null);

          if (featuresForClassification.length > 0) {
            const classifications = instrumentStore.classifyOnsets(featuresForClassification);
            let classIdx = 0;
            for (const onset of result.scoredOnsets) {
              if (onset.spectralFeatures !== null && classIdx < classifications.length) {
                const c = classifications[classIdx];
                onset.instrumentLabel = c.label;
                onset.instrumentConfidence = c.confidence;
                onset.instrumentCandidates = c.topCandidates;
                classIdx++;
              }
            }
          }
        }

        // Save analysis results to session record
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
        });

        // Save hit events (onset data) separately
        // Include spectral features + instrument classification if available
        await db.putHitEvents({
          sessionId,
          scoredOnsets: result.scoredOnsets.map((o) => ({
            time: o.time,
            delta: o.delta,
            absDelta: o.absDelta,
            peak: o.peak,
            matchedBeatTime: o.matchedBeatTime,
            matchedBeatIndex: o.matchedBeatIndex,
            scored: o.scored,
            measurePosition: o.measurePosition,
            spectralFeatures: o.spectralFeatures ?? null,
            instrumentLabel: o.instrumentLabel,
            instrumentConfidence: o.instrumentConfidence,
            instrumentCandidates: o.instrumentCandidates,
          })),
          rawOnsets: result.rawOnsets.map((o) => ({
            time: o.time,
            peak: o.peak,
            flux: o.flux,
            isFlam: o.isFlam,
          })),
        });

        setState({
          isAnalyzing: false,
          progress: { stage: 'complete', progress: 1 },
          result,
          error: null,
        });

        return result;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Analysis failed';
        console.error('Analysis error:', err);

        setState({
          isAnalyzing: false,
          progress: null,
          result: null,
          error: errorMsg,
        });

        return null;
      }
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    ...state,
    analyze,
    abort,
  };
}
