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
      return customSamples.find((sample) => sample.id === id)?.name || 'Custom Sample';
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
    current: string,
    onSelect: (id: string) => void,
    pickerKey: 'click' | 'accent',
  ) => {
    const isExpanded = expandedPicker === pickerKey;

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setExpandedPicker(isExpanded ? null : pickerKey);
            lastPickerRef.current = pickerKey;
          }}
          className="w-full min-h-[44px] flex items-center justify-between py-2.5 px-3 rounded-lg
                     bg-bg-surface border border-border-subtle text-sm active:bg-bg-raised"
          aria-expanded={isExpanded}
        >
          <span className="text-text-primary truncate">{getSoundName(current)}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isExpanded && (
          <div className="mt-1 bg-bg-surface border border-border-subtle rounded-lg overflow-hidden max-h-[320px] overflow-y-auto shadow-sm">
            {customSamples.length > 0 && (
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider px-3 pt-2 pb-1">My Samples</div>
                {customSamples.map((sample) => (
                  <button
                    type="button"
                    key={sample.id}
                    onClick={() => chooseSound(pickerKey, sample.id, onSelect)}
                    className={`w-full min-h-[42px] text-left px-3 py-2 text-sm flex items-center gap-2
                      ${sample.id === current ? 'text-text-primary bg-accent-dim font-semibold' : 'text-text-secondary active:bg-bg-raised'}`}
                  >
                    {sample.id === current && <span aria-hidden="true">✓</span>}
                    <span className={sample.id === current ? '' : 'pl-[18px]'}>
                      {sample.name}<span className="text-text-muted text-[10px] ml-1">{sample.durationMs}ms</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {categories.map((category) => (
              <div key={category}>
                <div className="text-[10px] text-text-muted uppercase tracking-wider px-3 pt-2 pb-1">
                  {categoryLabels[category]}
                </div>
                {SOUND_CATALOG.filter((sound) => sound.category === category).map((sound) => (
                  <button
                    type="button"
                    key={sound.id}
                    onClick={() => chooseSound(pickerKey, sound.id, onSelect)}
                    className={`w-full min-h-[42px] text-left px-3 py-2 text-sm flex items-center gap-2
                      ${sound.id === current ? 'text-text-primary bg-accent-dim font-semibold' : 'text-text-secondary active:bg-bg-raised'}`}
                  >
                    {sound.id === current && <span aria-hidden="true">✓</span>}
                    <span className={sound.id === current ? '' : 'pl-[18px]'}>{sound.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const previewSoundId = lastPickerRef.current === 'accent' ? accentSound : clickSound;
  const previewLabel = lastPickerRef.current === 'accent' ? 'Preview Accent' : 'Preview Click';

  const resetSounds = () => {
    setClickSound(DEFAULT_CLICK_SOUND);
    setAccentSound(DEFAULT_ACCENT_SOUND);
    setAccentSoundThreshold(VolumeState.LOUD);
    setClickVolume(DEFAULT_VOLUME);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Click Sound</label>
        {renderPicker(clickSound, setClickSound, 'click')}
      </div>

      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Accent Sound</label>
        {renderPicker(accentSound, setAccentSound, 'accent')}
      </div>

      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Accent Sound Plays At</label>
        <div className="text-[11px] text-text-muted mb-2">Levels at or above this use the accent sound</div>
        <div className="flex gap-1">
          {([
            { state: VolumeState.GHOST, label: 'Ghost' },
            { state: VolumeState.SOFT, label: 'Soft' },
            { state: VolumeState.MED, label: 'Med' },
            { state: VolumeState.LOUD, label: 'Loud' },
            { state: VolumeState.ACCENT, label: 'Accent' },
          ]).map(({ state, label }) => {
            const isActive = accentSoundThreshold === state;
            const isAbove = state >= accentSoundThreshold;
            return (
              <button
                type="button"
                key={state}
                onClick={() => setAccentSoundThreshold(state)}
                className={`flex-1 min-h-[42px] rounded-lg text-[10px] font-bold touch-manipulation border
                  ${isActive
                    ? 'bg-accent text-bg-primary border-accent'
                    : isAbove
                      ? 'bg-accent-dim text-text-primary border-border-emphasis'
                      : 'bg-bg-surface text-text-muted border-border-subtle active:bg-bg-raised'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">Click Volume</label>
          <span className="font-mono text-xs text-text-secondary">{Math.round(clickVolume * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(clickVolume * 100)}
          onChange={(event) => setClickVolume(Number(event.target.value) / 100)}
          className="w-full accent-accent h-2 bg-bg-raised rounded-full appearance-none
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                     [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => audioEngine.previewSound(previewSoundId)}
          className="min-h-[44px] rounded-lg border border-border-subtle bg-bg-surface
                     text-text-primary text-xs font-bold active:bg-bg-raised"
        >
          {previewLabel}
        </button>
        <button
          type="button"
          onClick={resetSounds}
          className="min-h-[44px] rounded-lg border border-border-subtle bg-bg-surface
                     text-text-secondary text-xs font-bold active:bg-bg-raised"
        >
          Reset Sounds
        </button>
      </div>

      <div className="border-t border-border-subtle pt-4 mt-2">
        <CustomSampleManager onSamplesChanged={refreshCustomSamples} />
      </div>
    </div>
  );
}
