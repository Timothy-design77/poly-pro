import { useState, type ReactNode } from 'react';
import { SoundSettings } from './SoundSettings';
import { VibrationSettings } from './VibrationSettings';
import { DetectionSettings } from './DetectionSettings';
import { CalibrationSettings } from './CalibrationSettings';
import { InstrumentSettings } from './InstrumentSettings';
import { DataSettings } from './DataSettings';
import { CloudSettings } from './CloudSettings';
import { useSettingsStore } from '../../store/settings-store';
import { HelpTip } from '../ui/HelpTip';

interface SectionProps {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  help?: string;
  children: ReactNode;
}

function CollapsibleSection({ title, icon, defaultOpen = false, help, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-subtle">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-bg-raised transition-all"
      >
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-semibold text-text-primary flex-1 flex items-center gap-1.5">
          {title}
          {help && <HelpTip text={help} />}
        </span>
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
 * Recording settings — full recording controls per plan.
 */
function RecordingSettings() {
  const sensitivity = useSettingsStore((s) => s.sensitivity);
  const setSensitivity = useSettingsStore((s) => s.setSensitivity);
  const includeClick = useSettingsStore((s) => s.includeClickInRecording);
  const setIncludeClick = useSettingsStore((s) => s.setIncludeClickInRecording);
  const clickVolRec = useSettingsStore((s) => s.clickVolumeInRecording);
  const setClickVolRec = useSettingsStore((s) => s.setClickVolumeInRecording);
  const liveWaveform = useSettingsStore((s) => s.liveWaveform);
  const setLiveWaveform = useSettingsStore((s) => s.setLiveWaveform);
  const audioAfter = useSettingsStore((s) => s.audioAfterAnalysis);
  const setAudioAfter = useSettingsStore((s) => s.setAudioAfterAnalysis);
  const retentionDays = useSettingsStore((s) => s.rawPcmRetentionDays);
  const setRetentionDays = useSettingsStore((s) => s.setRawPcmRetentionDays);

  // Gain label: sensitivity 0 = 1x, 0.5 = 3x, 1.0 = 5x
  const gainValue = 1 + sensitivity * 4;
  const gainLabel = gainValue === 1 ? '1x (off)' : `${gainValue.toFixed(1)}x`;

  const sliderClass = `w-full accent-white h-2 bg-bg-raised rounded-full appearance-none
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                       [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer`;

  return (
    <div className="space-y-4">
      {/* Include Click in Recording */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs text-text-muted uppercase tracking-wider">
            Include Click
          </label>
          <p className="text-[10px] text-text-muted mt-0.5">
            Play metronome through speaker during recording
          </p>
        </div>
        <button
          onClick={() => setIncludeClick(!includeClick)}
          className={`w-10 h-6 rounded-full transition-colors ${
            includeClick ? 'bg-accent' : 'bg-bg-raised'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${
              includeClick ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      {/* Click Volume in Recording */}
      {includeClick && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-text-muted uppercase tracking-wider">
              Click Volume (Recording)
            </label>
            <span className="font-mono text-xs text-text-secondary">{Math.round(clickVolRec * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={Math.round(clickVolRec * 100)}
            onChange={(e) => setClickVolRec(Number(e.target.value) / 100)}
            className={sliderClass}
          />
          <p className="text-[10px] text-text-muted mt-1.5">
            Lower than playback volume to reduce click bleed in mic
          </p>
        </div>
      )}

      {/* Mic Input Gain */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">
            Mic Boost
          </label>
          <span className="font-mono text-xs text-text-secondary">{gainLabel}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(sensitivity * 100)}
          onChange={(e) => setSensitivity(Number(e.target.value) / 100)}
          className={sliderClass}
        />
        <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
          Boost mic input for percussion. Phone mics are voice-optimized — drum hits need more gain.
        </p>
      </div>

      {/* Live Waveform */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs text-text-muted uppercase tracking-wider">
            Live Waveform
          </label>
          <p className="text-[10px] text-text-muted mt-0.5">
            Show real-time waveform display during recording
          </p>
        </div>
        <button
          onClick={() => setLiveWaveform(!liveWaveform)}
          className={`w-10 h-6 rounded-full transition-colors ${
            liveWaveform ? 'bg-accent' : 'bg-bg-raised'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${
              liveWaveform ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      {/* Audio After Analysis */}
      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider block mb-1.5">
          Audio After Analysis
        </label>
        <div className="flex gap-1">
          {([
            { value: 'compress' as const, label: 'Compress' },
            { value: 'keep-raw' as const, label: 'Keep Raw' },
            { value: 'delete' as const, label: 'Delete' },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAudioAfter(opt.value)}
              className={`flex-1 py-2 rounded-md text-xs min-h-[40px] transition-colors ${
                audioAfter === opt.value
                  ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                  : 'bg-bg-raised text-text-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-1.5">
          {audioAfter === 'compress'
            ? 'Compress to Opus after analysis (saves space, re-analysis from compressed)'
            : audioAfter === 'keep-raw'
              ? 'Keep raw PCM for highest-quality re-analysis'
              : 'Delete audio after analysis (analysis results kept, no re-analysis)'}
        </p>
      </div>

      {/* Raw PCM Retention */}
      {audioAfter === 'keep-raw' && (
        <div>
          <label className="text-xs text-text-muted uppercase tracking-wider block mb-1.5">
            Raw PCM Retention
          </label>
          <div className="flex gap-1">
            {[7, 14, 30, 60, 90].map((days) => (
              <button
                key={days}
                onClick={() => setRetentionDays(days)}
                className={`flex-1 py-2 rounded-md text-xs min-h-[40px] transition-colors ${
                  retentionDays === days
                    ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                    : 'bg-bg-raised text-text-muted'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1.5">
            Raw PCM files are large. After this period, raw audio is auto-deleted (analysis kept).
          </p>
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
        help="Choose click sounds for each accent level. Pick from built-in kits or individual samples. Preview by tapping the play icon."
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

      {/* Section 2: Recording */}
      <CollapsibleSection
        title="Recording"
        help="Controls for mic recording during practice. Recordings are stored locally and analyzed for timing accuracy after each session."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        }
      >
        <RecordingSettings />
      </CollapsibleSection>

      {/* Section 3: Detection */}
      <CollapsibleSection
        title="Detection"
        help="Default parameters for onset detection. These apply to new recordings. Existing sessions can be re-tuned from the session detail Tune tab."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        }
      >
        <DetectionSettings />
      </CollapsibleSection>

      {/* Section 4: Vibration */}
      <CollapsibleSection
        title="Vibration"
        help="Haptic feedback on beats. Useful when playing loud — you can feel the beat even if you can't hear the click."
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

      {/* Section 5: Calibration */}
      <CollapsibleSection
        title="Calibration"
        help="Measures your device's audio latency using chirp sounds. This offset is subtracted from all onset times so your scores reflect your actual timing, not device delay."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      >
        <CalibrationSettings />
      </CollapsibleSection>

      {/* Section 6: Instruments */}
      <CollapsibleSection
        title="Instruments"
        help="Train the classifier to recognize your kit. Once trained, each drum hit in your recordings will be labeled with its instrument type, enabling per-instrument timing stats."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        }
      >
        <InstrumentSettings />
      </CollapsibleSection>

      {/* Section 7: Data */}
      <CollapsibleSection
        title="Data"
        help="Export, import, and manage your practice data. Clear sessions, back up to file, or restore from a previous backup."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        }
      >
        <DataSettings />
      </CollapsibleSection>

      {/* Section 8: Cloud Enhancement */}
      <CollapsibleSection
        title="Cloud Enhancement"
        help="Optional: upload recordings to MVSEP for professional drum stem separation. Improves instrument classification accuracy significantly."
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
          </svg>
        }
      >
        <CloudSettings />
      </CollapsibleSection>
    </div>
  );
}
