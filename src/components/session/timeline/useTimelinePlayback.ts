/** Timeline playback transport with safe gain staging and exact stored click grid. */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../../store/db';
import * as db from '../../../store/db';
import { useSettingsStore } from '../../../store/settings-store';
import { VOLUME_GAINS } from '../../../audio/types';
import { createPlaybackLimiter, recordingPlaybackGain } from '../../../audio/recording-playback';
import { audioEngine } from '../../../audio';
import { getBuffer } from '../../../audio/sounds';
import { mediaPosition, eventsInWindow, type PlaybackLoop } from '../../../audio/playback-clock';
import { forEachClickBeat } from './timeline-shared';

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
  latencyOffsetMs: number;
  setLatencyOffsetMs: (ms: number) => void;
  togglePlayback: () => Promise<void>;
  skip: (deltaS: number) => Promise<void>;
  seekToFraction: (fraction: number) => void;
  saveAudio: (withClick: boolean) => Promise<void>;
}

interface Options {
  session: SessionRecord;
  audioBufferRef: React.MutableRefObject<AudioBuffer | null>;
  zoom: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  containerRef: React.RefObject<HTMLDivElement>;
  setScrollX: React.Dispatch<React.SetStateAction<number>>;
}

export function useTimelinePlayback({ session, audioBufferRef, zoom, containerRef, setScrollX, loopEnabled, loopStart, loopEnd }: Options): TimelinePlayback {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackVolume, setPlaybackVolumeState] = useState(0.72);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [clickOverlay, setClickOverlay] = useState(true);
  const [clickVolume, setClickVolume] = useState(0.5);
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [highPassHz, setHighPassHz] = useState(90);
  const [lowPassHz, setLowPassHz] = useState(12000);
  const [presenceBoostDb, setPresenceBoostDb] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(() => session.analysisConfig?.latencyOffsetMs ?? useSettingsStore.getState().calibratedOffset + useSettingsStore.getState().manualAdjustment);
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
  const gridBeatsRef = useRef<HitEventsRecord['gridBeats']>(undefined);
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
    const epoch = ++epochRef.current; pendingRef.current = true; setError(null);
    try {
      const [ctx, events] = await Promise.all([audioEngine.initContext(), db.getHitEvents(session.id)]);
      if (ctx.state === 'suspended') await ctx.resume();
      if (epoch !== epochRef.current) return;
      gridBeatsRef.current = events?.gridBeats;
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
      }, gridBeatsRef.current);
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
  }, [audioBufferRef, session, playbackSpeed, playbackVolume, loopEnabled, loopStart, loopEnd, cleanupEnabled, highPassHz, lowPassHz, presenceBoostDb, clickOverlay, clickVolume, clickSoundId, accentSoundId, accentThreshold, latencyOffsetMs, stopPlayback, position, containerRef, setScrollX]);

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
  useEffect(() => () => stopPlayback(), [stopPlayback]);
  const saveAudio = useCallback(async (withClick: boolean) => {
    if (!audioBufferRef.current) return;
    setIsSaving(true);
    try {
      const { getBuffer } = await import('../../../audio/sounds');
      const sourceBuffer = audioBufferRef.current;
      const sampleRate = sourceBuffer.sampleRate;
      const durationS = sourceBuffer.duration;
      const offline = new OfflineAudioContext(1, Math.ceil(durationS * sampleRate), sampleRate);
      const recordingSource = offline.createBufferSource();
      recordingSource.buffer = sourceBuffer;
      recordingSource.connect(offline.destination);
      recordingSource.start(0);

      if (withClick) {
        if (!gridBeatsRef.current) gridBeatsRef.current = (await db.getHitEvents(session.id).catch(() => undefined))?.gridBeats;
        const clickBuffer = getBuffer(clickSoundId) || getBuffer('woodblock');
        const accentBuffer = getBuffer(accentSoundId) || clickBuffer;
        if (clickBuffer) {
          const clickMaster = offline.createGain();
          clickMaster.gain.value = clickVolume;
          clickMaster.connect(offline.destination);
          forEachClickBeat(session, latencyOffsetMs / 1000, ({ adjustedBeatTime, volState }) => {
            if (adjustedBeatTime < 0 || adjustedBeatTime >= durationS) return;
            const buffer = volState >= accentThreshold ? (accentBuffer || clickBuffer) : clickBuffer;
            const clickSource = offline.createBufferSource();
            clickSource.buffer = buffer;
            const clickGain = offline.createGain();
            clickGain.gain.value = VOLUME_GAINS[volState];
            clickSource.connect(clickGain);
            clickGain.connect(clickMaster);
            clickSource.start(adjustedBeatTime);
          }, gridBeatsRef.current);
        }
      }

      const rendered = await offline.startRendering();
      const pcm = rendered.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
      const scale = peak > 0.98 ? 0.98 / peak : 1;
      const dataSize = pcm.length * 2;
      const wavBuffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(wavBuffer);
      const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
      write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE');
      write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true);
      let offset = 44;
      for (let i = 0; i < pcm.length; i++) {
        const sample = pcm[i] * scale;
        view.setInt16(offset, Math.max(-32768, Math.min(32767, sample < 0 ? sample * 0x8000 : sample * 0x7FFF)), true);
        offset += 2;
      }

      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date(session.date).toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `polypro-${session.bpm}bpm-${date}-${withClick ? 'with-click' : 'raw'}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not export this recording.');
    } finally {
      setIsSaving(false);
    }
  }, [audioBufferRef, session, clickSoundId, accentSoundId, accentThreshold, clickVolume, latencyOffsetMs]);

  return { error, isPlaying, playbackPos, playbackSpeed, setPlaybackSpeed, playbackVolume, setPlaybackVolume, followPlayhead, setFollowPlayhead,
    clickOverlay, setClickOverlay, clickVolume, setClickVolume, cleanupEnabled, setCleanupEnabled, highPassHz, setHighPassHz,
    lowPassHz, setLowPassHz, presenceBoostDb, setPresenceBoostDb, isSaving, latencyOffsetMs, setLatencyOffsetMs,
    togglePlayback, skip, seekToFraction, saveAudio };
}
