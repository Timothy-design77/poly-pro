import { useEffect, useMemo } from 'react';
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

  useEffect(() => {
    if (!visible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.dispatchEvent(new CustomEvent('polypro:cancel-analysis'));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <div data-no-swipe role="dialog" aria-modal="true" aria-labelledby="analysis-title" className="fixed inset-0 z-50 flex flex-col items-center justify-center animate-fade-in" style={{ backgroundColor: 'rgba(12,12,14,0.95)' }}>
      <div className="relative mb-8" aria-hidden="true"><svg className="animate-spin" width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="24" stroke="#2A2A2E" strokeWidth="4" /><path d="M28 4a24 24 0 0 1 24 24" stroke="rgba(255,255,255,0.85)" strokeWidth="4" strokeLinecap="round" /></svg></div>
      <h2 id="analysis-title" className="text-xl font-semibold mb-3 text-text-primary">Analyzing your session…</h2>
      <p className="text-sm mb-6 text-text-muted" aria-live="polite">{stageLabel}</p>
      <div className="w-48 h-1.5 rounded-full overflow-hidden bg-bg-raised" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overallProgress * 100)}>
        <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${overallProgress * 100}%` }} />
      </div>
      <button type="button" className="mt-6 min-h-[44px] px-5 rounded-lg border border-border-subtle text-sm text-text-secondary" onClick={() => window.dispatchEvent(new CustomEvent('polypro:cancel-analysis'))}>Cancel Analysis</button>
    </div>,
    document.body,
  );
}
