/**
 * DetectionTestBench — guided detection accuracy testing.
 *
 * Steps through 7 test patterns, each a short 3-4 second recording.
 * After each, runs onset detection and shows:
 *   - Mini waveform with detected onset markers
 *   - Expected vs detected count (pass/fail)
 *   - Peak amplitudes and timing gaps
 *   - Specific fix suggestions on failure
 *
 * After all tests, offers auto-tuned settings recommendations.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../store/settings-store';
import { estimateNoiseFloor } from '../../analysis/onset-detection';
import type { DetectedOnset, AnalysisConfig } from '../../analysis/types';
import { useTrainingCapture } from '../../hooks/useTrainingCapture';
import { useDialogFocus } from '../../hooks/useDialogFocus';

// ─── Test Pattern Definitions ───

interface TestPattern {
  id: string;
  name: string;
  icon: string;
  instruction: string;
  detail: string;
  durationS: number;
  expectedCount: number | 'range';
  /** For 'range' type: [min, max] */
  expectedRange?: [number, number];
  /** Pass criteria */
  evaluate: (detections: DetectedOnset[], config: AnalysisConfig) => TestResult;
}

interface TestResult {
  pass: boolean;
  label: string;
  detail: string;
  suggestion?: string;
}

const PATTERNS: TestPattern[] = [
  {
    id: 'single',
    name: 'Single Hit',
    icon: '🥁',
    instruction: 'Play ONE hit',
    detail: 'One clean hit, any drum. Should detect exactly 1.',
    durationS: 3,
    expectedCount: 1,
    evaluate: (d) => {
      if (d.length === 1) return { pass: true, label: '1 detected ✓', detail: `Peak: ${d[0].peak.toFixed(3)}` };
      if (d.length === 0) return { pass: false, label: '0 detected ✗', detail: 'Hit was below noise gate', suggestion: 'Lower Noise Gate or Noise Floor ×' };
      return { pass: false, label: `${d.length} detected ✗`, detail: 'Decay retriggered', suggestion: 'Raise Post-Hit Mask or Min Onset Gap' };
    },
  },
  {
    id: 'flam',
    name: 'Flam',
    icon: '🪘',
    instruction: 'Play a FLAM',
    detail: 'Grace note + main hit. Should merge to 1 detection.',
    durationS: 3,
    expectedCount: 1,
    evaluate: (d) => {
      if (d.length === 1) {
        const label = d[0].isFlam ? '1 flam detected ✓' : '1 detected ✓';
        return { pass: true, label, detail: `Peak: ${d[0].peak.toFixed(3)}` };
      }
      if (d.length === 2) {
        const gap = (d[1].time - d[0].time) * 1000;
        return { pass: false, label: `2 detected ✗ (${gap.toFixed(0)}ms gap)`, detail: 'Flam not merged', suggestion: 'Raise Flam Merge % or Min Onset Gap' };
      }
      if (d.length === 0) return { pass: false, label: '0 detected ✗', detail: 'Too quiet', suggestion: 'Lower Noise Gate' };
      return { pass: false, label: `${d.length} detected ✗`, detail: 'Multiple retriggers', suggestion: 'Raise Post-Hit Mask and Min Onset Gap' };
    },
  },
  {
    id: 'double',
    name: 'Double Stroke',
    icon: '🥢',
    instruction: 'Play TWO deliberate hits',
    detail: 'Two separate strokes. Should detect exactly 2.',
    durationS: 3,
    expectedCount: 2,
    evaluate: (d) => {
      if (d.length === 2) {
        const gap = (d[1].time - d[0].time) * 1000;
        return { pass: true, label: `2 detected ✓ (${gap.toFixed(0)}ms apart)`, detail: `Peaks: ${d[0].peak.toFixed(3)}, ${d[1].peak.toFixed(3)}` };
      }
      if (d.length === 1) return { pass: false, label: '1 detected ✗', detail: 'Hits were merged', suggestion: 'Lower Min Onset Gap or Post-Hit Mask' };
      if (d.length > 2) {
        return { pass: false, label: `${d.length} detected ✗`, detail: 'Extra detections from decay', suggestion: 'Raise Post-Hit Mask strength' };
      }
      return { pass: false, label: '0 detected ✗', detail: 'Too quiet', suggestion: 'Lower Noise Gate' };
    },
  },
  {
    id: 'sixteenths',
    name: '16th Notes',
    icon: '🎵',
    instruction: 'Play 4 even 16th notes at 120 BPM',
    detail: 'Four evenly spaced hits. Should detect 4.',
    durationS: 4,
    expectedCount: 4,
    evaluate: (d) => {
      if (d.length === 4) {
        const gaps = [];
        for (let i = 0; i < 3; i++) gaps.push((d[i + 1].time - d[i].time) * 1000);
        const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        const consistency = Math.sqrt(gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / gaps.length);
        return { pass: true, label: `4 detected ✓`, detail: `Gaps: ${gaps.map((g) => g.toFixed(0) + 'ms').join(', ')} · σ ${consistency.toFixed(0)}ms` };
      }
      if (d.length < 4) return { pass: false, label: `${d.length} detected ✗`, detail: 'Some hits merged or below gate', suggestion: d.length <= 2 ? 'Lower Min Onset Gap' : 'Lower Noise Gate' };
      return { pass: false, label: `${d.length} detected ✗`, detail: 'Extra triggers from decay', suggestion: 'Raise Post-Hit Mask' };
    },
  },
  {
    id: 'accent',
    name: 'Accent Pattern',
    icon: '💥',
    instruction: 'Play LOUD-soft-soft-soft',
    detail: 'One accented hit, three ghost notes. Should detect 4 with first louder.',
    durationS: 4,
    expectedCount: 4,
    evaluate: (d) => {
      if (d.length >= 3 && d.length <= 5) {
        const peaks = d.map((o) => o.peak);
        const maxPeak = Math.max(...peaks);
        const firstIsLoudest = d[0].peak === maxPeak || d[0].peak > peaks[1] * 1.3;
        const ratio = d.length >= 2 ? d[0].peak / d[1].peak : 0;
        const pass = d.length === 4 && firstIsLoudest;
        return {
          pass,
          label: `${d.length} detected ${pass ? '✓' : '~'}`,
          detail: `Accent ratio: ${ratio.toFixed(1)}× · Peaks: ${peaks.map((p) => p.toFixed(3)).join(', ')}`,
          suggestion: !firstIsLoudest ? 'First hit should be clearly louder' : undefined,
        };
      }
      if (d.length < 3) return { pass: false, label: `${d.length} detected ✗`, detail: 'Ghost notes below gate', suggestion: 'Lower Noise Gate — ghosts need to be detected' };
      return { pass: false, label: `${d.length} detected ✗`, detail: 'Too many triggers', suggestion: 'Raise Post-Hit Mask' };
    },
  },
  {
    id: 'ghost',
    name: 'Ghost Notes',
    icon: '👻',
    instruction: 'Play 4 VERY SOFT taps',
    detail: 'As quiet as you would play ghost notes. Should still detect 4.',
    durationS: 4,
    expectedCount: 4,
    evaluate: (d) => {
      if (d.length >= 3 && d.length <= 5) {
        const peaks = d.map((o) => o.peak);
        const maxPeak = Math.max(...peaks);
        return {
          pass: d.length === 4,
          label: `${d.length} detected ${d.length === 4 ? '✓' : '~'}`,
          detail: `Peak range: ${Math.min(...peaks).toFixed(4)} – ${maxPeak.toFixed(4)}`,
        };
      }
      if (d.length < 3) return { pass: false, label: `${d.length} detected ✗`, detail: 'Ghosts are too quiet for current gate', suggestion: 'Lower Noise Gate and/or Noise Floor ×' };
      return { pass: false, label: `${d.length} detected ✗`, detail: 'Retriggers on soft hits', suggestion: 'Raise Flux Threshold' };
    },
  },
  {
    id: 'buzz',
    name: 'Buzz Roll',
    icon: '🔥',
    instruction: 'Play a press/buzz roll for 2 seconds',
    detail: 'Dense, fast strokes. Should detect many hits without runaway triggering.',
    durationS: 4,
    expectedCount: 'range',
    expectedRange: [10, 80],
    evaluate: (d) => {
      if (d.length >= 10 && d.length <= 80) {
        const peaks = d.map((o) => o.peak);
        const avgGap = d.length > 1 ? ((d[d.length - 1].time - d[0].time) / (d.length - 1)) * 1000 : 0;
        return {
          pass: true,
          label: `${d.length} detected ✓`,
          detail: `Avg gap: ${avgGap.toFixed(0)}ms · Peak range: ${Math.min(...peaks).toFixed(3)} – ${Math.max(...peaks).toFixed(3)}`,
        };
      }
      if (d.length < 10) return { pass: false, label: `${d.length} detected ✗`, detail: 'Too few — strokes being merged', suggestion: 'Lower Min Onset Gap and Post-Hit Mask' };
      return { pass: false, label: `${d.length} detected ✗`, detail: 'Runaway detection from resonance', suggestion: 'Raise Post-Hit Mask and Flux Threshold' };
    },
  },
];

// ─── Component ───

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Phase = 'ready' | 'countdown' | 'recording' | 'analyzing' | 'result';

interface TestState {
  patternIndex: number;
  phase: Phase;
  countdown: number;
  pcm: Float32Array | null;
  detections: DetectedOnset[] | null;
  result: TestResult | null;
  results: Array<{ pattern: TestPattern; result: TestResult; detections: DetectedOnset[] }>;
}

export function DetectionTestBench({ visible, onClose }: Props) {
  const settings = useSettingsStore();

  const [state, setState] = useState<TestState>({
    patternIndex: 0,
    phase: 'ready',
    countdown: 0,
    pcm: null,
    detections: null,
    result: null,
    results: [],
  });

  const capture = useTrainingCapture();
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const sampleRateRef = useRef(48000);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(dialogRef, visible, onClose);
  useEffect(() => {
    if (visible) setState({ patternIndex: 0, phase: 'ready', countdown: 0, pcm: null, detections: null, result: null, results: [] });
    return () => { generationRef.current++; clearTimeout(timerRef.current); capture.stop(); };
  }, [visible, capture.stop]);
  const pattern = PATTERNS[state.patternIndex];
  const isComplete = state.patternIndex >= PATTERNS.length;

  const startTest = useCallback(async () => {
    const index = state.patternIndex;
    const generation = ++generationRef.current;
    setError(null); setState((current) => ({ ...current, phase: 'countdown', countdown: 3 }));
    let finishing = false;
    const finish = async () => {
      if (finishing || generation !== generationRef.current) return;
      finishing = true;
      clearTimeout(timerRef.current);
      setState((current) => ({ ...current, phase: 'analyzing' }));
      try {
        const result = await capture.finish({ bpm: 120, subdivision: PATTERNS[index].id === 'sixteenths' ? 4 : 1 });
        const pcm = new Float32Array(await result.pcmBlob.arrayBuffer());
        if (generation !== generationRef.current) return;
        sampleRateRef.current = result.sampleRate;
        setState((current) => ({ ...current, phase: 'result', pcm, detections: result.onsets, result: PATTERNS[index].evaluate(result.onsets, result.config) }));
      } catch (error) { if (generation === generationRef.current) { setError(error instanceof Error ? error.message : 'Detection test failed.'); setState((current) => ({ ...current, phase: 'ready' })); } }
    };
    try {
      for (let count = 3; count > 0; count--) {
        if (generation !== generationRef.current) return;
        setState((current) => ({ ...current, countdown: count }));
        await new Promise<void>((resolve) => setTimeout(resolve, 700));
      }
      if (generation !== generationRef.current) return;
      if (!await capture.start(() => { void finish(); })) return;
      if (generation !== generationRef.current) { capture.stop(); return; }
      setState((current) => ({ ...current, phase: 'recording' }));
      timerRef.current = setTimeout(() => { void finish(); }, PATTERNS[index].durationS * 1000);
    } catch (error) { if (generation === generationRef.current) { setError(error instanceof Error ? error.message : 'Microphone unavailable.'); setState((current) => ({ ...current, phase: 'ready' })); } }
  }, [state.patternIndex, capture.start, capture.finish, capture.stop]);

  // ─── Next test ───

  const nextTest = useCallback(() => {
    setState((s) => ({
      ...s,
      patternIndex: s.patternIndex + 1,
      phase: 'ready',
      pcm: null,
      detections: null,
      result: null,
      results: s.result && s.detections
        ? [...s.results, { pattern: PATTERNS[s.patternIndex], result: s.result, detections: s.detections }]
        : s.results,
    }));
  }, []);

  // ─── Retry current test ───

  const retryTest = useCallback(() => {
    setState((s) => ({ ...s, phase: 'ready', pcm: null, detections: null, result: null }));
  }, []);

  // ─── Draw waveform with markers ───

  useEffect(() => {
    if (state.phase !== 'result' || !state.pcm || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const w = container?.clientWidth ?? 320;
    const h = 100;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const pcm = state.pcm;
    const sampleRate = sampleRateRef.current;

    // Background
    ctx.fillStyle = '#E7E9ED';
    ctx.fillRect(0, 0, w, h);

    // Waveform
    const samplesPerPx = Math.max(1, Math.floor(pcm.length / w));
    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPx;
      let maxAbs = 0;
      for (let j = start; j < start + samplesPerPx && j < pcm.length; j++) {
        const abs = Math.abs(pcm[j]);
        if (abs > maxAbs) maxAbs = abs;
      }
      const barH = maxAbs * (h - 10);
      ctx.fillStyle = 'rgba(21,23,26,0.4)';
      ctx.fillRect(x, (h - barH) / 2, 1, Math.max(1, barH));
    }

    // Noise gate line
    const gate = Math.max(estimateNoiseFloor(pcm, sampleRate, settings.noiseFloorMultiplier), settings.noiseGate);
    const gateY = h / 2 - gate * (h - 10) / 2;
    const gateY2 = h / 2 + gate * (h - 10) / 2;
    ctx.strokeStyle = 'rgba(248,113,113,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, gateY); ctx.lineTo(w, gateY);
    ctx.moveTo(0, gateY2); ctx.lineTo(w, gateY2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Onset markers
    const detections = state.detections ?? [];
    const duration = pcm.length / sampleRate;

    for (const d of detections) {
      const x = (d.time / duration) * w;
      const color = d.isFlam ? '#A45108' : '#187A3B';

      // Vertical line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 5);
      ctx.lineTo(x, h - 5);
      ctx.stroke();

      // Triangle marker
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x - 4, 8);
      ctx.lineTo(x + 4, 8);
      ctx.closePath();
      ctx.fill();

      // Peak label
      ctx.fillStyle = '#8B8B94';
      ctx.font = '11px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.peak.toFixed(2), x, h - 2);
    }

    // Detection count label
    ctx.fillStyle = 'rgba(21,23,26,0.5)';
    ctx.font = '11px "DM Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${detections.length} detected`, w - 4, 14);

  }, [state.phase, state.pcm, state.detections, settings.noiseFloorMultiplier, settings.noiseGate]);

  if (!visible) return null;

  // ─── Summary screen ───

  if (isComplete || (state.patternIndex >= PATTERNS.length && state.phase === 'ready')) {
    const allResults = state.results;
    const passed = allResults.filter((r) => r.result.pass).length;
    const total = allResults.length;
    const suggestions = new Set(allResults.filter((r) => r.result.suggestion).map((r) => r.result.suggestion!));

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-bg-primary flex flex-col" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Detection test" data-no-swipe>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <button onClick={onClose} className="text-text-secondary text-sm min-w-[44px] min-h-[44px] flex items-center">← Back</button>
          <h1 className="text-text-primary text-base font-medium">Test Results</h1>
          <div className="w-[44px]" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Score */}
          <div className="text-center py-4">
            <span className={`text-4xl font-semibold font-mono ${passed === total ? 'text-success' : passed >= total * 0.7 ? 'text-warning' : 'text-danger'}`}>
              {passed}/{total}
            </span>
            <p className="text-text-muted text-xs mt-1">tests passed</p>
          </div>

          {/* Results list */}
          {allResults.map((r, i) => (
            <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border ${r.result.pass ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'}`}>
              <span className="text-lg">{r.pattern.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary font-medium">{r.pattern.name}</p>
                <p className="text-xs text-text-secondary">{r.result.label}</p>
                <p className="text-xs text-text-muted">{r.result.detail}</p>
              </div>
            </div>
          ))}

          {/* Suggestions */}
          {suggestions.size > 0 && (
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-text-muted font-medium ">Recommended Adjustments</p>
              {Array.from(suggestions).map((s, i) => (
                <p key={i} className="text-xs text-text-secondary">→ {s}</p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={() => {
              setState({ patternIndex: 0, phase: 'ready', countdown: 0, pcm: null, detections: null, result: null, results: [] });
            }} className="flex-1 py-3 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[48px]">
              Run Again
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[48px]">
              Done
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ─── Test screen ───

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-bg-primary flex flex-col" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Detection test" data-no-swipe>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <button onClick={onClose} className="text-text-secondary text-sm min-w-[44px] min-h-[44px] flex items-center">← Back</button>
        <h1 className="text-text-primary text-sm font-medium">
          Test {state.patternIndex + 1}/{PATTERNS.length}
        </h1>
        <button disabled={state.phase !== 'ready' && state.phase !== 'result'} onClick={() => setState((s) => ({ ...s, patternIndex: PATTERNS.length, phase: 'ready', results: s.result && s.detections ? [...s.results, { pattern: PATTERNS[s.patternIndex], result: s.result, detections: s.detections }] : s.results }))}
          className="text-text-muted text-xs min-w-[44px] min-h-[44px] flex items-center justify-end">
          Skip All
        </button>
      </div>

      {error && <p role="alert" className="p-3 text-sm text-danger">{error}</p>}
      {/* Progress dots */}
      <div className="flex gap-1.5 px-4 py-2 justify-center">
        {PATTERNS.map((_, i) => {
          const r = state.results[i];
          const isCurrent = i === state.patternIndex;
          const color = r ? (r.result.pass ? '#187A3B' : '#B4232C') : isCurrent ? 'rgba(21,23,26,0.6)' : 'rgba(21,23,26,0.15)';
          return <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />;
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center px-4 py-4">
        {/* Ready */}
        {state.phase === 'ready' && pattern && (
          <div className="text-center space-y-4 w-full max-w-xs">
            <div className="text-5xl">{pattern.icon}</div>
            <h2 className="text-text-primary text-lg font-medium">{pattern.name}</h2>
            <p className="text-text-secondary text-sm">{pattern.instruction}</p>
            <p className="text-text-muted text-xs">{pattern.detail}</p>
            <button onClick={startTest}
              className="w-full py-3 bg-accent text-bg-primary rounded-md text-sm font-medium min-h-[48px] mt-4">
              Start ({pattern.durationS}s)
            </button>
          </div>
        )}

        {/* Countdown */}
        {state.phase === 'countdown' && (
          <div className="text-center">
            <span className="text-6xl font-semibold font-mono text-accent">{state.countdown}</span>
            <p className="text-text-muted text-xs mt-2">Get ready…</p>
          </div>
        )}

        {/* Recording */}
        {state.phase === 'recording' && pattern && (
          <div className="text-center space-y-4">
            <div className="flex items-center gap-2 justify-center">
              <div className="w-3 h-3 rounded-full bg-recording animate-pulse" />
              <span className="text-text-secondary text-sm">Recording…</span>
            </div>
            <p className="text-text-primary text-lg font-medium">{pattern.instruction}</p>
            <p className="text-text-muted text-xs">Auto-stops in {pattern.durationS}s</p>
          </div>
        )}

        {/* Analyzing */}
        {state.phase === 'analyzing' && (
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
            <p className="text-text-secondary text-sm">Analyzing…</p>
          </div>
        )}

        {/* Result */}
        {state.phase === 'result' && state.result && pattern && (
          <div className="w-full space-y-4">
            {/* Pass/fail */}
            <div className={`text-center py-3 rounded-lg ${state.result.pass ? 'bg-success/10' : 'bg-danger/10'}`}>
              <span className="text-lg">{pattern.icon}</span>
              <p className={`text-sm font-medium mt-1 ${state.result.pass ? 'text-success' : 'text-danger'}`}>
                {state.result.label}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{state.result.detail}</p>
            </div>

            {/* Suggestion */}
            {state.result.suggestion && (
              <div className="bg-bg-surface border border-border-subtle rounded-lg p-2.5">
                <p className="text-xs text-warning">💡 {state.result.suggestion}</p>
              </div>
            )}

            {/* Waveform canvas */}
            <div ref={containerRef} className="rounded-lg border border-border-subtle overflow-hidden">
              <canvas ref={canvasRef} />
            </div>

            {/* Detection details */}
            {state.detections && state.detections.length > 0 && (
              <div className="text-xs text-text-muted space-y-0.5 font-mono">
                {state.detections.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <span>{d.time.toFixed(3)}s</span>
                    <span>peak={d.peak.toFixed(3)}</span>
                    <span>flux={d.flux.toFixed(1)}</span>
                    {d.isFlam && <span className="text-warning">flam</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={retryTest}
                className="flex-1 py-2.5 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]">
                Retry
              </button>
              <button onClick={nextTest}
                className="flex-1 py-2.5 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[44px]">
                {state.patternIndex < PATTERNS.length - 1 ? 'Next Test' : 'See Results'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
