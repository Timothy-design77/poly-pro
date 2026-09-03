/**
 * TimelineTab v2 — Mini-DAW session viewer.
 *
 * Features:
 *   - Frequency-colored spectrogram waveform
 *   - Mini-map with viewport indicator + tap-to-jump
 *   - Tap-to-seek on main canvas
 *   - Smooth playback scrolling
 *   - Inertial scroll with friction decay
 *   - Center-preserving zoom
 *   - Full-height onset markers with accuracy coloring
 *   - Playback speed control
 *   - Click overlay with mid-playback toggle
 *   - A/B loop practice over any recording region
 *   - WAV save/export (raw + with click)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { SessionAnalysis, ScoredOnset } from '../../analysis/types';
import { ScoringControls } from './ScoringControls';

import { useSessionAudio } from './timeline/useSessionAudio';
import { useTimelineGestures } from './timeline/useTimelineGestures';
import { useTimelinePlayback } from './timeline/useTimelinePlayback';
import { renderTimeline } from './timeline/renderers';
import { MiniMap } from './timeline/MiniMap';
import {
  ZOOM_LEVELS,
  SPEED_OPTIONS,
  CANVAS_HEIGHT,
  formatTime,
} from './timeline/timeline-shared';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

export function TimelineTab({ session, hitEvents }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showBass, setShowBass] = useState(true);
  const [showMid, setShowMid] = useState(true);
  const [showHigh, setShowHigh] = useState(true);
  const [liveOnsets, setLiveOnsets] = useState<ScoredOnset[] | null>(null);

  // Nondestructive practice loop. Bounds are fractions of the original recording,
  // so the source audio is never altered.
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(1);

  const { isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef } =
    useSessionAudio(session);

  const onTapRef = useRef<(clientX: number) => void>(() => {});
  const gestures = useTimelineGestures((clientX) => onTapRef.current(clientX));
  const { zoom, scrollX, setScrollX, containerWidth, totalWidth, containerRef } = gestures;

  const playback = useTimelinePlayback({
    session,
    audioBufferRef,
    zoom,
    containerRef,
    setScrollX,
  });

  const handleCanvasTap = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left + scrollX;
    const fraction = Math.max(0, Math.min(1, localX / totalWidth));
    playback.seekToFraction(fraction);
  }, [containerRef, scrollX, totalWidth, playback]);

  useEffect(() => {
    onTapRef.current = handleCanvasTap;
  }, [handleCanvasTap]);

  useEffect(() => {
    if (!loopEnabled || !playback.isPlaying) return;
    if (loopEnd - loopStart < 0.005) return;
    if (playback.playbackPos >= loopEnd) {
      playback.seekToFraction(loopStart);
    }
  }, [loopEnabled, loopStart, loopEnd, playback.playbackPos, playback.isPlaying, playback.seekToFraction]);

  const setLoopA = useCallback(() => {
    const next = Math.min(playback.playbackPos, loopEnd - 0.005);
    setLoopStart(Math.max(0, next));
    setLoopEnabled(true);
  }, [playback.playbackPos, loopEnd]);

  const setLoopB = useCallback(() => {
    const next = Math.max(playback.playbackPos, loopStart + 0.005);
    setLoopEnd(Math.min(1, next));
    setLoopEnabled(true);
  }, [playback.playbackPos, loopStart]);

  const clearLoop = useCallback(() => {
    setLoopEnabled(false);
    setLoopStart(0);
    setLoopEnd(1);
  }, []);

  const handleScoringResult = useCallback((result: SessionAnalysis) => {
    setLiveOnsets(result.scoredOnsets);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogramData) return;
    renderTimeline({
      canvas,
      spectrogramData,
      session,
      totalWidth,
      zoom,
      latencyOffsetMs: playback.latencyOffsetMs,
      showBass,
      showMid,
      showHigh,
      onsets: liveOnsets ?? hitEvents?.scoredOnsets,
      rawPcm: rawPcmRef.current,
    });
  }, [spectrogramData, session, totalWidth, zoom, playback.latencyOffsetMs,
      showBass, showMid, showHigh, liveOnsets, hitEvents, rawPcmRef]);

  if (!session.hasRecording) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm">No recording for this session</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent border-white/30 rounded-full animate-spin" />
        <p className="text-text-muted text-xs">Analyzing waveform…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <MiniMap
        spectrogramData={spectrogramData}
        containerWidth={containerWidth}
        zoom={zoom}
        scrollX={scrollX}
        totalWidth={totalWidth}
        playbackPos={playback.playbackPos}
        onSeekFraction={playback.seekToFraction}
      />

      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-border-subtle relative bg-[rgba(0,0,0,0.3)]"
        style={{ touchAction: 'none' }}
        onTouchStart={gestures.handleTouchStart}
        onTouchMove={gestures.handleTouchMove}
        onTouchEnd={gestures.handleTouchEnd}
      >
        <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: totalWidth, height: CANVAS_HEIGHT }} />
          {loopEnabled && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${loopStart * 100}%`,
                width: `${(loopEnd - loopStart) * 100}%`,
                top: 0,
                bottom: 0,
                background: 'rgba(255,255,255,0.045)',
                borderLeft: '1px solid rgba(255,255,255,0.45)',
                borderRight: '1px solid rgba(255,255,255,0.45)',
                pointerEvents: 'none',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              left: `${playback.playbackPos * 100}%`,
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

      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setShowBass(!showBass)} className={`px-2 py-1 rounded text-[10px] font-bold touch-manipulation transition-colors ${showBass ? 'text-white' : 'text-white/20'}`} style={{ backgroundColor: showBass ? 'hsla(15,80%,55%,0.3)' : 'rgba(255,255,255,0.05)' }}>Bass</button>
        <button onClick={() => setShowMid(!showMid)} className={`px-2 py-1 rounded text-[10px] font-bold touch-manipulation transition-colors ${showMid ? 'text-white' : 'text-white/20'}`} style={{ backgroundColor: showMid ? 'hsla(140,60%,50%,0.3)' : 'rgba(255,255,255,0.05)' }}>Mid</button>
        <button onClick={() => setShowHigh(!showHigh)} className={`px-2 py-1 rounded text-[10px] font-bold touch-manipulation transition-colors ${showHigh ? 'text-white' : 'text-white/20'}`} style={{ backgroundColor: showHigh ? 'hsla(195,80%,55%,0.3)' : 'rgba(255,255,255,0.05)' }}>High</button>
        <div className="w-px h-5 bg-border-subtle mx-1" />
        {ZOOM_LEVELS.map((z) => (
          <button key={z} onClick={() => gestures.setZoomLevel(z)} className={`px-2 py-1 rounded text-[10px] font-mono font-bold touch-manipulation transition-colors ${Math.abs(zoom - z) < 0.5 ? 'bg-[rgba(255,255,255,0.15)] text-white' : 'bg-[rgba(255,255,255,0.04)] text-white/30'}`}>{z}×</button>
        ))}
        {!ZOOM_LEVELS.some((z) => Math.abs(zoom - z) < 0.5) && <span className="px-1 py-1 text-[10px] font-mono text-white/30">{zoom.toFixed(1)}×</span>}
      </div>

      <div className="flex items-center gap-2 bg-bg-raised/60 rounded-lg px-3 py-2 border border-border-subtle">
        <button onClick={() => playback.skip(-5)} className="w-8 h-8 rounded flex items-center justify-center text-white/60 active:text-white touch-manipulation" aria-label="Skip back 5 seconds">−5</button>
        <button onClick={playback.togglePlayback} disabled={!isReady} className={`w-10 h-10 rounded-lg flex items-center justify-center touch-manipulation transition-colors ${playback.isPlaying ? 'bg-white/15 text-white' : 'bg-white/8 text-white/70 active:bg-white/12'} ${!isReady ? 'opacity-30' : ''}`} aria-label={playback.isPlaying ? 'Pause' : 'Play'}>
          {playback.isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <button onClick={() => playback.skip(5)} className="w-8 h-8 rounded flex items-center justify-center text-white/60 active:text-white touch-manipulation" aria-label="Skip forward 5 seconds">+5</button>
        <span className="text-xs font-mono text-white/40 min-w-[70px] text-center">{formatTime(playback.playbackPos * session.durationMs)} / {formatTime(session.durationMs)}</span>
        <button onClick={() => { const idx = SPEED_OPTIONS.indexOf(playback.playbackSpeed); playback.setPlaybackSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]); }} className={`px-2 py-1 rounded text-[10px] font-mono font-bold touch-manipulation transition-colors ${playback.playbackSpeed !== 1 ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/40'}`}>{playback.playbackSpeed}×</button>
        <button onClick={() => playback.setClickOverlay(!playback.clickOverlay)} className={`ml-auto px-2 h-8 rounded text-[10px] font-bold touch-manipulation transition-colors ${playback.clickOverlay ? 'text-white/80 bg-white/10' : 'text-white/20 bg-white/5'}`}>Click</button>
      </div>

      <div className="grid grid-cols-4 gap-2 bg-bg-raised/40 rounded-lg p-2 border border-border-subtle">
        <button onClick={setLoopA} className="min-h-[36px] rounded bg-white/5 text-[10px] font-bold text-white/70">Set A</button>
        <button onClick={setLoopB} className="min-h-[36px] rounded bg-white/5 text-[10px] font-bold text-white/70">Set B</button>
        <button onClick={() => setLoopEnabled((v) => !v)} disabled={loopEnd - loopStart < 0.005} className={`min-h-[36px] rounded text-[10px] font-bold ${loopEnabled ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/50'}`}>{loopEnabled ? 'Loop On' : 'Loop Off'}</button>
        <button onClick={clearLoop} className="min-h-[36px] rounded bg-white/5 text-[10px] font-bold text-white/40">Clear</button>
        <div className="col-span-4 flex justify-between px-1 text-[9px] font-mono text-white/30">
          <span>A {formatTime(loopStart * session.durationMs)}</span>
          <span>B {formatTime(loopEnd * session.durationMs)}</span>
        </div>
      </div>

      {playback.clickOverlay && (
        <div className="flex items-center gap-2 px-3">
          <span className="text-[9px] text-white/30">Click Vol</span>
          <input type="range" min="0" max="100" value={Math.round(playback.clickVolume * 100)} onChange={(e) => playback.setClickVolume(Number(e.target.value) / 100)} className="flex-1 accent-white h-1 bg-white/10 rounded-full appearance-none max-w-[160px]" />
          <span className="text-[9px] text-white/30 font-mono w-7 text-right">{Math.round(playback.clickVolume * 100)}%</span>
        </div>
      )}

      {isReady && (
        <div className="flex gap-2">
          <button onClick={() => playback.saveAudio(false)} disabled={playback.isSaving} className="flex-1 py-2 bg-bg-raised border border-border-subtle text-text-secondary rounded-md text-[10px] min-h-[38px] hover:bg-border-subtle transition-colors disabled:opacity-40">{playback.isSaving ? 'Rendering…' : 'Save Raw'}</button>
          <button onClick={() => playback.saveAudio(true)} disabled={playback.isSaving} className="flex-1 py-2 bg-bg-raised border border-border-subtle text-text-primary rounded-md text-[10px] min-h-[38px] hover:bg-border-subtle transition-colors disabled:opacity-40">{playback.isSaving ? 'Rendering…' : 'Save with Click'}</button>
        </div>
      )}

      <div className="flex items-center gap-3 text-[9px] text-white/30">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> &lt;10ms</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" /> 10–25ms</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger inline-block" /> &gt;25ms</span>
      </div>

      <TuneDrawer session={session} hitEvents={hitEvents} onResult={handleScoringResult} onLatencyChange={playback.setLatencyOffsetMs} />
    </div>
  );
}

function TuneDrawer({ session, hitEvents, onResult, onLatencyChange }: {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  onResult: (result: SessionAnalysis) => void;
  onLatencyChange: (ms: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs touch-manipulation transition-colors ${open ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}>
        Tune
      </button>
      {open && hitEvents && session.analyzed && (
        <div className="border border-border-subtle rounded-lg p-3 bg-bg-raised/40">
          <ScoringControls session={session} hitEvents={hitEvents} compact={false} onResult={onResult} onLatencyChange={onLatencyChange} />
        </div>
      )}
    </>
  );
}
