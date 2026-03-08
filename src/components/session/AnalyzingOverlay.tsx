/**
 * AnalyzingOverlay — Full-screen overlay shown during post-processing.
 *
 * Rendered via Portal at document.body to avoid SwipeNavigation event capture.
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AnalysisProgress } from '../../analysis/types';
import { ANALYSIS_STAGE_LABELS } from '../../analysis/types';

interface Props {
  visible: boolean;
  progress: AnalysisProgress | null;
}

export default function AnalyzingOverlay({ visible, progress }: Props) {
  // All hooks MUST be before any early return
  const stageLabel = progress
    ? ANALYSIS_STAGE_LABELS[progress.stage] ?? 'Analyzing…'
    : 'Preparing analysis…';

  const stageIndex = useMemo(() => {
    const stages = Object.keys(ANALYSIS_STAGE_LABELS);
    if (!progress) return 0;
    const idx = stages.indexOf(progress.stage);
    return idx >= 0 ? idx : 0;
  }, [progress]);

  const totalStages = Object.keys(ANALYSIS_STAGE_LABELS).length - 1;
  const overallProgress = progress
    ? (stageIndex + progress.progress) / totalStages
    : 0;

  if (!visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(12, 12, 14, 0.95)' }}
    >
      <div className="relative mb-8">
        <svg className="animate-spin" width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="28" r="24" stroke="#2A2A2E" strokeWidth="4" />
          <path d="M28 4a24 24 0 0 1 24 24" stroke="rgba(255,255,255,0.85)" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold mb-3"
        style={{ color: '#E8E8EC', fontFamily: 'DM Sans, sans-serif' }}>
        Analyzing your session…
      </h2>

      <p className="text-sm mb-6" style={{ color: '#8B8B94', fontFamily: 'DM Sans, sans-serif' }}>
        {stageLabel}
      </p>

      <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#2A2A2E' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, overallProgress * 100)}%`,
            backgroundColor: 'rgba(255,255,255,0.85)',
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
