/**
 * CalibrationPage — Full-screen 3-step calibration flow.
 *
 * Step 1: Setup — instructions + "Calibrate" button
 * Step 2: Measuring — chirp progress (1/5, 2/5, ...)
 * Step 3: Results — offset, consistency, quality + Accept/Run Again
 *
 * Rendered as a full-screen overlay.
 */

import { useCalibration } from '../hooks/useCalibration';
import { createPortal } from 'react-dom';
import { CHIRP_COUNT } from '../analysis/calibration';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CalibrationPage({ visible, onClose }: Props) {
  const cal = useCalibration();

  if (!visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: '#0C0C0E' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={() => { cal.cancel(); onClose(); }}
          className="text-sm text-text-secondary touch-manipulation py-2 px-1"
        >
          ← Back
        </button>
        <span className="text-sm font-semibold text-text-primary">Calibration</span>
        <div className="w-12" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {(cal.step === 'idle' || cal.step === 'setup') && (
          <SetupStep onStart={cal.runCalibration} />
        )}

        {cal.step === 'measuring' && (
          <MeasuringStep progress={cal.chirpProgress} total={CHIRP_COUNT} />
        )}

        {cal.step === 'results' && (
          <ResultsStep
            offsetMs={cal.offsetMs}
            consistencyMs={cal.consistencyMs}
            quality={cal.quality}
            accepted={cal.accepted}
            onAccept={() => { cal.acceptResult(); onClose(); }}
            onRunAgain={() => { cal.reset(); cal.runCalibration(); }}
          />
        )}

        {cal.step === 'failed' && (
          <FailedStep
            error={cal.error}
            onRetry={() => { cal.reset(); cal.runCalibration(); }}
            onClose={() => { cal.reset(); onClose(); }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Step 1: Setup ───

function SetupStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center max-w-xs">
      {/* Icon */}
      <div className="mb-6">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"
          className="mx-auto"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-text-primary mb-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        Latency Calibration
      </h2>

      <p className="text-sm text-text-secondary mb-2 leading-relaxed">
        Your phone will play short chirp sounds and measure system latency. This takes about 12 seconds.
      </p>

      <p className="text-xs text-text-muted mb-8 leading-relaxed">
        Place your phone where you normally practice. Keep the room quiet.
      </p>

      <button
        onClick={onStart}
        className="w-full h-[48px] rounded-xl font-bold text-sm tracking-wide
                   touch-manipulation select-none
                   bg-[rgba(255,255,255,0.85)] text-[#0C0C0E]
                   active:bg-[rgba(255,255,255,0.95)]"
      >
        Calibrate
      </button>
    </div>
  );
}

// ─── Step 2: Measuring ───

function MeasuringStep({ progress, total }: { progress: number; total: number }) {
  return (
    <div className="text-center">
      {/* Spinner */}
      <div className="mb-6">
        <svg className="animate-spin mx-auto" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="#2A2A2E" strokeWidth="4" />
          <path
            d="M24 4a20 20 0 0 1 20 20"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-text-primary mb-2" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        Measuring…
      </h2>

      <p className="text-sm text-text-secondary mb-4">
        Playing chirp {progress} of {total}
      </p>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < progress
                ? 'rgba(255,255,255,0.85)'
                : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>

      <p className="text-xs text-text-muted mt-6">
        Keep quiet — listening for chirp echoes
      </p>
    </div>
  );
}

// ─── Step 3: Results ───

function ResultsStep({
  offsetMs,
  consistencyMs,
  quality,
  accepted,
  onAccept,
  onRunAgain,
}: {
  offsetMs: number;
  consistencyMs: number;
  quality: 'excellent' | 'good' | 'poor' | 'failed';
  accepted: number;
  onAccept: () => void;
  onRunAgain: () => void;
}) {
  const qualityColor =
    quality === 'excellent' ? '#4ADE80'
    : quality === 'good' ? '#FBBF24'
    : '#F87171';

  const qualityLabel =
    quality === 'excellent' ? 'Excellent'
    : quality === 'good' ? 'Good'
    : 'Poor';

  return (
    <div className="text-center max-w-xs">
      {/* Check icon */}
      <div className="mb-4">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke={qualityColor} strokeWidth="2" strokeLinecap="round"
          className="mx-auto"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="8 12 11 15 16 9" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-text-primary mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        Calibration Complete
      </h2>

      {/* Metrics */}
      <div className="bg-bg-surface rounded-xl border border-border-subtle p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-text-muted">System Latency</span>
          <span className="text-base font-mono font-bold text-text-primary">{offsetMs.toFixed(1)}ms</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-text-muted">Consistency</span>
          <span className="text-sm font-mono text-text-secondary">±{consistencyMs.toFixed(1)}ms</span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">Quality</span>
          <span className="text-sm font-semibold" style={{ color: qualityColor }}>
            {qualityLabel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Chirps Detected</span>
          <span className="text-xs font-mono text-text-secondary">{accepted}/{CHIRP_COUNT}</span>
        </div>
      </div>

      {quality === 'poor' && (
        <p className="text-xs text-warning mb-4">
          Your environment may be noisy. Try a quieter room for more consistent results.
        </p>
      )}

      <button
        onClick={onAccept}
        className="w-full h-[48px] rounded-xl font-bold text-sm tracking-wide mb-2
                   touch-manipulation select-none
                   bg-[rgba(255,255,255,0.85)] text-[#0C0C0E]
                   active:bg-[rgba(255,255,255,0.95)]"
      >
        Accept & Save
      </button>

      <button
        onClick={onRunAgain}
        className="w-full h-[44px] rounded-xl font-medium text-sm
                   touch-manipulation select-none
                   border border-border-subtle text-text-secondary
                   active:bg-bg-raised"
      >
        Run Again
      </button>
    </div>
  );
}

// ─── Failed State ───

function FailedStep({
  error,
  onRetry,
  onClose,
}: {
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="text-center max-w-xs">
      <div className="mb-4">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke="#F87171" strokeWidth="2" strokeLinecap="round"
          className="mx-auto"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-text-primary mb-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        Calibration Failed
      </h2>

      <p className="text-sm text-text-secondary mb-6 leading-relaxed">
        {error || "Auto-calibration couldn't get a clear reading. Try a quieter room or move your phone closer."}
      </p>

      <button
        onClick={onRetry}
        className="w-full h-[48px] rounded-xl font-bold text-sm tracking-wide mb-2
                   touch-manipulation select-none
                   bg-[rgba(255,255,255,0.85)] text-[#0C0C0E]
                   active:bg-[rgba(255,255,255,0.95)]"
      >
        Try Again
      </button>

      <button
        onClick={onClose}
        className="w-full h-[44px] rounded-xl font-medium text-sm
                   touch-manipulation select-none
                   border border-border-subtle text-text-secondary
                   active:bg-bg-raised"
      >
        Cancel
      </button>
    </div>
  );
}
