import type { DetectedOnset } from '../../../analysis/types';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { Spinner } from '../../ui/Progress';
import type { TestPattern, TestResult } from './patterns';

export interface CompletedTest {
  pattern: TestPattern;
  result: TestResult;
  detections: DetectedOnset[];
}

function Verdict({ pass }: { pass: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${pass ? 'text-success' : 'text-danger'}`}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {pass ? <polyline points="20 6 9 17 4 12" /> : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
      </svg>
      {pass ? 'Passed' : 'Needs attention'}
    </span>
  );
}

export function ReadyView({ pattern, onStart }: { pattern: TestPattern; onStart: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <h2 className="text-xl font-semibold text-text-primary">{pattern.name}</h2>
      <p className="text-base text-text-primary">{pattern.instruction}</p>
      <p className="text-sm text-text-muted">{pattern.detail}</p>
      <div className="pt-4"><Button variant="primary" size="lg" block onClick={onStart}>Start ({pattern.durationS}s)</Button></div>
    </div>
  );
}

export function CountdownView({ count }: { count: number }) {
  return (
    <div role="status" className="text-center">
      <span className="block text-6xl font-semibold tabular-nums text-text-primary">{count}</span>
      <span className="mt-2 block text-sm text-text-secondary">Get ready</span>
    </div>
  );
}

export function RecordingView({ pattern }: { pattern: TestPattern }) {
  return (
    <div className="space-y-3 text-center">
      <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold text-danger">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-recording" />Recording
      </p>
      <p className="text-lg font-semibold text-text-primary">{pattern.instruction}</p>
      <p className="text-sm text-text-muted">Stops automatically after {pattern.durationS} seconds.</p>
    </div>
  );
}

export function AnalyzingView() {
  return <Spinner label="Analyzing…" />;
}

export function ResultView({ result, detections, waveform, isLast, onRetry, onNext }: {
  result: TestResult;
  detections: DetectedOnset[];
  waveform: React.ReactNode;
  isLast: boolean;
  onRetry: () => void;
  onNext: () => void;
}) {
  return (
    <div className="w-full space-y-4" aria-live="polite">
      <div className={`ui-notice space-y-1 ${result.pass ? 'ui-notice-success' : 'ui-notice-danger'}`}>
        <Verdict pass={result.pass} />
        <p className="text-base font-semibold text-text-primary">{result.label}</p>
        <p className="text-text-secondary">{result.detail}</p>
      </div>
      {result.suggestion && <Notice tone="warning" live={false}>Try: {result.suggestion}</Notice>}
      {waveform}
      {detections.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-text-secondary">Hit details</summary>
          <table className="w-full text-left text-xs tabular-nums text-text-secondary">
            <thead className="text-text-muted"><tr><th className="py-1 font-medium">Time</th><th className="font-medium">Peak</th><th className="font-medium">Flux</th><th className="font-medium">Type</th></tr></thead>
            <tbody>
              {detections.map((d, i) => (
                <tr key={i} className="border-t border-border-subtle"><td className="py-1">{d.time.toFixed(3)} s</td><td>{d.peak.toFixed(3)}</td><td>{d.flux.toFixed(1)}</td><td>{d.isFlam ? 'Flam' : 'Hit'}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onRetry}>Retry</Button>
        <Button variant="primary" onClick={onNext}>{isLast ? 'See results' : 'Next test'}</Button>
      </div>
    </div>
  );
}

export function SummaryView({ results, onRunAgain, onDone }: { results: CompletedTest[]; onRunAgain: () => void; onDone: () => void }) {
  const passed = results.filter((r) => r.result.pass).length;
  const total = results.length;
  const suggestions = [...new Set(results.map((r) => r.result.suggestion).filter((s): s is string => !!s))];
  const tone = total > 0 && passed === total ? 'text-success' : passed >= total * 0.7 ? 'text-warning' : 'text-danger';
  return (
    <div className="space-y-5">
      <div className="py-2 text-center">
        <p className={`text-4xl font-semibold tabular-nums ${tone}`}>{passed} of {total}</p>
        <p className="mt-1 text-sm text-text-muted">tests passed</p>
      </div>
      {total > 0 && (
        <ul className="ui-surface ui-rows px-4">
          {results.map((r, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">{r.pattern.name}</p>
                <p className="text-xs text-text-secondary">{r.result.label} · {r.result.detail}</p>
              </div>
              <Verdict pass={r.result.pass} />
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">Suggested adjustments</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">{suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
          <p className="ui-hint">Change these in Settings, Detection, then run the test again.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onRunAgain}>Run again</Button>
        <Button variant="primary" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
