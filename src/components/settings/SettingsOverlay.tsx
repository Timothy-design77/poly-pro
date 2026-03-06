import { useState, type ReactNode } from 'react';
import { SoundSettings } from './SoundSettings';
import { VibrationSettings } from './VibrationSettings';

interface SectionProps {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

function CollapsibleSection({ title, icon, defaultOpen = false, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-subtle">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-bg-raised transition-all"
      >
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-semibold text-text-primary flex-1">{title}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Settings overlay content — 6 collapsible sections.
 * Phase 1: Sounds + Vibration are functional.
 * Others show "Coming soon" stubs.
 */
export function SettingsContent() {
  return (
    <div>
      {/* Section 1: Sounds */}
      <CollapsibleSection
        title="Sounds"
        defaultOpen
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        }
      >
        <SoundSettings />
      </CollapsibleSection>

      {/* Section 2: Recording (stub) */}
      <CollapsibleSection
        title="Recording"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        }
      >
        <div className="text-sm text-text-muted py-2">Coming in Phase 4</div>
      </CollapsibleSection>

      {/* Section 3: Detection (stub) */}
      <CollapsibleSection
        title="Detection"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        }
      >
        <div className="text-sm text-text-muted py-2">Coming in Phase 5</div>
      </CollapsibleSection>

      {/* Section 4: Vibration */}
      <CollapsibleSection
        title="Vibration"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M22 12h2M0 12h2" />
          </svg>
        }
      >
        <VibrationSettings />
      </CollapsibleSection>

      {/* Section 5: Calibration (stub) */}
      <CollapsibleSection
        title="Calibration"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      >
        <div className="text-sm text-text-muted py-2">Coming in Phase 6</div>
      </CollapsibleSection>

      {/* Section 6: Data (stub) */}
      <CollapsibleSection
        title="Data"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        }
      >
        <div className="text-sm text-text-muted py-2">Coming in Phase 10</div>
      </CollapsibleSection>
    </div>
  );
}
