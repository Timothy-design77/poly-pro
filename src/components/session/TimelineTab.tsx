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
import { Range } from '../ui/Range';
import { Toggle } from '../ui/Toggle';
import { SettingRow } from '../ui/SettingRow';
import { Notice } from '../ui/Notice';

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

/** Tool toggle: pressed state is an ink outline (ui-choice), not a filled primary button. */
function ToolButton({ label, onClick, children, active = false, disabled = false }: {
  label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean;
}) {
  return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled} className="ui-choice text-xs">{children}</button>;
}

function SliderLine({ label, ariaLabel, min, max, step = 1, value, display, onChange }: {
  label: string; ariaLabel?: string; min: number; max: number; step?: number; value: number; display: string; onChange: (value: number) => void;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between text-sm"><span className="ui-label">{label}</span><span className="tabular-nums text-text-secondary">{display}</span></div>
      <Range aria-label={ariaLabel ?? label} min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
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
          <button type="button" aria-label="Skip back 5 seconds" onClick={() => void playback.skip(-5)} className="ui-icon-button w-full bg-bg-primary text-xs font-semibold tabular-nums">−5s</button>
          <button type="button" aria-label="Previous detected hit" onClick={() => jumpToHit(-1)} className="ui-icon-button w-full"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button>
          <button type="button" aria-label={playback.isPlaying ? 'Pause playback' : 'Start playback'} onClick={() => void playback.togglePlayback()} disabled={!isReady}
            className="flex h-14 items-center justify-center rounded-2xl bg-accent text-[var(--text-on-accent)] disabled:opacity-40">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">{playback.isPlaying ? <><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></> : <polygon points="6 3 20 12 6 21" />}</svg>
          </button>
          <button type="button" aria-label="Next detected hit" onClick={() => jumpToHit(1)} className="ui-icon-button w-full"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          <button type="button" aria-label="Skip forward 5 seconds" onClick={() => void playback.skip(5)} className="ui-icon-button w-full bg-bg-primary text-xs font-semibold tabular-nums">+5s</button>
        </div>
        <div className="grid grid-cols-[60px_1fr_1fr] gap-2 mt-2">
          <button type="button" aria-label={`Playback speed ${playback.playbackSpeed}×`} onClick={() => { const idx = SPEED_OPTIONS.indexOf(playback.playbackSpeed); playback.setPlaybackSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]); }} className="ui-button ui-button-secondary px-2 tabular-nums">{playback.playbackSpeed}×</button>
          <ToolButton label="Toggle click overlay" active={playback.clickOverlay} onClick={() => playback.setClickOverlay(!playback.clickOverlay)}>Click {playback.clickOverlay ? 'on' : 'off'}</ToolButton>
          <button type="button" aria-label="Sync click" aria-expanded={panel === 'sync'} disabled={saving} onClick={() => { togglePanel('sync'); playback.setClickOverlay(true); }} className={`ui-button ${panel === 'sync' ? 'ui-button-primary' : 'ui-button-secondary'}`}>Sync</button>
        </div>
      </div>
      {panel === 'sync' && <fieldset disabled={saving} className="ui-surface p-4">
        <ClickSyncControls session={session} hitEvents={editableEvents ?? hitEvents} offsetMs={config.latencyOffsetMs} playheadSeconds={currentTimeMs / 1000} playing={playback.isPlaying}
          onChange={(latencyOffsetMs) => onConfigChange({ latencyOffsetMs })} onSeek={playback.seekToFraction} />
      </fieldset>}

      <label className="sr-only" htmlFor={`seek-${session.id}`}>Recording position</label>
      <input id={`seek-${session.id}`} type="range" min="0" max="1000" step="1" value={Math.round(playback.playbackPos * 1000)} onChange={(event) => playback.seekToFraction(Number(event.target.value) / 1000)} aria-valuetext={`${formatTime(currentTimeMs)} of ${formatTime(session.durationMs)}`} className="ui-range" style={{ '--fill': `${playback.playbackPos * 100}%` } as React.CSSProperties} />
      {zoom > 1 && <MiniMap spectrogramData={spectrogramData} containerWidth={containerWidth} zoom={zoom} scrollX={scrollX} totalWidth={totalWidth} playbackPos={playback.playbackPos} onSeekFraction={playback.seekToFraction} />}

      <div className="rounded-2xl border border-border-subtle overflow-hidden bg-bg-surface shadow-sm">
        <details>
        <summary className="min-h-[44px] flex items-center px-3 cursor-pointer text-xs font-semibold text-text-secondary border-b border-border-subtle">Waveform view · {Math.round(zoom)}×</summary>
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle">
          <button type="button" aria-pressed={showBass} onClick={() => setShowBass(!showBass)} className="ui-chip">Bass</button>
          <button type="button" aria-pressed={showMid} onClick={() => setShowMid(!showMid)} className="ui-chip">Mid</button>
          <button type="button" aria-pressed={showHigh} onClick={() => setShowHigh(!showHigh)} className="ui-chip">High</button>
          <div aria-hidden="true" className="w-px h-6 bg-border-subtle mx-1 shrink-0" />
          <div role="group" aria-label="Zoom" className="contents">{ZOOM_LEVELS.map((z) => <button type="button" key={z} aria-pressed={Math.abs(zoom - z) < 0.5} onClick={() => gestures.setZoomLevel(z)} className="ui-chip tabular-nums">{z}×</button>)}</div>
          <button type="button" aria-pressed={playback.followPlayhead} onClick={() => playback.setFollowPlayhead(!playback.followPlayhead)} className="ui-chip ml-auto">Follow playhead</button>
        </div>

        </details>
        <div ref={containerRef} className="overflow-hidden relative bg-bg-surface" onPointerUp={(event) => { if (event.pointerType === 'mouse') handleCanvasTap(event.clientX); }} style={{ touchAction: 'none' }} onTouchStart={gestures.handleTouchStart} onTouchMove={gestures.handleTouchMove} onTouchEnd={gestures.handleTouchEnd} onTouchCancel={gestures.handleTouchCancel}>
          <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth, position: 'relative' }}>
            <canvas aria-label="Recording waveform and detected hits" role="img" ref={canvasRef} style={{ width: totalWidth, height: CANVAS_HEIGHT }} />
            {loopEnabled && <div aria-hidden="true" style={{ position: 'absolute', left: `${loopStart * 100}%`, width: `${(loopEnd - loopStart) * 100}%`, top: 0, bottom: 0, background: 'var(--accent-dim)', borderLeft: '2px solid var(--accent)', borderRight: '2px solid var(--accent)', pointerEvents: 'none' }} />}
            <div style={{ position: 'absolute', left: `${playback.playbackPos * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: 'var(--accent)', pointerEvents: 'none' }} />
          </div>
        </div>
      </div>

      <fieldset disabled={saving} className="grid grid-cols-3 gap-2 disabled:opacity-50">
        <ToolButton label="Hit correction tools" active={panel === 'edit'} onClick={() => togglePanel('edit')}>Edit hits</ToolButton>
        <ToolButton label="Tune scoring" active={panel === 'tune'} onClick={() => togglePanel('tune')}>Scoring</ToolButton>
        <ToolButton label="Loop region controls" active={panel === 'loop'} onClick={() => togglePanel('loop')}>A / B loop</ToolButton>
        <ToolButton label="Audio cleanup controls" active={panel === 'audio'} onClick={() => togglePanel('audio')}>Sound</ToolButton>
        <ToolButton label="Export audio" active={panel === 'export'} onClick={() => togglePanel('export')}>Export</ToolButton>
      </fieldset>
      {panel === 'tune' && <fieldset disabled={saving} className="ui-surface p-4 space-y-4">
        <ScoringControls bpm={session.bpm} subdivision={session.subdivision} config={config} onChange={onConfigChange} />
        {redetectControls}
      </fieldset>}

      {panel === 'audio' && (
        <div className="ui-surface p-4 space-y-1">
          <SliderLine label="Recording volume" ariaLabel="Playback volume" min={0} max={100} value={Math.round(playback.playbackVolume * 100)} display={`${Math.round(playback.playbackVolume * 100)}%`} onChange={(value) => playback.setPlaybackVolume(value / 100)} />
          <SliderLine label="Click volume" min={0} max={100} value={Math.round(playback.clickVolume * 100)} display={`${Math.round(playback.clickVolume * 100)}%`} onChange={(value) => playback.setClickVolume(value / 100)} />
          <SettingRow label="Playback cleanup" description="Changes playback only. The stored recording stays unchanged.">
            <Toggle label="Playback cleanup" enabled={playback.cleanupEnabled} onChange={playback.setCleanupEnabled} />
          </SettingRow>
          {playback.cleanupEnabled && <>
            <SliderLine label="Low cut" min={20} max={800} step={10} value={playback.highPassHz} display={`${playback.highPassHz} Hz`} onChange={playback.setHighPassHz} />
            <SliderLine label="High cut" min={3000} max={20000} step={250} value={playback.lowPassHz} display={`${(playback.lowPassHz / 1000).toFixed(1)} kHz`} onChange={playback.setLowPassHz} />
            <SliderLine label="Presence" min={-6} max={9} step={1} value={playback.presenceBoostDb} display={`${playback.presenceBoostDb > 0 ? '+' : ''}${playback.presenceBoostDb} dB`} onChange={playback.setPresenceBoostDb} />
          </>}
        </div>
      )}

      {panel === 'loop' && (
        <div className="ui-surface p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <button type="button" aria-label="Set loop start" onClick={setLoopA} className="ui-button ui-button-secondary px-2 text-xs">Set A</button>
            <button type="button" aria-label="Set loop end" onClick={setLoopB} className="ui-button ui-button-secondary px-2 text-xs">Set B</button>
            <ToolButton label="Enable or disable loop" active={loopEnabled} onClick={() => setLoopEnabled((value) => !value)}>{loopEnabled ? 'Loop on' : 'Loop off'}</ToolButton>
            <button type="button" aria-label="Clear loop" onClick={clearLoop} className="ui-button ui-button-quiet px-2 text-xs">Clear</button>
          </div>
          <div className="flex justify-between text-xs tabular-nums text-text-secondary"><span>A {formatTime(loopStart * session.durationMs)}</span><span>{formatTime((loopEnd - loopStart) * session.durationMs)} loop</span><span>B {formatTime(loopEnd * session.durationMs)}</span></div>
        </div>
      )}

      {panel === 'edit' && editableEvents && session.analyzed && <fieldset disabled={saving}><HitEditor session={session} hitEvents={editableEvents} playheadFraction={playback.playbackPos} onChange={onEventsChange} /></fieldset>}

      {panel === 'export' && isReady && (
        <div className="ui-surface p-4 space-y-2">
          <p className="text-sm font-semibold text-text-primary">Export WAV</p>
          <p className="ui-hint">Exports the full-quality stored recording. Click export uses the timing preview above. Playback speed and cleanup do not change the exported recording.</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => playback.saveAudio(false)} disabled={playback.isSaving} className="ui-button ui-button-secondary">{playback.isSaving ? 'Rendering…' : 'Raw recording'}</button>
            <button type="button" onClick={() => playback.saveAudio(true)} disabled={playback.isSaving} className="ui-button ui-button-primary">{playback.isSaving ? 'Rendering…' : 'With click'}</button>
          </div>
          {playback.isSaving && <div className="space-y-2">
            <p role="status" className="text-xs text-text-secondary">Preparing WAV… {Math.round(playback.exportProgress * 100)}%</p>
            <progress aria-label="Audio export progress" max={1} value={playback.exportProgress} className="w-full accent-accent" />
            <button type="button" onClick={playback.cancelExport} className="ui-button ui-button-secondary ui-button-block">Cancel export</button>
          </div>}
        </div>
      )}

      {audioError && <Notice tone="danger">{audioError}</Notice>}
      {playback.error && <Notice tone="danger">{playback.error}</Notice>}


    </div>
  );
}
