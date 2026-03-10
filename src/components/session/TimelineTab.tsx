/**
 * TimelineTab — DAW-style waveform display.
 *
 * Canvas-rendered:
 * - Grey audio waveform
 * - White metronome grid lines (weight: downbeat > beat > subdivision)
 * - Green-shaded scoring window zones
 * - Color-coded onset markers with deviation values at high zoom
 * - Zoom buttons (1×, 2×, 4×, 8×)
 * - Horizontal scroll (drag) within timeline
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { SessionAnalysis, ScoredOnset } from '../../analysis/types';
import * as db from '../../store/db';
import { ScoringControls } from './ScoringControls';
import { HelpTip } from '../ui/HelpTip';
import { INSTRUMENT_INFO } from '../../analysis/classification';
import type { InstrumentName } from '../../analysis/classification';
import { useSettingsStore } from '../../store/settings-store';
import { VolumeState, VOLUME_GAINS } from '../../audio/types';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

const ZOOM_LEVELS = [1, 2, 4, 8];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function TimelineTab({ session, hitEvents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const [containerWidth, setContainerWidth] = useState(350);
  const touchStartRef = useRef<number | null>(null);
  const scrollStartRef = useRef(0);
  /** Live-scored onsets from ScoringControls — overrides hitEvents when sliders are adjusted */
  const [liveOnsets, setLiveOnsets] = useState<ScoredOnset[] | null>(null);

  // ─── Click sound settings ───
  const clickSoundId = useSettingsStore((s) => s.clickSound);
  const accentSoundId = useSettingsStore((s) => s.accentSound);
  const accentThreshold = useSettingsStore((s) => s.accentSoundThreshold);

  // ─── Playback state ───
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0); // 0–1 fraction of duration
  const [showLanes, setShowLanes] = useState(false);
  const [clickOverlay, setClickOverlay] = useState(true);
  const [clickVolume, setClickVolume] = useState(0.5);
  const [isSaving, setIsSaving] = useState(false);
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(() => {
    const s = useSettingsStore.getState();
    return s.calibratedOffset + s.manualAdjustment;
  });
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const clickNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const clickGainRef = useRef<GainNode | null>(null);
  const playStartTimeRef = useRef(0); // AudioContext time when play started
  const playOffsetRef = useRef(0);    // offset into the buffer (for resume)
  const animFrameRef = useRef(0);

  const handleScoringResult = useCallback((result: SessionAnalysis) => {
    setLiveOnsets(result.scoredOnsets);
  }, []);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Load waveform data (downsample from PCM) + prepare AudioBuffer for playback
  useEffect(() => {
    if (!session.hasRecording) return;
    db.getRecording(session.id).then(async (blob) => {
      if (!blob) return;
      const buf = await blob.arrayBuffer();
      const pcm = new Float32Array(buf);

      // Downsample for waveform display
      const targetPoints = 2000;
      const step = Math.max(1, Math.floor(pcm.length / targetPoints));
      const downsampled = new Float32Array(Math.ceil(pcm.length / step));
      for (let i = 0; i < downsampled.length; i++) {
        let max = 0;
        const start = i * step;
        const end = Math.min(start + step, pcm.length);
        for (let j = start; j < end; j++) {
          const abs = Math.abs(pcm[j]);
          if (abs > max) max = abs;
        }
        downsampled[i] = max;
      }
      setWaveform(downsampled);

      // Create AudioBuffer for playback (use session's sample rate — may be compressed)
      try {
        const { audioEngine: eng } = await import('../../audio/engine');
        const ctx = await eng.initContext();
        const sampleRate = session.recordingSampleRate || 48000;
        const audioBuf = ctx.createBuffer(1, pcm.length, sampleRate);
        audioBuf.getChannelData(0).set(pcm);
        audioBufferRef.current = audioBuf;
      } catch (err) {
        console.warn('Failed to create playback buffer:', err);
      }
    });
  }, [session.id, session.hasRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // ─── Playback controls ───

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      try { gainNodeRef.current.disconnect(); } catch {}
      gainNodeRef.current = null;
    }
    // Stop all scheduled click sounds
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
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(async () => {
    if (!audioBufferRef.current) return;
    stopPlayback();

    const { audioEngine: eng } = await import('../../audio/engine');
    const { getBuffer } = await import('../../audio/sounds');
    const ctx = await eng.initContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;

    const gain = ctx.createGain();
    gain.gain.value = 4.0; // boost mic recording
    source.connect(gain);
    gain.connect(ctx.destination);

    const offset = playOffsetRef.current;
    playStartTimeRef.current = ctx.currentTime;
    source.start(0, offset);
    sourceNodeRef.current = source;
    gainNodeRef.current = gain;
    setIsPlaying(true);

    // ─── Click overlay: schedule clicks using user's sound settings ───
    if (clickOverlay) {
      const durationS = session.durationMs / 1000;
      const bpm = session.bpm;
      const subdivision = session.subdivision || 1;
      const ioi = 60 / bpm / subdivision;
      const meterNum = parseInt(session.meter) || 4;
      const latencyOffsetS = latencyOffsetMs / 1000; // shift clicks to align with scoring grid

      const clickBuf = getBuffer(clickSoundId) || getBuffer('woodblock');
      const accentBuf = getBuffer(accentSoundId) || clickBuf;

      if (clickBuf) {
        const clickGain = ctx.createGain();
        clickGain.gain.value = clickVolume;
        clickGain.connect(ctx.destination);
        clickGainRef.current = clickGain;

        const scheduled: AudioBufferSourceNode[] = [];
        let beatTime = 0;
        let beatIdx = 0;

        while (beatTime < durationS) {
          // Shift click by latency offset so clicks align with the scoring grid
          const adjustedBeatTime = beatTime + latencyOffsetS;
          if (adjustedBeatTime > offset && adjustedBeatTime < durationS) {
            const when = ctx.currentTime + (adjustedBeatTime - offset);
            const isDownbeat = beatIdx % (subdivision * meterNum) === 0;
            const isMainBeat = beatIdx % subdivision === 0;

            // Determine volume state for this beat
            const volState = isDownbeat ? VolumeState.ACCENT
              : isMainBeat ? VolumeState.LOUD
              : VolumeState.MED;

            // Use accent sound if volume state meets threshold
            const useAccent = volState >= accentThreshold;
            const buf = useAccent ? (accentBuf || clickBuf) : clickBuf;

            const clickSource = ctx.createBufferSource();
            clickSource.buffer = buf;

            const clickNodeGain = ctx.createGain();
            clickNodeGain.gain.value = VOLUME_GAINS[volState];
            clickSource.connect(clickNodeGain);
            clickNodeGain.connect(clickGain);

            clickSource.start(when);
            scheduled.push(clickSource);
          }

          beatTime += ioi;
          beatIdx++;
        }

        clickNodesRef.current = scheduled;
      }
    }

    source.onended = () => {
      setIsPlaying(false);
      setPlaybackPos(0);
      playOffsetRef.current = 0;
      sourceNodeRef.current = null;
      // Clean up click nodes
      for (const node of clickNodesRef.current) {
        try { node.stop(); } catch {}
      }
      clickNodesRef.current = [];
    };

    // Animation loop: update playhead position
    const durationS = session.durationMs / 1000;
    const animate = () => {
      if (!sourceNodeRef.current) return;
      const elapsed = ctx.currentTime - playStartTimeRef.current + offset;
      const pos = Math.min(1, elapsed / durationS);
      setPlaybackPos(pos);

      // Auto-scroll to follow playhead
      const cw = containerRef.current?.clientWidth ?? 350;
      const tw = cw * zoom;
      const playheadX = pos * tw;
      setScrollX((prev) => {
        if (playheadX < prev || playheadX > prev + cw) {
          return Math.max(0, playheadX - cw * 0.3);
        }
        return prev;
      });

      if (pos < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [stopPlayback, session.durationMs, session.bpm, session.subdivision, session.meter, zoom, clickOverlay, clickVolume, clickSoundId, accentSoundId, accentThreshold, latencyOffsetMs]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      const { audioEngine: eng } = await import('../../audio/engine');
      const ctx = eng.getContext();
      if (ctx) {
        playOffsetRef.current += ctx.currentTime - playStartTimeRef.current;
      }
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback]);

  // Re-schedule clicks when latency offset changes during playback
  const prevLatencyRef = useRef(latencyOffsetMs);
  useEffect(() => {
    if (prevLatencyRef.current !== latencyOffsetMs && isPlaying) {
      // Restart at current position to re-schedule clicks
      const restart = async () => {
        const { audioEngine: eng } = await import('../../audio/engine');
        const ctx = eng.getContext();
        if (ctx) {
          playOffsetRef.current += ctx.currentTime - playStartTimeRef.current;
        }
        stopPlayback();
        // Small delay to let stop complete
        setTimeout(() => startPlayback(), 50);
      };
      restart();
    }
    prevLatencyRef.current = latencyOffsetMs;
  }, [latencyOffsetMs, isPlaying, stopPlayback, startPlayback]);

  // ─── Save / Export audio file ───

  const saveAudio = useCallback(async (withClick: boolean) => {
    if (!audioBufferRef.current) return;
    setIsSaving(true);

    try {
      const { getBuffer } = await import('../../audio/sounds');
      const srcBuf = audioBufferRef.current;
      const sampleRate = srcBuf.sampleRate;
      const durationS = srcBuf.duration;
      const totalSamples = Math.ceil(durationS * sampleRate);

      // Create offline context
      const offline = new OfflineAudioContext(1, totalSamples, sampleRate);

      // Schedule the recording
      const recSource = offline.createBufferSource();
      recSource.buffer = srcBuf;
      const recGain = offline.createGain();
      recGain.gain.value = 4.0; // same boost as live playback
      recSource.connect(recGain);
      recGain.connect(offline.destination);
      recSource.start(0);

      // Schedule clicks if requested
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

      // Render
      const rendered = await offline.startRendering();

      // Convert to WAV
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

      // Normalize to -1dB headroom
      let peak = 0;
      for (let i = 0; i < pcm.length; i++) {
        const abs = Math.abs(pcm[i]);
        if (abs > peak) peak = abs;
      }
      const scale = peak > 0 ? 0.89 / peak : 1; // -1dB

      let off = 44;
      for (let i = 0; i < pcm.length; i++) {
        const s = pcm[i] * scale;
        v.setInt16(off, Math.max(-32768, Math.min(32767, s < 0 ? s * 0x8000 : s * 0x7FFF)), true);
        off += 2;
      }

      // Download
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

  const canvasHeight = 200;
  const totalWidth = containerWidth * zoom;

  // Draw
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, canvasHeight);

    const durationS = session.durationMs / 1000;
    if (durationS <= 0) return;

    const waveH = canvasHeight * 0.5;
    const waveMid = canvasHeight * 0.35;
    const onsetY = canvasHeight * 0.75;

    // ─── Beat grid lines + scoring window zones ───
    const bpm = session.bpm;
    const sub = session.subdivision || 1;
    const meterNum = parseInt(session.meter.split('/')[0]) || 4;
    const beatsPerMeasure = meterNum * sub;
    const ioi = 60 / bpm / sub;
    // Scoring window in seconds (default 5% of IOI)
    const scoringWindowS = ioi * 0.05;
    const scoringWindowPx = (scoringWindowS / durationS) * totalWidth;

    {
      let t = 0;
      let beatIdx = 0;
      while (t < durationS) {
        const x = (t / durationS) * totalWidth;
        const isDownbeat = beatIdx % beatsPerMeasure === 0;
        const isMainBeat = beatIdx % sub === 0;

        // Green scoring window zone (only for main beats at higher zoom)
        if (isMainBeat && scoringWindowPx > 1) {
          ctx.fillStyle = 'rgba(74,222,128,0.06)';
          ctx.fillRect(x - scoringWindowPx, 0, scoringWindowPx * 2, canvasHeight);
        }

        // Grid line
        ctx.strokeStyle = isDownbeat
          ? 'rgba(255,255,255,0.25)'
          : isMainBeat
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = isDownbeat ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();

        t += ioi;
        beatIdx++;
      }
    }

    // ─── Waveform ───
    if (waveform && waveform.length > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const samplesPerPixel = waveform.length / totalWidth;

      for (let x = 0; x < totalWidth; x++) {
        const sampleIdx = Math.floor(x * samplesPerPixel);
        const amp = waveform[Math.min(sampleIdx, waveform.length - 1)] || 0;
        const barH = amp * waveH;
        ctx.fillRect(x, waveMid - barH, 1, barH * 2);
      }
    }

    // ─── Onset markers ───
    const onsetsToRender = liveOnsets ?? hitEvents?.scoredOnsets;
    if (onsetsToRender) {
      // Detect if classification data exists
      const hasClassification = onsetsToRender.some((o) => o.instrumentLabel);

      for (const onset of onsetsToRender) {
        const x = (onset.time / durationS) * totalWidth;

        if (onset.scored) {
          if (hasClassification && onset.instrumentLabel && onset.instrumentLabel !== 'Unknown') {
            // Color by instrument classification
            const instInfo = INSTRUMENT_INFO[onset.instrumentLabel as InstrumentName];
            const alpha = (onset.instrumentConfidence ?? 0) >= 0.75 ? 0.8 : 0.4;
            ctx.fillStyle = instInfo
              ? `${instInfo.color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
              : 'rgba(255,255,255,0.4)';
          } else {
            // Color by deviation (no classification)
            const absDev = Math.abs(onset.delta);
            ctx.fillStyle = absDev < 10
              ? 'rgba(74,222,128,0.8)'
              : absDev < 25
                ? 'rgba(251,191,36,0.7)'
                : 'rgba(248,113,113,0.7)';
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
        }

        // Triangle marker at top
        ctx.beginPath();
        ctx.moveTo(x, onsetY - 6);
        ctx.lineTo(x - 3, onsetY);
        ctx.lineTo(x + 3, onsetY);
        ctx.closePath();
        ctx.fill();

        // Vertical line
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, onsetY);
        ctx.lineTo(x, onsetY + 20);
        ctx.stroke();

        // Dashed deviation connector (onset → matched beat grid)
        if (onset.scored && zoom >= 2) {
          const gridX = (onset.matchedBeatTime / durationS) * totalWidth;
          const absDev = Math.abs(onset.delta);
          ctx.strokeStyle = absDev < 10
            ? 'rgba(74,222,128,0.4)'
            : absDev < 25
              ? 'rgba(251,191,36,0.3)'
              : 'rgba(248,113,113,0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(x, onsetY - 6);
          ctx.lineTo(gridX, onsetY - 14);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Deviation label at high zoom
        if (zoom >= 4 && onset.scored) {
          ctx.fillStyle = '#8B8B94';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          const label = `${onset.delta > 0 ? '+' : ''}${onset.delta.toFixed(1)}`;
          ctx.fillText(label, x, onsetY + 32);
        }
      }

      // ─── Instrument lanes (below waveform) ───
      if (showLanes && hasClassification) {
        const laneStartY = canvasHeight * 0.85;
        const laneHeight = 12;

        // Collect unique instruments
        const instruments = new Set<string>();
        for (const o of onsetsToRender) {
          if (o.instrumentLabel && o.instrumentLabel !== 'Unknown' && o.scored) {
            instruments.add(o.instrumentLabel);
          }
        }

        const sortedInstruments = Array.from(instruments).sort();
        let laneIdx = 0;

        for (const instName of sortedInstruments) {
          const y = laneStartY + laneIdx * (laneHeight + 2);
          const instInfo = INSTRUMENT_INFO[instName as InstrumentName];
          const color = instInfo?.color ?? '#8B8B94';

          // Lane label
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '8px "DM Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(instName, 2, y + laneHeight - 2);

          // Onset blocks
          for (const o of onsetsToRender) {
            if (o.instrumentLabel !== instName || !o.scored) continue;
            const ox = (o.time / durationS) * totalWidth;
            const h = Math.min(laneHeight, Math.max(3, o.peak * laneHeight * 2));
            ctx.fillStyle = color + '99';
            ctx.fillRect(ox - 1, y + (laneHeight - h), 3, h);
          }

          laneIdx++;
        }
      }
    }
  }, [totalWidth, canvasHeight, waveform, hitEvents, liveOnsets, session, zoom, showLanes]);

  useEffect(() => {
    render();
  }, [render]);

  // Touch: single-finger pan + two-finger pinch-to-zoom
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pinchCenterRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = e.touches[0].clientX;
      scrollStartRef.current = scrollX;
    } else if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoomRef.current = zoom;
      // Center of pinch relative to container
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchCenterRef.current = rect ? cx - rect.left + scrollX : 0;
      touchStartRef.current = null; // cancel pan
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchStartDistRef.current > 0) {
        const scale = dist / pinchStartDistRef.current;
        const newZoom = Math.max(1, Math.min(16, pinchStartZoomRef.current * scale));
        const newTotalWidth = containerWidth * newZoom;

        // Keep pinch center point stable
        const ratio = newZoom / pinchStartZoomRef.current;
        const newScrollX = pinchCenterRef.current * ratio - (pinchCenterRef.current - scrollStartRef.current);
        const maxScroll = Math.max(0, newTotalWidth - containerWidth);

        setZoom(newZoom);
        setScrollX(Math.max(0, Math.min(maxScroll, newScrollX)));
      }
      e.preventDefault();
      return;
    }

    // Single-finger pan
    if (touchStartRef.current === null || e.touches.length !== 1) return;
    const dxPan = e.touches[0].clientX - touchStartRef.current;
    const maxScroll = Math.max(0, totalWidth - containerWidth);
    setScrollX(Math.max(0, Math.min(maxScroll, scrollStartRef.current - dxPan)));
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    pinchStartDistRef.current = 0;
  };

  if (!session.hasRecording) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm">No recording for this session</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Zoom buttons (quick-access; pinch-to-zoom also works) */}
      <div className="flex gap-1.5 items-center">
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            onClick={() => { setZoom(z); setScrollX(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold touch-manipulation
              ${Math.abs(zoom - z) < 0.5
                ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                : 'bg-bg-raised text-text-muted'}`}
          >
            {z}×
          </button>
        ))}
        {!ZOOM_LEVELS.some((z) => Math.abs(zoom - z) < 0.5) && (
          <span className="px-2 py-1.5 text-xs font-mono text-text-muted">
            {zoom.toFixed(1)}×
          </span>
        )}
        <HelpTip text="Zoom into the timeline to see individual hits and their timing deviations. Pinch with two fingers or tap a zoom level. Drag to scroll." />

        {/* Lanes toggle */}
        <button
          onClick={() => setShowLanes(!showLanes)}
          className={`ml-auto px-2 py-1.5 rounded-lg text-[10px] touch-manipulation transition-colors
            ${showLanes
              ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
              : 'bg-bg-raised text-text-muted'}`}
        >
          Lanes
        </button>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlayback}
          disabled={!audioBufferRef.current}
          className={`w-[40px] h-[40px] rounded-lg flex items-center justify-center
                      shrink-0 touch-manipulation
                      ${isPlaying
                        ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                        : 'bg-bg-raised text-text-secondary active:bg-[rgba(255,255,255,0.08)]'}
                      ${!audioBufferRef.current ? 'opacity-30' : ''}`}
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

        {/* Time display */}
        <span className="text-xs font-mono text-text-muted">
          {formatTime(playbackPos * session.durationMs)} / {formatTime(session.durationMs)}
        </span>

        {/* Reset to start */}
        {playbackPos > 0 && !isPlaying && (
          <button
            onClick={() => { playOffsetRef.current = 0; setPlaybackPos(0); }}
            className="text-xs text-text-muted touch-manipulation active:text-text-secondary"
          >
            ↺ Start
          </button>
        )}
      </div>

      {/* Click overlay controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setClickOverlay(!clickOverlay)}
          className={`px-2.5 py-1.5 rounded-lg text-[10px] touch-manipulation transition-colors flex items-center gap-1.5 ${
            clickOverlay
              ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
              : 'bg-bg-raised text-text-muted'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {clickOverlay && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
          </svg>
          Click
        </button>
        {clickOverlay && (
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(clickVolume * 100)}
            onChange={(e) => setClickVolume(Number(e.target.value) / 100)}
            className="flex-1 accent-white h-1 bg-bg-raised rounded-full appearance-none max-w-[120px]
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                       [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
        )}
        {clickOverlay && (
          <span className="text-[9px] text-text-muted font-mono w-8">
            {Math.round(clickVolume * 100)}%
          </span>
        )}
      </div>

      {/* Save / Export buttons */}
      {audioBufferRef.current && (
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

      {/* Timeline canvas with playhead */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-border-subtle relative"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: totalWidth, height: canvasHeight }}
          />
          {/* Playhead line */}
          <div
            style={{
              position: 'absolute',
              left: `${playbackPos * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: 'rgba(255,255,255,0.9)',
              pointerEvents: 'none',
              transition: isPlaying ? 'none' : 'left 0.1s ease',
              boxShadow: '0 0 4px rgba(255,255,255,0.4)',
            }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success inline-block" /> &lt;10ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning inline-block" /> 10–25ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-danger inline-block" /> &gt;25ms
        </span>
        <HelpTip text="Triangles show where your hits landed. Green = within 10ms of the beat (tight). Amber = 10–25ms off. Red = more than 25ms off. Vertical white lines are the metronome grid." />
      </div>

      {/* Scoring controls — adjustments update timeline markers live */}
      {hitEvents && session.analyzed && (
        <ScoringControls
          session={session}
          hitEvents={hitEvents}
          compact={false}
          onResult={handleScoringResult}
          onLatencyChange={setLatencyOffsetMs}
        />
      )}
    </div>
  );
}
