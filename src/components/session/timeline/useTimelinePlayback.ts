/** Timeline playback transport with safe gain staging and exact stored click grid. */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../../store/db';
import * as db from '../../../store/db';
import { useSettingsStore } from '../../../store/settings-store';
import { useMetronomeStore } from '../../../store/metronome-store';
import { VOLUME_GAINS } from '../../../audio/types';
import { createPlaybackLimiter, recordingPlaybackGain } from '../../../audio/recording-playback';
import { forEachClickBeat } from './timeline-shared';

export interface TimelinePlayback {
  isPlaying: boolean;
  playbackPos: number;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
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
  containerRef: React.RefObject<HTMLDivElement>;
  setScrollX: React.Dispatch<React.SetStateAction<number>>;
}

export function useTimelinePlayback({ session, audioBufferRef, zoom, containerRef, setScrollX }: Options): TimelinePlayback {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [clickOverlay, setClickOverlay] = useState(true);
  const [clickVolume, setClickVolume] = useState(0.5);
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [highPassHz, setHighPassHz] = useState(90);
  const [lowPassHz, setLowPassHz] = useState(12000);
  const [presenceBoostDb, setPresenceBoostDb] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(() => {
    const settings = useSettingsStore.getState();
    return settings.calibratedOffset + settings.manualAdjustment;
  });

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const filterNodesRef = useRef<AudioNode[]>([]);
  const clickNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const clickGainRef = useRef<GainNode | null>(null);
  const playStartTimeRef = useRef(0);
  const playOffsetRef = useRef(0);
  const animFrameRef = useRef(0);
  const volUnsubRef = useRef<(() => void) | null>(null);
  const savedClickVolRef = useRef(0.5);
  const gridBeatsRef = useRef<HitEventsRecord['gridBeats']>(undefined);

  const clickSoundId = useSettingsStore((state) => state.clickSound);
  const accentSoundId = useSettingsStore((state) => state.accentSound);
  const accentThreshold = useSettingsStore((state) => state.accentSoundThreshold);

  useEffect(() => {
    let cancelled = false;
    db.getHitEvents(session.id).then((events) => {
      if (!cancelled) gridBeatsRef.current = events?.gridBeats;
    }).catch(() => {});
    return () => { cancelled = true; gridBeatsRef.current = undefined; };
  }, [session.id]);

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      try { sourceNodeRef.current.disconnect(); } catch {}
      sourceNodeRef.current = null;
    }
    for (const node of filterNodesRef.current) {
      try { node.disconnect(); } catch {}
    }
    filterNodesRef.current = [];
    if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch {} gainNodeRef.current = null; }
    if (limiterRef.current) { try { limiterRef.current.disconnect(); } catch {} limiterRef.current = null; }
    for (const node of clickNodesRef.current) { try { node.stop(); } catch {} }
    clickNodesRef.current = [];
    if (clickGainRef.current) { try { clickGainRef.current.disconnect(); } catch {} clickGainRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; }
    volUnsubRef.current?.();
    volUnsubRef.current = null;
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(async () => {
    if (!audioBufferRef.current) return;
    const { audioEngine } = await import('../../../audio');
    const ctx = await audioEngine.initContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const duration = audioBufferRef.current.duration;
    if (playOffsetRef.current >= duration) playOffsetRef.current = 0;
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackSpeed;

    const gain = ctx.createGain();
    const limiter = createPlaybackLimiter(ctx);
    const volume = useMetronomeStore.getState().volume;
    gain.gain.value = recordingPlaybackGain(volume);
    gain.connect(limiter);
    limiter.connect(ctx.destination);
    gainNodeRef.current = gain;
    limiterRef.current = limiter;

    if (cleanupEnabled) {
      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = Math.max(20, highPassHz);
      highPass.Q.value = 0.707;
      const lowPass = ctx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = Math.max(highPassHz + 100, lowPassHz);
      lowPass.Q.value = 0.707;
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 3200;
      presence.Q.value = 0.8;
      presence.gain.value = presenceBoostDb;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 2.5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(presence);
      presence.connect(compressor);
      compressor.connect(gain);
      filterNodesRef.current = [highPass, lowPass, presence, compressor];
    } else {
      source.connect(gain);
    }

    const { getBuffer } = await import('../../../audio/sounds');
    const latencyOffsetS = latencyOffsetMs / 1000;
    const durationS = session.durationMs / 1000;
    const clickBuffer = getBuffer(clickSoundId) || getBuffer('woodblock');
    const accentBuffer = getBuffer(accentSoundId) || clickBuffer;
    if (clickBuffer) {
      if (!gridBeatsRef.current) {
        gridBeatsRef.current = (await db.getHitEvents(session.id).catch(() => undefined))?.gridBeats;
      }
      const clickGain = ctx.createGain();
      clickGain.gain.value = clickOverlay ? clickVolume : 0;
      savedClickVolRef.current = clickVolume;
      clickGain.connect(limiter);
      clickGainRef.current = clickGain;
      const scheduled: AudioBufferSourceNode[] = [];
      forEachClickBeat(session, latencyOffsetS, ({ adjustedBeatTime, volState }) => {
        const playbackTime = (adjustedBeatTime - playOffsetRef.current) / playbackSpeed;
        if (playbackTime <= 0 || adjustedBeatTime >= durationS) return;
        const buffer = volState >= accentThreshold ? (accentBuffer || clickBuffer) : clickBuffer;
        const clickSource = ctx.createBufferSource();
        clickSource.buffer = buffer;
        const clickNodeGain = ctx.createGain();
        clickNodeGain.gain.value = VOLUME_GAINS[volState];
        clickSource.connect(clickNodeGain);
        clickNodeGain.connect(clickGain);
        clickSource.start(ctx.currentTime + playbackTime);
        scheduled.push(clickSource);
      }, gridBeatsRef.current);
      clickNodesRef.current = scheduled;
    }

    volUnsubRef.current?.();
    let previousVolume = volume;
    volUnsubRef.current = useMetronomeStore.subscribe((state) => {
      if (state.volume === previousVolume) return;
      previousVolume = state.volume;
      if (gainNodeRef.current) gainNodeRef.current.gain.value = recordingPlaybackGain(state.volume);
    });

    sourceNodeRef.current = source;
    source.onended = () => stopPlayback();
    playStartTimeRef.current = ctx.currentTime;
    source.start(0, playOffsetRef.current);
    setIsPlaying(true);

    const animate = () => {
      if (!sourceNodeRef.current) return;
      const elapsed = (ctx.currentTime - playStartTimeRef.current) * playbackSpeed + playOffsetRef.current;
      const pos = Math.min(1, elapsed / duration);
      setPlaybackPos(pos);
      const width = containerRef.current?.clientWidth ?? 350;
      const totalWidth = width * zoom;
      const playheadX = pos * totalWidth;
      setScrollX((previous) => {
        if (playheadX < previous || playheadX > previous + width) {
          const target = Math.max(0, playheadX - width * 0.3);
          return previous + (target - previous) * 0.15;
        }
        if (playheadX > previous + width * 0.7) {
          const target = Math.max(0, playheadX - width * 0.3);
          return previous + (target - previous) * 0.08;
        }
        return previous;
      });
      if (pos < 1) animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [audioBufferRef, playbackSpeed, cleanupEnabled, highPassHz, lowPassHz, presenceBoostDb,
    clickSoundId, accentSoundId, accentThreshold, clickOverlay, clickVolume, latencyOffsetMs,
    session, containerRef, zoom, setScrollX, stopPlayback]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      const { audioEngine } = await import('../../../audio');
      const ctx = audioEngine.getContext();
      if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
      stopPlayback();
    } else {
      await startPlayback();
    }
  }, [isPlaying, playbackSpeed, startPlayback, stopPlayback]);

  const skip = useCallback(async (deltaS: number) => {
    const durationS = session.durationMs / 1000;
    if (isPlaying) {
      const { audioEngine } = await import('../../../audio');
      const ctx = audioEngine.getContext();
      if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
      stopPlayback();
      playOffsetRef.current = Math.max(0, Math.min(durationS, playOffsetRef.current + deltaS));
      await startPlayback();
    } else {
      playOffsetRef.current = Math.max(0, Math.min(durationS, playOffsetRef.current + deltaS));
      setPlaybackPos(playOffsetRef.current / durationS);
    }
  }, [isPlaying, playbackSpeed, session.durationMs, startPlayback, stopPlayback]);

  const seekToFraction = useCallback((fraction: number) => {
    const durationS = session.durationMs / 1000;
    playOffsetRef.current = Math.max(0, Math.min(1, fraction)) * durationS;
    setPlaybackPos(Math.max(0, Math.min(1, fraction)));
    if (isPlaying) {
      stopPlayback();
      void startPlayback();
    }
  }, [session.durationMs, isPlaying, stopPlayback, startPlayback]);

  const previousLatencyRef = useRef(latencyOffsetMs);
  useEffect(() => {
    if (previousLatencyRef.current !== latencyOffsetMs && isPlaying) {
      void (async () => {
        const { audioEngine } = await import('../../../audio');
        const ctx = audioEngine.getContext();
        if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
        stopPlayback();
        window.setTimeout(() => { void startPlayback(); }, 50);
      })();
    }
    previousLatencyRef.current = latencyOffsetMs;
  }, [latencyOffsetMs, isPlaying, playbackSpeed, stopPlayback, startPlayback]);

  const cleanupKey = `${cleanupEnabled}:${highPassHz}:${lowPassHz}:${presenceBoostDb}`;
  const previousCleanupKeyRef = useRef(cleanupKey);
  useEffect(() => {
    if (previousCleanupKeyRef.current !== cleanupKey && isPlaying) {
      void (async () => {
        const { audioEngine } = await import('../../../audio');
        const ctx = audioEngine.getContext();
        if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
        stopPlayback();
        window.setTimeout(() => { void startPlayback(); }, 25);
      })();
    }
    previousCleanupKeyRef.current = cleanupKey;
  }, [cleanupKey, isPlaying, playbackSpeed, stopPlayback, startPlayback]);

  useEffect(() => {
    if (clickGainRef.current) clickGainRef.current.gain.value = clickOverlay ? savedClickVolRef.current : 0;
  }, [clickOverlay]);

  useEffect(() => {
    savedClickVolRef.current = clickVolume;
    if (clickGainRef.current && clickOverlay) clickGainRef.current.gain.value = clickVolume;
  }, [clickVolume, clickOverlay]);

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
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [audioBufferRef, session, clickSoundId, accentSoundId, accentThreshold, clickVolume, latencyOffsetMs]);

  return {
    isPlaying, playbackPos, playbackSpeed, setPlaybackSpeed,
    clickOverlay, setClickOverlay, clickVolume, setClickVolume,
    cleanupEnabled, setCleanupEnabled, highPassHz, setHighPassHz,
    lowPassHz, setLowPassHz, presenceBoostDb, setPresenceBoostDb,
    isSaving, latencyOffsetMs, setLatencyOffsetMs,
    togglePlayback, skip, seekToFraction, saveAudio,
  };
}
