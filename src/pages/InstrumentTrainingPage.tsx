/**
 * InstrumentTrainingPage — Full-screen training UI (Phase 8)
 *
 * Flow:
 * 1. User selects instrument to train
 * 2. Taps "Start Recording"
 * 3. Plays 20+ hits of that instrument
 * 4. App detects onsets, extracts features
 * 5. Features saved to instrument profile
 * 6. Cross-validation accuracy shown
 *
 * Quick retrain: 5 hits to update existing model.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useInstrumentStore } from '../store/instrument-store';
import type { InstrumentName, InstrumentProfile } from '../analysis/classification';
import { INSTRUMENT_INFO } from '../analysis/classification';
import { extractOnsetFeatures } from '../analysis/features';
import type { SpectralFeatures } from '../analysis/types';
import { getPreferredMicStream } from '../utils/mic';

const ALL_INSTRUMENTS: InstrumentName[] = [
  'Kick', 'Snare', 'Hi-Hat', 'Tom Hi', 'Tom Lo', 'Ride', 'Crash', 'Other',
];

const MIN_HITS_FULL = 20;
const MIN_HITS_QUICK = 5;

interface TrainingPageProps {
  onClose: () => void;
}

type TrainingState = 'select' | 'recording' | 'processing' | 'done';

export function InstrumentTrainingPage({ onClose }: TrainingPageProps) {
  const profiles = useInstrumentStore((s) => s.profiles);
  const addTrainingSamples = useInstrumentStore((s) => s.addTrainingSamples);
  const deleteProfile = useInstrumentStore((s) => s.deleteProfile);

  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentName | null>(null);
  const [trainingState, setTrainingState] = useState<TrainingState>('select');
  const [hitCount, setHitCount] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isQuickRetrain, setIsQuickRetrain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcmBufferRef = useRef<Float32Array[]>([]);
  const featuresRef = useRef<SpectralFeatures[]>([]);

  // Onset detection state for real-time feedback
  const lastPeakRef = useRef(0);
  const lastHitTimeRef = useRef(0);
  const sampleCountRef = useRef(0);

  const existingProfile = profiles.find((p) => p.name === selectedInstrument);
  const minHits = isQuickRetrain ? MIN_HITS_QUICK : MIN_HITS_FULL;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    if (!selectedInstrument) return;

    try {
      setError(null);
      setHitCount(0);
      featuresRef.current = [];
      pcmBufferRef.current = [];
      sampleCountRef.current = 0;
      lastPeakRef.current = 0;
      lastHitTimeRef.current = 0;

      // Get mic stream
      const micResult = await getPreferredMicStream();
      const stream = micResult.stream;
      streamRef.current = stream;

      // Create AudioContext
      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;

      // Create a ScriptProcessor for simple onset detection during training
      // (we don't need the full worklet pipeline here — just energy threshold)
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      // Use a script processor for simple real-time onset detection
      const bufferSize = 2048;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      source.connect(processor);
      processor.connect(ctx.destination);

      const THRESHOLD = 0.08;
      const MIN_INTERVAL_MS = 100; // Minimum time between hits

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);

        // Store PCM data for feature extraction
        const copy = new Float32Array(input.length);
        copy.set(input);
        pcmBufferRef.current.push(copy);

        // Simple energy-based onset detection
        let maxAbs = 0;
        for (let i = 0; i < input.length; i++) {
          const abs = Math.abs(input[i]);
          if (abs > maxAbs) maxAbs = abs;
        }

        const now = performance.now();
        const timeSinceLastHit = now - lastHitTimeRef.current;

        if (maxAbs > THRESHOLD && timeSinceLastHit > MIN_INTERVAL_MS) {
          lastHitTimeRef.current = now;
          lastPeakRef.current = maxAbs;

          // Extract features from this buffer
          const features = extractOnsetFeatures(input, 48000, 0);
          featuresRef.current.push(features);
          setHitCount((c) => c + 1);
        }

        sampleCountRef.current += input.length;
      };

      setTrainingState('recording');
    } catch (err) {
      console.error('Training recording error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  }, [selectedInstrument]);

  const stopRecording = useCallback(() => {
    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Close audio context
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const finishTraining = useCallback(async () => {
    if (!selectedInstrument || featuresRef.current.length === 0) return;

    stopRecording();
    setTrainingState('processing');

    try {
      const result = await addTrainingSamples(selectedInstrument, featuresRef.current);
      setAccuracy(result.accuracy);
      setTrainingState('done');
    } catch (err) {
      console.error('Training save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save training data');
      setTrainingState('select');
    }
  }, [selectedInstrument, stopRecording, addTrainingSamples]);

  const handleCancel = useCallback(() => {
    stopRecording();
    setTrainingState('select');
    setHitCount(0);
    setError(null);
  }, [stopRecording]);

  const handleDeleteProfile = useCallback(async (name: InstrumentName) => {
    await deleteProfile(name);
  }, [deleteProfile]);

  const content = createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-bg-primary flex flex-col"
      style={{ touchAction: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <button
          onClick={trainingState === 'recording' ? handleCancel : onClose}
          className="text-text-secondary text-sm min-w-[44px] min-h-[44px] flex items-center"
        >
          {trainingState === 'recording' ? 'Cancel' : '← Back'}
        </button>
        <h1 className="text-text-primary text-base font-medium">
          Instrument Training
        </h1>
        <div className="w-[44px]" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && (
          <div className="bg-danger-dim border border-danger/30 rounded-md p-3 mb-4">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {trainingState === 'select' && (
          <InstrumentSelectView
            profiles={profiles}
            onSelect={(name, quick) => {
              setSelectedInstrument(name);
              setIsQuickRetrain(quick);
            }}
            onDelete={handleDeleteProfile}
            onStartTraining={() => startRecording()}
            selectedInstrument={selectedInstrument}
          />
        )}

        {trainingState === 'recording' && selectedInstrument && (
          <RecordingView
            instrument={selectedInstrument}
            hitCount={hitCount}
            minHits={minHits}
            isQuickRetrain={isQuickRetrain}
            onFinish={finishTraining}
            onCancel={handleCancel}
          />
        )}

        {trainingState === 'processing' && (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="text-text-secondary text-sm mb-3">Processing training data…</div>
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        )}

        {trainingState === 'done' && selectedInstrument && (
          <DoneView
            instrument={selectedInstrument}
            accuracy={accuracy}
            hitCount={hitCount}
            onTrainAnother={() => {
              setTrainingState('select');
              setSelectedInstrument(null);
              setHitCount(0);
              setAccuracy(null);
            }}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body,
  );

  return content;
}

// ─── Sub-views ───

function InstrumentSelectView({
  profiles,
  onSelect,
  onDelete,
  onStartTraining,
  selectedInstrument,
}: {
  profiles: InstrumentProfile[];
  onSelect: (name: InstrumentName, quick: boolean) => void;
  onDelete: (name: InstrumentName) => void;
  onStartTraining: () => void;
  selectedInstrument: InstrumentName | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-text-secondary text-sm">
        Train the classifier to recognize your drums. Select an instrument, then
        play 20+ consistent hits. The app learns your kit's unique sound.
      </p>

      {/* Instrument grid */}
      <div className="grid grid-cols-2 gap-2">
        {ALL_INSTRUMENTS.map((name) => {
          const profile = profiles.find((p) => p.name === name);
          const info = INSTRUMENT_INFO[name];
          const isSelected = selectedInstrument === name;

          return (
            <button
              key={name}
              onClick={() => onSelect(name, !!profile)}
              className={`
                flex flex-col items-start p-3 rounded-md border transition-colors text-left
                min-h-[72px]
                ${isSelected
                  ? 'border-accent bg-accent-dim'
                  : 'border-border-subtle bg-bg-surface hover:bg-bg-raised'
                }
              `}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{info.icon}</span>
                <span className="text-text-primary text-sm font-medium">{name}</span>
              </div>
              {profile ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-text-muted text-xs">
                    {profile.samples.length} hits · {Math.round(profile.accuracy * 100)}%
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(name);
                    }}
                    className="text-danger text-xs min-w-[44px] min-h-[44px] flex items-center justify-end"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <span className="text-text-muted text-xs">Not trained</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Start button */}
      {selectedInstrument && (
        <button
          onClick={onStartTraining}
          className="w-full py-3 bg-accent text-bg-primary font-medium rounded-md text-sm mt-4 min-h-[48px]"
        >
          {profiles.find((p) => p.name === selectedInstrument)
            ? `Quick Retrain ${selectedInstrument}`
            : `Train ${selectedInstrument}`}
        </button>
      )}
    </div>
  );
}

function RecordingView({
  instrument,
  hitCount,
  minHits,
  isQuickRetrain,
  onFinish,
  onCancel,
}: {
  instrument: InstrumentName;
  hitCount: number;
  minHits: number;
  isQuickRetrain: boolean;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const info = INSTRUMENT_INFO[instrument];
  const progress = Math.min(hitCount / minHits, 1);
  const ready = hitCount >= minHits;

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-6">
      {/* Instrument label */}
      <div className="text-center">
        <div className="text-4xl mb-2">{info.icon}</div>
        <h2 className="text-text-primary text-lg font-medium">{instrument}</h2>
        <p className="text-text-secondary text-sm mt-1">
          {isQuickRetrain ? 'Quick retrain — ' : ''}Play consistent hits
        </p>
      </div>

      {/* Hit counter */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Progress ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64" cy="64" r="56"
            fill="none"
            stroke="#2A2A2E"
            strokeWidth="6"
          />
          <circle
            cx="64" cy="64" r="56"
            fill="none"
            stroke={ready ? '#4ADE80' : 'rgba(255,255,255,0.85)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${progress * 351.86} 351.86`}
            style={{ transition: 'stroke-dasharray 0.2s' }}
          />
        </svg>
        <div className="text-center">
          <div className="text-text-primary text-3xl font-mono font-bold">{hitCount}</div>
          <div className="text-text-muted text-xs">/ {minHits} min</div>
        </div>
      </div>

      {/* Recording indicator */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-recording animate-pulse" />
        <span className="text-text-secondary text-sm">Listening…</span>
      </div>

      {/* Finish / Cancel */}
      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={onCancel}
          className="flex-1 py-3 border border-border-subtle text-text-secondary rounded-md text-sm min-h-[48px]"
        >
          Cancel
        </button>
        <button
          onClick={onFinish}
          disabled={hitCount < 3}
          className={`
            flex-1 py-3 rounded-md text-sm font-medium min-h-[48px]
            ${ready
              ? 'bg-success text-bg-primary'
              : hitCount >= 3
                ? 'bg-accent text-bg-primary'
                : 'bg-bg-raised text-text-muted cursor-not-allowed'
            }
          `}
        >
          {ready ? 'Done ✓' : hitCount >= 3 ? 'Finish Early' : `Need ${3 - hitCount} more`}
        </button>
      </div>
    </div>
  );
}

function DoneView({
  instrument,
  accuracy,
  hitCount,
  onTrainAnother,
  onClose,
}: {
  instrument: InstrumentName;
  accuracy: number | null;
  hitCount: number;
  onTrainAnother: () => void;
  onClose: () => void;
}) {
  const info = INSTRUMENT_INFO[instrument];
  const accPct = accuracy !== null ? Math.round(accuracy * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-6">
      <div className="text-5xl mb-2">{info.icon}</div>
      <h2 className="text-text-primary text-lg font-medium">
        {instrument} Trained
      </h2>

      <div className="bg-bg-surface border border-border-subtle rounded-md p-4 w-full max-w-xs text-center">
        <div className="text-text-muted text-xs mb-1">Model Accuracy</div>
        <div
          className={`text-3xl font-mono font-bold ${
            accPct >= 80 ? 'text-success' : accPct >= 60 ? 'text-warning' : 'text-danger'
          }`}
        >
          {accPct}%
        </div>
        <div className="text-text-muted text-xs mt-2">
          {hitCount} training hits
        </div>
      </div>

      {accPct < 60 && (
        <p className="text-warning text-xs text-center max-w-xs">
          Low accuracy — try training with more consistent hits, or ensure
          each instrument sounds distinct.
        </p>
      )}

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={onTrainAnother}
          className="flex-1 py-3 border border-border-subtle text-text-secondary rounded-md text-sm min-h-[48px]"
        >
          Train Another
        </button>
        <button
          onClick={onClose}
          className="flex-1 py-3 bg-accent text-bg-primary rounded-md text-sm font-medium min-h-[48px]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
