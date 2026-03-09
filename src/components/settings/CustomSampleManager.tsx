/**
 * CustomSampleManager — record or import your own click samples.
 *
 * Features:
 * - Record from mic (tap start, tap stop, auto-trims silence)
 * - Import audio file (WAV, MP3, OGG, etc.)
 * - Name, preview, delete custom samples
 * - Samples stored as WAV blobs in IDB (customSamples store)
 * - Custom sample IDs prefixed with 'custom:' for the sound system
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as db from '../../store/db';
import type { CustomSampleRecord } from '../../store/db';
import { audioEngine } from '../../audio/engine';
import { registerCustomBuffer } from '../../audio/sounds';
import { HelpTip } from '../ui/HelpTip';

interface Props {
  /** Called when the list of custom samples changes (add/delete) */
  onSamplesChanged: () => void;
}

type Mode = 'list' | 'recording' | 'naming' | 'importing';

export function CustomSampleManager({ onSamplesChanged }: Props) {
  const [samples, setSamples] = useState<CustomSampleRecord[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [sampleName, setSampleName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Recording refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number>(0);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingDurationRef = useRef(0);
  const pendingBufferRef = useRef<AudioBuffer | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load samples on mount
  useEffect(() => {
    loadSamples();
  }, []);

  const loadSamples = async () => {
    try {
      const all = await db.getAllCustomSamples();
      setSamples(all);
    } catch { /* ignore */ }
  };

  // ─── Recording ───

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setRecordingDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: { ideal: 48000 }, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        chunksRef.current.push(copy);
      };

      // Duration timer
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(Date.now() - startTime);
      }, 100);

      setMode('recording');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone access denied');
      } else {
        setError('Failed to start recording');
      }
    }
  }, []);

  const stopRecording = useCallback(async () => {
    // Stop timer
    clearInterval(timerRef.current);

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const ctx = audioCtxRef.current;
    if (ctx) {
      await ctx.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // Merge chunks into single Float32Array
    const totalLength = chunksRef.current.reduce((s, c) => s + c.length, 0);
    if (totalLength < 480) { // Less than 10ms at 48kHz
      setError('Recording too short');
      setMode('list');
      return;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    // Auto-trim silence from start and end (threshold: 0.02)
    const trimmed = autoTrim(merged, 0.02);
    if (trimmed.length < 480) {
      setError('Only silence detected — try again louder');
      setMode('list');
      return;
    }

    // Cap at 2 seconds
    const maxSamples = 48000 * 2;
    const final = trimmed.length > maxSamples ? trimmed.slice(0, maxSamples) : trimmed;

    // Convert to WAV blob
    const blob = float32ToWav(final, 48000);
    pendingBlobRef.current = blob;
    pendingDurationRef.current = (final.length / 48000) * 1000;

    // Create AudioBuffer for immediate preview
    try {
      const previewCtx = new AudioContext({ sampleRate: 48000 });
      const buffer = previewCtx.createBuffer(1, final.length, 48000);
      buffer.getChannelData(0).set(final);
      pendingBufferRef.current = buffer;
      await previewCtx.close();
    } catch { /* preview not critical */ }

    setSampleName('');
    setMode('naming');
  }, []);

  const cancelRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    chunksRef.current = [];
    setMode('list');
  }, []);

  // ─── Import ───

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset

    setError(null);

    try {
      // Decode the audio file
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 48000 });
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();

      // Get mono channel, cap at 2 seconds
      const maxSamples = 48000 * 2;
      const channel = audioBuffer.getChannelData(0);
      const final = channel.length > maxSamples ? channel.slice(0, maxSamples) : channel;

      // Auto-trim
      const trimmed = autoTrim(final, 0.02);
      if (trimmed.length < 480) {
        setError('Audio file is silent or too short');
        return;
      }

      const blob = float32ToWav(trimmed, 48000);
      pendingBlobRef.current = blob;
      pendingDurationRef.current = (trimmed.length / 48000) * 1000;

      // AudioBuffer for preview
      const previewCtx = new AudioContext({ sampleRate: 48000 });
      const buffer = previewCtx.createBuffer(1, trimmed.length, 48000);
      buffer.getChannelData(0).set(trimmed);
      pendingBufferRef.current = buffer;
      await previewCtx.close();

      // Pre-fill name from filename
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      setSampleName(baseName.slice(0, 30));
      setMode('naming');
    } catch (err) {
      console.error('Import failed:', err);
      setError('Could not decode audio file — try WAV or MP3');
    }
  }, []);

  // ─── Save ───

  const saveSample = useCallback(async () => {
    const blob = pendingBlobRef.current;
    if (!blob || !sampleName.trim()) return;

    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: CustomSampleRecord = {
      id,
      name: sampleName.trim(),
      blob,
      durationMs: Math.round(pendingDurationRef.current),
      createdAt: new Date().toISOString(),
    };

    try {
      await db.putCustomSample(record);

      // Register buffer in sound cache for immediate use
      if (pendingBufferRef.current) {
        registerCustomBuffer(id, pendingBufferRef.current);
      }

      pendingBlobRef.current = null;
      pendingBufferRef.current = null;
      pendingDurationRef.current = 0;

      await loadSamples();
      onSamplesChanged();
      setMode('list');
    } catch (err) {
      setError('Failed to save sample');
    }
  }, [sampleName, onSamplesChanged]);

  // ─── Delete ───

  const deleteSample = useCallback(async (id: string) => {
    try {
      await db.deleteCustomSample(id);
      await loadSamples();
      onSamplesChanged();
    } catch {
      setError('Failed to delete sample');
    }
  }, [onSamplesChanged]);

  // ─── Preview ───

  const previewSample = useCallback((id: string) => {
    audioEngine.previewSound(id);
  }, []);

  const previewPending = useCallback(() => {
    if (!pendingBufferRef.current) return;
    try {
      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createBufferSource();
      source.buffer = pendingBufferRef.current;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => ctx.close().catch(() => {});
    } catch { /* ignore */ }
  }, []);

  // ─── Render ───

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">
          My Samples
        </p>
        <HelpTip text="Record hits from your own kit or import audio files. Custom samples appear in the click/accent sound picker. Max 2 seconds per sample." />
      </div>

      {error && (
        <div className="bg-danger-dim border border-danger/30 rounded-md p-2">
          <p className="text-danger text-xs">{error}</p>
        </div>
      )}

      {/* Sample list */}
      {mode === 'list' && (
        <>
          {samples.length > 0 && (
            <div className="space-y-1">
              {samples.map((s) => (
                <SampleRow
                  key={s.id}
                  sample={s}
                  onPreview={() => previewSample(s.id)}
                  onDelete={() => deleteSample(s.id)}
                />
              ))}
            </div>
          )}

          {samples.length === 0 && (
            <p className="text-[10px] text-text-muted py-1">
              No custom samples yet. Record from your kit or import a file.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={startRecording}
              className="flex-1 py-2.5 bg-bg-raised border border-border-subtle text-text-primary rounded-md text-xs min-h-[44px] hover:bg-border-subtle transition-colors flex items-center justify-center gap-1.5"
            >
              <div className="w-2 h-2 rounded-full bg-recording" />
              Record
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5 bg-bg-raised border border-border-subtle text-text-primary rounded-md text-xs min-h-[44px] hover:bg-border-subtle transition-colors"
            >
              Import File
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac"
            onChange={handleFileSelect}
            className="hidden"
          />
        </>
      )}

      {/* Recording state */}
      {mode === 'recording' && (
        <div className="flex flex-col items-center py-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-recording animate-pulse" />
            <span className="text-text-secondary text-sm">Recording…</span>
          </div>
          <span className="font-mono text-2xl text-text-primary">
            {(recordingDuration / 1000).toFixed(1)}s
          </span>
          <p className="text-[10px] text-text-muted">
            Play a single hit. Max 2 seconds — auto-trims silence.
          </p>
          <div className="flex gap-3">
            <button
              onClick={cancelRecording}
              className="px-4 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={stopRecording}
              className="px-6 py-2 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[44px]"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Naming state (after recording or import) */}
      {mode === 'naming' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary text-xs">
              {Math.round(pendingDurationRef.current)}ms captured
            </span>
            <button
              onClick={previewPending}
              className="text-xs text-accent min-h-[36px] px-2"
            >
              Preview
            </button>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Sample Name</label>
            <input
              type="text"
              value={sampleName}
              onChange={(e) => setSampleName(e.target.value.slice(0, 30))}
              placeholder="e.g. My Kick, Studio Snare"
              autoFocus
              className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                pendingBlobRef.current = null;
                pendingBufferRef.current = null;
                setMode('list');
              }}
              className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
            >
              Discard
            </button>
            <button
              onClick={saveSample}
              disabled={!sampleName.trim()}
              className={`flex-1 py-2 rounded-md text-xs font-medium min-h-[44px] ${
                sampleName.trim()
                  ? 'bg-accent text-bg-primary'
                  : 'bg-bg-raised text-text-muted cursor-not-allowed'
              }`}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function SampleRow({
  sample,
  onPreview,
  onDelete,
}: {
  sample: CustomSampleRecord;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 bg-bg-surface rounded-sm">
      <button
        onClick={onPreview}
        className="w-7 h-7 rounded-md bg-bg-raised flex items-center justify-center shrink-0 touch-manipulation"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-text-secondary">
          <polygon points="6 3 20 12 6 21" />
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-primary truncate block">{sample.name}</span>
        <span className="text-[9px] text-text-muted font-mono">{sample.durationMs}ms</span>
      </div>
      {showConfirm ? (
        <div className="flex gap-1">
          <button onClick={() => setShowConfirm(false)} className="text-text-muted text-[9px] min-h-[32px] px-1">
            Keep
          </button>
          <button onClick={onDelete} className="text-danger text-[9px] min-h-[32px] px-1">
            Delete
          </button>
        </div>
      ) : (
        <button onClick={() => setShowConfirm(true)} className="text-text-muted text-[10px] min-h-[32px] px-1">
          ×
        </button>
      )}
    </div>
  );
}

// ─── Utilities ───

/** Trim leading and trailing silence below threshold. */
function autoTrim(pcm: Float32Array, threshold: number): Float32Array {
  let start = 0;
  let end = pcm.length - 1;

  // Find first sample above threshold
  while (start < pcm.length && Math.abs(pcm[start]) < threshold) start++;
  // Find last sample above threshold
  while (end > start && Math.abs(pcm[end]) < threshold) end--;

  // Add a tiny pre-roll (1ms) to avoid cutting the transient
  start = Math.max(0, start - 48);
  // Add post-tail (20ms) for natural decay
  end = Math.min(pcm.length - 1, end + 960);

  return pcm.slice(start, end + 1);
}

/** Convert Float32Array to 16-bit mono WAV blob. */
function float32ToWav(pcm: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Normalize to -0.9 peak
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const abs = Math.abs(pcm[i]);
    if (abs > peak) peak = abs;
  }
  const scale = peak > 0 ? 0.9 / peak : 1;

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i] * scale;
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, Math.max(-32768, Math.min(32767, int16)), true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
