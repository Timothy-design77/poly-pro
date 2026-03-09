/**
 * CloudSettings — Phase 10 (Optional)
 *
 * Settings > Cloud Enhancement section.
 * Controls MVSEP drum separation service integration.
 * One-time consent dialog before first upload.
 */

import { useState, useEffect, useCallback } from 'react';
import { hasConsent, grantConsent, revokeConsent } from '../../utils/mvsep';
import { HelpTip } from '../ui/HelpTip';

export function CloudSettings() {
  const [consentGranted, setConsentGranted] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hasConsent().then((granted) => {
      setConsentGranted(granted);
      setLoading(false);
    });
  }, []);

  const handleEnableToggle = useCallback(async () => {
    if (consentGranted) {
      // Revoking
      await revokeConsent();
      setConsentGranted(false);
    } else {
      // Show consent dialog
      setShowConsentDialog(true);
    }
  }, [consentGranted]);

  const handleGrantConsent = useCallback(async () => {
    await grantConsent();
    setConsentGranted(true);
    setShowConsentDialog(false);
  }, []);

  if (loading) return null;

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-text-secondary flex items-center gap-1">
            Enhanced Analysis
            <HelpTip text="Upload recordings to MVSEP for professional drum stem separation. This dramatically improves instrument classification accuracy. Free tier: 50 separations/day. Audio is processed on MVSEP servers." />
          </span>
          <p className="text-[10px] text-text-muted mt-0.5">
            Cloud drum separation via MVSEP
          </p>
        </div>
        <button
          onClick={handleEnableToggle}
          className={`w-10 h-6 rounded-full transition-colors ${
            consentGranted ? 'bg-accent' : 'bg-bg-raised'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${
              consentGranted ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      {/* Status */}
      <div className="text-[10px] text-text-muted">
        {consentGranted ? (
          <p>Enabled — per-session toggle available in session detail.</p>
        ) : (
          <p>Disabled — all analysis runs locally on your device.</p>
        )}
      </div>

      {/* Consent dialog */}
      {showConsentDialog && (
        <div className="bg-bg-surface border border-border-subtle rounded-md p-3 space-y-2">
          <p className="text-xs text-text-primary font-medium">
            Privacy Notice
          </p>
          <p className="text-[10px] text-text-secondary leading-relaxed">
            Enabling this feature will upload your drum recordings to MVSEP
            (mvsep.com) for processing. Your audio will be temporarily stored
            on their servers during separation and deleted afterwards.
          </p>
          <p className="text-[10px] text-text-secondary leading-relaxed">
            This is optional — all core analysis works without it.
            Enhanced separation improves instrument classification accuracy
            significantly.
          </p>
          <p className="text-[10px] text-text-muted">
            Free tier: 50 separations per day.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowConsentDialog(false)}
              className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleGrantConsent}
              className="flex-1 py-2 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[44px]"
            >
              I Agree
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
