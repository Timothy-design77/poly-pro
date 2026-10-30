import { CollapsibleCard as CollapsibleSection } from '../ui/CollapsibleCard';
import { useSettingsStore } from '../../store/settings-store';
import { SoundSettings } from './SoundSettings';
import { VibrationSettings } from './VibrationSettings';
import { DetectionSettings } from './DetectionSettings';
import { CalibrationSettings } from './CalibrationSettings';
import { InstrumentSettings } from './InstrumentSettings';
import { DataSettings } from './DataSettings';
import { Toggle } from '../ui/Toggle';
import { HelpTip } from '../ui/HelpTip';
import { Button } from '../ui/Button';
import { Range } from '../ui/Range';
import { SettingRow } from '../ui/SettingRow';

function RecordingSettings() {
  const sensitivity = useSettingsStore((state) => state.sensitivity);
  const setSensitivity = useSettingsStore((state) => state.setSensitivity);
  const includeClick = useSettingsStore((state) => state.includeClickInRecording);
  const setIncludeClick = useSettingsStore((state) => state.setIncludeClickInRecording);
  const analysisGain = 1 + sensitivity * 4;

  return (
    <div className="space-y-2">
      <div className="ui-rows">
        <SettingRow label="Click while recording" description="Turn off to record silently and follow the visual beat. Also in Recording setup on Practice.">
          <Toggle label="Click while recording" enabled={includeClick} onChange={setIncludeClick} />
        </SettingRow>
        <div className="ui-field py-3">
          <div className="flex items-center justify-between">
            <span className="ui-label flex items-center gap-2">Analysis input gain <HelpTip text="Applied only to the copy used for hit detection. Your saved recording is unchanged." /></span>
            <span className="text-sm tabular-nums text-text-secondary">{analysisGain.toFixed(1)}×</span>
          </div>
          <Range aria-label="Analysis input gain" min={0} max={100} value={Math.round(sensitivity * 100)} onChange={(value) => setSensitivity(value / 100)} />
        </div>
      </div>
      <Button variant="quiet" block onClick={() => { setSensitivity(0.5); setIncludeClick(true); }}>Reset recording settings</Button>
    </div>
  );
}

export function SettingsContent() {
  return (
    <div className="settings-list">
      <CollapsibleSection title="Sounds" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>}><SoundSettings /></CollapsibleSection>
      <CollapsibleSection title="Recording" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>}><RecordingSettings /></CollapsibleSection>
      <CollapsibleSection title="Detection" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}><DetectionSettings /></CollapsibleSection>
      <CollapsibleSection title="Vibration" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M22 12h2M0 12h2" /></svg>}><VibrationSettings /></CollapsibleSection>
      <CollapsibleSection title="Calibration" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}><CalibrationSettings /></CollapsibleSection>
      <CollapsibleSection title="Instruments" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></svg>}><InstrumentSettings /></CollapsibleSection>
      <CollapsibleSection title="Data" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}><DataSettings /></CollapsibleSection>
      <p className="pt-4 pb-6 text-center text-xs text-text-muted tabular-nums">Build {__BUILD_ID__}</p>
    </div>
  );
}
