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

import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useInstrumentStore } from '../store/instrument-store';
import type { InstrumentName, InstrumentProfile } from '../analysis/classification';
import { INSTRUMENT_INFO } from '../analysis/classification';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useTrainingCapture } from '../hooks/useTrainingCapture';

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

  const capture = useTrainingCapture();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, true, () => { capture.stop(); onClose(); });
  const finishRef = useRef<() => void>(() => {});
  const minHits = isQuickRetrain ? MIN_HITS_QUICK : MIN_HITS_FULL;
  const finishingRef = useRef(false);
  const startRecording = useCallback(async () => {
    if (!selectedInstrument || capture.preparing) return;
    setError(null); setHitCount(0);
    try { if (await capture.start(() => finishRef.current())) setTrainingState('recording'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Microphone unavailable.'); }
  }, [selectedInstrument, capture.start, capture.preparing]);

  const finishTraining = useCallback(async () => {
    if (!selectedInstrument || finishingRef.current) return;
    finishingRef.current = true; setTrainingState('processing');
    try {
      const { features } = await capture.finish();
      if (features.length < minHits) throw new Error(`Detected ${features.length} usable hits; ${minHits} are needed. Try spaced, consistent hits in a quiet room.`);
      const result = await addTrainingSamples(selectedInstrument, features);
      setHitCount(features.length); setAccuracy(result.accuracy); setTrainingState('done');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save training.'); setTrainingState('select'); }
    finally { finishingRef.current = false; }
  }, [selectedInstrument, capture.finish, minHits, addTrainingSamples]);
  finishRef.current = () => { void finishTraining(); };

  const handleCancel = useCallback(() => {
    capture.stop();
    setTrainingState('select');
    setHitCount(0);
    setError(null);
  }, [capture.stop]);

  const handleDeleteProfile = useCallback(async (name: InstrumentName) => {
    try { await deleteProfile(name); } catch { setError('Could not delete this profile. Try again.'); }
  }, [deleteProfile]);

  const content = createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-bg-primary flex flex-col"
      ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Instrument Training" data-no-swipe
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <button
          onClick={() => { capture.stop(); if (trainingState === 'recording') handleCancel(); else onClose(); }}
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

        {capture.preparing && <p role="status" className="text-sm text-text-secondary">Preparing microphone…</p>}
        {trainingState === 'select' && !capture.preparing && (
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
            hitCount={capture.hitCount}
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
            <div key={name} className="relative">
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(name, !!profile)}
              className={`
                w-full flex flex-col items-start p-3 rounded-md border transition-colors text-left
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
                  <span className="text-text-secondary text-xs">
                    {profile.samples.length} hits · {profiles.length < 2 || profile.accuracy < 0 ? 'Train another instrument' : `${Math.round(profile.accuracy * 100)}% validation`}
                  </span>

                </div>
              ) : (
                <span className="text-text-secondary text-xs">Not trained</span>
              )}
            </button>
            {profile && <button aria-label={`Delete ${name} profile`} onClick={() => onDelete(name)} className="min-h-[44px] px-3 text-danger text-xs">Delete profile</button>}
            </div>
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
            stroke={ready ? '#15803d' : '#15171A'}
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
        <span className="text-text-secondary text-sm">Listening… auto-stops at 60 seconds. Count is approximate.</span>
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
        <div className="text-text-muted text-xs mb-1">Training validation</div>
        <div
          className={`text-3xl font-mono font-bold ${
            accPct >= 80 ? 'text-success' : accPct >= 60 ? 'text-warning' : 'text-danger'
          }`}
        >
          {accuracy !== null && accuracy >= 0 ? `${accPct}%` : 'Needs a second instrument'}
        </div>
        <div className="text-text-muted text-xs mt-2">
          {hitCount} training hits
        </div>
      </div>

      {accuracy !== null && accuracy >= 0 && accPct < 60 && (
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
