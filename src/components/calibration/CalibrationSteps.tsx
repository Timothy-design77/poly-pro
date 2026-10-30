import type { ReactNode } from 'react';
import { CHIRP_COUNT } from '../../analysis/calibration';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { ProgressRing } from '../ui/Progress';
import { SettingRow } from '../ui/SettingRow';

type Quality = 'excellent' | 'good' | 'poor' | 'failed';

function StepLayout({ title, children, actions, live = false }: { title: string; children: ReactNode; actions?: ReactNode; live?: boolean }) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-6 py-4">
      <div className="space-y-3 text-center" aria-live={live ? 'polite' : undefined}>
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h2>
        {children}
      </div>
      {actions && <div className="grid gap-2">{actions}</div>}
    </div>
  );
}

export function SetupStep({ onStart }: { onStart: () => void }) {
  return (
    <StepLayout title="Measure your device latency" actions={<Button variant="primary" size="lg" onClick={onStart}>Start calibration</Button>}>
      <p className="text-sm leading-relaxed text-text-secondary">Poly Pro plays {CHIRP_COUNT} short chirps and listens for them, which takes about 12 seconds. The result lines up timing scores with what you hear.</p>
      <ul className="mx-auto max-w-[340px] list-disc space-y-1 pl-5 text-left text-sm text-text-secondary">
        <li>Put the phone where you normally practice.</li>
        <li>Use the speaker or headphones you practice with.</li>
        <li>Keep the room quiet until it finishes.</li>
      </ul>
    </StepLayout>
  );
}

export function MeasuringStep({ progress }: { progress: number }) {
  return (
    <StepLayout title="Listening…" live>
      <div className="flex justify-center py-2">
        <ProgressRing value={progress} max={CHIRP_COUNT} label="Chirps played">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">{progress}</span>
          <span className="block text-xs text-text-muted">of {CHIRP_COUNT}</span>
        </ProgressRing>
      </div>
      <p className="text-sm text-text-secondary">Keep quiet while the chirps play.</p>
    </StepLayout>
  );
}

const QUALITY: Record<Quality, { label: string; tone: string }> = {
  excellent: { label: 'Excellent', tone: 'text-success' },
  good: { label: 'Good', tone: 'text-warning' },
  poor: { label: 'Poor', tone: 'text-danger' },
  failed: { label: 'Poor', tone: 'text-danger' },
};

export function ResultsStep({ offsetMs, consistencyMs, quality, accepted, onAccept, onRunAgain }: {
  offsetMs: number;
  consistencyMs: number;
  quality: Quality;
  accepted: number;
  onAccept: () => void;
  onRunAgain: () => void;
}) {
  return (
    <StepLayout title="Calibration complete" live actions={<>
      <Button variant="primary" size="lg" onClick={onAccept}>Save calibration</Button>
      <Button variant="quiet" onClick={onRunAgain}>Run again</Button>
    </>}>
      <p className="text-4xl font-semibold tabular-nums tracking-tight text-text-primary">{offsetMs.toFixed(1)} ms</p>
      <p className="text-sm text-text-secondary">Measured latency</p>
      <div className="ui-surface ui-rows px-4 text-left">
        <SettingRow label="Consistency"><span className="ui-row-value">±{consistencyMs.toFixed(1)} ms</span></SettingRow>
        <SettingRow label="Quality"><span className={`ui-row-value font-semibold ${QUALITY[quality].tone}`}>{QUALITY[quality].label}</span></SettingRow>
        <SettingRow label="Chirps heard"><span className="ui-row-value">{accepted} of {CHIRP_COUNT}</span></SettingRow>
      </div>
      {quality === 'poor' && <Notice tone="warning" className="text-left">Readings varied. A quieter room usually gives a steadier result.</Notice>}
    </StepLayout>
  );
}

export function FailedStep({ error, onRetry, onClose }: { error: string | null; onRetry: () => void; onClose: () => void }) {
  return (
    <StepLayout title="Calibration didn't finish" actions={<>
      <Button variant="primary" size="lg" onClick={onRetry}>Try again</Button>
      <Button variant="quiet" onClick={onClose}>Cancel</Button>
    </>}>
      <Notice tone="danger" className="text-left">{error || "The chirps weren't heard clearly. Try a quieter room or move the phone closer to the speaker."}</Notice>
    </StepLayout>
  );
}
