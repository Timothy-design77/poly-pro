/**
 * DetectionTestBench — guided detection check.
 *
 * Steps through short test patterns (patterns.ts). After each take it shows
 * the verdict, a suggestion, the waveform with detected hits and hit details;
 * the summary collects suggested setting changes.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import type { DetectedOnset } from '../../analysis/types';
import { useTrainingCapture } from '../../hooks/useTrainingCapture';
import { ScreenDialog } from '../ui/Dialog';
import { Notice } from '../ui/Notice';
import { PATTERNS, type TestResult } from './bench/patterns';
import { BenchWaveform } from './bench/BenchWaveform';
import { AnalyzingView, CountdownView, ReadyView, RecordingView, ResultView, SummaryView, type CompletedTest } from './bench/BenchViews';

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
  results: CompletedTest[];
}

const INITIAL: TestState = { patternIndex: 0, phase: 'ready', countdown: 0, pcm: null, detections: null, result: null, results: [] };

export function DetectionTestBench({ visible, onClose }: Props) {
  return visible ? <Bench onClose={onClose} /> : null;
}

function Bench({ onClose }: { onClose: () => void }) {
  const noiseGate = useSettingsStore((s) => s.noiseGate);
  const noiseFloorMultiplier = useSettingsStore((s) => s.noiseFloorMultiplier);
  const [state, setState] = useState<TestState>(INITIAL);

  const capture = useTrainingCapture();
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const sampleRateRef = useRef(48000);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { generationRef.current++; clearTimeout(timerRef.current); capture.stop(); }, [capture.stop]);
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

  const skipAll = () => setState((s) => ({ ...s, patternIndex: PATTERNS.length, phase: 'ready', results: s.result && s.detections ? [...s.results, { pattern: PATTERNS[s.patternIndex], result: s.result, detections: s.detections }] : s.results }));

  if (isComplete) {
    return (
      <ScreenDialog title="Test results" label="Detection test" onBack={onClose}>
        <div className="screen-body"><div className="screen-content">
          <SummaryView results={state.results} onRunAgain={() => setState(INITIAL)} onDone={onClose} />
        </div></div>
      </ScreenDialog>
    );
  }

  return (
    <ScreenDialog
      title="Detection test"
      subtitle={`Test ${state.patternIndex + 1} of ${PATTERNS.length}`}
      onBack={onClose}
      action={<button type="button" disabled={state.phase !== 'ready' && state.phase !== 'result'} onClick={skipAll} className="ui-button ui-button-quiet px-3">Skip all</button>}
    >
      <div className="screen-body">
        <div className="screen-content flex min-h-full flex-col gap-6">
          <StepDots label="Test progress" total={PATTERNS.length} current={state.patternIndex} results={state.results.map((r) => r.result.pass)} />
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-1 flex-col justify-center">
            {state.phase === 'ready' && <ReadyView pattern={pattern} onStart={() => void startTest()} />}
            {state.phase === 'countdown' && <CountdownView count={state.countdown} />}
            {state.phase === 'recording' && <RecordingView pattern={pattern} />}
            {state.phase === 'analyzing' && <AnalyzingView />}
            {state.phase === 'result' && state.result && (
              <ResultView
                result={state.result}
                detections={state.detections ?? []}
                waveform={state.pcm && <BenchWaveform pcm={state.pcm} sampleRate={sampleRateRef.current} detections={state.detections ?? []} noiseGate={noiseGate} noiseFloorMultiplier={noiseFloorMultiplier} />}
                isLast={state.patternIndex === PATTERNS.length - 1}
                onRetry={retryTest}
                onNext={nextTest}
              />
            )}
          </div>
        </div>
      </div>
    </ScreenDialog>
  );
}

/** Step indicator: done steps carry pass/fail, the current step is outlined. */
function StepDots({ total, current, results, label }: { total: number; current: number; results: (boolean | undefined)[]; label: string }) {
  return (
    <ol aria-label={label} className="flex justify-center gap-2">
      {Array.from({ length: total }, (_, index) => {
        const result = results[index];
        const state = result === true ? 'passed' : result === false ? 'needs attention' : index === current ? 'current' : 'not started';
        const tone = result === true ? 'bg-success' : result === false ? 'bg-danger' : index === current ? 'bg-accent' : 'bg-bg-raised shadow-[inset_0_0_0_1px_var(--border-emphasis)]';
        return <li key={index} aria-label={`Test ${index + 1}: ${state}`} aria-current={index === current ? 'step' : undefined} className={`h-2.5 w-2.5 rounded-full ${tone} ${index === current ? 'scale-125' : ''}`} />;
      })}
    </ol>
  );
}
