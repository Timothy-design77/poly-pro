import { useMetronomeStore } from '../../store/metronome-store';
import { Toggle } from '../ui/Toggle';

/**
 * Trainer mode configuration — lives inside a CollapsibleCard.
 * All controls enlarged for easy mobile use.
 */
export function TrainerConfig() {
  const enabled = useMetronomeStore((s) => s.trainerEnabled);
  const startBpm = useMetronomeStore((s) => s.trainerStartBpm);
  const endBpm = useMetronomeStore((s) => s.trainerEndBpm);
  const step = useMetronomeStore((s) => s.trainerBpmStep);
  const bars = useMetronomeStore((s) => s.trainerBarsPerStep);
  const setEnabled = useMetronomeStore((s) => s.setTrainerEnabled);
  const setConfig = useMetronomeStore((s) => s.setTrainerConfig);

  return (
    <div>
      {/* Enable toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-text-primary">Enable Trainer</span>
        <Toggle enabled={enabled} onChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4">
          {/* Start → End BPM */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase mb-1 block">Start BPM</label>
              <input
                type="number"
                value={startBpm}
                onChange={(e) => setConfig({ trainerStartBpm: Math.max(20, Math.min(300, Number(e.target.value))) })}
                className="w-full h-[44px] bg-bg-surface border border-border-subtle rounded-xl
                           px-3 font-mono text-base text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="text-text-muted mt-4 shrink-0">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase mb-1 block">End BPM</label>
              <input
                type="number"
                value={endBpm}
                onChange={(e) => setConfig({ trainerEndBpm: Math.max(20, Math.min(300, Number(e.target.value))) })}
                className="w-full h-[44px] bg-bg-surface border border-border-subtle rounded-xl
                           px-3 font-mono text-base text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
          </div>

          {/* Step + Bars — large stepper buttons */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase mb-1 block">BPM Step</label>
              <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <button
                  onClick={() => setConfig({ trainerBpmStep: Math.max(1, step - 1) })}
                  className="w-[44px] h-[44px] flex items-center justify-center text-text-secondary
                             active:bg-bg-raised text-lg font-bold touch-manipulation"
                >−</button>
                <span className="flex-1 text-center font-mono text-base text-text-primary font-bold">{step}</span>
                <button
                  onClick={() => setConfig({ trainerBpmStep: Math.min(20, step + 1) })}
                  className="w-[44px] h-[44px] flex items-center justify-center text-text-secondary
                             active:bg-bg-raised text-lg font-bold touch-manipulation"
                >+</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase mb-1 block">Every N Bars</label>
              <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <button
                  onClick={() => setConfig({ trainerBarsPerStep: Math.max(1, bars - 1) })}
                  className="w-[44px] h-[44px] flex items-center justify-center text-text-secondary
                             active:bg-bg-raised text-lg font-bold touch-manipulation"
                >−</button>
                <span className="flex-1 text-center font-mono text-base text-text-primary font-bold">{bars}</span>
                <button
                  onClick={() => setConfig({ trainerBarsPerStep: Math.min(16, bars + 1) })}
                  className="w-[44px] h-[44px] flex items-center justify-center text-text-secondary
                             active:bg-bg-raised text-lg font-bold touch-manipulation"
                >+</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function useTrainerBadge(): string {
  const enabled = useMetronomeStore((s) => s.trainerEnabled);
  const start = useMetronomeStore((s) => s.trainerStartBpm);
  const end = useMetronomeStore((s) => s.trainerEndBpm);
  return enabled ? `${start}→${end}` : 'Off';
}
