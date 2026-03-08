/**
 * InstrumentSettings — Settings section for instrument classification (Phase 8).
 *
 * Shows:
 * - List of trained instruments with accuracy and hit count
 * - "Train Instruments" button → opens InstrumentTrainingPage
 * - "Clear All" button to reset all profiles
 */

import { useState } from 'react';
import { useInstrumentStore } from '../../store/instrument-store';
import { INSTRUMENT_INFO } from '../../analysis/classification';
import { InstrumentTrainingPage } from '../../pages/InstrumentTrainingPage';
import { HelpTip } from '../ui/HelpTip';

export function InstrumentSettings() {
  const profiles = useInstrumentStore((s) => s.profiles);
  const clearAllProfiles = useInstrumentStore((s) => s.clearAllProfiles);
  const isReady = useInstrumentStore((s) => s.isClassifierReady);

  const [showTraining, setShowTraining] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const classifierReady = isReady();

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          Classifier Status
          <HelpTip text="Train at least one instrument with 20+ hits to enable automatic instrument labeling. The classifier uses your kit's unique sound to identify drums in recordings." />
        </span>
        <span className={`text-xs font-mono ${classifierReady ? 'text-success' : 'text-text-muted'}`}>
          {classifierReady
            ? `${profiles.length} instrument${profiles.length !== 1 ? 's' : ''}`
            : 'Not trained'}
        </span>
      </div>

      {/* Trained instruments list */}
      {profiles.length > 0 && (
        <div className="space-y-1">
          {profiles.map((p) => {
            const info = INSTRUMENT_INFO[p.name] || INSTRUMENT_INFO['Other'];
            const accPct = Math.round(p.accuracy * 100);
            return (
              <div
                key={p.name}
                className="flex items-center justify-between py-2 px-2 bg-bg-surface rounded-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{info.icon}</span>
                  <span className="text-text-primary text-xs">{p.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-text-muted text-xs font-mono">
                    {p.samples.length} hits
                  </span>
                  <span
                    className={`text-xs font-mono ${
                      accPct >= 80 ? 'text-success' : accPct >= 60 ? 'text-warning' : 'text-danger'
                    }`}
                  >
                    {accPct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Train button */}
      <button
        onClick={() => setShowTraining(true)}
        className="w-full py-2.5 bg-bg-raised border border-border-subtle text-text-primary rounded-md text-sm min-h-[44px] hover:bg-border-subtle transition-colors"
      >
        {profiles.length > 0 ? 'Manage Instruments' : 'Train Instruments'}
      </button>

      {/* Clear all */}
      {profiles.length > 0 && (
        <>
          {showClearConfirm ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await clearAllProfiles();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2 bg-danger-dim border border-danger/30 text-danger rounded-md text-xs min-h-[44px]"
              >
                Confirm Clear
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="w-full py-2 text-danger text-xs min-h-[44px]"
            >
              Clear All Profiles
            </button>
          )}
        </>
      )}

      {/* Training page overlay */}
      {showTraining && (
        <InstrumentTrainingPage onClose={() => setShowTraining(false)} />
      )}
    </div>
  );
}
