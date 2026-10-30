/**
 * InstrumentSettings — Settings section for instrument classification (Phase 8).
 *
 * Shows:
 * - List of trained instruments with accuracy and hit count
 * - "Train instruments" → opens InstrumentTrainingPage
 * - "Clear all profiles" with inline confirmation
 */

import { useState } from 'react';
import { useInstrumentStore } from '../../store/instrument-store';
import { InstrumentTrainingPage } from '../../pages/InstrumentTrainingPage';
import { HelpTip } from '../ui/HelpTip';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { SettingRow } from '../ui/SettingRow';

export function InstrumentSettings() {
  const profiles = useInstrumentStore((s) => s.profiles);
  const clearAllProfiles = useInstrumentStore((s) => s.clearAllProfiles);
  const isReady = useInstrumentStore((s) => s.isClassifierReady);

  const [showTraining, setShowTraining] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClear = async () => {
    if (clearing) return;
    setClearing(true); setError(null);
    try {
      await clearAllProfiles();
      setShowClearConfirm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not clear instrument profiles. Please try again.');
    } finally { setClearing(false); }
  };

  const classifierReady = isReady();

  return (
    <div className="space-y-4">
      <div className="ui-rows">
        <SettingRow label={<span className="flex items-center gap-2">Instrument recognition <HelpTip text="Train at least two instruments with 20 or more hits each to label instruments in recordings. Training learns your own kit's sound." /></span>}>
          <span className={`ui-row-value ${classifierReady ? 'text-success' : ''}`}>
            {classifierReady ? `${profiles.length} instrument${profiles.length !== 1 ? 's' : ''}` : 'Off'}
          </span>
        </SettingRow>
        {profiles.map((profile) => {
          const accPct = Math.round(profile.accuracy * 100);
          const validated = profiles.length >= 2 && profile.accuracy >= 0;
          return (
            <SettingRow key={profile.name} label={profile.name} description={`${profile.samples.length} training hits`}>
              <span className={`ui-row-value ${!validated ? '' : accPct >= 80 ? 'text-success' : accPct >= 60 ? 'text-warning' : 'text-danger'}`}>
                {validated ? `${accPct}% validated` : 'Not validated'}
              </span>
            </SettingRow>
          );
        })}
      </div>

      <Button variant="secondary" block disabled={clearing} onClick={() => setShowTraining(true)}>
        {profiles.length > 0 ? 'Manage instruments' : 'Train instruments'}
      </Button>

      {error && <Notice tone="danger">{error}</Notice>}
      {profiles.length > 0 && (showClearConfirm ? (
        <div role="group" aria-label="Clear all instrument profiles?" className="ui-notice ui-notice-danger space-y-3">
          <p>Clear all instrument profiles? Training must be repeated afterwards.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={clearing} onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button variant="danger" disabled={clearing} onClick={() => void handleClear()}>{clearing ? 'Clearing…' : 'Clear profiles'}</Button>
          </div>
        </div>
      ) : (
        <Button variant="danger-quiet" block onClick={() => setShowClearConfirm(true)}>Clear all profiles</Button>
      ))}

      {showTraining && <InstrumentTrainingPage onClose={() => setShowTraining(false)} />}
    </div>
  );
}
