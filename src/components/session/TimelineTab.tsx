/**
 * TimelineTab v2 — Mini-DAW session viewer.
 *
 * Features:
 *   - Frequency-colored spectrogram waveform
 *   - Mini-map with viewport indicator + tap-to-jump
 *   - Tap-to-seek on main canvas
 *   - Smooth playback scrolling
 *   - Center-preserving zoom
 *   - Full-height onset markers with accuracy coloring
 *   - Playback speed control and click overlay
 *   - Nondestructive playback cleanup filters
 *   - A/B loop practice over any recording region
 *   - Manual hit correction with re-scoring
 *   - WAV save/export (raw + with click)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { AnalysisConfig } from '../../analysis/types';
import { ClickSyncControls } from './ClickSyncControls';
import { ScoringControls } from './ScoringControls';
import { HitEditor } from './HitEditor';
import { useSessionAudio } from './timeline/useSessionAudio';
import { useTimelineGestures } from './timeline/useTimelineGestures';
import { useTimelinePlayback } from './timeline/useTimelinePlayback';
import { renderTimeline } from './timeline/renderers';
import { MiniMap } from './timeline/MiniMap';
import { ZOOM_LEVELS, SPEED_OPTIONS, CANVAS_HEIGHT, formatTime } from './timeline/timeline-shared';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  editableEvents: HitEventsRecord | null;
  config: AnalysisConfig;
  active: boolean;
  saving: boolean;
  onConfigChange: (partial: Partial<AnalysisConfig>) => void;
  onEventsChange: (next: HitEventsRecord) => void;
  redetectControls?: React.ReactNode;
}

type PanelId = 'sync' | 'audio' | 'loop' | 'edit' | 'tune' | 'export' | null;

function IconButton({ label, onClick, children, active = false, disabled = false, className = '' }: {
  label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}
      className={`min-h-[44px] rounded-xl border text-xs font-semibold touch-manipulation disabled:opacity-30 ${active
        ? 'bg-accent text-bg-primary border-accent'
        : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'} ${className}`}>
      {children}
    </button>
  );
}

export function TimelineTab({ session, hitEvents, editableEvents, config, active, saving, onConfigChange, onEventsChange, redetectControls }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showBass, setShowBass] = useState(true);
  const [showMid, setShowMid] = useState(true);
  const [showHigh, setShowHigh] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(1);
  const [panel, setPanel] = useState<PanelId>(null);
  const { error: audioError, isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef } = useSessionAudio(session);
  const onTapRef = useRef<(clientX: number) => void>(() => {});
  const gestures = useTimelineGestures((clientX) => onTapRef.current(clientX), isReady && active);
  const { zoom, scrollX, setScrollX, containerWidth, totalWidth, containerRef } = gestures;
  const playback = useTimelinePlayback({ session, audioBufferRef, zoom, containerRef, setScrollX, loopEnabled, loopStart, loopEnd, active, gridBeats: hitEvents?.gridBeats, latencyOffsetMs: config.latencyOffsetMs });

  const onsets = useMemo(() => hitEvents?.scoredOnsets ?? [], [hitEvents]);
  const sortedOnsets = useMemo(() => [...onsets].sort((a, b) => a.time - b.time), [onsets]);
  const currentTimeMs = playback.playbackPos * session.durationMs;

  const handleCanvasTap = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left + scrollX;
    playback.seekToFraction(Math.max(0, Math.min(1, localX / totalWidth)));
  }, [containerRef, scrollX, totalWidth, playback]);

  useEffect(() => { onTapRef.current = handleCanvasTap; }, [handleCanvasTap]);

  const setLoopA = useCallback(() => {
    setLoopStart(Math.max(0, Math.min(playback.playbackPos, loopEnd - 0.005)));
    setLoopEnabled(true);
  }, [playback.playbackPos, loopEnd]);

  const setLoopB = useCallback(() => {
    setLoopEnd(Math.min(1, Math.max(playback.playbackPos, loopStart + 0.005)));
    setLoopEnabled(true);
  }, [playback.playbackPos, loopStart]);

  const clearLoop = useCallback(() => {
    setLoopEnabled(false);
    setLoopStart(0);
    setLoopEnd(1);
  }, []);

  const jumpToHit = useCallback((direction: -1 | 1) => {
    if (!onsets.length || session.durationMs <= 0) return;
    const currentSec = currentTimeMs / 1000;
    const sorted = sortedOnsets;
    const target = direction > 0
      ? sorted.find((hit) => hit.time > currentSec + 0.025) ?? sorted[sorted.length - 1]
      : [...sorted].reverse().find((hit) => hit.time < currentSec - 0.025) ?? sorted[0];
    playback.seekToFraction(Math.max(0, Math.min(1, target.time / (session.durationMs / 1000))));
  }, [onsets, sortedOnsets, currentTimeMs, session.durationMs, playback]);

  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const playback = playbackRef.current;
      const target = event.target as HTMLElement | null;
      if (!active || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, button, [role="slider"], [role="tab"], [contenteditable="true"]')) return;
      if (event.code === 'Space') { event.preventDefault(); void playback.togglePlayback(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); void playback.skip(-5); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); void playback.skip(5); }
      else if (event.key.toLowerCase() === 'c') playback.setClickOverlay(!playback.clickOverlay);
      else if (event.key.toLowerCase() === 'l') setLoopEnabled((value) => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogramData) return;
    renderTimeline({
      canvas, spectrogramData, session, totalWidth, zoom,
      latencyOffsetMs: playback.latencyOffsetMs,
      showBass, showMid, showHigh,
      onsets, gridBeats: hitEvents?.gridBeats, scoringWindowPct: config.scoringWindowPct,
      rawPcm: rawPcmRef.current,
    });
  }, [spectrogramData, session, totalWidth, zoom, playback.latencyOffsetMs, showBass, showMid, showHigh, onsets, rawPcmRef, hitEvents?.gridBeats, config.scoringWindowPct]);

  if (!session.hasRecording) return <div className="flex items-center justify-center h-32"><p className="text-text-muted text-sm">No recording for this session</p></div>;
  if (isLoading) return <div className="flex flex-col items-center justify-center h-48 gap-3"><div className="w-8 h-8 border-2 border-t-transparent border-text-muted/30 rounded-full animate-spin" /><p className="text-text-muted text-xs">Preparing playback…</p></div>;

  const togglePanel = (next: Exclude<PanelId, null>) => setPanel((current) => current === next ? null : next);

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>

          <p className="text-xl font-mono font-semibold text-text-primary tabular-nums mt-0.5">{formatTime(currentTimeMs)} <span className="text-sm font-medium text-text-muted">/ {formatTime(session.durationMs)}</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs font-mono font-semibold text-text-secondary">{session.bpm} BPM · {session.meter}</p>
          <p className="text-xs text-text-muted mt-0.5">{onsets.length} detected hits</p>
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-2xl border border-border-subtle bg-bg-surface p-2.5">
        <div className="grid grid-cols-[46px_46px_1fr_46px_46px] items-center gap-2">
          <button type="button" aria-label="Skip back 5 seconds" onClick={() => void playback.skip(-5)} className="h-11 rounded-xl bg-bg-raised text-text-secondary font-mono text-xs">−5</button>
          <button type="button" aria-label="Previous detected hit" onClick={() => jumpToHit(-1)} className="h-11 rounded-xl text-text-muted text-lg">‹</button>
          <button type="button" aria-label={playback.isPlaying ? 'Pause playback' : 'Start playback'} onClick={() => void playback.togglePlayback()} disabled={!isReady}
            className={`h-14 flex items-center justify-center rounded-2xl text-xl font-semibold disabled:opacity-30 ${playback.isPlaying ? 'bg-text-primary text-bg-primary' : 'bg-accent text-bg-primary'}`}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">{playback.isPlaying ? <><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></> : <polygon points="6 3 20 12 6 21" />}</svg>
          </button>
          <button type="button" aria-label="Next detected hit" onClick={() => jumpToHit(1)} className="h-11 rounded-xl text-text-muted text-lg">›</button>
          <button type="button" aria-label="Skip forward 5 seconds" onClick={() => void playback.skip(5)} className="h-11 rounded-xl bg-bg-raised text-text-secondary font-mono text-xs">+5</button>
        </div>
        <div className="grid grid-cols-[60px_1fr_1fr] gap-2 mt-2">
          <button type="button" aria-label={`Playback speed ${playback.playbackSpeed}×`} onClick={() => { const idx = SPEED_OPTIONS.indexOf(playback.playbackSpeed); playback.setPlaybackSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]); }} className="min-h-[44px] rounded-xl bg-bg-raised text-sm tabular-nums">{playback.playbackSpeed}×</button>
          <IconButton label="Toggle click overlay" active={playback.clickOverlay} onClick={() => playback.setClickOverlay(!playback.clickOverlay)}>Click {playback.clickOverlay ? 'on' : 'off'}</IconButton>
          <button type="button" aria-label="Sync click" aria-expanded={panel === 'sync'} disabled={saving} onClick={() => { togglePanel('sync'); playback.setClickOverlay(true); }} className={`ui-button ${panel === 'sync' ? 'ui-button-primary' : 'ui-button-secondary'}`}>Sync</button>
        </div>
      </div>
      {panel === 'sync' && <fieldset disabled={saving} className="ui-surface p-4">
        <ClickSyncControls session={session} hitEvents={editableEvents ?? hitEvents} offsetMs={config.latencyOffsetMs} playheadSeconds={currentTimeMs / 1000} playing={playback.isPlaying}
          onChange={(latencyOffsetMs) => onConfigChange({ latencyOffsetMs })} onSeek={playback.seekToFraction} />
      </fieldset>}

      <label className="sr-only" htmlFor={`seek-${session.id}`}>Recording position</label>
      <input id={`seek-${session.id}`} type="range" min="0" max="1000" step="1" value={Math.round(playback.playbackPos * 1000)} onChange={(event) => playback.seekToFraction(Number(event.target.value) / 1000)} aria-valuetext={`${formatTime(currentTimeMs)} of ${formatTime(session.durationMs)}`} className="w-full accent-accent" />
      {zoom > 1 && <MiniMap spectrogramData={spectrogramData} containerWidth={containerWidth} zoom={zoom} scrollX={scrollX} totalWidth={totalWidth} playbackPos={playback.playbackPos} onSeekFraction={playback.seekToFraction} />}

      <div className="rounded-2xl border border-border-subtle overflow-hidden bg-bg-surface shadow-sm">
        <details>
        <summary className="min-h-[44px] flex items-center px-3 cursor-pointer text-xs text-text-secondary border-b border-border-subtle">Waveform view · {Math.round(zoom)}×</summary>
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle overflow-x-auto">
          <button type="button" aria-pressed={showBass} onClick={() => setShowBass(!showBass)} className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap ${showBass ? 'bg-bg-raised text-text-primary' : 'text-text-muted'}`}>Bass</button>
          <button type="button" aria-pressed={showMid} onClick={() => setShowMid(!showMid)} className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap ${showMid ? 'bg-bg-raised text-text-primary' : 'text-text-muted'}`}>Mid</button>
          <button type="button" aria-pressed={showHigh} onClick={() => setShowHigh(!showHigh)} className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap ${showHigh ? 'bg-bg-raised text-text-primary' : 'text-text-muted'}`}>High</button>
          <div className="w-px h-5 bg-border-subtle mx-1 shrink-0" />
          {ZOOM_LEVELS.map((z) => <button type="button" key={z} aria-pressed={Math.abs(zoom - z) < 0.5} onClick={() => gestures.setZoomLevel(z)} className={`h-8 px-2.5 rounded-full text-xs font-mono font-semibold whitespace-nowrap ${Math.abs(zoom - z) < 0.5 ? 'bg-accent text-bg-primary' : 'text-text-muted'}`}>{z}×</button>)}
          <button type="button" aria-pressed={playback.followPlayhead} onClick={() => playback.setFollowPlayhead(!playback.followPlayhead)} className={`ml-auto h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap ${playback.followPlayhead ? 'bg-accent-dim text-accent' : 'text-text-muted'}`}>Follow</button>
        </div>

        </details>
        <div ref={containerRef} className="overflow-hidden relative bg-bg-surface" onPointerUp={(event) => { if (event.pointerType === 'mouse') handleCanvasTap(event.clientX); }} style={{ touchAction: 'none' }} onTouchStart={gestures.handleTouchStart} onTouchMove={gestures.handleTouchMove} onTouchEnd={gestures.handleTouchEnd} onTouchCancel={gestures.handleTouchCancel}>
          <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth, position: 'relative' }}>
            <canvas aria-label="Recording waveform and detected hits" role="img" ref={canvasRef} style={{ width: totalWidth, height: CANVAS_HEIGHT }} />
            {loopEnabled && <div aria-hidden="true" style={{ position: 'absolute', left: `${loopStart * 100}%`, width: `${(loopEnd - loopStart) * 100}%`, top: 0, bottom: 0, background: 'rgba(21,23,26,0.055)', borderLeft: '2px solid rgba(21,23,26,0.65)', borderRight: '2px solid rgba(21,23,26,0.65)', pointerEvents: 'none' }} />}
            <div style={{ position: 'absolute', left: `${playback.playbackPos * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(21,23,26,0.98)', pointerEvents: 'none', boxShadow: '0 0 10px rgba(21,23,26,0.55)' }} />
          </div>
        </div>
      </div>

      <fieldset disabled={saving} className="grid grid-cols-3 gap-2 disabled:opacity-50">
        <IconButton label="Hit correction tools" active={panel === 'edit'} onClick={() => togglePanel('edit')}>Edit hits</IconButton>
        <IconButton label="Tune scoring" active={panel === 'tune'} onClick={() => togglePanel('tune')}>Scoring</IconButton>
        <IconButton label="Loop region controls" active={panel === 'loop'} onClick={() => togglePanel('loop')}>A / B loop</IconButton>
        <IconButton label="Audio cleanup controls" active={panel === 'audio'} onClick={() => togglePanel('audio')}>Sound</IconButton>
        <IconButton label="Export audio" active={panel === 'export'} onClick={() => togglePanel('export')}>Export</IconButton>
      </fieldset>
      {panel === 'tune' && <fieldset disabled={saving} className="rounded-xl border border-border-subtle bg-bg-surface p-3 space-y-4">
        <ScoringControls bpm={session.bpm} subdivision={session.subdivision} config={config} onChange={onConfigChange} />
        {redetectControls}
      </fieldset>}

      {panel === 'audio' && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-3">
          <label className="flex items-center gap-3 text-xs text-text-secondary">Recording volume<input aria-label="Playback volume" type="range" min="0" max="100" value={Math.round(playback.playbackVolume * 100)} onChange={(event) => playback.setPlaybackVolume(Number(event.target.value) / 100)} className="min-w-0 flex-1" /></label>
          <label className="flex items-center gap-3 text-xs text-text-secondary">Click volume<input aria-label="Click volume" type="range" min="0" max="100" value={Math.round(playback.clickVolume * 100)} onChange={(event) => playback.setClickVolume(Number(event.target.value) / 100)} className="min-w-0 flex-1" /></label>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-text-primary">Playback cleanup</p><p className="text-xs text-text-muted mt-0.5">Nondestructive. The stored recording stays unchanged.</p></div>
            <button type="button" aria-label="Playback cleanup" aria-pressed={playback.cleanupEnabled} onClick={() => playback.setCleanupEnabled(!playback.cleanupEnabled)} className={`h-9 px-4 rounded-full text-xs font-semibold ${playback.cleanupEnabled ? 'bg-accent text-bg-primary' : 'bg-bg-raised text-text-muted'}`}>{playback.cleanupEnabled ? 'On' : 'Off'}</button>
          </div>
          {playback.cleanupEnabled && <div className="grid gap-3">
            <label className="grid grid-cols-[68px_1fr_58px] items-center gap-2 text-xs text-text-muted"><span>Low cut</span><input type="range" min="20" max="800" step="10" value={playback.highPassHz} onChange={(e) => playback.setHighPassHz(Number(e.target.value))} /><span className="font-mono text-right">{playback.highPassHz}Hz</span></label>
            <label className="grid grid-cols-[68px_1fr_58px] items-center gap-2 text-xs text-text-muted"><span>High cut</span><input type="range" min="3000" max="20000" step="250" value={playback.lowPassHz} onChange={(e) => playback.setLowPassHz(Number(e.target.value))} /><span className="font-mono text-right">{(playback.lowPassHz / 1000).toFixed(1)}k</span></label>
            <label className="grid grid-cols-[68px_1fr_58px] items-center gap-2 text-xs text-text-muted"><span>Presence</span><input type="range" min="-6" max="9" step="1" value={playback.presenceBoostDb} onChange={(e) => playback.setPresenceBoostDb(Number(e.target.value))} /><span className="font-mono text-right">{playback.presenceBoostDb > 0 ? '+' : ''}{playback.presenceBoostDb}dB</span></label>
          </div>}
        </div>
      )}

      {panel === 'loop' && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <IconButton label="Set loop start" onClick={setLoopA}>Set A</IconButton>
            <IconButton label="Set loop end" onClick={setLoopB}>Set B</IconButton>
            <IconButton label="Enable or disable loop" active={loopEnabled} onClick={() => setLoopEnabled((value) => !value)}>{loopEnabled ? 'On' : 'Off'}</IconButton>
            <IconButton label="Clear loop" onClick={clearLoop}>Clear</IconButton>
          </div>
          <div className="flex justify-between text-xs font-mono text-text-muted"><span>A {formatTime(loopStart * session.durationMs)}</span><span>{formatTime((loopEnd - loopStart) * session.durationMs)} loop</span><span>B {formatTime(loopEnd * session.durationMs)}</span></div>
        </div>
      )}

      {panel === 'edit' && editableEvents && session.analyzed && <fieldset disabled={saving}><HitEditor session={session} hitEvents={editableEvents} playheadFraction={playback.playbackPos} onChange={onEventsChange} /></fieldset>}

      {panel === 'export' && isReady && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-2">
          <p className="text-xs font-semibold text-text-primary">Export WAV</p>
          <p className="text-xs text-text-muted">Exports the full-quality stored recording. Click export uses the timing preview above. Playback speed and cleanup do not change the exported recording.</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => playback.saveAudio(false)} disabled={playback.isSaving} className="min-h-[44px] rounded-xl bg-bg-raised border border-border-subtle text-text-secondary text-xs font-semibold disabled:opacity-40">{playback.isSaving ? 'Rendering…' : 'Raw recording'}</button>
            <button type="button" onClick={() => playback.saveAudio(true)} disabled={playback.isSaving} className="min-h-[44px] rounded-xl bg-accent text-bg-primary text-xs font-semibold disabled:opacity-40">{playback.isSaving ? 'Rendering…' : 'With click'}</button>
          </div>
          {playback.isSaving && <div className="space-y-2">
            <p role="status" className="text-xs text-text-secondary">Preparing WAV… {Math.round(playback.exportProgress * 100)}%</p>
            <progress aria-label="Audio export progress" max={1} value={playback.exportProgress} className="w-full accent-accent" />
            <button type="button" onClick={playback.cancelExport} className="min-h-[44px] w-full rounded-xl border border-border-subtle text-sm font-semibold">Cancel export</button>
          </div>}
        </div>
      )}

      {audioError && <p role="alert" className="p-3 text-sm text-danger">{audioError}</p>}
      {playback.error && <p role="alert" className="p-3 text-sm text-danger">{playback.error}</p>}


    </div>
  );
}
