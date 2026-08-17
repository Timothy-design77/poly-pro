import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { SOUND_CATALOG } from '../../audio/sounds';
import { audioEngine } from '../../audio';
import { VolumeState } from '../../audio/types';
import * as db from '../../store/db';
import type { CustomSampleRecord } from '../../store/db';
import { CustomSampleManager } from './CustomSampleManager';

/**
 * Settings section: Sounds
 * - Click Sound picker
 * - Accent Sound picker
 * - Click Volume slider
 * - Preview button (previews whichever was last changed)
 */
export function SoundSettings() {
  const clickSound = useSettingsStore((state) => state.clickSound);
  const accentSound = useSettingsStore((state) => state.accentSound);
  const clickVolume = useMetronomeStore((state) => state.volume);
  const setClickSound = useSettingsStore((state) => state.setClickSound);
  const setAccentSound = useSettingsStore((state) => state.setAccentSound);
  const setClickVolume = useMetronomeStore((state) => state.setVolume);
  const accentSoundThreshold = useSettingsStore((state) => state.accentSoundThreshold);
  const setAccentSoundThreshold = useSettingsStore((state) => state.setAccentSoundThreshold);

  const [expandedPicker, setExpandedPicker] = useState<'click' | 'accent' | null>(null);
  const lastPickerRef = useRef<'click' | 'accent'>('click');
  const [customSamples, setCustomSamples] = useState<CustomSampleRecord[]>([]);

  useEffect(() => {
    db.getAllCustomSamples().then(setCustomSamples).catch(() => {});
  }, []);

  const refreshCustomSamples = useCallback(() => {
    db.getAllCustomSamples().then(setCustomSamples).catch(() => {});
  }, []);

  const handlePreview = (soundId: string) => {
    audioEngine.previewSound(soundId);
  };

  const getSoundName = (id: string) => {
    if (id.startsWith('custom:')) {
      const custom = customSamples.find((sample) => sample.id === id);
      return custom?.name || 'Custom Sample';
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

  const renderPicker = (
    current: string,
    onSelect: (id: string) => void,
    pickerKey: 'click' | 'accent',
  ) => {
    const isExpanded = expandedPicker === pickerKey;
    const pickerLabel = pickerKey === 'click' ? 'Click sound' : 'Accent sound';

    return (
      <div>
        <button
          type="button"
          aria-label={`${pickerLabel}: ${getSoundName(current)}`}
          aria-expanded={isExpanded}
          onClick={() => {
            setExpandedPicker(isExpanded ? null : pickerKey);
            lastPickerRef.current = pickerKey;
          }}
          className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg
                     bg-bg-primary border border-border-subtle text-sm
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="text-text-primary">{getSoundName(current)}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isExpanded && (
          <div
            className="mt-1 bg-bg-primary border border-border-subtle rounded-lg overflow-hidden max-h-[320px] overflow-y-auto"
            role="listbox"
            aria-label={pickerLabel}
          >
            {customSamples.length > 0 && (
              <div role="group" aria-label="My samples">
                <div className="text-[10px] text-text-secondary uppercase tracking-wider px-3 pt-2 pb-1">
                  My Samples
                </div>
                {customSamples.map((sample) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={sample.id === current}
                    key={sample.id}
                    onClick={() => {
                      onSelect(sample.id);
                      handlePreview(sample.id);
                      lastPickerRef.current = pickerKey;
                      setExpandedPicker(null);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2
                      ${sample.id === current
                        ? 'text-text-primary bg-bg-raised'
                        : 'text-text-secondary active:bg-bg-raised'
                      }`}
                  >
                    {sample.id === current && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    <span className={sample.id === current ? '' : 'pl-[22px]'}>
                      {sample.name}
                      <span className="text-text-secondary text-[10px] ml-1">{sample.durationMs}ms</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {categories.map((category) => {
              const sounds = SOUND_CATALOG.filter((sound) => sound.category === category);
              return (
                <div key={category} role="group" aria-label={categoryLabels[category]}>
                  <div className="text-[10px] text-text-secondary uppercase tracking-wider px-3 pt-2 pb-1">
                    {categoryLabels[category]}
                  </div>
                  {sounds.map((sound) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={sound.id === current}
                      key={sound.id}
                      onClick={() => {
                        onSelect(sound.id);
                        handlePreview(sound.id);
                        lastPickerRef.current = pickerKey;
                        setExpandedPicker(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2
                        ${sound.id === current
                          ? 'text-text-primary bg-bg-raised'
                          : 'text-text-secondary active:bg-bg-raised'
                        }`}
                    >
                      {sound.id === current && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      <span className={sound.id === current ? '' : 'pl-[22px]'}>{sound.name}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const previewSoundId = lastPickerRef.current === 'accent' ? accentSound : clickSound;
  const previewLabel = lastPickerRef.current === 'accent' ? 'Preview Accent' : 'Preview Click';

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-1.5">
          Click Sound
        </div>
        {renderPicker(clickSound, setClickSound, 'click')}
      </div>

      <div>
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-1.5">
          Accent Sound
        </div>
        {renderPicker(accentSound, setAccentSound, 'accent')}
      </div>

      <div>
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-1.5">
          Accent Sound Plays At
        </div>
        <div className="text-[11px] text-text-secondary mb-2">
          Levels at or above this use the accent sound
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Accent sound threshold">
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
                role="radio"
                aria-checked={isActive}
                key={state}
                onClick={() => setAccentSoundThreshold(state)}
                className={`
                  flex-1 h-[40px] rounded-xl text-[10px] font-bold
                  touch-manipulation select-none transition-colors
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
                  ${isActive
                    ? 'bg-[rgba(255,255,255,0.18)] text-text-primary border border-[rgba(255,255,255,0.2)]'
                    : isAbove
                      ? 'bg-[rgba(255,255,255,0.06)] text-text-secondary border border-[rgba(255,255,255,0.06)]'
                      : 'bg-bg-primary text-text-secondary border border-border-subtle active:bg-bg-raised'
                  }
                `}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="click-volume" className="text-xs text-text-secondary uppercase tracking-wider">
            Click Volume
          </label>
          <span className="font-mono text-xs text-text-secondary">
            {Math.round(clickVolume * 100)}%
          </span>
        </div>
        <input
          id="click-volume"
          aria-label="Click volume"
          type="range"
          min="0"
          max="100"
          value={Math.round(clickVolume * 100)}
          onChange={(event) => setClickVolume(Number(event.target.value) / 100)}
          className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      <button
        type="button"
        onClick={() => handlePreview(previewSoundId)}
        className="w-full h-[40px] rounded-lg border border-border-subtle bg-bg-primary
                   text-text-secondary text-xs font-bold tracking-wide
                   active:bg-bg-raised transition-all flex items-center justify-center gap-2
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
        {previewLabel}
      </button>

      <div className="border-t border-border-subtle pt-4 mt-2">
        <CustomSampleManager onSamplesChanged={refreshCustomSamples} />
      </div>
    </div>
  );
}
