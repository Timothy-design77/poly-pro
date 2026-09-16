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

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { SessionAnalysis, ScoredOnset } from '../../analysis/types';
import { ScoringControls } from './ScoringControls';
import { HitEditor } from './HitEditor';
import { useSessionAudio } from './timeline/useSessionAudio';
import { useTimelineGestures } from './timeline/useTimelineGestures';
import { useTimelinePlayback } from './timeline/useTimelinePlayback';
import { renderTimeline } from './timeline/renderers';
import { MiniMap } from './timeline/MiniMap';
import { ZOOM_LEVELS, SPEED_OPTIONS, CANVAS_HEIGHT, formatTime } from './timeline/timeline-shared';
import { useSettingsStore } from '../../store/settings-store';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

type PanelId = 'audio' | 'loop' | 'edit' | 'export' | null;

function IconButton({ label, onClick, children, active = false, disabled = false, className = '' }: {
  label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <button type="button" aria-label={label} aria-pressed={active || undefined} onClick={onClick} disabled={disabled}
      className={`min-h-[42px] rounded-xl border text-xs font-bold transition-colors touch-manipulation disabled:opacity-30 ${active
        ? 'bg-accent text-bg-primary border-accent'
        : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'} ${className}`}>
      {children}
    </button>
  );
}

export function TimelineTab({ session, hitEvents }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showBass, setShowBass] = useState(true);
  const [showMid, setShowMid] = useState(true);
  const [showHigh, setShowHigh] = useState(true);
  const [liveOnsets, setLiveOnsets] = useState<ScoredOnset[] | null>(null);
  const [editableHitEvents, setEditableHitEvents] = useState<HitEventsRecord | null>(hitEvents);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(1);
  const [panel, setPanel] = useState<PanelId>(null);
  const [syncSaved, setSyncSaved] = useState(false);
  const calibratedOffset = useSettingsStore((state) => state.calibratedOffset);
  const manualAdjustment = useSettingsStore((state) => state.manualAdjustment);
  const setManualAdjustment = useSettingsStore((state) => state.setManualAdjustment);
  const savedSyncOffset = calibratedOffset + manualAdjustment;

  useEffect(() => {
    setEditableHitEvents(hitEvents);
    setLiveOnsets(null);
  }, [hitEvents, session.id]);

  const handleHitEventsChange = useCallback((next: HitEventsRecord) => {
    setEditableHitEvents(next);
    setLiveOnsets(null);
  }, []);

  const { isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef } = useSessionAudio(session);
  const onTapRef = useRef<(clientX: number) => void>(() => {});
  const gestures = useTimelineGestures((clientX) => onTapRef.current(clientX));
  const { zoom, scrollX, setScrollX, containerWidth, totalWidth, containerRef } = gestures;
  const playback = useTimelinePlayback({ session, audioBufferRef, zoom, containerRef, setScrollX });

  const onsets = liveOnsets ?? editableHitEvents?.scoredOnsets ?? [];
  const currentTimeMs = playback.playbackPos * session.durationMs;

  const setSyncOffset = useCallback((value: number) => {
    setSyncSaved(false);
    playback.setLatencyOffsetMs(Math.max(-300, Math.min(300, value)));
  }, [playback.setLatencyOffsetMs]);

  const nudgeSync = useCallback((deltaMs: number) => {
    setSyncOffset(playback.latencyOffsetMs + deltaMs);
  }, [playback.latencyOffsetMs, setSyncOffset]);

  const saveSyncDefault = useCallback(() => {
    setManualAdjustment(playback.latencyOffsetMs - calibratedOffset);
    setSyncSaved(true);
  }, [playback.latencyOffsetMs, calibratedOffset, setManualAdjustment]);

  const handleCanvasTap = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left + scrollX;
    playback.seekToFraction(Math.max(0, Math.min(1, localX / totalWidth)));
  }, [containerRef, scrollX, totalWidth, playback]);

  useEffect(() => { onTapRef.current = handleCanvasTap; }, [handleCanvasTap]);

  useEffect(() => {
    if (!loopEnabled || !playback.isPlaying || loopEnd - loopStart < 0.005) return;
    if (playback.playbackPos >= loopEnd) playback.seekToFraction(loopStart);
  }, [loopEnabled, loopStart, loopEnd, playback.playbackPos, playback.isPlaying, playback.seekToFraction]);

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
    const sorted = [...onsets].sort((a, b) => a.time - b.time);
    const target = direction > 0
      ? sorted.find((hit) => hit.time > currentSec + 0.025) ?? sorted[sorted.length - 1]
      : [...sorted].reverse().find((hit) => hit.time < currentSec - 0.025) ?? sorted[0];
    playback.seekToFraction(Math.max(0, Math.min(1, target.time / (session.durationMs / 1000))));
  }, [onsets, currentTimeMs, session.durationMs, playback]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.code === 'Space') { event.preventDefault(); void playback.togglePlayback(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); void playback.skip(-5); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); void playback.skip(5); }
      else if (event.key.toLowerCase() === 'c') playback.setClickOverlay(!playback.clickOverlay);
      else if (event.key.toLowerCase() === 'l') setLoopEnabled((value) => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playback]);

  const handleScoringResult = useCallback((result: SessionAnalysis) => setLiveOnsets(result.scoredOnsets), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogramData) return;
    renderTimeline({
      canvas, spectrogramData, session, totalWidth, zoom,
      latencyOffsetMs: playback.latencyOffsetMs,
      showBass, showMid, showHigh,
      onsets,
      rawPcm: rawPcmRef.current,
    });
  }, [spectrogramData, session, totalWidth, zoom, playback.latencyOffsetMs, showBass, showMid, showHigh, onsets, rawPcmRef]);

  if (!session.hasRecording) return <div className="flex items-center justify-center h-32"><p className="text-text-muted text-sm">No recording for this session</p></div>;
  if (isLoading) return <div className="flex flex-col items-center justify-center h-48 gap-3"><div className="w-8 h-8 border-2 border-t-transparent border-text-muted/30 rounded-full animate-spin" /><p className="text-text-muted text-xs">Preparing playback…</p></div>;

  const togglePanel = (next: Exclude<PanelId, null>) => setPanel((current) => current === next ? null : next);

  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-text-muted">Playback</p>
          <p className="text-xl font-mono font-bold text-text-primary tabular-nums mt-0.5">{formatTime(currentTimeMs)} <span className="text-sm font-medium text-text-muted">/ {formatTime(session.durationMs)}</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs font-mono font-semibold text-text-secondary">{session.bpm} BPM · {session.meter}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{onsets.length} detected hits</p>
        </div>
      </div>

      <MiniMap spectrogramData={spectrogramData} containerWidth={containerWidth} zoom={zoom} scrollX={scrollX} totalWidth={totalWidth} playbackPos={playback.playbackPos} onSeekFraction={playback.seekToFraction} />

      <div className="rounded-2xl border border-border-subtle overflow-hidden bg-bg-surface shadow-sm">
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle overflow-x-auto">
          <button type="button" onClick={() => setShowBass(!showBass)} className={`h-8 px-3 rounded-full text-[10px] font-bold whitespace-nowrap ${showBass ? 'bg-bg-raised text-text-primary' : 'text-text-muted'}`}>Bass</button>
          <button type="button" onClick={() => setShowMid(!showMid)} className={`h-8 px-3 rounded-full text-[10px] font-bold whitespace-nowrap ${showMid ? 'bg-bg-raised text-text-primary' : 'text-text-muted'}`}>Mid</button>
          <button type="button" onClick={() => setShowHigh(!showHigh)} className={`h-8 px-3 rounded-full text-[10px] font-bold whitespace-nowrap ${showHigh ? 'bg-bg-raised text-text-primary' : 'text-text-muted'}`}>High</button>
          <div className="w-px h-5 bg-border-subtle mx-1 shrink-0" />
          {ZOOM_LEVELS.map((z) => <button type="button" key={z} onClick={() => gestures.setZoomLevel(z)} className={`h-8 px-2.5 rounded-full text-[10px] font-mono font-bold whitespace-nowrap ${Math.abs(zoom - z) < 0.5 ? 'bg-accent text-bg-primary' : 'text-text-muted'}`}>{z}×</button>)}
          <button type="button" onClick={() => playback.setFollowPlayhead(!playback.followPlayhead)} className={`ml-auto h-8 px-3 rounded-full text-[10px] font-bold whitespace-nowrap ${playback.followPlayhead ? 'bg-accent-dim text-accent' : 'text-text-muted'}`}>Follow</button>
        </div>

        <div ref={containerRef} className="overflow-hidden relative bg-[rgba(0,0,0,0.34)]" style={{ touchAction: 'none' }} onTouchStart={gestures.handleTouchStart} onTouchMove={gestures.handleTouchMove} onTouchEnd={gestures.handleTouchEnd}>
          <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth, position: 'relative' }}>
            <canvas ref={canvasRef} style={{ width: totalWidth, height: CANVAS_HEIGHT }} />
            {loopEnabled && <div aria-hidden="true" style={{ position: 'absolute', left: `${loopStart * 100}%`, width: `${(loopEnd - loopStart) * 100}%`, top: 0, bottom: 0, background: 'rgba(255,255,255,0.055)', borderLeft: '2px solid rgba(255,255,255,0.65)', borderRight: '2px solid rgba(255,255,255,0.65)', pointerEvents: 'none' }} />}
            <div style={{ position: 'absolute', left: `${playback.playbackPos * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.98)', pointerEvents: 'none', boxShadow: '0 0 10px rgba(255,255,255,0.55)' }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <IconButton label="Previous detected hit" onClick={() => jumpToHit(-1)}>‹ Hit</IconButton>
        <IconButton label="Toggle click overlay" active={playback.clickOverlay} onClick={() => playback.setClickOverlay(!playback.clickOverlay)}>Click</IconButton>
        <IconButton label="Toggle loop" active={loopEnabled} onClick={() => setLoopEnabled((value) => !value)}>Loop</IconButton>
        <IconButton label="Next detected hit" onClick={() => jumpToHit(1)}>Hit ›</IconButton>
      </div>

      {playback.clickOverlay && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-3">
          <div className="grid grid-cols-[70px_1fr_42px] items-center gap-2">
            <span className="text-[10px] font-semibold text-text-muted">Click level</span>
            <input aria-label="Click level" type="range" min="0" max="100" value={Math.round(playback.clickVolume * 100)} onChange={(e) => playback.setClickVolume(Number(e.target.value) / 100)} />
            <span className="text-[10px] text-text-muted font-mono text-right">{Math.round(playback.clickVolume * 100)}%</span>
          </div>

          <div className="border-t border-border-subtle pt-3 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-text-primary">Metronome sync</p>
                <p className="text-[10px] text-text-muted mt-0.5">Negative = click earlier · Positive = click later</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-bold text-text-primary">{playback.latencyOffsetMs > 0 ? '+' : ''}{playback.latencyOffsetMs.toFixed(1)}ms</p>
                <p className="text-[9px] text-text-muted">saved {savedSyncOffset > 0 ? '+' : ''}{savedSyncOffset.toFixed(1)}ms</p>
              </div>
            </div>

            <div className="grid grid-cols-[46px_46px_1fr_46px_46px] gap-1.5 items-center">
              <button type="button" aria-label="Move metronome 10 milliseconds earlier" onClick={() => nudgeSync(-10)} className="h-10 rounded-lg bg-bg-raised text-[10px] font-mono font-bold text-text-secondary">−10</button>
              <button type="button" aria-label="Move metronome 1 millisecond earlier" onClick={() => nudgeSync(-1)} className="h-10 rounded-lg bg-bg-raised text-[10px] font-mono font-bold text-text-secondary">−1</button>
              <input aria-label="Metronome sync offset" type="range" min="-300" max="300" step="0.5" value={playback.latencyOffsetMs} onChange={(e) => setSyncOffset(Number(e.target.value))} />
              <button type="button" aria-label="Move metronome 1 millisecond later" onClick={() => nudgeSync(1)} className="h-10 rounded-lg bg-bg-raised text-[10px] font-mono font-bold text-text-secondary">+1</button>
              <button type="button" aria-label="Move metronome 10 milliseconds later" onClick={() => nudgeSync(10)} className="h-10 rounded-lg bg-bg-raised text-[10px] font-mono font-bold text-text-secondary">+10</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSyncOffset(savedSyncOffset)} disabled={Math.abs(playback.latencyOffsetMs - savedSyncOffset) < 0.01} className="min-h-[40px] rounded-lg border border-border-subtle text-[10px] font-semibold text-text-muted disabled:opacity-35">Reset to saved</button>
              <button type="button" onClick={saveSyncDefault} className="min-h-[40px] rounded-lg bg-accent-dim text-accent text-[10px] font-bold">{syncSaved ? 'Saved as default' : 'Save as default'}</button>
            </div>
            <p className="text-[9px] leading-relaxed text-text-muted">This shifts the playback metronome and timing overlay against the recording. The audio file is not changed.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <IconButton label="Audio cleanup controls" active={panel === 'audio'} onClick={() => togglePanel('audio')}>Audio</IconButton>
        <IconButton label="Loop region controls" active={panel === 'loop'} onClick={() => togglePanel('loop')}>A / B</IconButton>
        <IconButton label="Hit correction tools" active={panel === 'edit'} onClick={() => togglePanel('edit')}>Edit Hits</IconButton>
        <IconButton label="Export audio" active={panel === 'export'} onClick={() => togglePanel('export')}>Export</IconButton>
      </div>

      {panel === 'audio' && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold text-text-primary">Playback cleanup</p><p className="text-[10px] text-text-muted mt-0.5">Nondestructive. The stored recording stays unchanged.</p></div>
            <button type="button" onClick={() => playback.setCleanupEnabled(!playback.cleanupEnabled)} className={`h-9 px-4 rounded-full text-[10px] font-bold ${playback.cleanupEnabled ? 'bg-accent text-bg-primary' : 'bg-bg-raised text-text-muted'}`}>{playback.cleanupEnabled ? 'On' : 'Off'}</button>
          </div>
          {playback.cleanupEnabled && <div className="grid gap-3">
            <label className="grid grid-cols-[68px_1fr_58px] items-center gap-2 text-[10px] text-text-muted"><span>Low cut</span><input type="range" min="20" max="800" step="10" value={playback.highPassHz} onChange={(e) => playback.setHighPassHz(Number(e.target.value))} /><span className="font-mono text-right">{playback.highPassHz}Hz</span></label>
            <label className="grid grid-cols-[68px_1fr_58px] items-center gap-2 text-[10px] text-text-muted"><span>High cut</span><input type="range" min="3000" max="20000" step="250" value={playback.lowPassHz} onChange={(e) => playback.setLowPassHz(Number(e.target.value))} /><span className="font-mono text-right">{(playback.lowPassHz / 1000).toFixed(1)}k</span></label>
            <label className="grid grid-cols-[68px_1fr_58px] items-center gap-2 text-[10px] text-text-muted"><span>Presence</span><input type="range" min="-6" max="9" step="1" value={playback.presenceBoostDb} onChange={(e) => playback.setPresenceBoostDb(Number(e.target.value))} /><span className="font-mono text-right">{playback.presenceBoostDb > 0 ? '+' : ''}{playback.presenceBoostDb}dB</span></label>
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
          <div className="flex justify-between text-[10px] font-mono text-text-muted"><span>A {formatTime(loopStart * session.durationMs)}</span><span>{formatTime((loopEnd - loopStart) * session.durationMs)} loop</span><span>B {formatTime(loopEnd * session.durationMs)}</span></div>
        </div>
      )}

      {panel === 'edit' && editableHitEvents && hitEvents && session.analyzed && <HitEditor session={session} hitEvents={editableHitEvents} originalHitEvents={hitEvents} playheadFraction={playback.playbackPos} onChange={handleHitEventsChange} />}

      {panel === 'export' && isReady && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-2">
          <p className="text-xs font-bold text-text-primary">Export WAV</p>
          <p className="text-[10px] text-text-muted">Exports the full-quality stored recording. Click export uses the stored timing grid.</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => playback.saveAudio(false)} disabled={playback.isSaving} className="min-h-[44px] rounded-xl bg-bg-raised border border-border-subtle text-text-secondary text-xs font-semibold disabled:opacity-40">{playback.isSaving ? 'Rendering…' : 'Raw recording'}</button>
            <button type="button" onClick={() => playback.saveAudio(true)} disabled={playback.isSaving} className="min-h-[44px] rounded-xl bg-accent text-bg-primary text-xs font-semibold disabled:opacity-40">{playback.isSaving ? 'Rendering…' : 'With click'}</button>
          </div>
        </div>
      )}

      <TuneDrawer session={session} hitEvents={editableHitEvents} onResult={handleScoringResult} onLatencyChange={playback.setLatencyOffsetMs} />

      <div className="sticky bottom-2 z-20 rounded-[22px] border border-border-emphasis bg-bg-surface/95 backdrop-blur-xl shadow-lg p-2.5">
        <div className="grid grid-cols-[46px_46px_1fr_46px_46px] items-center gap-2">
          <button type="button" aria-label="Skip back 5 seconds" onClick={() => void playback.skip(-5)} className="h-11 rounded-xl bg-bg-raised text-text-secondary font-mono text-xs">−5</button>
          <button type="button" aria-label="Previous detected hit" onClick={() => jumpToHit(-1)} className="h-11 rounded-xl text-text-muted text-lg">‹</button>
          <button type="button" aria-label={playback.isPlaying ? 'Pause playback' : 'Start playback'} onClick={() => void playback.togglePlayback()} disabled={!isReady}
            className={`h-14 rounded-2xl text-xl font-bold disabled:opacity-30 ${playback.isPlaying ? 'bg-text-primary text-bg-primary' : 'bg-accent text-bg-primary'}`}>
            {playback.isPlaying ? 'Ⅱ' : '▶'}
          </button>
          <button type="button" aria-label="Next detected hit" onClick={() => jumpToHit(1)} className="h-11 rounded-xl text-text-muted text-lg">›</button>
          <button type="button" aria-label="Skip forward 5 seconds" onClick={() => void playback.skip(5)} className="h-11 rounded-xl bg-bg-raised text-text-secondary font-mono text-xs">+5</button>
        </div>
        <div className="grid grid-cols-[52px_1fr_58px_52px] gap-2 items-center mt-2">
          <button type="button" onClick={() => { const idx = SPEED_OPTIONS.indexOf(playback.playbackSpeed); playback.setPlaybackSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]); }} className="h-9 rounded-lg bg-bg-raised text-[10px] font-mono font-bold text-text-secondary">{playback.playbackSpeed}×</button>
          <input aria-label="Playback volume" type="range" min="0" max="100" value={Math.round(playback.playbackVolume * 100)} onChange={(e) => playback.setPlaybackVolume(Number(e.target.value) / 100)} />
          <span className="text-[10px] font-mono text-text-muted text-right">Vol {Math.round(playback.playbackVolume * 100)}</span>
          <button type="button" onClick={() => playback.setClickOverlay(!playback.clickOverlay)} className={`h-9 rounded-lg text-[10px] font-bold ${playback.clickOverlay ? 'bg-accent-dim text-accent' : 'bg-bg-raised text-text-muted'}`}>Click</button>
        </div>
      </div>
    </div>
  );
}

function TuneDrawer({ session, hitEvents, onResult, onLatencyChange }: { session: SessionRecord; hitEvents: HitEventsRecord | null; onResult: (result: SessionAnalysis) => void; onLatencyChange: (ms: number) => void; }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(!open)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${open ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}>Tune</button>{open && hitEvents && session.analyzed && <div className="border border-border-subtle rounded-lg p-3 bg-bg-raised/40"><ScoringControls session={session} hitEvents={hitEvents} compact={false} onResult={onResult} onLatencyChange={onLatencyChange} /></div>}</>;
}
