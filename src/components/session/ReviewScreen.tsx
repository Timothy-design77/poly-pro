import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionAnalysis } from '../../analysis/types';
import type { SessionRecord } from '../../store/db';
import { useSettingsStore } from '../../store/settings-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { useSessionStore } from '../../store/session-store';
import { VOLUME_GAINS } from '../../audio/types';
import { createPlaybackLimiter, recordingPlaybackGain } from '../../audio/recording-playback';
import { forEachClickBeat } from './timeline/timeline-shared';
import * as db from '../../store/db';

interface Props {
  visible: boolean;
  sessionId: string;
  analysis: SessionAnalysis;
  onViewDetails: () => void;
  onRecordAgain: () => void;
  onDelete: () => void;
}

type SaveStep = 'review' | 'saving' | 'done' | 'error';
type StorageChoice = 'raw' | 'delete';
type DownloadChoice = 'none' | 'raw' | 'with-click' | 'both';

export function ReviewScreen({ visible, sessionId, analysis, onViewDetails, onRecordAgain, onDelete }: Props) {
  const [step, setStep] = useState<SaveStep>('review');
  const [storageChoice, setStorageChoice] = useState<StorageChoice>('raw');
  const [downloadChoice, setDownloadChoice] = useState<DownloadChoice>('none');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clickOn, setClickOn] = useState(true);
  const [clickVol, setClickVol] = useState(0.5);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const clickNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const clickGainRef = useRef<GainNode | null>(null);
  const recGainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const volUnsubRef = useRef<(() => void) | null>(null);
  const savedClickVolRef = useRef(0.5);

  const session = useSessionStore((state) => state.sessions.find((item) => item.id === sessionId) ?? null);
  const clickSoundId = useSettingsStore((state) => state.clickSound);
  const accentSoundId = useSettingsStore((state) => state.accentSound);
  const accentThreshold = useSettingsStore((state) => state.accentSoundThreshold);
  const latencyOffsetMs = useSettingsStore((state) => state.calibratedOffset + state.manualAdjustment);

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    for (const node of clickNodesRef.current) {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    clickNodesRef.current = [];
    if (clickGainRef.current) { try { clickGainRef.current.disconnect(); } catch {} clickGainRef.current = null; }
    if (recGainRef.current) { try { recGainRef.current.disconnect(); } catch {} recGainRef.current = null; }
    if (limiterRef.current) { try { limiterRef.current.disconnect(); } catch {} limiterRef.current = null; }
    volUnsubRef.current?.();
    volUnsubRef.current = null;
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      stopPlayback();
      return;
    }
    setStep('review');
    setStorageChoice('raw');
    setDownloadChoice('none');
    setSaveError(null);
    setShowDeleteConfirm(false);
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      stopPlayback();
      previousFocusRef.current?.focus();
    };
  }, [visible, sessionId, stopPlayback]);

  useEffect(() => {
    if (!visible || !session) return;
    let cancelled = false;
    setAudioReady(false);
    audioBufferRef.current = null;
    (async () => {
      try {
        const blob = await db.getRecording(sessionId);
        if (!blob || cancelled) return;
        const { audioEngine } = await import('../../audio');
        const ctx = await audioEngine.initContext();
        const arrayBuffer = await blob.arrayBuffer();
        let buffer: AudioBuffer;
        if (blob.type.startsWith('audio/')) {
          buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        } else {
          const pcm = new Float32Array(arrayBuffer);
          const sampleRate = session.recordingSampleRate ?? 48000;
          buffer = ctx.createBuffer(1, pcm.length, sampleRate);
          buffer.getChannelData(0).set(pcm);
        }
        if (!cancelled) {
          audioBufferRef.current = buffer;
          setAudioReady(true);
        }
      } catch (error) {
        console.error('Review audio load failed:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, sessionId, session]);

  useEffect(() => {
    if (clickGainRef.current) clickGainRef.current.gain.value = clickOn ? savedClickVolRef.current : 0;
  }, [clickOn]);

  useEffect(() => {
    savedClickVolRef.current = clickVol;
    if (clickGainRef.current && clickOn) clickGainRef.current.gain.value = clickVol;
  }, [clickVol, clickOn]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (!audioBufferRef.current || !session) return;

    const { audioEngine } = await import('../../audio');
    const { getBuffer } = await import('../../audio/sounds');
    const ctx = await audioEngine.initContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    const gain = ctx.createGain();
    const limiter = createPlaybackLimiter(ctx);
    const volume = useMetronomeStore.getState().volume;
    gain.gain.value = recordingPlaybackGain(volume);
    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(ctx.destination);
    sourceRef.current = source;
    recGainRef.current = gain;
    limiterRef.current = limiter;

    if (clickOn) {
      const clickBuffer = getBuffer(clickSoundId) || getBuffer('woodblock');
      const accentBuffer = getBuffer(accentSoundId) || clickBuffer;
      if (clickBuffer) {
        const clickGain = ctx.createGain();
        clickGain.gain.value = clickVol;
        savedClickVolRef.current = clickVol;
        clickGain.connect(limiter);
        clickGainRef.current = clickGain;
        const scheduled: AudioBufferSourceNode[] = [];
        forEachClickBeat(session, latencyOffsetMs / 1000, ({ adjustedBeatTime, volState }) => {
          if (adjustedBeatTime < 0 || adjustedBeatTime >= audioBufferRef.current!.duration) return;
          const buffer = volState >= accentThreshold ? (accentBuffer || clickBuffer) : clickBuffer;
          const clickSource = ctx.createBufferSource();
          clickSource.buffer = buffer;
          const clickNodeGain = ctx.createGain();
          clickNodeGain.gain.value = VOLUME_GAINS[volState];
          clickSource.connect(clickNodeGain);
          clickNodeGain.connect(clickGain);
          clickSource.start(ctx.currentTime + adjustedBeatTime);
          scheduled.push(clickSource);
        }, analysis.gridBeats);
        clickNodesRef.current = scheduled;
      }
    }

    source.onended = () => stopPlayback();
    source.start();
    setIsPlaying(true);

    volUnsubRef.current?.();
    let previousVolume = volume;
    volUnsubRef.current = useMetronomeStore.subscribe((state) => {
      if (state.volume === previousVolume) return;
      previousVolume = state.volume;
      if (recGainRef.current) recGainRef.current.gain.value = recordingPlaybackGain(state.volume);
    });
  }, [isPlaying, stopPlayback, session, clickOn, clickVol, clickSoundId, accentSoundId, accentThreshold, latencyOffsetMs, analysis.gridBeats]);

  const handleSave = useCallback(async () => {
    if (!session) return;
    setStep('saving');
    setSaveError(null);
    stopPlayback();
    try {
      if (downloadChoice !== 'none') {
        if (!audioBufferRef.current) throw new Error('Recording audio is not ready for export.');
        if (downloadChoice === 'raw' || downloadChoice === 'both') {
          downloadAudioBuffer(audioBufferRef.current, session, false);
        }
        if (downloadChoice === 'with-click' || downloadChoice === 'both') {
          const rendered = await renderWithClick(
            audioBufferRef.current,
            session,
            analysis,
            clickSoundId,
            accentSoundId,
            accentThreshold,
            clickVol,
            latencyOffsetMs,
          );
          downloadAudioBuffer(rendered, session, true);
        }
      }

      if (storageChoice === 'delete') {
        await db.deleteRecording(sessionId);
        await useSessionStore.getState().updateSession(sessionId, { hasRecording: false });
      }
      await useSessionStore.getState().loadFromDB();
      setStep('done');
    } catch (error) {
      console.error('Review save failed:', error);
      setSaveError(error instanceof Error ? error.message : 'Saving failed');
      setStep('error');
    }
  }, [session, sessionId, storageChoice, downloadChoice, analysis, clickSoundId, accentSoundId, accentThreshold, clickVol, latencyOffsetMs, stopPlayback]);

  const handleDelete = useCallback(async () => {
    stopPlayback();
    try {
      await useSessionStore.getState().deleteSession(sessionId);
      onDelete();
    } catch (error) {
      console.error('Delete failed:', error);
      setSaveError(error instanceof Error ? error.message : 'Delete failed');
    }
  }, [sessionId, stopPlayback, onDelete]);

  if (!visible) return null;

  const scoreColor = analysis.score >= 85 ? '#4ADE80' : analysis.score >= 70 ? '#FBBF24' : '#F87171';
  const durationSec = Math.round(analysis.durationMs / 1000);
  const durationLabel = durationSec >= 60 ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : `${durationSec}s`;

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-no-swipe className="fixed inset-0 z-[9998] bg-bg-primary flex flex-col animate-sheet-up outline-none">
      <div className="px-4 py-3 text-center border-b border-border-subtle">
        <p id={titleId} className="text-xs text-text-muted">Session Complete</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {step === 'review' && (
          <>
            <div className="flex flex-col items-center py-2">
              <span className="text-5xl font-bold font-mono" style={{ color: scoreColor }}>{Math.round(analysis.score)}%</span>
              <div className="mt-1.5 px-3 py-1 rounded-full bg-bg-surface"><span className="text-xs font-mono text-text-secondary">σ {analysis.sigma.toFixed(1)}ms · {analysis.sigmaLevel}</span></div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <Metric label="BPM" value={String(analysis.bpm)} />
              <Metric label="Hits" value={`${analysis.totalScored}/${analysis.totalExpected}`} />
              <Metric label="Duration" value={durationLabel} />
              <Metric label="Hit Rate" value={`${Math.round(analysis.hitRate * 100)}%`} />
            </div>

            {analysis.headlines.slice(0, 3).map((headline, index) => (
              <p key={index} className="text-xs text-text-secondary bg-bg-surface rounded-lg px-3 py-2 border border-border-subtle">{headline.text}</p>
            ))}

            <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 space-y-2">
              <div className="flex items-center gap-3">
                <button type="button" aria-label={isPlaying ? 'Pause recording playback' : 'Play recording'} onClick={() => void togglePlayback()} disabled={!audioReady} className="w-[44px] h-[44px] rounded-lg bg-bg-raised text-text-primary disabled:opacity-30">{isPlaying ? 'Ⅱ' : '▶'}</button>
                <button type="button" aria-pressed={clickOn} onClick={() => setClickOn(!clickOn)} className={`px-3 min-h-[38px] rounded-lg text-xs ${clickOn ? 'bg-accent-dim text-text-primary' : 'bg-bg-raised text-text-muted'}`}>Click overlay</button>
                {clickOn && <input aria-label="Click overlay volume" type="range" min="0" max="100" value={Math.round(clickVol * 100)} onChange={(event) => setClickVol(Number(event.target.value) / 100)} className="flex-1 max-w-[120px]" />}
              </div>
              <p className="text-[10px] text-text-muted">Playback uses the stored recording sample rate, persisted beat grid, and bounded limiter-protected gain.</p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Keep in App</p>
                <div className="grid grid-cols-2 gap-2">
                  <Choice selected={storageChoice === 'raw'} onClick={() => setStorageChoice('raw')} label="Raw Audio" description="Original durable recording" />
                  <Choice selected={storageChoice === 'delete'} onClick={() => setStorageChoice('delete')} label="Score Only" description="Delete recording audio" />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Download WAV</p>
                <div className="grid grid-cols-4 gap-1">
                  {(['none', 'raw', 'with-click', 'both'] as DownloadChoice[]).map((choice) => (
                    <button type="button" key={choice} onClick={() => setDownloadChoice(choice)} className={`min-h-[38px] rounded-md text-[10px] border ${downloadChoice === choice ? 'bg-accent-dim border-accent/30 text-text-primary' : 'bg-bg-raised border-transparent text-text-muted'}`}>{choice === 'with-click' ? 'Click' : choice === 'both' ? 'Both' : choice[0].toUpperCase() + choice.slice(1)}</button>
                  ))}
                </div>
              </div>
            </div>

            {saveError && <p role="alert" className="text-xs text-danger">{saveError}</p>}
            <div className="flex gap-2 pt-1">
              {showDeleteConfirm ? (
                <>
                  <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 min-h-[48px] border border-border-subtle text-text-secondary rounded-md text-xs">Cancel</button>
                  <button type="button" onClick={() => void handleDelete()} className="flex-1 min-h-[48px] bg-danger text-white rounded-md text-xs font-medium">Delete Session</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)} className="px-4 min-h-[48px] text-danger text-xs">Delete</button>
                  <button type="button" onClick={() => void handleSave()} className="flex-1 min-h-[48px] bg-accent text-bg-primary rounded-md text-sm font-medium">Continue</button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'saving' && <div className="flex flex-col items-center justify-center h-64 gap-3" role="status"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /><p className="text-text-secondary text-sm">Finalizing…</p></div>}

        {step === 'error' && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <p className="text-danger text-sm font-semibold">Could not finish the requested save/export</p>
            <p role="alert" className="text-text-secondary text-xs max-w-sm">{saveError}</p>
            <button type="button" onClick={() => setStep('review')} className="min-h-[44px] px-5 rounded-lg border border-border-subtle text-sm text-text-primary">Back to Review</button>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl" aria-hidden="true">✓</div>
            <p className="text-text-primary text-sm font-medium">Session Ready</p>
            <p className="text-text-muted text-xs">{storageChoice === 'delete' ? 'Score kept; recording audio deleted' : 'Original recording retained'}{downloadChoice !== 'none' && ' · WAV downloaded'}</p>
            <div className="flex gap-3 w-full max-w-xs pt-2">
              <button type="button" onClick={onRecordAgain} className="flex-1 min-h-[48px] border border-border-subtle text-text-secondary rounded-md text-xs">Record Again</button>
              <button type="button" onClick={onViewDetails} className="flex-1 min-h-[48px] bg-accent text-bg-primary rounded-md text-xs font-medium">View Details</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] text-text-muted">{label}</p><p className="text-xs font-mono font-semibold text-text-primary">{value}</p></div>;
}

function Choice({ selected, onClick, label, description }: { selected: boolean; onClick: () => void; label: string; description: string }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-[52px] rounded-lg border p-2 text-left ${selected ? 'bg-accent-dim border-accent/30' : 'bg-bg-raised border-transparent'}`}><span className="block text-xs font-semibold text-text-primary">{label}</span><span className="block text-[9px] text-text-muted mt-0.5">{description}</span></button>;
}

function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, dataSize, true);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const scale = peak > 0.999 ? 0.999 / peak : 1;
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i] * scale;
    view.setInt16(offset, Math.max(-32768, Math.min(32767, sample < 0 ? sample * 0x8000 : sample * 0x7FFF)), true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadAudioBuffer(buffer: AudioBuffer, session: SessionRecord, withClick: boolean): void {
  const pcm = buffer.getChannelData(0);
  const blob = encodeWav(pcm, buffer.sampleRate);
  const date = new Date(session.date).toISOString().slice(0, 10);
  triggerDownload(blob, `polypro-${session.bpm}bpm-${date}-${withClick ? 'with-click' : 'raw'}.wav`);
}

async function renderWithClick(
  sourceBuffer: AudioBuffer,
  session: SessionRecord,
  analysis: SessionAnalysis,
  clickSoundId: string,
  accentSoundId: string,
  accentThreshold: number,
  clickVolume: number,
  latencyOffsetMs: number,
): Promise<AudioBuffer> {
  const { getBuffer } = await import('../../audio/sounds');
  const offline = new OfflineAudioContext(1, sourceBuffer.length, sourceBuffer.sampleRate);
  const recording = offline.createBufferSource();
  recording.buffer = sourceBuffer;
  recording.connect(offline.destination);
  recording.start();

  const clickBuffer = getBuffer(clickSoundId) || getBuffer('woodblock');
  const accentBuffer = getBuffer(accentSoundId) || clickBuffer;
  if (clickBuffer) {
    const clickGain = offline.createGain();
    clickGain.gain.value = clickVolume;
    clickGain.connect(offline.destination);
    forEachClickBeat(session, latencyOffsetMs / 1000, ({ adjustedBeatTime, volState }) => {
      if (adjustedBeatTime < 0 || adjustedBeatTime >= sourceBuffer.duration) return;
      const buffer = volState >= accentThreshold ? (accentBuffer || clickBuffer) : clickBuffer;
      const source = offline.createBufferSource();
      source.buffer = buffer;
      const gain = offline.createGain();
      gain.gain.value = VOLUME_GAINS[volState];
      source.connect(gain);
      gain.connect(clickGain);
      source.start(adjustedBeatTime);
    }, analysis.gridBeats);
  }
  return offline.startRendering();
}
