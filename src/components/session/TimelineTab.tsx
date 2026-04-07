/**
 * TimelineTab v2 — Mini-DAW session viewer.
 *
 * Features:
 *   - Frequency-colored spectrogram waveform (Bass🔴 / Mid🟢 / High🔵)
 *   - Mini-map with viewport indicator + tap-to-jump
 *   - Tap-to-seek on main canvas
 *   - Smooth playback scrolling (lerp-based follow)
 *   - Inertial scroll with friction decay
 *   - Center-preserving zoom (buttons + pinch)
 *   - Full-height onset markers with accuracy coloring
 *   - Measure:beat labels at zoom ≥ 4×
 *   - Playback speed control
 *   - Click overlay with mid-playback toggle
 *   - WAV save/export (raw + with click)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { SessionAnalysis, ScoredOnset } from '../../analysis/types';
import * as db from '../../store/db';
import { ScoringControls } from './ScoringControls';

import { useSettingsStore } from '../../store/settings-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { MASTER_GAIN_MULTIPLIER } from '../../utils/constants';
import { VolumeState, VOLUME_GAINS } from '../../audio/types';
import { computeSpectrogram, bandColor } from './Spectrogram';
import type { SpectrogramData } from './Spectrogram';

// ─── Constants ───

const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32];
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const CANVAS_HEIGHT = 200;
const MINIMAP_HEIGHT = 30;
const SCROLL_FRICTION = 0.92;
const MIN_SCROLL_VELOCITY = 0.5;

function perceptualGain(vol: number): number {
  return vol * vol * MASTER_GAIN_MULTIPLIER;
}
const MIC_BOOST = 4.0;

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// ─── Props ───

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

// ─── Component ───

export function TimelineTab({ session, hitEvents }: Props) {
  // ─── Refs ───
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniMapCanvasRef = useRef<HTMLCanvasElement>(null);

  // ─── View state ───
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(350);
  const [spectrogramData, setSpectrogramData] = useState<SpectrogramData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  // Band filter toggles (true = visible)
  const [showBass, setShowBass] = useState(true);
  const [showMid, setShowMid] = useState(true);
  const [showHigh, setShowHigh] = useState(true);

  // Live-scored onsets from ScoringControls
  const [liveOnsets, setLiveOnsets] = useState<ScoredOnset[] | null>(null);

  // ─── Playback state ───
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [clickOverlay, setClickOverlay] = useState(true);
  const [clickVolume, setClickVolume] = useState(0.5);
  const [isSaving, setIsSaving] = useState(false);
  const [showTuneDrawer, setShowTuneDrawer] = useState(false);
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(() => {
    const s = useSettingsStore.getState();
    return s.calibratedOffset + s.manualAdjustment;
  });

  // Audio refs
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rawPcmRef = useRef<Float32Array | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const clickNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const clickGainRef = useRef<GainNode | null>(null);
  const playStartTimeRef = useRef(0);
  const playOffsetRef = useRef(0);
  const animFrameRef = useRef(0);
  const volUnsubRef = useRef<(() => void) | null>(null);
  const savedClickVolRef = useRef(0.5);

  // Touch/scroll refs
  const touchStartRef = useRef<number | null>(null);
  const scrollStartRef = useRef(0);
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pinchCenterRef = useRef(0);
  const pinchScrollStartRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTouchTimeRef = useRef(0);
  const momentumFrameRef = useRef(0);

  // Click sound settings
  const clickSoundId = useSettingsStore((s) => s.clickSound);
  const accentSoundId = useSettingsStore((s) => s.accentSound);
  const accentThreshold = useSettingsStore((s) => s.accentSoundThreshold);

  const totalWidth = containerWidth * zoom;

  // ─── Measure container ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Load PCM + compute spectrogram ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const blob = await db.getRecording(session.id);
      if (!blob || blob.size === 0 || cancelled) {
        setIsLoading(false);
        return;
      }

      const arrayBuffer = await blob.arrayBuffer();
      let pcm: Float32Array;
      let sampleRate = 48000;

      if (blob.type.startsWith('audio/') || blob.type === '') {
        // Handle both raw PCM and compressed formats
        try {
          // Try raw PCM first
          pcm = new Float32Array(arrayBuffer);
          if (pcm.length === 0) {
            setIsLoading(false);
            return;
          }
          // Look up sample rate
          try {
            const sessions = await db.getAllSessions();
            const s = sessions.find((s) => s.id === session.id);
            if (s?.recordingSampleRate) sampleRate = s.recordingSampleRate;
          } catch { /* default */ }
        } catch {
          setIsLoading(false);
          return;
        }
      } else {
        setIsLoading(false);
        return;
      }

      if (cancelled) return;

      // Store raw PCM for playback
      rawPcmRef.current = pcm;

      // Build AudioBuffer for playback
      const { audioEngine } = await import('../../audio/engine');
      const ctx = await audioEngine.initContext();
      const audioBuf = ctx.createBuffer(1, pcm.length, sampleRate);
      audioBuf.getChannelData(0).set(pcm);
      audioBufferRef.current = audioBuf;
      setIsReady(true);

      // Compute spectrogram (this may take 1-2s on long recordings)
      const specData = computeSpectrogram(pcm, sampleRate);
      if (!cancelled) {
        setSpectrogramData(specData);
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session.id]);

  // ─── Scoring result handler ───
  const handleScoringResult = useCallback((result: SessionAnalysis) => {
    setLiveOnsets(result.scoredOnsets);
  }, []);

  // ─── Playback ───

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
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
    const { audioEngine } = await import('../../audio/engine');
    const ctx = await audioEngine.initContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const offset = playOffsetRef.current;
    const duration = audioBufferRef.current.duration;
    if (offset >= duration) {
      playOffsetRef.current = 0;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackSpeed;

    // Gain with volume slider
    const gain = ctx.createGain();
    const vol = useMetronomeStore.getState().volume;
    gain.gain.value = MIC_BOOST * perceptualGain(vol);
    source.connect(gain);
    gain.connect(ctx.destination);

    sourceNodeRef.current = source;
    gainNodeRef.current = gain;

    // Schedule click overlay
    const { getBuffer } = await import('../../audio/sounds');
    const bpm = session.bpm;
    const subdivision = session.subdivision || 1;
    const ioi = 60 / bpm / subdivision;
    const meterNum = parseInt(session.meter?.split('/')[0] || '4') || 4;
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
      let beatTime = 0;
      let beatIdx = 0;

      while (beatTime < durationS) {
        const adjustedBeatTime = beatTime + latencyOffsetS;
        // Only schedule future beats (adjusted for speed)
        const playbackTime = (adjustedBeatTime - playOffsetRef.current) / playbackSpeed;
        if (playbackTime > 0 && adjustedBeatTime < durationS) {
          const isDownbeat = beatIdx % (subdivision * meterNum) === 0;
          const isMainBeat = beatIdx % subdivision === 0;
          const volState = isDownbeat ? VolumeState.ACCENT
            : isMainBeat ? VolumeState.LOUD
            : VolumeState.MED;
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
        beatTime += ioi;
        beatIdx++;
      }
      clickNodesRef.current = scheduled;
    }

    // Subscribe to volume changes during playback
    volUnsubRef.current?.();
    let prevVol = vol;
    volUnsubRef.current = useMetronomeStore.subscribe((state) => {
      if (state.volume !== prevVol) {
        prevVol = state.volume;
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = MIC_BOOST * perceptualGain(state.volume);
        }
      }
    });

    source.onended = () => stopPlayback();
    playStartTimeRef.current = ctx.currentTime;
    source.start(0, playOffsetRef.current);
    setIsPlaying(true);

    // Animation loop: update playhead + smooth scroll
    const animate = () => {
      if (!sourceNodeRef.current) return;
      const elapsed = (ctx.currentTime - playStartTimeRef.current) * playbackSpeed + playOffsetRef.current;
      const pos = Math.min(1, elapsed / (session.durationMs / 1000));
      setPlaybackPos(pos);

      // Smooth scroll to follow playhead
      const cw = containerRef.current?.clientWidth ?? 350;
      const tw = cw * zoom;
      const playheadX = pos * tw;
      setScrollX((prev) => {
        // If playhead is off-screen, lerp toward it
        if (playheadX < prev || playheadX > prev + cw) {
          const target = Math.max(0, playheadX - cw * 0.3);
          return prev + (target - prev) * 0.15; // Smooth lerp
        }
        // If playhead is near right edge, gently scroll
        if (playheadX > prev + cw * 0.7) {
          const target = Math.max(0, playheadX - cw * 0.3);
          return prev + (target - prev) * 0.08;
        }
        return prev;
      });

      if (pos < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [stopPlayback, session, zoom, clickOverlay, clickVolume, clickSoundId, accentSoundId, accentThreshold, latencyOffsetMs, playbackSpeed]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      // Pause: save current position
      const { audioEngine } = await import('../../audio/engine');
      const ctx = audioEngine.getContext();
      if (ctx) {
        playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
      }
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback, playbackSpeed]);

  // Skip ±5 seconds
  const skip = useCallback(async (deltaS: number) => {
    const durationS = session.durationMs / 1000;
    if (isPlaying) {
      const { audioEngine } = await import('../../audio/engine');
      const ctx = audioEngine.getContext();
      if (ctx) {
        playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
      }
      stopPlayback();
      playOffsetRef.current = Math.max(0, Math.min(durationS, playOffsetRef.current + deltaS));
      startPlayback();
    } else {
      playOffsetRef.current = Math.max(0, Math.min(durationS, playOffsetRef.current + deltaS));
      setPlaybackPos(playOffsetRef.current / durationS);
    }
  }, [isPlaying, stopPlayback, startPlayback, session.durationMs, playbackSpeed]);

  // Latency offset restart
  const prevLatencyRef = useRef(latencyOffsetMs);
  useEffect(() => {
    if (prevLatencyRef.current !== latencyOffsetMs && isPlaying) {
      const restart = async () => {
        const { audioEngine: eng } = await import('../../audio/engine');
        const ctx = eng.getContext();
        if (ctx) {
          playOffsetRef.current += (ctx.currentTime - playStartTimeRef.current) * playbackSpeed;
        }
        stopPlayback();
        setTimeout(() => startPlayback(), 50);
      };
      restart();
    }
    prevLatencyRef.current = latencyOffsetMs;
  }, [latencyOffsetMs, isPlaying, stopPlayback, startPlayback, playbackSpeed]);

  // Mid-playback click toggle
  useEffect(() => {
    if (clickGainRef.current) {
      clickGainRef.current.gain.value = clickOverlay ? savedClickVolRef.current : 0;
    }
  }, [clickOverlay]);

  // Click volume slider: update gain in real-time
  useEffect(() => {
    savedClickVolRef.current = clickVolume;
    if (clickGainRef.current && clickOverlay) {
      clickGainRef.current.gain.value = clickVolume;
    }
  }, [clickVolume, clickOverlay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (momentumFrameRef.current) cancelAnimationFrame(momentumFrameRef.current);
    };
  }, [stopPlayback]);

  // ─── Tap-to-seek ───
  const handleSeek = useCallback((clientX: number, isMinimapTap = false) => {
    const durationS = session.durationMs / 1000;
    let fraction: number;

    if (isMinimapTap) {
      const mmCanvas = miniMapCanvasRef.current;
      if (!mmCanvas) return;
      const rect = mmCanvas.getBoundingClientRect();
      fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    } else {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const localX = clientX - rect.left + scrollX;
      fraction = Math.max(0, Math.min(1, localX / totalWidth));
    }

    playOffsetRef.current = fraction * durationS;
    setPlaybackPos(fraction);

    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  }, [session.durationMs, scrollX, totalWidth, isPlaying, stopPlayback, startPlayback]);

  // ─── Touch handlers: pan + pinch + tap-to-seek + inertia ───

  const isTapRef = useRef(true);
  const tapStartTimeRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Cancel any ongoing momentum scroll
    if (momentumFrameRef.current) {
      cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = 0;
    }
    velocityRef.current = 0;

    if (e.touches.length === 1) {
      touchStartRef.current = e.touches[0].clientX;
      scrollStartRef.current = scrollX;
      lastTouchXRef.current = e.touches[0].clientX;
      lastTouchTimeRef.current = Date.now();
      isTapRef.current = true;
      tapStartTimeRef.current = Date.now();
    } else if (e.touches.length === 2) {
      isTapRef.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoomRef.current = zoom;
      pinchScrollStartRef.current = scrollX;
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchCenterRef.current = rect ? cx - rect.left + scrollX : 0;
      touchStartRef.current = null;
    }
  }, [scrollX, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom with center preservation
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchStartDistRef.current > 0) {
        const scale = dist / pinchStartDistRef.current;
        const newZoom = Math.max(1, Math.min(32, pinchStartZoomRef.current * scale));
        const newTotalWidth = containerWidth * newZoom;

        // Center-preserving scroll: the point under the pinch center stays fixed
        const ratio = newZoom / pinchStartZoomRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const containerX = rect ? cx - rect.left : containerWidth / 2;
        const newScrollX = pinchCenterRef.current * ratio - containerX;
        const maxScroll = Math.max(0, newTotalWidth - containerWidth);

        setZoom(newZoom);
        setScrollX(Math.max(0, Math.min(maxScroll, newScrollX)));
      }
      e.preventDefault();
      return;
    }

    // Single-finger pan
    if (touchStartRef.current === null || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const dxPan = currentX - touchStartRef.current;

    // If moved more than 5px, it's not a tap
    if (Math.abs(dxPan) > 5) {
      isTapRef.current = false;
    }

    // Track velocity for inertia
    const now = Date.now();
    const dt = now - lastTouchTimeRef.current;
    if (dt > 0) {
      velocityRef.current = (lastTouchXRef.current - currentX) / dt * 16; // px per frame
    }
    lastTouchXRef.current = currentX;
    lastTouchTimeRef.current = now;

    const maxScroll = Math.max(0, totalWidth - containerWidth);
    setScrollX(Math.max(0, Math.min(maxScroll, scrollStartRef.current - dxPan)));
    e.preventDefault();
  }, [containerWidth, totalWidth]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Check for tap-to-seek (short duration, no significant movement)
    if (isTapRef.current && Date.now() - tapStartTimeRef.current < 300) {
      // Get the last touch position from changedTouches
      if (e.changedTouches.length > 0) {
        handleSeek(e.changedTouches[0].clientX);
      }
    } else if (Math.abs(velocityRef.current) > MIN_SCROLL_VELOCITY) {
      // Start inertial scrolling
      const doMomentum = () => {
        velocityRef.current *= SCROLL_FRICTION;
        if (Math.abs(velocityRef.current) < MIN_SCROLL_VELOCITY) {
          momentumFrameRef.current = 0;
          return;
        }
        const maxScroll = Math.max(0, containerWidth * zoom - containerWidth);
        setScrollX((prev) => Math.max(0, Math.min(maxScroll, prev + velocityRef.current)));
        momentumFrameRef.current = requestAnimationFrame(doMomentum);
      };
      momentumFrameRef.current = requestAnimationFrame(doMomentum);
    }

    touchStartRef.current = null;
    pinchStartDistRef.current = 0;
  }, [handleSeek, containerWidth, zoom]);

  // Minimap tap
  const handleMinimapTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e
      ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0]?.clientX ?? 0
      : (e as React.MouseEvent).clientX;
    handleSeek(clientX, true);
  }, [handleSeek]);

  // ─── Zoom buttons (center-preserving) ───
  const setZoomLevel = useCallback((newZoom: number) => {
    const cw = containerWidth;
    const oldTotalWidth = cw * zoom;
    const newTotalWidth = cw * newZoom;

    // Keep center of viewport fixed
    const viewCenter = scrollX + cw / 2;
    const fraction = viewCenter / oldTotalWidth;
    const newScrollX = fraction * newTotalWidth - cw / 2;
    const maxScroll = Math.max(0, newTotalWidth - cw);

    setZoom(newZoom);
    setScrollX(Math.max(0, Math.min(maxScroll, newScrollX)));
  }, [containerWidth, zoom, scrollX]);

  // ─── Canvas rendering ───
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogramData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, CANVAS_HEIGHT);

    const durationS = session.durationMs / 1000;
    if (durationS <= 0) return;

    const spec = spectrogramData;
    const wHalf = CANVAS_HEIGHT * 0.45;
    const wMid = CANVAS_HEIGHT * 0.5;

    // ─── Beat grid lines ───
    const bpm = session.bpm;
    const sub = session.subdivision || 1;
    const meterNum = parseInt(session.meter?.split('/')[0] || '4') || 4;
    const beatsPerMeasure = meterNum * sub;
    const ioi = 60 / bpm / sub;
    const latencyOffsetS = latencyOffsetMs / 1000;

    {
      let t = 0;
      let beatIdx = 0;
      while (t < durationS) {
        const adjustedT = t + latencyOffsetS;
        const x = (adjustedT / durationS) * totalWidth;
        const isDownbeat = beatIdx % beatsPerMeasure === 0;
        const isMainBeat = beatIdx % sub === 0;

        // Scoring window zone
        const scoringWindowS = ioi * 0.05;
        const scoringWindowPx = (scoringWindowS / durationS) * totalWidth;
        if (isMainBeat && scoringWindowPx > 1) {
          ctx.fillStyle = 'rgba(74,222,128,0.06)';
          ctx.fillRect(x - scoringWindowPx, 0, scoringWindowPx * 2, CANVAS_HEIGHT);
        }

        // Grid line — much brighter now
        ctx.strokeStyle = isDownbeat
          ? 'rgba(255,255,255,0.5)'
          : isMainBeat
            ? 'rgba(255,255,255,0.25)'
            : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = isDownbeat ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();

        // Measure:beat labels at zoom ≥ 4×
        if (zoom >= 4 && isMainBeat) {
          const measureNum = Math.floor(beatIdx / beatsPerMeasure) + 1;
          const beatInMeasure = Math.floor((beatIdx % beatsPerMeasure) / sub) + 1;
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${measureNum}:${beatInMeasure}`, x, 12);
        }

        t += ioi;
        beatIdx++;
      }
    }

    // ─── Spectrogram waveform (frequency-colored) ───
    const windowsPerPixel = spec.windowCount / totalWidth;

    for (let px = 0; px < totalWidth; px++) {
      const wIdx = Math.min(spec.windowCount - 1, Math.floor(px * windowsPerPixel));

      const bassE = spec.bass[wIdx];
      const midE = spec.mid[wIdx];
      const highE = spec.high[wIdx];

      // Stack bands bottom-to-top: bass at bottom, high at top
      const totalE = bassE + midE + highE;
      if (totalE < 0.001) continue;

      const barH = totalE * wHalf;

      // Bass (bottom portion)
      if (bassE > 0.001) {
        const h = (bassE / totalE) * barH;
        const alpha = showBass ? 0.7 : 0.07;
        ctx.fillStyle = bandColor('bass', alpha);
        ctx.fillRect(px, wMid + barH - h, 1, h); // bottom
        ctx.fillRect(px, wMid - barH, 1, h); // top (mirrored)
      }

      // Mid (middle portion)
      if (midE > 0.001) {
        const bassH = (bassE / totalE) * barH;
        const h = (midE / totalE) * barH;
        const alpha = showMid ? 0.7 : 0.07;
        ctx.fillStyle = bandColor('mid', alpha);
        ctx.fillRect(px, wMid + barH - bassH - h, 1, h);
        ctx.fillRect(px, wMid - barH + bassH, 1, h);
      }

      // High (top portion)
      if (highE > 0.001) {
        const bassH = (bassE / totalE) * barH;
        const midH = (midE / totalE) * barH;
        const h = (highE / totalE) * barH;
        const alpha = showHigh ? 0.7 : 0.07;
        ctx.fillStyle = bandColor('high', alpha);
        ctx.fillRect(px, wMid + barH - bassH - midH - h, 1, h);
        ctx.fillRect(px, wMid - barH + bassH + midH, 1, h);
      }
    }

    // ─── Onset markers ───
    const onsetsToRender = liveOnsets ?? hitEvents?.scoredOnsets;
    if (onsetsToRender) {
      for (const onset of onsetsToRender) {
        const x = (onset.time / durationS) * totalWidth;

        // Color by accuracy
        let color: string;
        if (onset.scored) {
          const absDev = Math.abs(onset.delta);
          color = absDev < 10
            ? 'rgba(74,222,128,0.8)'
            : absDev < 25
              ? 'rgba(251,191,36,0.7)'
              : 'rgba(248,113,113,0.7)';
        } else {
          color = 'rgba(255,255,255,0.15)';
        }

        // Full-height vertical line
        ctx.strokeStyle = color;
        ctx.lineWidth = zoom >= 8 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();

        // Small circle at top
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, 8, zoom >= 4 ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();

        // Dashed connector to matched beat at zoom ≥ 2×
        if (onset.scored && zoom >= 2) {
          const gridX = ((onset.matchedBeatTime + latencyOffsetS) / durationS) * totalWidth;
          ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.3)');
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, 8);
          ctx.lineTo(gridX, 18);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Deviation label at zoom ≥ 4×
        if (zoom >= 4 && onset.scored) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = zoom >= 8 ? '10px "JetBrains Mono", monospace' : '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          const label = `${onset.delta > 0 ? '+' : ''}${onset.delta.toFixed(1)}`;
          ctx.fillText(label, x, CANVAS_HEIGHT - 4);
        }

        // At zoom ≥ 8×: Draw hit waveform shape (40ms window)
        if (zoom >= 8 && rawPcmRef.current && spectrogramData) {
          const sr = spectrogramData.sampleRate;
          const centerSample = Math.floor(onset.time * sr);
          const windowSamples = Math.floor(0.04 * sr); // 40ms
          const startSample = Math.max(0, centerSample - windowSamples / 2);
          const endSample = Math.min(rawPcmRef.current.length, centerSample + windowSamples / 2);

          const windowDurationS = (endSample - startSample) / sr;
          const windowStartX = ((onset.time - windowDurationS / 2) / durationS) * totalWidth;
          const windowEndX = ((onset.time + windowDurationS / 2) / durationS) * totalWidth;
          const windowWidthPx = windowEndX - windowStartX;

          if (windowWidthPx > 4) {
            ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.4)');
            ctx.lineWidth = 1;
            ctx.beginPath();

            for (let s = startSample; s < endSample; s++) {
              const frac = (s - startSample) / (endSample - startSample);
              const px = windowStartX + frac * windowWidthPx;
              const amp = rawPcmRef.current[s] * wHalf * 0.8;
              if (s === startSample) {
                ctx.moveTo(px, wMid - amp);
              } else {
                ctx.lineTo(px, wMid - amp);
              }
            }
            ctx.stroke();
          }
        }
      }
    }
  }, [totalWidth, spectrogramData, hitEvents, liveOnsets, session, zoom, showBass, showMid, showHigh, latencyOffsetMs]);

  // Render on change
  useEffect(() => {
    render();
  }, [render]);

  // ─── Mini-map rendering ───
  const renderMiniMap = useCallback(() => {
    const canvas = miniMapCanvasRef.current;
    if (!canvas || !spectrogramData) return;
    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;
    canvas.width = width * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, MINIMAP_HEIGHT);

    const env = spectrogramData.miniMapEnvelope;
    const barW = width / env.length;
    const midY = MINIMAP_HEIGHT / 2;
    const halfH = MINIMAP_HEIGHT * 0.45;

    // Draw waveform envelope
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < env.length; i++) {
      const h = env[i] * halfH;
      ctx.fillRect(i * barW, midY - h, Math.max(1, barW), h * 2);
    }

    // Viewport indicator
    if (zoom > 1) {
      const viewStart = scrollX / totalWidth;
      const viewEnd = (scrollX + containerWidth) / totalWidth;
      const x1 = viewStart * width;
      const x2 = viewEnd * width;

      // Dim outside viewport
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, x1, MINIMAP_HEIGHT);
      ctx.fillRect(x2, 0, width - x2, MINIMAP_HEIGHT);

      // Bright border on viewport
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, 0, x2 - x1, MINIMAP_HEIGHT);
    }

    // Playhead on minimap
    const playX = playbackPos * width;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, MINIMAP_HEIGHT);
    ctx.stroke();
  }, [spectrogramData, containerWidth, zoom, scrollX, totalWidth, playbackPos]);

  useEffect(() => {
    renderMiniMap();
  }, [renderMiniMap]);

  // ─── Save / Export ───

  const saveAudio = useCallback(async (withClick: boolean) => {
    if (!audioBufferRef.current) return;
    setIsSaving(true);

    try {
      const { getBuffer } = await import('../../audio/sounds');
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
        const bpm = session.bpm;
        const subdivision = session.subdivision || 1;
        const ioi = 60 / bpm / subdivision;
        const meterNum = parseInt(session.meter) || 4;
        const clickBuf = getBuffer(clickSoundId) || getBuffer('woodblock');
        const accentBuf = getBuffer(accentSoundId) || clickBuf;

        if (clickBuf) {
          const clickMasterGain = offline.createGain();
          clickMasterGain.gain.value = clickVolume;
          clickMasterGain.connect(offline.destination);
          const latencyOffsetS = latencyOffsetMs / 1000;

          let beatTime = 0;
          let beatIdx = 0;
          while (beatTime < durationS) {
            const adjustedBeatTime = beatTime + latencyOffsetS;
            if (adjustedBeatTime >= 0 && adjustedBeatTime < durationS) {
              const isDownbeat = beatIdx % (subdivision * meterNum) === 0;
              const isMainBeat = beatIdx % subdivision === 0;
              const volState = isDownbeat ? VolumeState.ACCENT
                : isMainBeat ? VolumeState.LOUD
                : VolumeState.MED;
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
            beatTime += ioi;
            beatIdx++;
          }
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
      for (let i = 0; i < pcm.length; i++) {
        const abs = Math.abs(pcm[i]);
        if (abs > peak) peak = abs;
      }
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
  }, [session, clickSoundId, accentSoundId, accentThreshold, clickVolume, latencyOffsetMs]);

  // ─── No recording guard ───
  if (!session.hasRecording) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm">No recording for this session</p>
      </div>
    );
  }

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent border-white/30 rounded-full animate-spin" />
        <p className="text-text-muted text-xs">Analyzing waveform…</p>
      </div>
    );
  }

  // ─── Render ───
  return (
    <div className="flex flex-col gap-2">

      {/* ─── Mini-map ─── */}
      <div
        className="rounded-md overflow-hidden border border-border-subtle cursor-pointer"
        onClick={handleMinimapTap}
        onTouchStart={handleMinimapTap}
      >
        <canvas
          ref={miniMapCanvasRef}
          style={{ width: '100%', height: MINIMAP_HEIGHT, display: 'block' }}
        />
      </div>

      {/* ─── Main timeline canvas ─── */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-border-subtle relative bg-[rgba(0,0,0,0.3)]"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: totalWidth, height: CANVAS_HEIGHT }}
          />
          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              left: `${playbackPos * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: 'rgba(255,255,255,0.95)',
              pointerEvents: 'none',
              boxShadow: '0 0 8px rgba(255,255,255,0.5), 0 0 16px rgba(255,255,255,0.2)',
            }}
          />
        </div>
      </div>

      {/* ─── Band filter toggles + zoom buttons ─── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Band filters */}
        <button
          onClick={() => setShowBass(!showBass)}
          className={`px-2 py-1 rounded text-[10px] font-bold touch-manipulation transition-colors
            ${showBass ? 'text-white' : 'text-white/20'}`}
          style={{ backgroundColor: showBass ? 'hsla(15,80%,55%,0.3)' : 'rgba(255,255,255,0.05)' }}
        >
          Bass
        </button>
        <button
          onClick={() => setShowMid(!showMid)}
          className={`px-2 py-1 rounded text-[10px] font-bold touch-manipulation transition-colors
            ${showMid ? 'text-white' : 'text-white/20'}`}
          style={{ backgroundColor: showMid ? 'hsla(140,60%,50%,0.3)' : 'rgba(255,255,255,0.05)' }}
        >
          Mid
        </button>
        <button
          onClick={() => setShowHigh(!showHigh)}
          className={`px-2 py-1 rounded text-[10px] font-bold touch-manipulation transition-colors
            ${showHigh ? 'text-white' : 'text-white/20'}`}
          style={{ backgroundColor: showHigh ? 'hsla(195,80%,55%,0.3)' : 'rgba(255,255,255,0.05)' }}
        >
          High
        </button>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        {/* Zoom buttons */}
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            onClick={() => setZoomLevel(z)}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold touch-manipulation transition-colors
              ${Math.abs(zoom - z) < 0.5
                ? 'bg-[rgba(255,255,255,0.15)] text-white'
                : 'bg-[rgba(255,255,255,0.04)] text-white/30'}`}
          >
            {z}×
          </button>
        ))}
        {!ZOOM_LEVELS.some((z) => Math.abs(zoom - z) < 0.5) && (
          <span className="px-1 py-1 text-[10px] font-mono text-white/30">
            {zoom.toFixed(1)}×
          </span>
        )}
      </div>

      {/* ─── Transport bar ─── */}
      <div className="flex items-center gap-2 bg-bg-raised/60 rounded-lg px-3 py-2 border border-border-subtle">
        {/* Skip back 5s */}
        <button
          onClick={() => skip(-5)}
          className="w-8 h-8 rounded flex items-center justify-center text-white/60 active:text-white touch-manipulation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlayback}
          disabled={!isReady}
          className={`w-10 h-10 rounded-lg flex items-center justify-center touch-manipulation transition-colors
            ${isPlaying
              ? 'bg-white/15 text-white'
              : 'bg-white/8 text-white/70 active:bg-white/12'}
            ${!isReady ? 'opacity-30' : ''}`}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21" />
            </svg>
          )}
        </button>

        {/* Skip forward 5s */}
        <button
          onClick={() => skip(5)}
          className="w-8 h-8 rounded flex items-center justify-center text-white/60 active:text-white touch-manipulation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>

        {/* Time display */}
        <span className="text-xs font-mono text-white/40 min-w-[70px] text-center">
          {formatTime(playbackPos * session.durationMs)} / {formatTime(session.durationMs)}
        </span>

        {/* Speed selector */}
        <button
          onClick={() => {
            const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
            const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
            setPlaybackSpeed(next);
          }}
          className={`px-2 py-1 rounded text-[10px] font-mono font-bold touch-manipulation transition-colors
            ${playbackSpeed !== 1 ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/40'}`}
        >
          {playbackSpeed}×
        </button>

        {/* Click toggle */}
        <button
          onClick={() => setClickOverlay(!clickOverlay)}
          className={`ml-auto w-8 h-8 rounded flex items-center justify-center touch-manipulation transition-colors
            ${clickOverlay ? 'text-white/80' : 'text-white/20'}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
            {clickOverlay && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
          </svg>
        </button>
      </div>

      {/* Click volume slider (visible when click enabled) */}
      {clickOverlay && (
        <div className="flex items-center gap-2 px-3">
          <span className="text-[9px] text-white/30">Click Vol</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(clickVolume * 100)}
            onChange={(e) => setClickVolume(Number(e.target.value) / 100)}
            className="flex-1 accent-white h-1 bg-white/10 rounded-full appearance-none max-w-[160px]
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                       [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-[9px] text-white/30 font-mono w-7 text-right">
            {Math.round(clickVolume * 100)}%
          </span>
        </div>
      )}

      {/* ─── Save / Export ─── */}
      {isReady && (
        <div className="flex gap-2">
          <button
            onClick={() => saveAudio(false)}
            disabled={isSaving}
            className="flex-1 py-2 bg-bg-raised border border-border-subtle text-text-secondary rounded-md text-[10px] min-h-[38px] hover:bg-border-subtle transition-colors disabled:opacity-40"
          >
            {isSaving ? 'Rendering…' : 'Save Raw'}
          </button>
          <button
            onClick={() => saveAudio(true)}
            disabled={isSaving}
            className="flex-1 py-2 bg-bg-raised border border-border-subtle text-text-primary rounded-md text-[10px] min-h-[38px] hover:bg-border-subtle transition-colors disabled:opacity-40"
          >
            {isSaving ? 'Rendering…' : 'Save with Click'}
          </button>
        </div>
      )}

      {/* ─── Legend ─── */}
      <div className="flex items-center gap-3 text-[9px] text-white/30">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success inline-block" /> &lt;10ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning inline-block" /> 10–25ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-danger inline-block" /> &gt;25ms
        </span>
      </div>

      {/* ─── Tune drawer toggle ─── */}
      <button
        onClick={() => setShowTuneDrawer(!showTuneDrawer)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs touch-manipulation transition-colors
          ${showTuneDrawer ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Tune
      </button>

      {/* ─── Scoring controls (tune drawer) ─── */}
      {showTuneDrawer && hitEvents && session.analyzed && (
        <div className="border border-border-subtle rounded-lg p-3 bg-bg-raised/40">
          <ScoringControls
            session={session}
            hitEvents={hitEvents}
            compact={false}
            onResult={handleScoringResult}
            onLatencyChange={setLatencyOffsetMs}
          />
        </div>
      )}
    </div>
  );
}
