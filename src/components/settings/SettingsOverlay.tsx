import { useState, type ReactNode } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { SoundSettings } from './SoundSettings';
import { VibrationSettings } from './VibrationSettings';
import { DetectionSettings } from './DetectionSettings';
import { CalibrationSettings } from './CalibrationSettings';
import { InstrumentSettings } from './InstrumentSettings';
import { DataSettings } from './DataSettings';
import { CloudSettings } from './CloudSettings';
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
    <div className="border-b border-border-subtle bg-bg-surface">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full min-h-[50px] flex items-center gap-3 px-4 py-3 text-left active:bg-bg-raised transition-colors"
      >
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-semibold text-text-primary flex-1 flex items-center gap-1.5">
          {title}
          {help && <HelpTip text={help} />}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && <div className="px-4 pb-4 bg-bg-primary">{children}</div>}
    </div>
  );
}

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

  const gainValue = 1 + sensitivity * 4;
  const gainLabel = gainValue === 1 ? '1x (off)' : `${gainValue.toFixed(1)}x`;
  const sliderClass = `w-full accent-accent h-2 bg-bg-raised rounded-full appearance-none
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                       [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer`;

  const resetRecording = () => {
    setSensitivity(0.5);
    setIncludeClick(true);
    setClickVolRec(0.15);
    setLiveWaveform(true);
    setAudioAfter('compress');
    setRetentionDays(30);
  };

  const ToggleButton = ({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      onClick={onToggle}
      className={`w-11 h-7 rounded-full transition-colors border shrink-0 ${enabled ? 'bg-accent border-accent' : 'bg-bg-raised border-border-subtle'}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-white mx-1 transition-transform shadow-sm ${enabled ? 'translate-x-4' : ''}`} />
    </button>
  );

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="text-xs text-text-muted uppercase tracking-wider">Include Click</label>
          <p className="text-[10px] text-text-muted mt-0.5">Play metronome during recording</p>
        </div>
        <ToggleButton enabled={includeClick} onToggle={() => setIncludeClick(!includeClick)} label="Include click in recording" />
      </div>

      {includeClick && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-text-muted uppercase tracking-wider">Click Volume (Recording)</label>
            <span className="font-mono text-xs text-text-secondary">{Math.round(clickVolRec * 100)}%</span>
          </div>
          <input type="range" min="0" max="50" value={Math.round(clickVolRec * 100)}
            onChange={(event) => setClickVolRec(Number(event.target.value) / 100)} className={sliderClass} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">Mic Boost</label>
          <span className="font-mono text-xs text-text-secondary">{gainLabel}</span>
        </div>
        <input type="range" min="0" max="100" value={Math.round(sensitivity * 100)}
          onChange={(event) => setSensitivity(Number(event.target.value) / 100)} className={sliderClass} />
        <p className="text-[10px] text-text-muted mt-1.5">Boost raw phone-mic input for percussion transients.</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="text-xs text-text-muted uppercase tracking-wider">Live Waveform</label>
          <p className="text-[10px] text-text-muted mt-0.5">Show real-time input level while recording</p>
        </div>
        <ToggleButton enabled={liveWaveform} onToggle={() => setLiveWaveform(!liveWaveform)} label="Live waveform" />
      </div>

      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider block mb-1.5">Audio After Analysis</label>
        <div className="grid grid-cols-3 gap-1">
          {([
            { value: 'compress' as const, label: 'Compress' },
            { value: 'keep-raw' as const, label: 'Keep Raw' },
            { value: 'delete' as const, label: 'Delete' },
          ]).map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => setAudioAfter(option.value)}
              className={`min-h-[42px] rounded-lg text-xs border ${audioAfter === option.value
                ? 'bg-accent text-bg-primary border-accent'
                : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {audioAfter === 'keep-raw' && (
        <div>
          <label className="text-xs text-text-muted uppercase tracking-wider block mb-1.5">Raw PCM Retention</label>
          <div className="grid grid-cols-5 gap-1">
            {[7, 14, 30, 60, 90].map((days) => (
              <button
                type="button"
                key={days}
                onClick={() => setRetentionDays(days)}
                className={`min-h-[40px] rounded-lg text-xs border ${retentionDays === days
                  ? 'bg-accent text-bg-primary border-accent'
                  : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'}`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={resetRecording}
        className="w-full min-h-[40px] rounded-lg border border-border-subtle bg-bg-surface text-text-secondary text-xs font-semibold active:bg-bg-raised"
      >
        Reset Recording Settings
      </button>
    </div>
  );
}

export function SettingsContent() {
  return (
    <div className="bg-bg-surface">
      <CollapsibleSection title="Sounds" defaultOpen help="Choose click and accent sounds, volume, and custom samples."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>}>
        <SoundSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Recording" help="Raw mic capture, input boost, monitoring, and audio retention behavior."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>}>
        <RecordingSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Detection" help="Onset/scoring controls and named presets. Use Run Detection Test to validate the current profile."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}>
        <DetectionSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Vibration" help="Beat haptics for loud practice environments."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M22 12h2M0 12h2" /></svg>}>
        <VibrationSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Calibration" help="Measure and fine-tune device audio latency so timing scores reflect playing rather than hardware delay."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}>
        <CalibrationSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Instruments" help="Train and manage acoustic instrument profiles for per-instrument classification and timing stats."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></svg>}>
        <InstrumentSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Data" help="Export/import backups, inspect storage, and explicitly manage retained recordings and local data."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}>
        <DataSettings />
      </CollapsibleSection>

      <CollapsibleSection title="Cloud Enhancement" help="Optional MVSEP drum separation. Core recording and analysis remain local without this feature."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>}>
        <CloudSettings />
      </CollapsibleSection>

      <p className="text-center text-[10px] text-text-faint font-mono pt-3 pb-6 bg-bg-primary">build {__BUILD_ID__}</p>
    </div>
  );
}
