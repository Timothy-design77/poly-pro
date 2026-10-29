import { useState, useCallback, useEffect, useRef } from 'react';
import type { AnalysisConfig, AnalysisProgress, SessionAnalysis } from '../analysis/types';
import { DEFAULT_ANALYSIS_CONFIG } from '../analysis/types';
import { runAnalysisInWorker } from '../analysis/worker-client';
import { saveAnalysisResult } from '../analysis/save-result';
import { useSessionStore } from '../store/session-store';
import { useSettingsStore } from '../store/settings-store';
import { useInstrumentStore } from '../store/instrument-store';
import { beginCriticalActivity, isCriticalActivityActive } from '../utils/critical-activity';
import * as db from '../store/db';

export interface AnalysisState {
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  result: SessionAnalysis | null;
  error: string | null;
}

export function currentAnalysisConfig(sampleRate: number): AnalysisConfig {
  const settings = useSettingsStore.getState();
  return {
    ...DEFAULT_ANALYSIS_CONFIG, sampleRate,
    scoringWindowPct: settings.scoringWindowPct, flamMergePct: settings.flamMergePct,
    noiseGate: settings.noiseGate, accentThreshold: settings.accentThreshold,
    highPassHz: settings.highPassHz, latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment,
    inputGain: 1 + settings.sensitivity * 4, noiseFloorMultiplier: settings.noiseFloorMultiplier,
    minOnsetIntervalMs: settings.minOnsetIntervalMs, postHitMaskingMs: settings.postHitMaskingMs,
    postHitMaskingStrength: settings.postHitMaskingStrength, fluxThresholdOffset: settings.fluxThresholdOffset,
  };
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ isAnalyzing: false, progress: null, result: null, error: null });
  const activeRef = useRef<{ cancelled: boolean; cancel?: () => void } | null>(null);
  const abort = useCallback(() => {
    if (activeRef.current) { activeRef.current.cancelled = true; activeRef.current.cancel?.(); }
  }, []);

  useEffect(() => {
    window.addEventListener('polypro:cancel-analysis', abort);
    return () => { window.removeEventListener('polypro:cancel-analysis', abort); abort(); };
  }, [abort]);

  const analyze = useCallback(async (
    sessionId: string,
    timing?: db.RecordingTiming,
    useCurrentSettings = false,
  ): Promise<SessionAnalysis | null> => {
    if (isCriticalActivityActive()) {
      setState((current) => ({ ...current, error: 'Finish the current recording, analysis or data operation first.' }));
      return null;
    }
    const operation = { cancelled: false, cancel: undefined as (() => void) | undefined };
    activeRef.current = operation;
    const checkCancelled = () => { if (operation.cancelled) throw new DOMException('Analysis cancelled', 'AbortError'); };
    const releaseCritical = beginCriticalActivity('analysis');
    setState({ isAnalyzing: true, progress: null, result: null, error: null });
    try {
      const [storedBlob, previous, manifest] = await Promise.all([db.getRecording(sessionId), db.getHitEvents(sessionId), db.getRecordingManifest(sessionId)]);
      checkCancelled();
      if (!storedBlob) throw new Error('Audio is missing. Restore a full backup to analyze this take.');

      const session = useSessionStore.getState().sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error('Session metadata is missing');
      let pcmBlob = storedBlob;
      let sampleRate = session.recordingSampleRate ?? 48000;
      if (storedBlob.type.startsWith('audio/')) {
        const context = new OfflineAudioContext(1, 1, sampleRate);
        const decoded = await context.decodeAudioData(await storedBlob.arrayBuffer());
        checkCancelled(); sampleRate = decoded.sampleRate;
        pcmBlob = new Blob([new Float32Array(decoded.getChannelData(0)).buffer]);
      }
      const selectedConfig = !useCurrentSettings && session.analysisConfig ? session.analysisConfig : currentAnalysisConfig(session.recordingSampleRate ?? 48000);
      const config = { ...selectedConfig, sampleRate };
      const captured = timing ?? session.recordingTiming ?? manifest?.timing;
      const [meterNumerator, meterDenominator] = session.meter.split('/').map(Number);
      const run = runAnalysisInWorker({
        pcmBlob, bpm: session.bpm, meterNumerator, meterDenominator, subdivision: session.subdivision,
        durationMs: session.durationMs,
        scheduledBeats: captured?.scheduledBeats ?? [],
        recordingStartTime: captured?.recordingStartTime ?? 0,
        recordingEndTime: captured?.recordingEndTime ?? session.durationMs / 1000,
        // An empty captured grid (e.g. all count-in) is meaningful, not a reason to invent beats.
        gridBeats: !captured ? previous?.gridBeats : undefined,
        config,
      }, (progress) => { if (!operation.cancelled) setState((current) => ({ ...current, progress })); });
      operation.cancel = run.cancel;
      const result = await run.promise;
      checkCancelled();
      const instruments = useInstrumentStore.getState();
      if (instruments.isClassifierReady()) {
        for (const onset of result.scoredOnsets) {
          if (!onset.spectralFeatures) continue;
          const [classification] = instruments.classifyOnsets([onset.spectralFeatures]);
          onset.instrumentLabel = classification.label;
          onset.instrumentConfidence = classification.confidence;
          onset.instrumentCandidates = classification.topCandidates;
        }
      }
      if (!captured?.scheduledBeats.length && !previous?.gridBeats) result.headlines.unshift({ text: 'Estimated beat grid: original metronome timing is unavailable. Timing scores are approximate.' });
      await saveAnalysisResult(session, result, config, !!captured?.scheduledBeats.length);
      setState({ isAnalyzing: false, progress: { stage: 'complete', progress: 1 }, result, error: null });
      return result;
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'Analysis cancelled. Your recording and saved results are unchanged.'
        : error instanceof Error ? error.message : 'Analysis failed';
      setState({ isAnalyzing: false, progress: null, result: null, error: message });
      return null;
    } finally {
      if (activeRef.current === operation) activeRef.current = null;
      releaseCritical();
    }
  }, []);

  return { ...state, analyze, abort };
}
