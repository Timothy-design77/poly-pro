/**
 * CustomSampleManager — record or import your own click samples.
 *
 * Flow: record/import → trim and compress (SampleEditor) → name → save.
 * Samples are stored as WAV blobs in IndexedDB and registered for playback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../../store/db';
import type { CustomSampleRecord } from '../../store/db';
import { audioEngine } from '../../audio';
import { registerCustomBuffer, forgetCustomBuffer } from '../../audio/sounds';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { SampleRow } from './samples/SampleRow';
import { SampleEditor, type Quality } from './samples/SampleEditor';
import { useSampleCapture, MAX_SAMPLE_MS } from './samples/useSampleCapture';
import { detectContent, float32ToWav, resample } from './samples/sampleAudio';

interface Props {
  onSamplesChanged: () => void;
}

interface Draft {
  pcm: Float32Array; // 48 kHz
  trimStart: number; // 0–1
  trimEnd: number;
  quality: Quality;
  name: string;
}

function newDraft(pcm: Float32Array, name = ''): Draft {
  const { start, end } = detectContent(pcm, 0.015);
  return { pcm, trimStart: start, trimEnd: end, quality: 22050, name };
}

export function CustomSampleManager({ onSamplesChanged }: Props) {
  const [samples, setSamples] = useState<CustomSampleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const previewRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSamples = useCallback(async () => {
    try { setSamples(await db.getAllCustomSamples()); } catch { /* list stays as is */ }
  }, []);
  useEffect(() => { void loadSamples(); }, [loadSamples]);

  const capture = useSampleCapture((pcm) => setDraft(newDraft(pcm)), setError);
  useEffect(() => () => { void previewRef.current?.close().catch(() => {}); }, []);

  const trimmedPcm = draft ? draft.pcm.slice(Math.floor(draft.trimStart * draft.pcm.length), Math.floor(draft.trimEnd * draft.pcm.length)) : null;
  const trimmedDurationMs = trimmedPcm ? (trimmedPcm.length / 48000) * 1000 : 0;
  // 16-bit samples after resampling plus the 44-byte WAV header.
  const estimatedBytes = trimmedPcm && draft ? Math.round(trimmedPcm.length * (draft.quality / 48000)) * 2 + 44 : 0;

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('Choose an audio file under 20 MB. Only the first 4 seconds are used.'); return; }
    event.target.value = '';
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 48000 });
      let audioBuffer: AudioBuffer;
      try { audioBuffer = await ctx.decodeAudioData(arrayBuffer); } finally { await ctx.close(); }
      const channel = audioBuffer.getChannelData(0);
      const maxSamples = 48000 * 4; // edit at most 4 seconds
      const pcm = channel.length > maxSamples ? channel.slice(0, maxSamples) : new Float32Array(channel);
      setDraft(newDraft(pcm, file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').slice(0, 30)));
    } catch {
      setError('Could not read that file. Try a WAV or MP3.');
    }
  }, []);

  const previewTrimmed = useCallback(() => {
    if (!trimmedPcm || trimmedPcm.length < 10) return;
    try {
      void previewRef.current?.close().catch(() => {});
      const ctx = new AudioContext({ sampleRate: 48000 }); previewRef.current = ctx;
      const buffer = ctx.createBuffer(1, trimmedPcm.length, 48000);
      buffer.getChannelData(0).set(trimmedPcm);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => { if (previewRef.current === ctx) previewRef.current = null; if (ctx.state !== 'closed') void ctx.close().catch(() => {}); };
    } catch { /* preview is best effort */ }
  }, [trimmedPcm]);

  const saveSample = useCallback(async () => {
    if (!draft || !trimmedPcm || !draft.name.trim() || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    const resampled = resample(trimmedPcm, 48000, draft.quality);
    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: CustomSampleRecord = {
      id,
      name: draft.name.trim(),
      blob: float32ToWav(resampled, draft.quality),
      durationMs: Math.round((resampled.length / draft.quality) * 1000),
      createdAt: new Date().toISOString(),
    };
    try {
      await db.putCustomSample(record);
      // Register at 48 kHz for playback.
      const buf = new AudioBuffer({ numberOfChannels: 1, length: trimmedPcm.length, sampleRate: 48000 });
      buf.getChannelData(0).set(trimmedPcm);
      registerCustomBuffer(id, buf);
      setDraft(null);
      await loadSamples();
      onSamplesChanged();
    } catch {
      setError('Could not save the sample. Check available storage and try again.');
    } finally { savingRef.current = false; setSaving(false); }
  }, [draft, trimmedPcm, loadSamples, onSamplesChanged]);

  const deleteSample = useCallback(async (id: string) => {
    try {
      await db.deleteCustomSample(id);
      forgetCustomBuffer(id);
      await loadSamples();
      onSamplesChanged();
    } catch { setError('Could not delete the sample. Try again.'); }
  }, [loadSamples, onSamplesChanged]);

  const startRecording = () => { setError(null); void capture.start(); };

  return (
    <section aria-labelledby="custom-samples-heading" className="space-y-3">
      <div>
        <h3 id="custom-samples-heading" className="text-sm font-semibold text-text-primary">My samples</h3>
        <p className="ui-hint mt-0.5">Record one hit from your kit or import a file. Samples appear in the click and accent lists.</p>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {capture.state === 'preparing' && <p role="status" className="text-sm text-text-secondary">Preparing microphone…</p>}

      {capture.state === 'recording' && (
        <div className="rounded-xl bg-bg-primary p-4 text-center">
          <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold text-danger">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-recording" />Recording
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{(capture.elapsedMs / 1000).toFixed(1)} s</p>
          <p className="ui-hint mt-1">Play a single hit. Stops automatically at {MAX_SAMPLE_MS / 1000} seconds.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={capture.cancel}>Cancel</Button>
            <Button variant="primary" onClick={() => void capture.stop()}>Stop</Button>
          </div>
        </div>
      )}

      {draft && capture.state === 'idle' && (
        <SampleEditor
          pcm={draft.pcm}
          trimStart={draft.trimStart}
          trimEnd={draft.trimEnd}
          onTrimChange={(trimStart, trimEnd) => setDraft((current) => current && { ...current, trimStart, trimEnd })}
          quality={draft.quality}
          onQualityChange={(quality) => setDraft((current) => current && { ...current, quality })}
          name={draft.name}
          onNameChange={(name) => setDraft((current) => current && { ...current, name })}
          durationMs={trimmedDurationMs}
          estimatedBytes={estimatedBytes}
          saving={saving}
          onPreview={previewTrimmed}
          onDiscard={() => setDraft(null)}
          onSave={() => void saveSample()}
        />
      )}

      {!draft && capture.state === 'idle' && (
        <>
          {samples.length > 0
            ? <div className="ui-rows">{samples.map((sample) => (
              <SampleRow key={sample.id} sample={sample} onPreview={() => audioEngine.previewSound(sample.id)} onDelete={() => void deleteSample(sample.id)} />
            ))}</div>
            : <p className="text-sm text-text-muted">No samples yet.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={startRecording}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-recording" />Record
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Import file</Button>
          </div>
          <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac" onChange={handleFileSelect} className="hidden" />
        </>
      )}
    </section>
  );
}
