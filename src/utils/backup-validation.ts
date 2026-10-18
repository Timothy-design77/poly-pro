import type * as db from '../store/db';
import { DEFAULT_ANALYSIS_CONFIG } from '../analysis/types';
import { PERSISTED_METRONOME_KEYS, PERSISTED_SETTINGS_KEYS } from '../store/persisted-shapes';

function fail(context: string): never { throw new Error(`Invalid backup: ${context}. No data was imported.`); }
function object(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(context);
  return value as Record<string, unknown>;
}
function number(value: unknown, context: string, min = -1e9, max = 1e9): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(context);
}
function string(value: unknown, context: string, max = 300): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max) fail(context);
}
function id(value: unknown): asserts value is string { string(value, 'missing ID', 150); if (!/^[\w:-]+$/.test(value)) fail('unsafe ID'); }
function date(value: unknown) { string(value, 'missing date'); if (!Number.isFinite(Date.parse(value))) fail('invalid date'); }
function list(value: unknown, context: string, max = 500000): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(context); return value;
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  const ids = items.map(key); if (new Set(ids).size !== ids.length) fail('duplicate IDs within archive'); return items;
}

const numericBounds: Record<string, [number, number]> = {
  bpm: [10, 400], meterNumerator: [1, 32], meterDenominator: [1, 32], subdivision: [1, 16],
  volume: [0, 4], swing: [0, 1], trainerStartBpm: [10, 400], trainerEndBpm: [10, 400], trainerBpmStep: [0.5, 100], trainerBarsPerStep: [1, 1000],
  countInBars: [0, 100], gapClickProbability: [0, 1], randomMuteProbability: [0, 1], playMuteCyclePlayBars: [1, 1000], playMuteCycleMuteBars: [1, 1000],
  accentSoundThreshold: [0, 5], vibrationIntensity: [0, 1], calibratedOffset: [-5000, 5000], manualAdjustment: [-5000, 5000], sensitivity: [0, 1],
  scoringWindowPct: [0.1, 100], flamMergePct: [0, 100], noiseGate: [0, 1], accentThreshold: [0, 100], highPassHz: [0, 20000], bandPassHz: [0, 20000],
  noiseFloorMultiplier: [0, 100], minOnsetIntervalMs: [1, 1000], postHitMaskingMs: [0, 5000], postHitMaskingStrength: [0, 100], fluxThresholdOffset: [0, 100],
  latencyOffsetMs: [-10000, 10000], biasCorrection: [-5000, 5000], inputGain: [0.01, 100],
  clickVolumeInRecording: [0, 1], rawPcmRetentionDays: [0, 36500], calibrationConsistency: [0, 10000],
};
function bounded(value: unknown, field: string) {
  const bounds = numericBounds[field];
  if (bounds) number(value, `out-of-range ${field}`, ...bounds);
  if (['meterNumerator', 'meterDenominator', 'subdivision', 'countInBars', 'trainerBarsPerStep', 'playMuteCyclePlayBars', 'playMuteCycleMuteBars'].includes(field) && !Number.isInteger(value)) fail(`fractional ${field}`);
  if (field === 'meterDenominator' && ![1, 2, 4, 8, 16, 32].includes(value as number)) fail('invalid meter denominator');
}
function tracks(value: unknown) {
  const entries = list(value, 'invalid tracks', 16);
  if (!entries.length) fail('empty tracks');
  for (const value of entries) {
    const track = object(value, 'invalid track'); id(track.id); number(track.beats, 'invalid beat count', 1, 128);
    if (!Number.isInteger(track.beats)) fail('fractional beat count');
    const accents = list(track.accents, 'invalid accents', 128);
    if (accents.length !== track.beats) fail('accent count does not match track');
    for (const accent of accents) { number(accent, 'invalid accent', 0, 5); if (!Number.isInteger(accent)) fail('invalid accent'); }
    for (const key of ['normalSound', 'accentSound']) string(track[key], `invalid ${key}`);
    for (const key of ['normalVolume', 'accentVolume', 'swing']) number(track[key], `invalid ${key}`, 0, key === 'swing' ? 1 : 4);
    if (typeof track.muted !== 'boolean') fail('invalid mute setting');
    object(track.soundOverrides, 'invalid sound overrides');
  }
}
function config(value: unknown) {
  const settings = object(value, 'invalid analysis settings');
  for (const [key, fallback] of Object.entries(DEFAULT_ANALYSIS_CONFIG)) if (settings[key] !== undefined) {
    if (typeof fallback === 'number') { number(settings[key], `invalid analysis ${key}`); bounded(settings[key], key); }
  }
  if (settings.sampleRate !== undefined) number(settings.sampleRate, 'invalid sample rate', 8000, 192000);
}
function timing(value: unknown) {
  const record = object(value, 'invalid recording timing');
  number(record.recordingStartTime, 'invalid recording start', 0); number(record.recordingEndTime, 'invalid recording end', 0);
  for (const beat of list(record.scheduledBeats, 'invalid captured beats', 200000)) {
    const item = object(beat, 'invalid beat'); number(item.time, 'invalid beat time', 0); number(item.beatIndex, 'invalid beat index', 0, 128); string(item.trackId, 'invalid track');
  }
}
export function validateSessions(value: unknown): db.SessionRecord[] {
  const sessions = list(value, 'invalid sessions', 100000).map((entry) => {
    const session = object(entry, 'invalid session'); id(session.id); date(session.date);
    if (session.projectId !== null) id(session.projectId);
    number(session.bpm, 'invalid tempo', 10, 400); number(session.subdivision, 'invalid subdivision', 1, 16);
    string(session.meter, 'invalid meter'); if (!/^([1-9]|[12]\d|3[0-2])\/(1|2|4|8|16|32)$/.test(session.meter)) fail('invalid meter');
    number(session.durationMs, 'invalid duration', 0, 86400000);
    for (const key of ['totalHits', 'avgDelta', 'stdDev', 'perfectPct']) number(session[key], `invalid ${key}`);
    if (typeof session.hasRecording !== 'boolean') fail('invalid recording flag');
    for (const key of ['score', 'sigma', 'meanOffset', 'hitRate', 'goodPct', 'totalDetected', 'totalScored', 'totalExpected', 'scoringWindowMs', 'flamMergeMs', 'noiseFloor', 'autoLatencyMs', 'fatigueRatio', 'maxDrift', 'swingRatio', 'swingSigma', 'analysisRevision', 'analysisVersion']) if (session[key] !== undefined) number(session[key], `invalid ${key}`);
    if (session.analyzed !== undefined && typeof session.analyzed !== 'boolean') fail('invalid analyzed flag');
    if (session.analysisNotice !== undefined) string(session.analysisNotice, 'invalid analysis notice', 2000);
    if (session.analysisConfig) config(session.analysisConfig);
    if (session.recordingTiming) timing(session.recordingTiming);
    if (session.recordingSampleRate !== undefined) number(session.recordingSampleRate, 'invalid sample rate', 8000, 192000);
    if (session.headlines !== undefined) for (const headline of list(session.headlines, 'invalid headlines', 100)) {
      if (typeof headline !== 'string') string(object(headline, 'invalid headline').text, 'invalid headline', 2000);
    }
    return session as unknown as db.SessionRecord;
  });
  return unique(sessions, (session) => session.id);
}
export function validateProjects(value: unknown): db.ProjectRecord[] {
  return unique(list(value, 'invalid projects', 10000).map((entry) => {
    const project = object(entry, 'invalid project'); id(project.id); string(project.name, 'invalid project name'); string(project.icon, 'invalid icon'); date(project.created); date(project.lastOpened);
    for (const key of ['startBpm', 'goalBpm', 'currentBpm']) number(project[key], 'invalid project tempo', 10, 400);
    number(project.accuracyTarget, 'invalid accuracy target', 0, 100); number(project.advanceAfterN, 'invalid advancement count', 1, 100); number(project.bpmStep, 'invalid BPM step', 0.5, 100); number(project.consecutiveCount, 'invalid streak', 0);
    if (typeof project.autoAdvance !== 'boolean') fail('invalid advancement flag');
    list(project.sessionIds, 'invalid project sessions').forEach(id);
    if (project.snapshot) { const snapshot = object(project.snapshot, 'invalid snapshot'); tracks(snapshot.tracks); number(snapshot.bpm, 'invalid snapshot tempo', 10, 400);
      // Snapshots must be complete because selecting a project restores them directly.
      const restored = validateSettings({ 'metronome-state': snapshot, 'settings-state': snapshot });
      const metro = restored['metronome-state'] as Record<string, unknown>;
      for (const field of PERSISTED_METRONOME_KEYS) if (metro[field] === undefined) fail(`missing snapshot ${field}`); }
    return project as unknown as db.ProjectRecord;
  }), (project) => project.id);
}
export function validateEvents(value: unknown, sessionId: string): db.HitEventsRecord {
  const events = object(value, 'invalid hit data'); if (events.sessionId !== sessionId) fail('hit data belongs to another take');
  for (const key of ['rawOnsets', 'scoredOnsets']) for (const onset of list(events[key], 'invalid hits')) {
    const hit = object(onset, 'invalid hit'); number(hit.time, 'invalid hit time', 0, 86400); number(hit.peak, 'invalid hit strength', 0, 1e6);
    if (key === 'scoredOnsets') { number(hit.delta, 'invalid timing deviation'); number(hit.absDelta, 'invalid absolute deviation', 0); if (typeof hit.scored !== 'boolean') fail('invalid scored flag'); }
    if (hit.matchedMeasure !== undefined) number(hit.matchedMeasure, 'invalid matched measure', 0);
  }
  if (events.gridBeats) for (const beat of list(events.gridBeats, 'invalid beat grid', 200000)) {
    const item = object(beat, 'invalid grid beat'); number(item.time, 'invalid grid time', 0, 86400); number(item.beatIndex, 'invalid beat index', 0, 128); number(item.measure, 'invalid measure', 0); string(item.trackId, 'invalid track');
  }
  const validated = events as unknown as db.HitEventsRecord;
  validated.rawOnsets.sort((a, b) => a.time - b.time); validated.scoredOnsets.sort((a, b) => a.time - b.time); validated.gridBeats?.sort((a, b) => a.time - b.time);
  return validated;
}
export function validateSettings(value: unknown): Record<string, unknown> {
  const input = object(value, 'invalid settings'); const result: Record<string, unknown> = {};
  for (const [key, keys] of [['metronome-state', PERSISTED_METRONOME_KEYS], ['settings-state', PERSISTED_SETTINGS_KEYS]] as const) {
    if (!input[key]) continue;
    const source = object(input[key], 'invalid settings'); const target: Record<string, unknown> = {};
    for (const field of keys) if (source[field] !== undefined) {
      const item = source[field];
      if (field === 'tracks') tracks(item);
      else if (field === 'beatGrouping') list(item, 'invalid beat grouping', 32).forEach((value) => number(value, 'invalid beat grouping', 1, 32));
      else if (['clickSound', 'accentSound', 'detectionPreset', 'audioAfterAnalysis', 'lastCalibratedAt'].includes(field)) { if (item !== null) string(item, `invalid ${field}`); }
      else if (['trainerEnabled', 'gapClickEnabled', 'randomMuteEnabled', 'playMuteCycleEnabled', 'hapticEnabled', 'includeClickInRecording', 'liveWaveform'].includes(field)) { if (typeof item !== 'boolean') fail(`invalid ${field}`); }
      else if (field === 'calibrationConsistency' && item === null) { /* Not calibrated yet. */ }
      else number(item, `invalid ${field}`);
      if (typeof item === 'number') { number(item, `invalid setting ${field}`); bounded(item, field); }
      target[field] = item;
    }
    if (key === 'metronome-state') {
      for (const field of ['bpm', 'meterNumerator', 'meterDenominator', 'subdivision']) if (target[field] !== undefined) number(target[field], `invalid ${field}`, 1, field === 'bpm' ? 400 : 32);
      if (typeof source._schemaVersion === 'number') target._schemaVersion = source._schemaVersion;
    }
    result[key] = target;
  }
  if (input.activeProjectId !== undefined) { if (input.activeProjectId !== null) id(input.activeProjectId); result.activeProjectId = input.activeProjectId; }
  return result;
}
export function validateProfiles(value: unknown): db.InstrumentProfileRecord[] {
  return unique(list(value, 'invalid instrument profiles', 8).map((entry) => {
    const profile = object(entry, 'invalid instrument profile'); string(profile.name, 'invalid instrument');
    if (!['Kick', 'Snare', 'Hi-Hat', 'Tom Hi', 'Tom Lo', 'Ride', 'Crash', 'Other'].includes(profile.name)) fail('unknown instrument');
    date(profile.lastTrained); number(profile.accuracy, 'invalid validation score', -1, 1);
    const samples = list(profile.samples, 'invalid training samples', 10000).slice(-200);
    for (const entry of samples) {
      const sample = object(entry, 'invalid sample'); if (sample.label !== profile.name) fail('mislabeled training sample');
      const features = object(sample.features, 'invalid features');
      for (const key of ['centroid', 'bandwidth', 'rolloff', 'zeroCrossingRate', 'attackTime']) number(features[key], 'invalid features', 0);
      const bands = list(features.bandEnergy, 'invalid band energy', 5); if (bands.length !== 5) fail('invalid band energy'); bands.forEach((value) => number(value, 'invalid band energy', 0));
    }
    return { ...profile, samples } as unknown as db.InstrumentProfileRecord;
  }), (profile) => profile.name);
}
export function validatePresets(value: unknown): db.PresetRecord[] {
  return unique(list(value, 'invalid presets', 10000).map((entry) => {
    const preset = object(entry, 'invalid preset'); id(preset.id); string(preset.name, 'invalid preset name'); date(preset.created);
    if (preset.projectId !== null) id(preset.projectId);
    number(preset.bpm, 'invalid preset tempo', 10, 400); number(preset.meterNumerator, 'invalid meter', 1, 32); number(preset.meterDenominator, 'invalid meter', 1, 32); number(preset.subdivision, 'invalid subdivision', 1, 16);
    string(preset.clickSound, 'invalid sound'); string(preset.accentSound, 'invalid sound');
    return preset as unknown as db.PresetRecord;
  }), (preset) => preset.id);
}
export function validateCustomMetadata(value: unknown): Array<Omit<db.CustomSampleRecord, 'blob'>> {
  return unique(list(value, 'invalid custom samples', 1000).map((entry) => {
    const sample = object(entry, 'invalid custom sample'); id(sample.id); string(sample.name, 'invalid custom sample name'); date(sample.createdAt); number(sample.durationMs, 'invalid sample duration', 1, 60000);
    return sample as unknown as Omit<db.CustomSampleRecord, 'blob'>;
  }), (sample) => sample.id);
}
