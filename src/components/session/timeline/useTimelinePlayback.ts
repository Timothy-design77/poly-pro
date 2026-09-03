/**
 * useTimelinePlayback — playback transport for the session timeline:
 * play/pause/seek/skip, speed control, click overlay scheduling,
 * nondestructive playback cleanup, playhead-follow scrolling, and WAV export.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord } from '../../../store/db';
import { useSettingsStore } from '../../../store/settings-store';
import { useMetronomeStore } from '../../../store/metronome-store';
import { VOLUME_GAINS } from '../../../audio/types';
import { MIC_BOOST, perceptualGain, forEachClickBeat } from './timeline-shared';

export interface TimelinePlayback {
  isPlaying: boolean;
  playbackPos: number;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
  clickOverlay: boolean;
  setClickOverlay: (v: boolean) => void;
  clickVolume: number;
  setClickVolume: (v: number) => void;
  cleanupEnabled: boolean;
  setCleanupEnabled: (v: boolean) => void;
  highPassHz: number;
  setHighPassHz: (v: number) => void;
  lowPassHz: number;
  setLowPassHz: (v: number) => void;
  presenceBoostDb: number;
  setPresenceBoostDb: (v: number) => void;
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
    const s = useSettingsStore.getState();
    return s.calibratedOffset + s.manualAdjustment;
  });

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterNodesRef = useRef<AudioNode[]>([]);
  const clickNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const clickGainRef = useRef<GainNode | null>(null);
  const playStartTimeRef = useRef(0);
  const playOffsetRef = useRef(0);
  const animFrameRef = useRef(0);
  const volUnsubRef = useRef<(() => void) | null>(null);
  const savedClickVolRef = useRef(0.5);

  const clickSoundId = useSettingsStore((s) => s.clickSound);
  const accentSoundId = useSettingsStore((s) => s.accentSound);
  const accentThreshold = useSettingsStore((s) => s.accentSoundThreshold);

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
    for (const node of filterNodesRef.current) {
      try { node.disconnect(); } catch {}
    }
    filterNodesRef.current = [];
    if (gainNodeRef.current) {
      try { gainNodeRef.current.disconnect(); } catch {}
      gainNodeRef.current = null;
    }
    for (const node of clickNodesRef.current) {
      try { node.stop(); } catch {}
    }
    clickNodesRef.current = [];
    if (clickGainRef.current) {
      try { clickGainRef.current.disconnect(); } catch {}
      clickGainRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
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
    const vol = useMetronomeStore.getState().volume;
    gain.gain.value = MIC_BOOST * perceptualGain(vol);

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
    gain.connect(ctx.destination);

    sourceNodeRef.current = source;
    gainNodeRef.current = gain;

    const { getBuffer } = await import('../../../audio/sounds');
    const latencyOffsetS = latencyOffsetMs / 1000;
    const durationS = session.durationMs / 1000;
    const clickBuf = getBuffer(clickSoundId) || getBuffer('woodblock');
    const accentBuf = getBuffer(accentSoundId) || clickBuf;

    if (clickBuf) {
      const clickGain = ctx.createGain();
      clickGain.gain.value = clickOverlay ? clickVolume : 0;
      savedClickVolRef.current = clickVolume;
      clickGain.connect(ctx.destination);
      clickGainRef.current = clickGain;

      const scheduled: AudioBufferSourceNode[] = [];
      forEachClickBeat(session, latencyOffsetS, ({ adjustedBeatTime, volState }) => {
        const playbackTime = (adjustedBeatTime - playOffsetRef.current) / playbackSpeed;
        if (playbackTime > 0 && adjustedBeatTime < durationS) {
          const useAccent = volState >= accentThreshold;
          const buf = useAccent ? (accentBuf || clickBuf) : clickBuf;
          const clickSource = ctx.createBufferSource();
          clickSource.buffer = buf;
          const clickNodeGain = ctx.createGain();
          clickNodeGain.gain.value = VOLUME_GAINS[volState];
          clickSource.connect(clickNodeGain);
          clickNodeGain.connect(clickGain);
          clickSource.start(ctx.currentTime + playbackTime);
          scheduled.push(clickSource);
        }
      });
      clickNodesRef.current = scheduled;
    }

    volUnsubRef.current?.();
    let prevVol = vol;
    volUnsubRef.current = useMetronomeStore.subscribe((state) => {
      if (state.volume !== prevVol) {
        prevVol = state.volume;
        if (gainNodeRef.current) gainNodeRef.current.gain.value = MIC_BOOST * perceptualGain(state.volume);
      }
    });

    source.onended = () => stopPlayback();
    playStartTimeRef.current = ctx.currentTime;
    source.start(0, playOffsetRef.current);
    setIsPlaying(true);

    const animate = () => {
      if (!sourceNodeRef.current) return;
      const elapsed = (ctx.currentTime - playStartTimeRef.current) * playbackSpeed + playOffsetRef.current;
      const pos = Math.min(1, elapsed / (session.durationMs / 1000));
      setPlaybackPos(pos);

      const cw = containerRef.current?.clientWidth ?? 350;
      const tw = cw * zoom;
      const playheadX = pos * tw;
      setScrollX((prev) => {
        if (playheadX < prev || playheadX > prev + cw) {
          const target = Math.max(0, playheadX - cw * 0.3);
          return prev + (target - prev) * 0.15;
        }
        if (playheadX > prev + cw * 0.7) {
          const target = Math.max(0, playheadX - cw * 0.3);
          return prev + (target - prev) * 0.08;
        }
        return prev;
      });

      if (pos < 1) animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [stopPlayback, session, zoom, clickOverlay, clickVolume, clickSoundId, accentSoundId,
      accentThreshold, latencyOffsetMs, playbackSpeed, audioBufferRef, containerRef, setScrollX,
      cleanupEnabled, highPassHz, lowPassHz, presenceBoostDb]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      const { audioEngine } = await import('../../../audio');
      const ctx = audioEngine.getContext();
      if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback, playbackSpeed]);

  const skip = useCallback(async (deltaS: number) => {
    const durationS = session.durationMs / 1000;
    if (isPlaying) {
      const { audioEngine } = await import('../../../audio');
      const ctx = audioEngine.getContext();
      if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
      stopPlayback();
      playOffsetRef.current = Math.max(0, Math.min(durationS, playOffsetRef.current + deltaS));
      startPlayback();
    } else {
      playOffsetRef.current = Math.max(0, Math.min(durationS, playOffsetRef.current + deltaS));
      setPlaybackPos(playOffsetRef.current / durationS);
    }
  }, [isPlaying, stopPlayback, startPlayback, session.durationMs, playbackSpeed]);

  const seekToFraction = useCallback((fraction: number) => {
    const durationS = session.durationMs / 1000;
    playOffsetRef.current = Math.max(0, Math.min(1, fraction)) * durationS;
    setPlaybackPos(Math.max(0, Math.min(1, fraction)));
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  }, [session.durationMs, isPlaying, stopPlayback, startPlayback]);

  const prevLatencyRef = useRef(latencyOffsetMs);
  useEffect(() => {
    if (prevLatencyRef.current !== latencyOffsetMs && isPlaying) {
      const restart = async () => {
        const { audioEngine: eng } = await import('../../../audio');
        const ctx = eng.getContext();
        if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
        stopPlayback();
        setTimeout(() => startPlayback(), 50);
      };
      restart();
    }
    prevLatencyRef.current = latencyOffsetMs;
  }, [latencyOffsetMs, isPlaying, stopPlayback, startPlayback, playbackSpeed]);

  const cleanupKey = `${cleanupEnabled}:${highPassHz}:${lowPassHz}:${presenceBoostDb}`;
  const prevCleanupKeyRef = useRef(cleanupKey);
  useEffect(() => {
    if (prevCleanupKeyRef.current !== cleanupKey && isPlaying) {
      const restart = async () => {
        const { audioEngine: eng } = await import('../../../audio');
        const ctx = eng.getContext();
        if (ctx) playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
        stopPlayback();
        setTimeout(() => startPlayback(), 25);
      };
      restart();
    }
    prevCleanupKeyRef.current = cleanupKey;
  }, [cleanupKey, isPlaying, stopPlayback, startPlayback, playbackSpeed]);

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
      const srcBuf = audioBufferRef.current;
      const sampleRate = srcBuf.sampleRate;
      const durationS = srcBuf.duration;
      const totalSamples = Math.ceil(durationS * sampleRate);
      const offline = new OfflineAudioContext(1, totalSamples, sampleRate);

      const recSource = offline.createBufferSource();
      recSource.buffer = srcBuf;
      const recGain = offline.createGain();
      recGain.gain.value = 4.0;
      recSource.connect(recGain);
      recGain.connect(offline.destination);
      recSource.start(0);

      if (withClick) {
        const clickBuf = getBuffer(clickSoundId) || getBuffer('woodblock');
        const accentBuf = getBuffer(accentSoundId) || clickBuf;
        if (clickBuf) {
          const clickMasterGain = offline.createGain();
          clickMasterGain.gain.value = clickVolume;
          clickMasterGain.connect(offline.destination);
          const latencyOffsetS = latencyOffsetMs / 1000;
          forEachClickBeat(session, latencyOffsetS, ({ adjustedBeatTime, volState }) => {
            if (adjustedBeatTime >= 0 && adjustedBeatTime < durationS) {
              const useAccent = volState >= accentThreshold;
              const buf = useAccent ? (accentBuf || clickBuf) : clickBuf;
              const clickSource = offline.createBufferSource();
              clickSource.buffer = buf;
              const clickNodeGain = offline.createGain();
              clickNodeGain.gain.value = VOLUME_GAINS[volState];
              clickSource.connect(clickNodeGain);
              clickNodeGain.connect(clickMasterGain);
              clickSource.start(adjustedBeatTime);
            }
          });
        }
      }

      const rendered = await offline.startRendering();
      const pcm = rendered.getChannelData(0);
      const dataSize = pcm.length * 2;
      const wavBuf = new ArrayBuffer(44 + dataSize);
      const v = new DataView(wavBuf);
      const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
      w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
      v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      w(36, 'data'); v.setUint32(40, dataSize, true);

      let peak = 0;
      for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
      const scale = peak > 0 ? 0.89 / peak : 1;
      let off = 44;
      for (let i = 0; i < pcm.length; i++) {
        const s = pcm[i] * scale;
        v.setInt16(off, Math.max(-32768, Math.min(32767, s < 0 ? s * 0x8000 : s * 0x7FFF)), true);
        off += 2;
      }

      const blob = new Blob([wavBuf], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date(session.date).toISOString().slice(0, 10);
      const suffix = withClick ? 'with-click' : 'raw';
      a.href = url;
      a.download = `polypro-${session.bpm}bpm-${dateStr}-${suffix}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [session, clickSoundId, accentSoundId, accentThreshold, clickVolume, latencyOffsetMs, audioBufferRef]);

  return {
    isPlaying, playbackPos, playbackSpeed, setPlaybackSpeed,
    clickOverlay, setClickOverlay, clickVolume, setClickVolume,
    cleanupEnabled, setCleanupEnabled, highPassHz, setHighPassHz,
    lowPassHz, setLowPassHz, presenceBoostDb, setPresenceBoostDb,
    isSaving, latencyOffsetMs, setLatencyOffsetMs,
    togglePlayback, skip, seekToFraction, saveAudio,
  };
}
