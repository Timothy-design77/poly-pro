import { useMemo, useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { createPortal } from 'react-dom';
import type { AnalysisProgress } from '../../analysis/types';
import { ANALYSIS_STAGE_LABELS } from '../../analysis/types';

interface Props {
  visible: boolean;
  progress: AnalysisProgress | null;
}

export default function AnalyzingOverlay({ visible, progress }: Props) {
  const stageLabel = progress ? ANALYSIS_STAGE_LABELS[progress.stage] ?? 'Analyzing…' : 'Preparing analysis…';
  const stageIndex = useMemo(() => {
    const stages = Object.keys(ANALYSIS_STAGE_LABELS);
    if (!progress) return 0;
    const index = stages.indexOf(progress.stage);
    return index >= 0 ? index : 0;
  }, [progress]);
  const totalStages = Math.max(1, Object.keys(ANALYSIS_STAGE_LABELS).length - 1);
  const overallProgress = progress ? Math.min(1, (stageIndex + progress.progress) / totalStages) : 0;

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, visible, () => window.dispatchEvent(new CustomEvent('polypro:cancel-analysis')));

  if (!visible) return null;

  return createPortal(
    <div ref={dialogRef} tabIndex={-1} data-no-swipe role="dialog" aria-modal="true" aria-labelledby="analysis-title" className="fixed inset-0 z-50 flex flex-col items-center justify-center animate-fade-in" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="relative mb-8" aria-hidden="true"><svg className="animate-spin" width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="24" stroke="var(--bg-raised)" strokeWidth="4" /><path d="M28 4a24 24 0 0 1 24 24" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" /></svg></div>
      <h2 id="analysis-title" className="text-xl font-semibold mb-3 text-text-primary">Analyzing your session…</h2>
      <p className="text-sm mb-6 text-text-secondary" aria-live="polite">{stageLabel}</p>
      <div className="w-48 h-1.5 rounded-full overflow-hidden bg-bg-raised" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overallProgress * 100)}>
        <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${overallProgress * 100}%` }} />
      </div>
      <button type="button" className="ui-button ui-button-secondary mt-6" onClick={() => window.dispatchEvent(new CustomEvent('polypro:cancel-analysis'))}>Cancel analysis</button>
    </div>,
    document.body,
  );
}
