/**
 * InstrumentTrainingPage — Full-screen training UI (Phase 8)
 *
 * Flow:
 * 1. User selects instrument to train
 * 2. Taps "Train <instrument>"
 * 3. Plays 20+ hits of that instrument
 * 4. App detects onsets, extracts features
 * 5. Features saved to instrument profile
 * 6. Cross-validation accuracy shown
 *
 * Quick retrain: 5 hits to update existing model.
 */

import { useState, useCallback, useRef } from 'react';
import { useInstrumentStore } from '../store/instrument-store';
import type { InstrumentName } from '../analysis/classification';
import { useTrainingCapture } from '../hooks/useTrainingCapture';
import { ScreenDialog } from '../components/ui/Dialog';
import { Notice } from '../components/ui/Notice';
import { Spinner } from '../components/ui/Progress';
import { InstrumentGrid, TrainingDone, TrainingRecording } from '../components/training/TrainingViews';

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

  const recording = trainingState === 'recording';
  return (
    <ScreenDialog
      title="Instrument training"
      backLabel={recording ? 'Cancel' : 'Back'}
      onEscape={() => { capture.stop(); onClose(); }}
      onBack={() => { capture.stop(); if (recording) handleCancel(); else onClose(); }}
    >
      <div className="screen-body">
        <div className="screen-content min-h-full space-y-4">
          {error && <Notice tone="danger">{error}</Notice>}
          {capture.preparing && <p role="status" className="text-sm text-text-secondary">Preparing microphone…</p>}
          {trainingState === 'select' && !capture.preparing && (
            <InstrumentGrid
              profiles={profiles}
              selected={selectedInstrument}
              onSelect={(name, quick) => { setSelectedInstrument(name); setIsQuickRetrain(quick); }}
              onDelete={(name) => void handleDeleteProfile(name)}
              onStart={() => void startRecording()}
            />
          )}
          {recording && selectedInstrument && (
            <TrainingRecording instrument={selectedInstrument} hitCount={capture.hitCount} minHits={minHits} quick={isQuickRetrain} onFinish={() => void finishTraining()} onCancel={handleCancel} />
          )}
          {trainingState === 'processing' && <div className="py-16"><Spinner label="Saving training…" /></div>}
          {trainingState === 'done' && selectedInstrument && (
            <TrainingDone
              instrument={selectedInstrument}
              accuracy={accuracy}
              hitCount={hitCount}
              onTrainAnother={() => { setTrainingState('select'); setSelectedInstrument(null); setHitCount(0); setAccuracy(null); }}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </ScreenDialog>
  );
}
