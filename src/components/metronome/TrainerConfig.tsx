import { useMetronomeStore } from '../../store/metronome-store';
import { Toggle } from '../ui/Toggle';

/**
 * Trainer mode configuration.
 * Start BPM → End BPM, step size, bars per step.
 * Compact collapsible section.
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
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Trainer</span>
        <Toggle enabled={enabled} onChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-2.5 pt-1">
          {/* Start → End BPM */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-text-muted uppercase mb-0.5 block">Start</label>
              <input
                type="number"
                value={startBpm}
                onChange={(e) => setConfig({ trainerStartBpm: Math.max(20, Math.min(300, Number(e.target.value))) })}
                className="w-full h-[32px] bg-bg-primary border border-border-subtle rounded-md
                           px-2 font-mono text-sm text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="text-text-muted mt-3 shrink-0">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <div className="flex-1">
              <label className="text-[9px] text-text-muted uppercase mb-0.5 block">End</label>
              <input
                type="number"
                value={endBpm}
                onChange={(e) => setConfig({ trainerEndBpm: Math.max(20, Math.min(300, Number(e.target.value))) })}
                className="w-full h-[32px] bg-bg-primary border border-border-subtle rounded-md
                           px-2 font-mono text-sm text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
          </div>

          {/* Step + Bars */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-text-muted uppercase mb-0.5 block">+BPM Step</label>
              <div className="flex items-center bg-bg-primary border border-border-subtle rounded-md overflow-hidden">
                <button
                  onClick={() => setConfig({ trainerBpmStep: Math.max(1, step - 1) })}
                  className="w-[28px] h-[32px] flex items-center justify-center text-text-muted active:bg-bg-raised"
                >−</button>
                <span className="flex-1 text-center font-mono text-sm text-text-primary">{step}</span>
                <button
                  onClick={() => setConfig({ trainerBpmStep: Math.min(20, step + 1) })}
                  className="w-[28px] h-[32px] flex items-center justify-center text-text-muted active:bg-bg-raised"
                >+</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-text-muted uppercase mb-0.5 block">Every N bars</label>
              <div className="flex items-center bg-bg-primary border border-border-subtle rounded-md overflow-hidden">
                <button
                  onClick={() => setConfig({ trainerBarsPerStep: Math.max(1, bars - 1) })}
                  className="w-[28px] h-[32px] flex items-center justify-center text-text-muted active:bg-bg-raised"
                >−</button>
                <span className="flex-1 text-center font-mono text-sm text-text-primary">{bars}</span>
                <button
                  onClick={() => setConfig({ trainerBarsPerStep: Math.min(16, bars + 1) })}
                  className="w-[28px] h-[32px] flex items-center justify-center text-text-muted active:bg-bg-raised"
                >+</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
