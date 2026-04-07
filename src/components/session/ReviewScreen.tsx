/**
 * ReviewScreen — Post-recording review before committing.
 *
 * Shown after analysis completes. Full-screen portal overlay.
 *
 * Flow:
 *   Record → Analyze → ReviewScreen → Save/Delete → View Details or Record Again
 *
 * Features:
 *   - Score hero + key metrics
 *   - Playback with/without click overlay (using your sound settings)
 *   - Save format picker (what to keep + what to download)
 *   - Delete / discard
 *   - Post-save routing
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { SessionAnalysis } from '../../analysis/types';
import { useSettingsStore } from '../../store/settings-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { MASTER_GAIN_MULTIPLIER } from '../../utils/constants';
import { useSessionStore } from '../../store/session-store';
import { VolumeState, VOLUME_GAINS } from '../../audio/types';
import * as db from '../../store/db';

/** Same perceptual curve as engine.ts */
function perceptualGain(vol: number): number {
  return vol * vol * MASTER_GAIN_MULTIPLIER;
}
const MIC_BOOST = 4.0;

interface Props {
  visible: boolean;
  sessionId: string;
  analysis: SessionAnalysis;
  /** Called when user chooses to view session detail */
  onViewDetails: () => void;
  /** Called when user chooses to record again */
  onRecordAgain: () => void;
  /** Called when user deletes the session */
  onDelete: () => void;
}

type SaveStep = 'review' | 'saving' | 'done';
type StorageChoice = 'raw' | 'compressed' | 'delete';
type DownloadChoice = 'none' | 'raw' | 'with-click' | 'both';

export function ReviewScreen({
  visible,
  sessionId,
  analysis,
  onViewDetails,
  onRecordAgain,
  onDelete,
}: Props) {
  const [step, setStep] = useState<SaveStep>('review');
  const [storageChoice, setStorageChoice] = useState<StorageChoice>('compressed');
  const [downloadChoice, setDownloadChoice] = useState<DownloadChoice>('none');

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [clickOn, setClickOn] = useState(true);
  const [clickVol, setClickVol] = useState(0.5);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const clickNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const clickGainRef = useRef<GainNode | null>(null);
  const recGainRef = useRef<GainNode | null>(null);
  const volUnsubRef = useRef<(() => void) | null>(null);
  const savedClickVolRef = useRef(0.5);

  // Settings
  const clickSoundId = useSettingsStore((s) => s.clickSound);
  const accentSoundId = useSettingsStore((s) => s.accentSound);
  const accentThreshold = useSettingsStore((s) => s.accentSoundThreshold);

  // Reset state when shown
  useEffect(() => {
    if (visible) {
      setStep('review');
      setStorageChoice('compressed');
      setDownloadChoice('none');
      setIsPlaying(false);
      audioBufferRef.current = null;
    }
  }, [visible, sessionId]);

  // Load audio buffer
  useEffect(() => {
    if (!visible || !sessionId) return;
    db.getRecording(sessionId).then(async (blob) => {
      if (!blob) return;
      try {
        const { audioEngine } = await import('../../audio/engine');
        const ctx = await audioEngine.initContext();
        const pcm = new Float32Array(await blob.arrayBuffer());
        const buf = ctx.createBuffer(1, pcm.length, 48000);
        buf.getChannelData(0).set(pcm);
        audioBufferRef.current = buf;
      } catch { /* */ }
    });
  }, [visible, sessionId]);

  // Cleanup on unmount / hide
  useEffect(() => {
    if (!visible) stopPlayback();
  }, [visible]);

  // ─── Playback ───

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    for (const n of clickNodesRef.current) {
      try { n.stop(); } catch {}
    }
    clickNodesRef.current = [];
    if (clickGainRef.current) {
      try { clickGainRef.current.disconnect(); } catch {}
      clickGainRef.current = null;
    }
    if (recGainRef.current) {
      try { recGainRef.current.disconnect(); } catch {}
      recGainRef.current = null;
    }
    volUnsubRef.current?.();
    volUnsubRef.current = null;
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!audioBufferRef.current) return;

    const { audioEngine } = await import('../../audio/engine');
    const { getBuffer } = await import('../../audio/sounds');
    const ctx = await audioEngine.initContext();

    // Play recording
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    const gain = ctx.createGain();
    const vol = useMetronomeStore.getState().volume;
    gain.gain.value = MIC_BOOST * perceptualGain(vol);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    sourceRef.current = source;
    recGainRef.current = gain;
    setIsPlaying(true);

    // Subscribe to volume changes during playback
    volUnsubRef.current?.();
    let prevVol = vol;
    volUnsubRef.current = useMetronomeStore.subscribe((state) => {
      if (state.volume !== prevVol) {
        prevVol = state.volume;
        if (recGainRef.current) {
          recGainRef.current.gain.value = MIC_BOOST * perceptualGain(state.volume);
        }
      }
    });

    source.onended = () => {
      setIsPlaying(false);
      sourceRef.current = null;
      for (const n of clickNodesRef.current) { try { n.stop(); } catch {} }
      clickNodesRef.current = [];
    };

    // Click overlay
    if (clickOn) {
      const durationS = analysis.durationMs / 1000;
      const bpm = analysis.bpm;
      const ioi = 60 / bpm;

      const clickBuf = getBuffer(clickSoundId) || getBuffer('woodblock');
      const accentBuf = getBuffer(accentSoundId) || clickBuf;

      if (clickBuf) {
        const clickGain = ctx.createGain();
        clickGain.gain.value = clickOn ? clickVol : 0;
        savedClickVolRef.current = clickVol;
        clickGain.connect(ctx.destination);
        clickGainRef.current = clickGain;

        const scheduled: AudioBufferSourceNode[] = [];
        let beatTime = 0;
        let beatIdx = 0;
        const meterNum = 4; // default

        while (beatTime < durationS) {
          const when = ctx.currentTime + beatTime;
          const isDownbeat = beatIdx % meterNum === 0;

          const volState = isDownbeat ? VolumeState.ACCENT : VolumeState.LOUD;
          const useAccent = volState >= accentThreshold;
          const buf = useAccent ? (accentBuf || clickBuf) : clickBuf;

          const cs = ctx.createBufferSource();
          cs.buffer = buf;
          const cg = ctx.createGain();
          cg.gain.value = VOLUME_GAINS[volState];
          cs.connect(cg);
          cg.connect(clickGain);
          cs.start(when);
          scheduled.push(cs);

          beatTime += ioi;
          beatIdx++;
        }
        clickNodesRef.current = scheduled;
      }
    }
  }, [isPlaying, stopPlayback, analysis, clickVol, clickSoundId, accentSoundId, accentThreshold]);

  // Mid-playback click toggle: mute/unmute gain node
  useEffect(() => {
    if (clickGainRef.current) {
      clickGainRef.current.gain.value = clickOn ? savedClickVolRef.current : 0;
    }
  }, [clickOn]);

  // Click volume slider: update gain in real-time
  useEffect(() => {
    savedClickVolRef.current = clickVol;
    if (clickGainRef.current && clickOn) {
      clickGainRef.current.gain.value = clickVol;
    }
  }, [clickVol, clickOn]);

  // ─── Save ───

  const handleSave = useCallback(async () => {
    setStep('saving');
    stopPlayback();

    try {
      const { getBuffer } = await import('../../audio/sounds');

      // Handle downloads FIRST — before compression modifies the stored blob
      if (downloadChoice !== 'none') {
        const blob = await db.getRecording(sessionId);
        if (blob) {
          const pcm = new Float32Array(await blob.arrayBuffer());
          // Downloads always use the original 48kHz data
          if (downloadChoice === 'raw' || downloadChoice === 'both') {
            downloadWav(pcm, 48000, analysis, false, getBuffer);
          }
          if (downloadChoice === 'with-click' || downloadChoice === 'both') {
            await downloadWithClick(pcm, analysis, clickSoundId, accentSoundId, accentThreshold, clickVol, getBuffer);
          }
        }
      }

      // Handle storage choice (may modify or delete the recording blob)
      if (storageChoice === 'compressed') {
        // Resample to 22kHz and re-save as raw Float32 (same format, fewer samples)
        const blob = await db.getRecording(sessionId);
        if (blob) {
          const pcm = new Float32Array(await blob.arrayBuffer());
          const ratio = 48000 / 22050;
          const outLen = Math.round(pcm.length / ratio);
          const resampled = new Float32Array(outLen);
          for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, pcm.length - 1);
            const frac = srcIdx - lo;
            resampled[i] = pcm[lo] * (1 - frac) + pcm[hi] * frac;
          }
          // Store as raw Float32 blob — same format as original, just downsampled
          const rawBlob = new Blob([resampled.buffer], { type: 'application/octet-stream' });
          await db.putRecording(sessionId, rawBlob);
          // Record the new sample rate on the session
          const sessions = await db.getAllSessions();
          const s = sessions.find((s) => s.id === sessionId);
          if (s) await db.putSession({ ...s, recordingSampleRate: 22050 });
        }
      } else if (storageChoice === 'delete') {
        await db.deleteRecording(sessionId);
        // Update session record
        const sessions = await db.getAllSessions();
        const s = sessions.find((s) => s.id === sessionId);
        if (s) await db.putSession({ ...s, hasRecording: false });
      }
      // 'raw' = keep as-is

      // Verify recording state and sync session record
      // (guards against stale store data or IDB upgrade edge cases)
      if (storageChoice !== 'delete') {
        const verifyBlob = await db.getRecording(sessionId);
        const recordingExists = !!verifyBlob && verifyBlob.size > 0;
        const sessions = await db.getAllSessions();
        const s = sessions.find((s) => s.id === sessionId);
        if (s && s.hasRecording !== recordingExists) {
          await db.putSession({ ...s, hasRecording: recordingExists });
        }
      }

      // Reload session store so View Details gets fresh data
      await useSessionStore.getState().loadFromDB();

      setStep('done');
    } catch (err) {
      console.error('Save failed:', err);
      setStep('done'); // Still show done so user isn't stuck
    }
  }, [sessionId, storageChoice, downloadChoice, analysis, clickSoundId, accentSoundId, accentThreshold, clickVol, stopPlayback]);

  // ─── Delete ───

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = useCallback(async () => {
    stopPlayback();
    try {
      await db.deleteRecording(sessionId);
      await db.deleteHitEvents(sessionId);
      await db.deleteSession(sessionId);
      onDelete();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [sessionId, stopPlayback, onDelete]);

  if (!visible) return null;

  const score = analysis.score;
  const sigma = analysis.sigma;
  const sigmaLevel = analysis.sigmaLevel;
  const scoreColor = score >= 85 ? '#4ADE80' : score >= 70 ? '#FBBF24' : '#F87171';
  const durationSec = Math.round(analysis.durationMs / 1000);
  const durationLabel = durationSec >= 60
    ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`
    : `${durationSec}s`;

  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-bg-primary flex flex-col" style={{ touchAction: 'none' }}>
      {/* Header */}
      <div className="px-4 py-3 text-center border-b border-border-subtle">
        <p className="text-xs text-text-muted">Session Complete</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {step === 'review' && (
          <>
            {/* Score hero */}
            <div className="flex flex-col items-center py-2">
              <span className="text-5xl font-bold font-mono" style={{ color: scoreColor }}>
                {Math.round(score)}%
              </span>
              <div className="mt-1.5 px-3 py-1 rounded-full flex items-center gap-1.5"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-mono text-text-secondary">σ {sigma.toFixed(1)}ms</span>
                <span className="text-xs text-text-muted">{sigmaLevel}</span>
              </div>
            </div>

            {/* Key metrics row */}
            <div className="flex items-center justify-center gap-5 text-center">
              <div>
                <p className="text-[10px] text-text-muted">BPM</p>
                <p className="text-xs font-mono font-semibold text-text-primary">{analysis.bpm}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted">Hits</p>
                <p className="text-xs font-mono font-semibold text-text-primary">{analysis.totalScored}/{analysis.totalExpected}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted">Duration</p>
                <p className="text-xs font-mono font-semibold text-text-primary">{durationLabel}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted">Hit Rate</p>
                <p className="text-xs font-mono font-semibold text-text-primary">{Math.round(analysis.hitRate * 100)}%</p>
              </div>
            </div>

            {/* Headlines */}
            {analysis.headlines.length > 0 && (
              <div className="space-y-1">
                {analysis.headlines.slice(0, 3).map((h, i) => (
                  <p key={i} className="text-xs text-text-secondary bg-bg-surface rounded-lg px-3 py-2 border border-border-subtle">
                    {h.text}
                  </p>
                ))}
              </div>
            )}

            {/* Playback */}
            <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 space-y-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlayback}
                  disabled={!audioBufferRef.current}
                  className={`w-[44px] h-[44px] rounded-lg flex items-center justify-center shrink-0 touch-manipulation
                    ${isPlaying ? 'bg-[rgba(255,255,255,0.12)] text-text-primary' : 'bg-bg-raised text-text-secondary'}
                    ${!audioBufferRef.current ? 'opacity-30' : ''}`}
                >
                  {isPlaying ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5" y="4" width="5" height="16" rx="1" />
                      <rect x="14" y="4" width="5" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="6 3 20 12 6 21" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => setClickOn(!clickOn)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] touch-manipulation transition-colors flex items-center gap-1.5 ${
                    clickOn ? 'bg-[rgba(255,255,255,0.12)] text-text-primary' : 'bg-bg-raised text-text-muted'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {clickOn && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                  </svg>
                  Click
                </button>

                {clickOn && (
                  <input
                    type="range" min="0" max="100"
                    value={Math.round(clickVol * 100)}
                    onChange={(e) => setClickVol(Number(e.target.value) / 100)}
                    className="flex-1 accent-white h-1 bg-bg-raised rounded-full appearance-none max-w-[100px]
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                      [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                )}
              </div>
            </div>

            {/* Save options */}
            <div className="space-y-3">
              {/* Storage */}
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">
                  Keep in App
                </label>
                <div className="flex gap-1">
                  {([
                    { v: 'raw' as StorageChoice, label: 'Raw Audio', desc: 'Full quality' },
                    { v: 'compressed' as StorageChoice, label: 'Compressed', desc: '~Half size' },
                    { v: 'delete' as StorageChoice, label: 'Score Only', desc: 'No audio' },
                  ]).map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setStorageChoice(opt.v)}
                      className={`flex-1 py-2 rounded-md text-[10px] min-h-[42px] transition-colors ${
                        storageChoice === opt.v
                          ? 'bg-[rgba(255,255,255,0.12)] text-text-primary border border-[rgba(255,255,255,0.15)]'
                          : 'bg-bg-raised text-text-muted border border-transparent'
                      }`}
                    >
                      {opt.label}
                      <span className="block text-[8px] text-text-muted mt-0.5">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Download */}
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">
                  Download WAV
                </label>
                <div className="flex gap-1">
                  {([
                    { v: 'none' as DownloadChoice, label: 'None' },
                    { v: 'raw' as DownloadChoice, label: 'Raw' },
                    { v: 'with-click' as DownloadChoice, label: 'With Click' },
                    { v: 'both' as DownloadChoice, label: 'Both' },
                  ]).map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setDownloadChoice(opt.v)}
                      className={`flex-1 py-2 rounded-md text-[10px] min-h-[38px] transition-colors ${
                        downloadChoice === opt.v
                          ? 'bg-[rgba(255,255,255,0.12)] text-text-primary border border-[rgba(255,255,255,0.15)]'
                          : 'bg-bg-raised text-text-muted border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              {showDeleteConfirm ? (
                <>
                  <button onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-3 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[48px]">
                    Cancel
                  </button>
                  <button onClick={handleDelete}
                    className="flex-1 py-3 bg-danger text-white rounded-md text-xs font-medium min-h-[48px]">
                    Delete Session
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-3 text-danger text-xs min-h-[48px]">
                    Delete
                  </button>
                  <button onClick={handleSave}
                    className="flex-1 py-3 bg-accent text-bg-primary rounded-md text-sm font-medium min-h-[48px]">
                    Save Session
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-text-secondary text-sm">Saving…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl">✓</div>
            <p className="text-text-primary text-sm font-medium">Session Saved</p>
            <p className="text-text-muted text-xs">
              {storageChoice === 'delete' ? 'Score saved, audio discarded'
                : storageChoice === 'compressed' ? 'Compressed audio saved'
                : 'Full quality audio saved'}
              {downloadChoice !== 'none' && ' · WAV downloaded'}
            </p>
            <div className="flex gap-3 w-full max-w-xs pt-2">
              <button onClick={onRecordAgain}
                className="flex-1 py-3 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[48px]">
                Record Again
              </button>
              <button onClick={onViewDetails}
                className="flex-1 py-3 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[48px]">
                View Details
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);

  let peak = 0;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
  const scale = peak > 0 ? 0.89 / peak : 1;

  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] * scale;
    v.setInt16(off, Math.max(-32768, Math.min(32767, s < 0 ? s * 0x8000 : s * 0x7FFF)), true);
    off += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadWav(
  pcm: Float32Array,
  sampleRate: number,
  analysis: SessionAnalysis,
  _withClick: boolean,
  _getBuffer: (id: string) => AudioBuffer | null,
) {
  // Boost same as playback
  const boosted = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) boosted[i] = pcm[i] * 4.0;

  const blob = encodeWav(boosted, sampleRate);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `polypro-${analysis.bpm}bpm-${dateStr}-raw.wav`);
}

async function downloadWithClick(
  pcm: Float32Array,
  analysis: SessionAnalysis,
  clickSoundId: string,
  accentSoundId: string,
  accentThreshold: number,
  clickVol: number,
  getBuffer: (id: string) => AudioBuffer | null,
) {
  const sampleRate = 48000;
  const totalSamples = pcm.length;
  const offline = new OfflineAudioContext(1, totalSamples, sampleRate);

  // Recording
  const recSource = offline.createBufferSource();
  const recBuf = offline.createBuffer(1, pcm.length, sampleRate);
  recBuf.getChannelData(0).set(pcm);
  recSource.buffer = recBuf;
  const recGain = offline.createGain();
  recGain.gain.value = 4.0;
  recSource.connect(recGain);
  recGain.connect(offline.destination);
  recSource.start(0);

  // Clicks
  const durationS = pcm.length / sampleRate;
  const bpm = analysis.bpm;
  const ioi = 60 / bpm;
  const meterNum = 4;

  const clickBuf = getBuffer(clickSoundId) || getBuffer('woodblock');
  const accentBuf = getBuffer(accentSoundId) || clickBuf;

  if (clickBuf) {
    const clickGain = offline.createGain();
    clickGain.gain.value = clickVol;
    clickGain.connect(offline.destination);

    let beatTime = 0;
    let beatIdx = 0;
    while (beatTime < durationS) {
      const isDownbeat = beatIdx % meterNum === 0;
      const volState = isDownbeat ? VolumeState.ACCENT : VolumeState.LOUD;
      const useAccent = volState >= accentThreshold;
      const buf = useAccent ? (accentBuf || clickBuf) : clickBuf;

      const cs = offline.createBufferSource();
      cs.buffer = buf;
      const cg = offline.createGain();
      cg.gain.value = VOLUME_GAINS[volState];
      cs.connect(cg);
      cg.connect(clickGain);
      cs.start(beatTime);

      beatTime += ioi;
      beatIdx++;
    }
  }

  const rendered = await offline.startRendering();
  const blob = encodeWav(rendered.getChannelData(0), sampleRate);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `polypro-${analysis.bpm}bpm-${dateStr}-with-click.wav`);
}
