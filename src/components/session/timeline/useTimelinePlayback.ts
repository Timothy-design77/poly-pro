/** Timeline playback transport with safe gain staging and exact stored click grid. */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../../store/db';
import { useSettingsStore } from '../../../store/settings-store';
import { VOLUME_GAINS } from '../../../audio/types';
import { createPlaybackLimiter, recordingPlaybackGain } from '../../../audio/recording-playback';
import { audioEngine } from '../../../audio';
import { useMetronomeStore } from '../../../store/metronome-store';
import { beginCriticalActivity, isCriticalActivityActive } from '../../../utils/critical-activity';
import { getBuffer } from '../../../audio/sounds';
import { mediaPosition, eventsInWindow, type PlaybackLoop } from '../../../audio/playback-clock';
import { forEachClickBeat } from './timeline-shared';
import { exportWav, type ExportClick } from '../../../audio/wav-export';

export interface TimelinePlayback {
  error: string | null;
  isPlaying: boolean;
  playbackPos: number;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  playbackVolume: number;
  setPlaybackVolume: (value: number) => void;
  followPlayhead: boolean;
  setFollowPlayhead: (value: boolean) => void;
  clickOverlay: boolean;
  setClickOverlay: (value: boolean) => void;
  clickVolume: number;
  setClickVolume: (value: number) => void;
  cleanupEnabled: boolean;
  setCleanupEnabled: (value: boolean) => void;
  highPassHz: number;
  setHighPassHz: (value: number) => void;
  lowPassHz: number;
  setLowPassHz: (value: number) => void;
  presenceBoostDb: number;
  setPresenceBoostDb: (value: number) => void;
  isSaving: boolean;
  exportProgress: number;
  cancelExport: () => void;
  latencyOffsetMs: number;
  togglePlayback: () => Promise<void>;
  skip: (deltaS: number) => Promise<void>;
  seekToFraction: (fraction: number) => void;
  saveAudio: (withClick: boolean) => Promise<void>;
}

interface Options {
  session: SessionRecord;
  active: boolean;
  gridBeats: HitEventsRecord['gridBeats'];
  latencyOffsetMs: number;
  audioBufferRef: React.MutableRefObject<AudioBuffer | null>;
  zoom: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  containerRef: React.RefObject<HTMLDivElement>;
  setScrollX: React.Dispatch<React.SetStateAction<number>>;
}

export function useTimelinePlayback({ session, audioBufferRef, zoom, containerRef, setScrollX, loopEnabled, loopStart, loopEnd, active, gridBeats, latencyOffsetMs }: Options): TimelinePlayback {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackVolume, setPlaybackVolumeState] = useState(0.72);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [clickOverlay, setClickOverlay] = useState(false);
  const [clickVolume, setClickVolume] = useState(0.5);
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [highPassHz, setHighPassHz] = useState(90);
  const [lowPassHz, setLowPassHz] = useState(12000);
  const [presenceBoostDb, setPresenceBoostDb] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportRef = useRef<{ controller: AbortController; release: () => void } | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const clickGainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const clicksRef = useRef(new Set<AudioBufferSourceNode>());
  const epochRef = useRef(0);
  const pendingRef = useRef(false);
  const offsetRef = useRef(0);
  const clockRef = useRef({ time: 0, offset: 0, speed: 1, duration: 1, loop: undefined as PlaybackLoop | undefined });
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const frameRef = useRef(0);
  const releaseRef = useRef<(() => void) | null>(null);
  const visualRef = useRef({ zoom, followPlayhead });
  visualRef.current = { zoom, followPlayhead };
  const clickSoundId = useSettingsStore((state) => state.clickSound);
  const accentSoundId = useSettingsStore((state) => state.accentSound);
  const accentThreshold = useSettingsStore((state) => state.accentSoundThreshold);

  const position = useCallback(() => {
    const clock = clockRef.current;
    return sourceNodeRef.current ? mediaPosition(clock.offset + Math.max(0, (audioEngine.getContext()?.currentTime ?? clock.time) - clock.time) * clock.speed, clock.duration, clock.loop) : offsetRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    ++epochRef.current; pendingRef.current = false;
    releaseRef.current?.(); releaseRef.current = null;
    if (sourceNodeRef.current) {
      offsetRef.current = position();
      sourceNodeRef.current.onended = null;
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current.disconnect(); sourceNodeRef.current = null;
    }
    for (const source of clicksRef.current) { try { source.stop(); } catch {} source.disconnect(); }
    clicksRef.current.clear();
    for (const node of nodesRef.current) node.disconnect();
    nodesRef.current = []; gainNodeRef.current = null; clickGainRef.current = null;
    clearInterval(timerRef.current); cancelAnimationFrame(frameRef.current);
    setIsPlaying(false);
  }, [position]);

  const startPlayback = useCallback(async () => {
    const buffer = audioBufferRef.current;
    if (!buffer) { setError('This recording is not ready for playback.'); return; }
    if (!active) return;
    if (isCriticalActivityActive()) { setError('Finish the current recording, analysis or data operation first.'); return; }
    audioEngine.stop(); useMetronomeStore.getState().setPlaying(false);
    releaseRef.current = beginCriticalActivity('playback');
    const epoch = ++epochRef.current; pendingRef.current = true; setError(null);
    try {
      const ctx = await audioEngine.initContext();
      if (ctx.state === 'suspended') await ctx.resume();
      if (epoch !== epochRef.current) return;
      const duration = buffer.duration;
      const loop = loopEnabled && loopEnd > loopStart ? { start: loopStart * duration, end: loopEnd * duration } : undefined;
      if (offsetRef.current >= duration) offsetRef.current = 0;
      if (loop && (offsetRef.current < loop.start || offsetRef.current >= loop.end)) offsetRef.current = loop.start;
      const source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = playbackSpeed;
      if (loop) { source.loop = true; source.loopStart = loop.start; source.loopEnd = loop.end; }
      const gain = ctx.createGain(); gain.gain.value = recordingPlaybackGain(playbackVolume);
      const limiter = createPlaybackLimiter(ctx); gain.connect(limiter); limiter.connect(ctx.destination);
      gainNodeRef.current = gain; nodesRef.current = [source, gain, limiter];
      if (cleanupEnabled) {
        const highPass = ctx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = highPassHz; highPass.Q.value = 0.707;
        const lowPass = ctx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = Math.max(highPassHz + 100, lowPassHz); lowPass.Q.value = 0.707;
        const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.8; presence.gain.value = presenceBoostDb;
        source.connect(highPass); highPass.connect(lowPass); lowPass.connect(presence); presence.connect(gain);
        nodesRef.current.push(highPass, lowPass, presence);
      } else source.connect(gain);
      const clickGain = ctx.createGain(); clickGain.gain.value = clickOverlay ? clickVolume : 0; clickGain.connect(limiter);
      clickGainRef.current = clickGain; nodesRef.current.push(clickGain);
      const beats: Array<{ time: number; volState: keyof typeof VOLUME_GAINS }> = [];
      forEachClickBeat(session, latencyOffsetMs / 1000, ({ adjustedBeatTime, volState }) => {
        if (adjustedBeatTime >= 0 && adjustedBeatTime < duration) beats.push({ time: adjustedBeatTime, volState });
      }, gridBeats);
      const clickBuffer = getBuffer(clickSoundId) || getBuffer('woodblock');
      const accentBuffer = getBuffer(accentSoundId) || clickBuffer;
      const startTime = ctx.currentTime + 0.025;
      clockRef.current = { time: startTime, offset: offsetRef.current, speed: playbackSpeed, duration, loop };
      let through = offsetRef.current;
      const schedule = () => {
        const clock = clockRef.current;
        const from = Math.max(through, clock.offset + (ctx.currentTime - clock.time) * clock.speed);
        const to = clock.offset + (ctx.currentTime + 0.15 - clock.time) * clock.speed;
        if (clickBuffer) for (const { event, time } of eventsInWindow(beats, from, to, loop)) {
          const click = ctx.createBufferSource(); click.buffer = event.volState >= accentThreshold ? accentBuffer! : clickBuffer;
          const level = ctx.createGain(); level.gain.value = VOLUME_GAINS[event.volState];
          click.connect(level); level.connect(clickGain); clicksRef.current.add(click);
          click.onended = () => { clicksRef.current.delete(click); click.disconnect(); level.disconnect(); };
          click.start(clock.time + (time - clock.offset) / clock.speed);
        }
        through = to;
      };
      sourceNodeRef.current = source;
      source.onended = () => { if (sourceNodeRef.current === source) { stopPlayback(); offsetRef.current = duration; setPlaybackPos(1); } };
      source.start(startTime, offsetRef.current);
      pendingRef.current = false; setIsPlaying(true); schedule(); timerRef.current = setInterval(schedule, 25);
      const animate = () => {
        if (epoch !== epochRef.current || !sourceNodeRef.current) return;
        const pos = position() / duration; setPlaybackPos(pos);
        const width = containerRef.current?.clientWidth ?? 350;
        if (visualRef.current.followPlayhead) {
          const x = pos * width * visualRef.current.zoom;
          setScrollX((previous) => x < previous || x > previous + width * 0.8 ? Math.max(0, Math.min(width * (visualRef.current.zoom - 1), x - width * 0.3)) : previous);
        }
        frameRef.current = requestAnimationFrame(animate);
      };
      frameRef.current = requestAnimationFrame(animate);
    } catch (failure) { if (epoch === epochRef.current) { stopPlayback(); setError(failure instanceof Error ? failure.message : 'Playback failed.'); } }
  }, [active, gridBeats, audioBufferRef, session, playbackSpeed, playbackVolume, loopEnabled, loopStart, loopEnd, cleanupEnabled, highPassHz, lowPassHz, presenceBoostDb, clickOverlay, clickVolume, clickSoundId, accentSoundId, accentThreshold, latencyOffsetMs, stopPlayback, position, containerRef, setScrollX]);

  const togglePlayback = useCallback(async () => {
    if (sourceNodeRef.current || pendingRef.current) stopPlayback(); else await startPlayback();
  }, [startPlayback, stopPlayback]);
  const seekToFraction = useCallback((fraction: number) => {
    const resume = !!sourceNodeRef.current || pendingRef.current;
    stopPlayback();
    const duration = audioBufferRef.current?.duration ?? session.durationMs / 1000;
    offsetRef.current = Math.max(0, Math.min(1, fraction)) * duration;
    setPlaybackPos(offsetRef.current / duration);
    if (resume) void startPlayback();
  }, [audioBufferRef, session.durationMs, startPlayback, stopPlayback]);
  const skip = useCallback(async (delta: number) => {
    const duration = audioBufferRef.current?.duration ?? session.durationMs / 1000;
    seekToFraction((position() + delta) / duration);
  }, [audioBufferRef, session.durationMs, position, seekToFraction]);

  const restartKey = `${playbackSpeed}:${loopEnabled}:${loopStart}:${loopEnd}:${cleanupEnabled}:${highPassHz}:${lowPassHz}:${presenceBoostDb}:${latencyOffsetMs}:${clickSoundId}:${accentSoundId}:${accentThreshold}`;
  const previousKey = useRef(restartKey);
  useEffect(() => {
    if (previousKey.current !== restartKey && (sourceNodeRef.current || pendingRef.current)) { stopPlayback(); void startPlayback(); }
    previousKey.current = restartKey;
  }, [restartKey, stopPlayback, startPlayback]);
  useEffect(() => { if (clickGainRef.current) clickGainRef.current.gain.value = clickOverlay ? clickVolume : 0; }, [clickOverlay, clickVolume]);
  const setPlaybackVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value)); setPlaybackVolumeState(next);
    if (gainNodeRef.current) gainNodeRef.current.gain.value = recordingPlaybackGain(next);
  }, []);
  const cancelExport = useCallback(() => {
    const operation = exportRef.current;
    if (!operation) return;
    operation.controller.abort(); operation.release(); exportRef.current = null;
    setIsSaving(false); setExportProgress(0);
  }, []);
  useEffect(() => { if (!active) { stopPlayback(); cancelExport(); } }, [active, stopPlayback, cancelExport]);
  useEffect(() => () => {
    stopPlayback();
    exportRef.current?.controller.abort(); exportRef.current?.release(); exportRef.current = null;
  }, [stopPlayback]);
  const saveAudio = useCallback(async (withClick: boolean) => {
    const sourceBuffer = audioBufferRef.current;
    if (!sourceBuffer || !active || exportRef.current) return;
    stopPlayback();
    if (isCriticalActivityActive()) { setError('Finish the current recording, analysis or data operation first.'); return; }
    const operation = { controller: new AbortController(), release: beginCriticalActivity('data') };
    exportRef.current = operation;
    setIsSaving(true); setExportProgress(0); setError(null);
    try {
      const clicks: ExportClick[] = [];
      if (withClick) {
        const clickBuffer = getBuffer(clickSoundId) || getBuffer('woodblock');
        const accentBuffer = getBuffer(accentSoundId) || clickBuffer;
        if (!clickBuffer) throw new Error('Click sounds are still loading. Try exporting again.');
        forEachClickBeat(session, latencyOffsetMs / 1000, ({ adjustedBeatTime, volState }) => {
          if (adjustedBeatTime < 0 || adjustedBeatTime >= sourceBuffer.duration) return;
          clicks.push({ time: adjustedBeatTime, buffer: volState >= accentThreshold ? accentBuffer! : clickBuffer, gain: clickVolume * VOLUME_GAINS[volState] });
        }, gridBeats);
      }
      const blob = await exportWav({ buffer: sourceBuffer, clicks, signal: operation.controller.signal,
        onProgress: (progress) => { if (exportRef.current === operation) setExportProgress(progress); } });
      operation.controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date(session.date).toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `polypro-${session.bpm}bpm-${date}-${withClick ? 'with-click' : 'raw'}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (failure) {
      if (!operation.controller.signal.aborted && exportRef.current === operation) {
        setError(failure instanceof Error ? failure.message : 'Could not export this recording.');
      }
    } finally {
      operation.release();
      if (exportRef.current === operation) { exportRef.current = null; setIsSaving(false); }
    }
  }, [active, gridBeats, audioBufferRef, session, clickSoundId, accentSoundId, accentThreshold, clickVolume, latencyOffsetMs, stopPlayback]);

  return { error, isPlaying, playbackPos, playbackSpeed, setPlaybackSpeed, playbackVolume, setPlaybackVolume, followPlayhead, setFollowPlayhead,
    clickOverlay, setClickOverlay, clickVolume, setClickVolume, cleanupEnabled, setCleanupEnabled, highPassHz, setHighPassHz,
    lowPassHz, setLowPassHz, presenceBoostDb, setPresenceBoostDb, isSaving, exportProgress, cancelExport, latencyOffsetMs,
    togglePlayback, skip, seekToFraction, saveAudio };
}
