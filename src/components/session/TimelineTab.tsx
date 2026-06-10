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
 *
 * Composition (decomposed from a single 1,250-line component):
 *   - timeline/useSessionAudio     — PCM load + AudioBuffer + spectrogram
 *   - timeline/useTimelineGestures — pan/pinch/tap/inertia + zoom
 *   - timeline/useTimelinePlayback — transport, click overlay, WAV export
 *   - timeline/renderers           — pure canvas painting
 *   - timeline/MiniMap             — overview strip component
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

  // Band filter toggles (true = visible)
  const [showBass, setShowBass] = useState(true);
  const [showMid, setShowMid] = useState(true);
  const [showHigh, setShowHigh] = useState(true);

  // Live-scored onsets from ScoringControls
  const [liveOnsets, setLiveOnsets] = useState<ScoredOnset[] | null>(null);

  // ─── Audio loading ───
  const { isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef } =
    useSessionAudio(session);

  // ─── Gestures (tap handler wired after playback hook exists) ───
  const onTapRef = useRef<(clientX: number) => void>(() => {});
  const gestures = useTimelineGestures((clientX) => onTapRef.current(clientX));
  const { zoom, scrollX, setScrollX, containerWidth, totalWidth, containerRef } = gestures;

  // ─── Playback ───
  const playback = useTimelinePlayback({
    session,
    audioBufferRef,
    zoom,
    containerRef,
    setScrollX,
  });

  // ─── Tap-to-seek on main canvas ───
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

  // ─── Scoring result handler ───
  const handleScoringResult = useCallback((result: SessionAnalysis) => {
    setLiveOnsets(result.scoredOnsets);
  }, []);

  // ─── Main canvas rendering ───
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
      <MiniMap
        spectrogramData={spectrogramData}
        containerWidth={containerWidth}
        zoom={zoom}
        scrollX={scrollX}
        totalWidth={totalWidth}
        playbackPos={playback.playbackPos}
        onSeekFraction={playback.seekToFraction}
      />

      {/* ─── Main timeline canvas ─── */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-border-subtle relative bg-[rgba(0,0,0,0.3)]"
        style={{ touchAction: 'none' }}
        onTouchStart={gestures.handleTouchStart}
        onTouchMove={gestures.handleTouchMove}
        onTouchEnd={gestures.handleTouchEnd}
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
            onClick={() => gestures.setZoomLevel(z)}
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
          onClick={() => playback.skip(-5)}
          className="w-8 h-8 rounded flex items-center justify-center text-white/60 active:text-white touch-manipulation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={playback.togglePlayback}
          disabled={!isReady}
          className={`w-10 h-10 rounded-lg flex items-center justify-center touch-manipulation transition-colors
            ${playback.isPlaying
              ? 'bg-white/15 text-white'
              : 'bg-white/8 text-white/70 active:bg-white/12'}
            ${!isReady ? 'opacity-30' : ''}`}
        >
          {playback.isPlaying ? (
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
          onClick={() => playback.skip(5)}
          className="w-8 h-8 rounded flex items-center justify-center text-white/60 active:text-white touch-manipulation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>

        {/* Time display */}
        <span className="text-xs font-mono text-white/40 min-w-[70px] text-center">
          {formatTime(playback.playbackPos * session.durationMs)} / {formatTime(session.durationMs)}
        </span>

        {/* Speed selector */}
        <button
          onClick={() => {
            const idx = SPEED_OPTIONS.indexOf(playback.playbackSpeed);
            const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
            playback.setPlaybackSpeed(next);
          }}
          className={`px-2 py-1 rounded text-[10px] font-mono font-bold touch-manipulation transition-colors
            ${playback.playbackSpeed !== 1 ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/40'}`}
        >
          {playback.playbackSpeed}×
        </button>

        {/* Click toggle */}
        <button
          onClick={() => playback.setClickOverlay(!playback.clickOverlay)}
          className={`ml-auto w-8 h-8 rounded flex items-center justify-center touch-manipulation transition-colors
            ${playback.clickOverlay ? 'text-white/80' : 'text-white/20'}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
            {playback.clickOverlay && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
          </svg>
        </button>
      </div>

      {/* Click volume slider (visible when click enabled) */}
      {playback.clickOverlay && (
        <div className="flex items-center gap-2 px-3">
          <span className="text-[9px] text-white/30">Click Vol</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(playback.clickVolume * 100)}
            onChange={(e) => playback.setClickVolume(Number(e.target.value) / 100)}
            className="flex-1 accent-white h-1 bg-white/10 rounded-full appearance-none max-w-[160px]
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                       [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-[9px] text-white/30 font-mono w-7 text-right">
            {Math.round(playback.clickVolume * 100)}%
          </span>
        </div>
      )}

      {/* ─── Save / Export ─── */}
      {isReady && (
        <div className="flex gap-2">
          <button
            onClick={() => playback.saveAudio(false)}
            disabled={playback.isSaving}
            className="flex-1 py-2 bg-bg-raised border border-border-subtle text-text-secondary rounded-md text-[10px] min-h-[38px] hover:bg-border-subtle transition-colors disabled:opacity-40"
          >
            {playback.isSaving ? 'Rendering…' : 'Save Raw'}
          </button>
          <button
            onClick={() => playback.saveAudio(true)}
            disabled={playback.isSaving}
            className="flex-1 py-2 bg-bg-raised border border-border-subtle text-text-primary rounded-md text-[10px] min-h-[38px] hover:bg-border-subtle transition-colors disabled:opacity-40"
          >
            {playback.isSaving ? 'Rendering…' : 'Save with Click'}
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
      <TuneDrawer
        session={session}
        hitEvents={hitEvents}
        onResult={handleScoringResult}
        onLatencyChange={playback.setLatencyOffsetMs}
      />
    </div>
  );
}

// ─── Tune drawer (scoring controls) ───

function TuneDrawer({
  session,
  hitEvents,
  onResult,
  onLatencyChange,
}: {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  onResult: (result: SessionAnalysis) => void;
  onLatencyChange: (ms: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs touch-manipulation transition-colors
          ${open ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Tune
      </button>

      {open && hitEvents && session.analyzed && (
        <div className="border border-border-subtle rounded-lg p-3 bg-bg-raised/40">
          <ScoringControls
            session={session}
            hitEvents={hitEvents}
            compact={false}
            onResult={onResult}
            onLatencyChange={onLatencyChange}
          />
        </div>
      )}
    </>
  );
}
