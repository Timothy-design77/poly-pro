import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { SOUND_CATALOG } from '../../audio/sounds';
import { audioEngine } from '../../audio/engine';

/**
 * Settings section: Sounds
 * - Click Sound picker
 * - Accent Sound picker
 * - Click Volume slider
 * - Preview button
 */
export function SoundSettings() {
  const clickSound = useSettingsStore((s) => s.clickSound);
  const accentSound = useSettingsStore((s) => s.accentSound);
  const clickVolume = useSettingsStore((s) => s.clickVolume);
  const setClickSound = useSettingsStore((s) => s.setClickSound);
  const setAccentSound = useSettingsStore((s) => s.setAccentSound);
  const setClickVolume = useSettingsStore((s) => s.setClickVolume);

  const [expandedPicker, setExpandedPicker] = useState<'click' | 'accent' | null>(null);

  const handlePreview = (soundId: string) => {
    audioEngine.previewSound(soundId);
  };

  const getSoundName = (id: string) =>
    SOUND_CATALOG.find((s) => s.id === id)?.name || id;

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
    pickerKey: 'click' | 'accent'
  ) => {
    const isExpanded = expandedPicker === pickerKey;

    return (
      <div>
        <button
          onClick={() => setExpandedPicker(isExpanded ? null : pickerKey)}
          className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg
                     bg-bg-primary border border-border-subtle text-sm"
        >
          <span className="text-text-primary">{getSoundName(current)}</span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isExpanded && (
          <div className="mt-1 bg-bg-primary border border-border-subtle rounded-lg overflow-hidden">
            {categories.map((cat) => {
              const sounds = SOUND_CATALOG.filter((s) => s.category === cat);
              return (
                <div key={cat}>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider px-3 pt-2 pb-1">
                    {categoryLabels[cat]}
                  </div>
                  {sounds.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onSelect(s.id);
                        handlePreview(s.id);
                        setExpandedPicker(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2
                        ${s.id === current
                          ? 'text-text-primary bg-bg-raised'
                          : 'text-text-secondary active:bg-bg-raised'
                        }`}
                    >
                      {s.id === current && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      <span className={s.id === current ? '' : 'pl-[22px]'}>{s.name}</span>
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

  return (
    <div className="space-y-4">
      {/* Click Sound */}
      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
          Click Sound
        </label>
        {renderPicker(clickSound, setClickSound, 'click')}
      </div>

      {/* Accent Sound */}
      <div>
        <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
          Accent Sound
        </label>
        {renderPicker(accentSound, setAccentSound, 'accent')}
      </div>

      {/* Click Volume */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">
            Click Volume
          </label>
          <span className="font-mono text-xs text-text-secondary">
            {Math.round(clickVolume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(clickVolume * 100)}
          onChange={(e) => setClickVolume(Number(e.target.value) / 100)}
          className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* Preview */}
      <button
        onClick={() => handlePreview(clickSound)}
        className="w-full h-[40px] rounded-lg border border-border-subtle bg-bg-primary
                   text-text-secondary text-xs font-bold tracking-wide
                   active:bg-bg-raised transition-all flex items-center justify-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
        Preview
      </button>
    </div>
  );
}
