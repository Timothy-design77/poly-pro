/**
 * CustomSampleManager — record or import your own click samples.
 *
 * Flow: record/import → trim & compress editor → name → save
 *
 * Editor features:
 * - Canvas waveform with draggable trim handles
 * - Preview trimmed region
 * - Quality picker (48kHz / 22kHz / 11kHz) for compression
 * - Estimated file size display
 * - Samples stored as WAV blobs in IDB
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as db from '../../store/db';
import type { CustomSampleRecord } from '../../store/db';
import { audioEngine } from '../../audio/engine';
import { registerCustomBuffer } from '../../audio/sounds';
import { HelpTip } from '../ui/HelpTip';

interface Props {
  onSamplesChanged: () => void;
}

type Mode = 'list' | 'recording' | 'editing';

type Quality = 48000 | 22050 | 11025;
const QUALITY_OPTIONS: { rate: Quality; label: string; desc: string }[] = [
  { rate: 48000, label: 'High', desc: '48kHz' },
  { rate: 22050, label: 'Normal', desc: '22kHz' },
  { rate: 11025, label: 'Small', desc: '11kHz' },
];

export function CustomSampleManager({ onSamplesChanged }: Props) {
  const [samples, setSamples] = useState<CustomSampleRecord[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Recording refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number>(0);

  // Editor state — raw PCM at 48kHz, trimmed before save
  const [rawPcm, setRawPcm] = useState<Float32Array | null>(null);
  const [trimStart, setTrimStart] = useState(0); // 0–1 fraction
  const [trimEnd, setTrimEnd] = useState(1);     // 0–1 fraction
  const [quality, setQuality] = useState<Quality>(22050);
  const [sampleName, setSampleName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSamples(); }, []);

  const loadSamples = async () => {
    try { setSamples(await db.getAllCustomSamples()); } catch { /* */ }
  };

  // ─── Derived values ───

  const trimmedPcm = rawPcm
    ? rawPcm.slice(
        Math.floor(trimStart * rawPcm.length),
        Math.floor(trimEnd * rawPcm.length),
      )
    : null;

  const trimmedDurationMs = trimmedPcm ? (trimmedPcm.length / 48000) * 1000 : 0;

  // Estimate file size after resampling: samples × 2 bytes (16-bit) + 44 header
  const estimatedSamples = trimmedPcm
    ? Math.round(trimmedPcm.length * (quality / 48000))
    : 0;
  const estimatedBytes = estimatedSamples * 2 + 44;

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

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // Merge chunks
    const totalLen = chunksRef.current.reduce((s, c) => s + c.length, 0);
    if (totalLen < 480) {
      setError('Recording too short');
      setMode('list');
      return;
    }

    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const chunk of chunksRef.current) { merged.set(chunk, off); off += chunk.length; }
    chunksRef.current = [];

    // Auto-detect content region for initial trim handles
    const { start, end } = detectContent(merged, 0.015);
    setRawPcm(merged);
    setTrimStart(start);
    setTrimEnd(end);
    setQuality(22050);
    setSampleName('');
    setMode('editing');
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
    e.target.value = '';
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 48000 });
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();

      const channel = audioBuffer.getChannelData(0);
      // Cap at 4 seconds for editing (user trims down)
      const maxSamples = 48000 * 4;
      const pcm = channel.length > maxSamples ? channel.slice(0, maxSamples) : new Float32Array(channel);

      const { start, end } = detectContent(pcm, 0.015);
      setRawPcm(pcm);
      setTrimStart(start);
      setTrimEnd(end);
      setQuality(22050);

      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      setSampleName(baseName.slice(0, 30));
      setMode('editing');
    } catch {
      setError('Could not decode audio file — try WAV or MP3');
    }
  }, []);

  // ─── Preview ───

  const previewTrimmed = useCallback(() => {
    if (!trimmedPcm || trimmedPcm.length < 10) return;
    try {
      const ctx = new AudioContext({ sampleRate: 48000 });
      const buffer = ctx.createBuffer(1, trimmedPcm.length, 48000);
      buffer.getChannelData(0).set(trimmedPcm);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => ctx.close().catch(() => {});
    } catch { /* */ }
  }, [trimmedPcm]);

  // ─── Save ───

  const saveSample = useCallback(async () => {
    if (!trimmedPcm || !sampleName.trim()) return;

    // Resample to target quality
    const resampled = resample(trimmedPcm, 48000, quality);

    // Encode to WAV
    const blob = float32ToWav(resampled, quality);

    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: CustomSampleRecord = {
      id,
      name: sampleName.trim(),
      blob,
      durationMs: Math.round((resampled.length / quality) * 1000),
      createdAt: new Date().toISOString(),
    };

    try {
      await db.putCustomSample(record);

      // Register at 48kHz for playback
      const previewCtx = new AudioContext({ sampleRate: 48000 });
      const buf = previewCtx.createBuffer(1, trimmedPcm.length, 48000);
      buf.getChannelData(0).set(trimmedPcm);
      registerCustomBuffer(id, buf);
      await previewCtx.close();

      setRawPcm(null);
      await loadSamples();
      onSamplesChanged();
      setMode('list');
    } catch {
      setError('Failed to save sample');
    }
  }, [trimmedPcm, sampleName, quality, onSamplesChanged]);

  // ─── Delete ───

  const deleteSample = useCallback(async (id: string) => {
    try {
      await db.deleteCustomSample(id);
      await loadSamples();
      onSamplesChanged();
    } catch { setError('Failed to delete'); }
  }, [onSamplesChanged]);

  // ─── Render ───

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">
          My Samples
        </p>
        <HelpTip text="Record from your kit or import audio files. Trim tight and compress to keep samples small. Custom samples appear in the click/accent picker." />
      </div>

      {error && (
        <div className="bg-danger-dim border border-danger/30 rounded-md p-2">
          <p className="text-danger text-xs">{error}</p>
        </div>
      )}

      {/* ─── List ─── */}
      {mode === 'list' && (
        <>
          {samples.length > 0 && (
            <div className="space-y-1">
              {samples.map((s) => (
                <SampleRow
                  key={s.id}
                  sample={s}
                  onPreview={() => audioEngine.previewSound(s.id)}
                  onDelete={() => deleteSample(s.id)}
                />
              ))}
            </div>
          )}
          {samples.length === 0 && (
            <p className="text-[10px] text-text-muted py-1">
              No custom samples yet.
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

      {/* ─── Recording ─── */}
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
            Play a single hit. You'll trim it next.
          </p>
          <div className="flex gap-3">
            <button onClick={cancelRecording}
              className="px-4 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]">
              Cancel
            </button>
            <button onClick={stopRecording}
              className="px-6 py-2 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[44px]">
              Stop
            </button>
          </div>
        </div>
      )}

      {/* ─── Editor ─── */}
      {mode === 'editing' && rawPcm && (
        <div className="space-y-3">
          {/* Waveform trimmer */}
          <WaveformTrimmer
            pcm={rawPcm}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
          />

          {/* Trim info + preview */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted font-mono">
              {trimmedDurationMs.toFixed(0)}ms · ~{formatBytes(estimatedBytes)}
            </span>
            <button onClick={previewTrimmed}
              className="text-xs text-accent min-h-[36px] px-2 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21" />
              </svg>
              Preview
            </button>
          </div>

          {/* Quality picker */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">
              Quality
            </label>
            <div className="flex gap-1">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.rate}
                  onClick={() => setQuality(opt.rate)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] min-h-[36px] transition-colors ${
                    quality === opt.rate
                      ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                      : 'bg-bg-raised text-text-muted'
                  }`}
                >
                  {opt.label}
                  <span className="block text-[8px] text-text-muted">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Name</label>
            <input
              type="text"
              value={sampleName}
              onChange={(e) => setSampleName(e.target.value.slice(0, 30))}
              placeholder="e.g. My Kick, Studio Snare"
              autoFocus
              className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => { setRawPcm(null); setMode('list'); }}
              className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
            >
              Discard
            </button>
            <button
              onClick={saveSample}
              disabled={!sampleName.trim() || trimmedDurationMs < 5}
              className={`flex-1 py-2 rounded-md text-xs font-medium min-h-[44px] ${
                sampleName.trim() && trimmedDurationMs >= 5
                  ? 'bg-accent text-bg-primary'
                  : 'bg-bg-raised text-text-muted cursor-not-allowed'
              }`}
            >
              Save ({formatBytes(estimatedBytes)})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WaveformTrimmer — canvas waveform with draggable start/end
// ═══════════════════════════════════════════════════════════════

function WaveformTrimmer({
  pcm,
  trimStart,
  trimEnd,
  onTrimChange,
}: {
  pcm: Float32Array;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const draggingRef = useRef<'start' | 'end' | null>(null);

  const HEIGHT = 80;
  const HANDLE_W = 12;

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1A1A1E';
    ctx.fillRect(0, 0, width, HEIGHT);

    // Downsample waveform for display
    const bins = width;
    const samplesPerBin = Math.max(1, Math.floor(pcm.length / bins));

    for (let i = 0; i < bins; i++) {
      const start = i * samplesPerBin;
      let maxAbs = 0;
      for (let j = start; j < start + samplesPerBin && j < pcm.length; j++) {
        const abs = Math.abs(pcm[j]);
        if (abs > maxAbs) maxAbs = abs;
      }
      const h = maxAbs * (HEIGHT - 8);
      const frac = i / bins;
      const inTrim = frac >= trimStart && frac <= trimEnd;

      ctx.fillStyle = inTrim ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(i, (HEIGHT - h) / 2, 1, Math.max(1, h));
    }

    // Dim overlay outside trim
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, trimStart * width, HEIGHT);
    ctx.fillRect(trimEnd * width, 0, (1 - trimEnd) * width, HEIGHT);

    // Trim handles
    const drawHandle = (x: number) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(x - 1.5, 0, 3, HEIGHT);
      ctx.fillStyle = '#0C0C0E';
      for (let y = HEIGHT * 0.3; y < HEIGHT * 0.7; y += 8) {
        ctx.fillRect(x - 0.5, y, 1, 3);
      }
    };
    drawHandle(trimStart * width);
    drawHandle(trimEnd * width);

  }, [pcm, width, trimStart, trimEnd]);

  // Pointer drag handling
  const getHandleFromX = useCallback((clientX: number): 'start' | 'end' | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (clientX - rect.left) / rect.width;
    const distStart = Math.abs(x - trimStart);
    const distEnd = Math.abs(x - trimEnd);
    const threshold = HANDLE_W / width;
    if (distStart < threshold && distStart <= distEnd) return 'start';
    if (distEnd < threshold) return 'end';
    if (x > trimStart && x < trimEnd) {
      return distStart < distEnd ? 'start' : 'end';
    }
    return x < trimStart ? 'start' : 'end';
  }, [trimStart, trimEnd, width]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const handle = getHandleFromX(e.clientX);
    if (handle) {
      draggingRef.current = handle;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [getHandleFromX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    let frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    const minFrac = (48000 * 0.005) / pcm.length; // 5ms minimum

    if (draggingRef.current === 'start') {
      frac = Math.min(frac, trimEnd - minFrac);
      onTrimChange(Math.max(0, frac), trimEnd);
    } else {
      frac = Math.max(frac, trimStart + minFrac);
      onTrimChange(trimStart, Math.min(1, frac));
    }
  }, [pcm.length, trimStart, trimEnd, onTrimChange]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div ref={containerRef} className="rounded-md overflow-hidden border border-border-subtle">
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT, touchAction: 'none' }}
        className="block cursor-col-resize"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SampleRow
// ═══════════════════════════════════════════════════════════════

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
        <span className="text-[9px] text-text-muted font-mono">
          {sample.durationMs}ms · {formatBytes(sample.blob.size)}
        </span>
      </div>
      {showConfirm ? (
        <div className="flex gap-1">
          <button onClick={() => setShowConfirm(false)} className="text-text-muted text-[9px] min-h-[32px] px-1">Keep</button>
          <button onClick={onDelete} className="text-danger text-[9px] min-h-[32px] px-1">Delete</button>
        </div>
      ) : (
        <button onClick={() => setShowConfirm(true)} className="text-text-muted text-[10px] min-h-[32px] px-1">×</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

/** Detect content boundaries above threshold. Returns 0–1 fractions. */
function detectContent(pcm: Float32Array, threshold: number): { start: number; end: number } {
  let s = 0;
  let e = pcm.length - 1;
  while (s < pcm.length && Math.abs(pcm[s]) < threshold) s++;
  while (e > s && Math.abs(pcm[e]) < threshold) e--;
  // Pre-roll 1ms, post-tail 10ms
  s = Math.max(0, s - 48);
  e = Math.min(pcm.length - 1, e + 480);
  return { start: s / pcm.length, end: (e + 1) / pcm.length };
}

/** Linear interpolation resample. */
function resample(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const outLen = Math.round(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, pcm.length - 1);
    const frac = srcIdx - lo;
    out[i] = pcm[lo] * (1 - frac) + pcm[hi] * frac;
  }
  return out;
}

/** Encode Float32Array to 16-bit mono WAV blob, normalized to -0.9dB. */
function float32ToWav(pcm: Float32Array, sampleRate: number): Blob {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const abs = Math.abs(pcm[i]);
    if (abs > peak) peak = abs;
  }
  const scale = peak > 0 ? 0.9 / peak : 1;

  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] * scale;
    v.setInt16(off, Math.max(-32768, Math.min(32767, s < 0 ? s * 0x8000 : s * 0x7FFF)), true);
    off += 2;
  }

  return new Blob([buf], { type: 'audio/wav' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
