import { CollapsibleCard as CollapsibleSection } from '../ui/CollapsibleCard';
import { useSettingsStore } from '../../store/settings-store';
import { SoundSettings } from './SoundSettings';
import { VibrationSettings } from './VibrationSettings';
import { DetectionSettings } from './DetectionSettings';
import { CalibrationSettings } from './CalibrationSettings';
import { InstrumentSettings } from './InstrumentSettings';
import { DataSettings } from './DataSettings';
import { HelpTip } from '../ui/HelpTip';

function RecordingSettings() {
  const sensitivity = useSettingsStore((state) => state.sensitivity);
  const setSensitivity = useSettingsStore((state) => state.setSensitivity);
  const includeClick = useSettingsStore((state) => state.includeClickInRecording);
  const setIncludeClick = useSettingsStore((state) => state.setIncludeClickInRecording);
  const analysisGain = 1 + sensitivity * 4;

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-text-secondary">Click while recording</p>
          <p className="text-xs text-text-muted mt-0.5">Turn off for silent recording with visual beats and timing feedback. Available in Recording setup on Practice.</p>
        </div>
        <button type="button" role="switch" aria-label="Click while recording" aria-checked={includeClick} onClick={() => setIncludeClick(!includeClick)} className={`w-11 h-7 rounded-full border shrink-0 ${includeClick ? 'bg-accent border-accent' : 'bg-bg-raised border-border-subtle'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white mx-1 transition-transform ${includeClick ? 'translate-x-4' : ''}`} />
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-text-secondary flex items-center gap-1">Analysis Input Gain <HelpTip text="Applied only to the analysis copy of the recording. Raw stored PCM remains unchanged." /></span>
          <span className="font-mono text-xs text-text-muted">{analysisGain.toFixed(1)}×</span>
        </div>
        <input aria-label="Analysis input gain" type="range" min="0" max="100" value={Math.round(sensitivity * 100)} onChange={(event) => setSensitivity(Number(event.target.value) / 100)} className="w-full accent-accent" />
      </div>

      <button type="button" onClick={() => { setSensitivity(0.5); setIncludeClick(true); }} className="w-full min-h-[40px] rounded-lg border border-border-subtle bg-bg-surface text-text-secondary text-xs font-semibold">Reset Recording Settings</button>

    </div>
  );
}

export function SettingsContent() {
  return (
    <div className="px-4 space-y-2">
      <CollapsibleSection title="Sounds" help="Choose click and accent sounds and manage custom samples." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>}><SoundSettings /></CollapsibleSection>
      <CollapsibleSection title="Recording" help="Raw capture behavior and analysis-only input gain." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>}><RecordingSettings /></CollapsibleSection>
      <CollapsibleSection title="Detection" help="Onset detection profiles and full re-detection settings." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}><DetectionSettings /></CollapsibleSection>
      <CollapsibleSection title="Vibration" help="Beat haptics for loud practice environments." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M22 12h2M0 12h2" /></svg>}><VibrationSettings /></CollapsibleSection>
      <CollapsibleSection title="Calibration" help="Measure speaker-to-microphone round-trip latency for timing scores." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}><CalibrationSettings /></CollapsibleSection>
      <CollapsibleSection title="Instruments" help="Train and manage local instrument-classification profiles." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></svg>}><InstrumentSettings /></CollapsibleSection>
      <CollapsibleSection title="Data" help="Bounded backups, imports, storage cleanup, and destructive data controls." icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}><DataSettings /></CollapsibleSection>
      <p className="text-center text-xs text-text-muted font-mono pt-3 pb-6 bg-bg-primary">build {__BUILD_ID__}</p>
    </div>
  );
}
