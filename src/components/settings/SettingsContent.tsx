import { useId, useState, type ReactNode } from 'react';
import { Toggle } from '../ui/Toggle';
import { HelpTip } from '../ui/HelpTip';
import { useSettingsStore } from '../../store/settings-store';
import { SoundSettings } from './SoundSettings';
import { VibrationSettings } from './VibrationSettings';
import { DetectionSettings } from './DetectionSettings';
import { CalibrationSettings } from './CalibrationSettings';
import { InstrumentSettings } from './InstrumentSettings';
import { DataSettings } from './DataSettings';
import { CloudSettings } from './CloudSettings';

interface SettingsSectionProps {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  help?: string;
  children: ReactNode;
}

function SettingsSection({
  title,
  icon,
  defaultOpen = false,
  help,
  children,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const contentId = useId();

  return (
    <section className="border-b border-border-subtle">
      <div className="flex items-stretch focus-within:bg-bg-raised transition-colors">
        <button
          type="button"
          id={titleId}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={contentId}
          className="min-w-0 flex-1 flex items-center gap-3 px-4 py-3.5 text-left
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
        >
          <span className="text-text-secondary" aria-hidden="true">{icon}</span>
          <span className="text-sm font-semibold text-text-primary flex-1">{title}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {help && (
          <div className="flex items-center pr-3">
            <HelpTip text={help} label={`Help for ${title}`} />
          </div>
        )}
      </div>

      {open && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={titleId}
          className="px-4 pb-4"
        >
          {children}
        </div>
      )}
    </section>
  );
}

function RecordingSettings() {
  const sensitivity = useSettingsStore((state) => state.sensitivity);
  const setSensitivity = useSettingsStore((state) => state.setSensitivity);
  const includeClick = useSettingsStore((state) => state.includeClickInRecording);
  const setIncludeClick = useSettingsStore((state) => state.setIncludeClickInRecording);
  const clickVolume = useSettingsStore((state) => state.clickVolumeInRecording);
  const setClickVolume = useSettingsStore((state) => state.setClickVolumeInRecording);
  const liveWaveform = useSettingsStore((state) => state.liveWaveform);
  const setLiveWaveform = useSettingsStore((state) => state.setLiveWaveform);

  const gainValue = 1 + sensitivity * 4;
  const gainLabel = gainValue === 1 ? '1×' : `${gainValue.toFixed(1)}×`;
  const sliderClass = `w-full accent-white h-2 bg-bg-raised rounded-full appearance-none
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                       [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer`;

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-text-primary font-semibold">Audible click while recording</div>
          <p className="text-[11px] text-text-secondary mt-1">
            The timing grid continues internally even when the click is muted.
          </p>
        </div>
        <Toggle
          label="Audible click while recording"
          enabled={includeClick}
          onChange={setIncludeClick}
        />
      </div>

      {includeClick && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="recording-click-volume" className="text-xs text-text-primary font-semibold">
              Recording click volume
            </label>
            <span className="font-mono text-xs text-text-secondary">
              {Math.round(clickVolume * 100)}%
            </span>
          </div>
          <input
            id="recording-click-volume"
            type="range"
            min="0"
            max="50"
            value={Math.round(clickVolume * 100)}
            onChange={(event) => setClickVolume(Number(event.target.value) / 100)}
            className={sliderClass}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="recording-mic-boost" className="text-xs text-text-primary font-semibold">
            Microphone boost
          </label>
          <span className="font-mono text-xs text-text-secondary">{gainLabel}</span>
        </div>
        <input
          id="recording-mic-boost"
          type="range"
          min="0"
          max="100"
          value={Math.round(sensitivity * 100)}
          onChange={(event) => setSensitivity(Number(event.target.value) / 100)}
          className={sliderClass}
        />
        <p className="text-[11px] text-text-secondary mt-2 leading-relaxed">
          Applies gain before raw PCM capture. Reduce it if strong drum hits clip.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-text-primary font-semibold">Live input meter</div>
          <p className="text-[11px] text-text-secondary mt-1">
            Show microphone level while recording.
          </p>
        </div>
        <Toggle
          label="Live input meter"
          enabled={liveWaveform}
          onChange={setLiveWaveform}
        />
      </div>

      <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          Sessions are retained as unprocessed PCM so they can be reanalyzed. Use Data settings to monitor storage and create backups.
        </p>
      </div>
    </div>
  );
}

function InterfaceSettings() {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
      <p className="text-xs text-text-primary font-semibold">Explicit navigation</p>
      <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
        Use the bottom navigation buttons. Horizontal page swiping and swipe-to-dismiss Settings are disabled to prevent accidental changes while operating sliders, pattern cells, and the BPM controls.
      </p>
    </div>
  );
}

function icon(paths: ReactNode) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export function SettingsContent() {
  return (
    <div>
      <SettingsSection
        title="Sounds"
        defaultOpen
        help="Choose and preview click sounds and accent levels."
        icon={icon(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></>)}
      >
        <SoundSettings />
      </SettingsSection>

      <SettingsSection
        title="Recording"
        help="Configure raw microphone capture and the click heard during recording."
        icon={icon(<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></>)}
      >
        <RecordingSettings />
      </SettingsSection>

      <SettingsSection
        title="Detection"
        help="Tune onset detection and scoring defaults for new recordings."
        icon={icon(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.7" y2="16.7" /></>)}
      >
        <DetectionSettings />
      </SettingsSection>

      <SettingsSection
        title="Vibration"
        help="Configure haptic beat feedback on supported devices."
        icon={icon(<><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M1 9v6M23 9v6" /></>)}
      >
        <VibrationSettings />
      </SettingsSection>

      <SettingsSection
        title="Interface"
        help="Poly Pro uses explicit vertical and button-based navigation."
        icon={icon(<><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="9" y1="18" x2="15" y2="18" /></>)}
      >
        <InterfaceSettings />
      </SettingsSection>

      <SettingsSection
        title="Calibration"
        help="Measure and adjust device input/output latency."
        icon={icon(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></>)}
      >
        <CalibrationSettings />
      </SettingsSection>

      <SettingsSection
        title="Instruments"
        help="Train the local classifier to recognize instruments in your kit."
        icon={icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>)}
      >
        <InstrumentSettings />
      </SettingsSection>

      <SettingsSection
        title="Data"
        help="Monitor storage, export backups, restore data, and perform explicit cleanup."
        icon={icon(<><path d="M4 7c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3z" /><path d="M4 7v5c0 2 3.6 3 8 3s8-1 8-3V7" /><path d="M4 12v5c0 2 3.6 3 8 3s8-1 8-3v-5" /></>)}
      >
        <DataSettings />
      </SettingsSection>

      <SettingsSection
        title="Cloud Enhancement"
        help="Optional external processing. Local analysis remains the default."
        icon={icon(<><path d="M17.5 19H7a5 5 0 0 1-.5-10 7 7 0 0 1 13.3 2A4 4 0 0 1 17.5 19z" /></>)}
      >
        <CloudSettings />
      </SettingsSection>

      <div className="px-4 py-4 text-center">
        <span className="text-[10px] text-text-secondary font-mono">
          Poly Pro · Build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
        </span>
      </div>
    </div>
  );
}
