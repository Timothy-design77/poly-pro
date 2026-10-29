import type { AnalysisConfig, SessionAnalysis } from './types';
import type { HitEventsRecord, SessionRecord } from '../store/db';
import * as db from '../store/db';
import { useSessionStore } from '../store/session-store';

export function applyAnalysisToSession(session: SessionRecord, result: SessionAnalysis): SessionRecord {
  return {
    ...session,
    analyzed: true,
    analysisError: undefined,
    analysisRevision: (session.analysisRevision ?? 0) + 1,
    analysisVersion: 1,
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
  };
}

export function analysisToHitEvents(
  sessionId: string,
  result: SessionAnalysis,
  previous?: HitEventsRecord | null,
): HitEventsRecord {
  const prior = [...(previous?.scoredOnsets ?? [])].sort((a, b) => a.time - b.time);
  return {
    sessionId,
    scoredOnsets: result.scoredOnsets.map((onset) => {
      let low = 0, high = prior.length;
      while (low < high) { const mid = (low + high) >>> 1; if (prior[mid].time <= onset.time - 0.002) low = mid + 1; else high = mid; }
      const old = prior[low] && Math.abs(prior[low].time - onset.time) < 0.002 ? prior[low] : undefined;
      return {
        time: onset.time,
        delta: onset.delta,
        absDelta: onset.absDelta,
        peak: onset.peak,
        matchedBeatTime: onset.matchedBeatTime,
        matchedBeatIndex: onset.matchedBeatIndex,
        matchedMeasure: onset.matchedMeasure,
        scored: onset.scored,
        measurePosition: onset.measurePosition,
        spectralFeatures: onset.spectralFeatures ?? old?.spectralFeatures ?? null,
        instrumentLabel: onset.instrumentLabel ?? old?.instrumentLabel,
        instrumentConfidence: onset.instrumentConfidence ?? old?.instrumentConfidence,
        instrumentCandidates: onset.instrumentCandidates ?? old?.instrumentCandidates,
      };
    }),
    rawOnsets: result.rawOnsets.map((onset) => ({
      time: onset.time,
      peak: onset.peak,
      flux: onset.flux,
      isFlam: onset.isFlam,
    })),
    gridBeats: result.gridBeats ?? previous?.gridBeats,
  };
}

export async function persistAnalysisResult(
  session: SessionRecord,
  result: SessionAnalysis,
  previous?: HitEventsRecord | null,
  config?: AnalysisConfig,
): Promise<{ session: SessionRecord; hitEvents: HitEventsRecord }> {
  let updatedSession = applyAnalysisToSession(session, result);
  if (config) updatedSession.analysisConfig = { ...config };
  const hitEvents = analysisToHitEvents(session.id, result, previous);
  updatedSession = await db.putAnalysis(updatedSession, hitEvents, session.analysisRevision ?? 0);
  useSessionStore.setState((state) => ({
    sessions: state.sessions.map((item) => item.id === session.id ? updatedSession : item),
  }));
  return { session: updatedSession, hitEvents };
}
