import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { SOUND_CATALOG } from '../../audio/sounds';
import { audioEngine } from '../../audio';
import { VolumeState } from '../../audio/types';
import { DEFAULT_ACCENT_SOUND, DEFAULT_CLICK_SOUND, DEFAULT_VOLUME } from '../../utils/constants';
import * as db from '../../store/db';
import type { CustomSampleRecord } from '../../store/db';
import { CustomSampleManager } from './CustomSampleManager';
import { Button } from '../ui/Button';
import { Range } from '../ui/Range';

export function SoundSettings() {
  const clickSound = useSettingsStore((s) => s.clickSound);
  const accentSound = useSettingsStore((s) => s.accentSound);
  const clickVolume = useMetronomeStore((s) => s.volume);
  const setClickSound = useSettingsStore((s) => s.setClickSound);
  const setAccentSound = useSettingsStore((s) => s.setAccentSound);
  const setClickVolume = useMetronomeStore((s) => s.setVolume);
  const accentSoundThreshold = useSettingsStore((s) => s.accentSoundThreshold);
  const setAccentSoundThreshold = useSettingsStore((s) => s.setAccentSoundThreshold);

  const [expandedPicker, setExpandedPicker] = useState<'click' | 'accent' | null>(null);
  const lastPickerRef = useRef<'click' | 'accent'>('click');
  const [customSamples, setCustomSamples] = useState<CustomSampleRecord[]>([]);

  useEffect(() => {
    db.getAllCustomSamples().then(setCustomSamples).catch(() => {});
  }, []);

  const refreshCustomSamples = useCallback(() => {
    db.getAllCustomSamples().then(setCustomSamples).catch(() => {});
  }, []);

  const getSoundName = (id: string) => {
    if (id.startsWith('custom:')) {
      return customSamples.find((sample) => sample.id === id)?.name || 'Custom sample';
    }
    return SOUND_CATALOG.find((sound) => sound.id === id)?.name || id;
  };

  const categories = ['clicks', 'drums', 'percussion', 'tonal'] as const;
  const categoryLabels: Record<string, string> = {
    clicks: 'Clicks',
    drums: 'Drums',
    percussion: 'Percussion',
    tonal: 'Tonal',
  };

  const chooseSound = (pickerKey: 'click' | 'accent', id: string, onSelect: (soundId: string) => void) => {
    onSelect(id);
    audioEngine.previewSound(id);
    lastPickerRef.current = pickerKey;
    setExpandedPicker(null);
  };

  const renderPicker = (
    label: string,
    current: string,
    onSelect: (id: string) => void,
    pickerKey: 'click' | 'accent',
  ) => {
    const isExpanded = expandedPicker === pickerKey;
    const option = (id: string, name: string, detail?: string) => (
      <button
        type="button"
        key={id}
        aria-pressed={id === current}
        onClick={() => chooseSound(pickerKey, id, onSelect)}
        className={`flex w-full min-h-[44px] items-center gap-2 px-3 text-left text-sm ${id === current ? 'bg-accent-dim font-semibold text-text-primary' : 'text-text-secondary active:bg-bg-raised'}`}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={id === current ? '' : 'invisible'}><polyline points="20 6 9 17 4 12" /></svg>
        <span>{name}{detail && <span className="ml-1 text-xs font-normal text-text-muted">{detail}</span>}</span>
      </button>
    );

    return (
      <div role="group" aria-label={label} className="ui-field">
        <span className="ui-label" aria-hidden="true">{label}</span>
        <button
          type="button"
          onClick={() => {
            setExpandedPicker(isExpanded ? null : pickerKey);
            lastPickerRef.current = pickerKey;
          }}
          className="ui-select flex items-center text-left"
          aria-expanded={isExpanded}
        >
          <span className="truncate">{getSoundName(current)}</span>
        </button>

        {isExpanded && (
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border-subtle bg-bg-surface py-1">
            {customSamples.length > 0 && (
              <div>
                <div className="px-3 pt-2 pb-1 text-xs font-semibold text-text-muted">My samples</div>
                {customSamples.map((sample) => option(sample.id, sample.name, `${sample.durationMs}ms`))}
              </div>
            )}
            {categories.map((category) => (
              <div key={category}>
                <div className="px-3 pt-2 pb-1 text-xs font-semibold text-text-muted">{categoryLabels[category]}</div>
                {SOUND_CATALOG.filter((sound) => sound.category === category).map((sound) => option(sound.id, sound.name))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const previewSoundId = lastPickerRef.current === 'accent' ? accentSound : clickSound;
  const previewLabel = lastPickerRef.current === 'accent' ? 'Preview accent' : 'Preview click';

  const resetSounds = () => {
    setClickSound(DEFAULT_CLICK_SOUND);
    setAccentSound(DEFAULT_ACCENT_SOUND);
    setAccentSoundThreshold(VolumeState.LOUD);
    setClickVolume(DEFAULT_VOLUME);
  };

  return (
    <div className="space-y-5">
      {renderPicker('Click sound', clickSound, setClickSound, 'click')}
      {renderPicker('Accent sound', accentSound, setAccentSound, 'accent')}

      <div className="ui-field">
        <span className="ui-label">Use the accent sound from</span>
        <div role="group" aria-label="Use the accent sound from" className="ui-segmented">
          {([
            { state: VolumeState.GHOST, label: 'Ghost' },
            { state: VolumeState.SOFT, label: 'Soft' },
            { state: VolumeState.MED, label: 'Med' },
            { state: VolumeState.LOUD, label: 'Loud' },
            { state: VolumeState.ACCENT, label: 'Accent' },
          ]).map(({ state, label }) => (
            <button
              type="button"
              key={state}
              aria-pressed={accentSoundThreshold === state}
              onClick={() => setAccentSoundThreshold(state)}
              className={accentSoundThreshold !== state && state > accentSoundThreshold ? 'bg-accent-dim! text-text-primary!' : ''}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ui-hint">Beats at this level and above play the accent sound.</span>
      </div>

      <div className="ui-field">
        <div className="flex items-center justify-between">
          <span className="ui-label">Click volume</span>
          <span className="text-sm tabular-nums text-text-secondary">{Math.round(clickVolume * 100)}%</span>
        </div>
        <Range aria-label="Click volume" min={0} max={100} value={Math.round(clickVolume * 100)} onChange={(value) => setClickVolume(value / 100)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => audioEngine.previewSound(previewSoundId)}>{previewLabel}</Button>
        <Button variant="quiet" onClick={resetSounds}>Reset sounds</Button>
      </div>

      <div className="border-t border-border-subtle pt-4">
        <CustomSampleManager onSamplesChanged={refreshCustomSamples} />
      </div>
    </div>
  );
}
