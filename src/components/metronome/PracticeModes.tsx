import { useMetronomeStore } from '../../store/metronome-store';
import { Toggle } from '../ui/Toggle';

/**
 * Practice mode controls: Count-in, Gap Click, Random Mute, Swing.
 * Compact cards in the scrollable area.
 */
export function PracticeModes() {
  const countInBars = useMetronomeStore((s) => s.countInBars);
  const setCountInBars = useMetronomeStore((s) => s.setCountInBars);
  const gapClickEnabled = useMetronomeStore((s) => s.gapClickEnabled);
  const gapClickProbability = useMetronomeStore((s) => s.gapClickProbability);
  const setGapClick = useMetronomeStore((s) => s.setGapClick);
  const randomMuteEnabled = useMetronomeStore((s) => s.randomMuteEnabled);
  const randomMuteProbability = useMetronomeStore((s) => s.randomMuteProbability);
  const setRandomMute = useMetronomeStore((s) => s.setRandomMute);
  const swing = useMetronomeStore((s) => s.swing);
  const setSwing = useMetronomeStore((s) => s.setSwing);

  return (
    <div className="space-y-2">
      {/* Count-in */}
      <div className="flex items-center justify-between bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Count-in</span>
        <div className="flex items-center bg-bg-primary border border-border-subtle rounded-md overflow-hidden">
          <button
            onClick={() => setCountInBars(Math.max(0, countInBars - 1))}
            className="w-[26px] h-[28px] flex items-center justify-center text-text-muted active:bg-bg-raised text-xs"
          >−</button>
          <span className="w-[28px] text-center font-mono text-xs text-text-primary">
            {countInBars === 0 ? 'Off' : countInBars}
          </span>
          <button
            onClick={() => setCountInBars(Math.min(8, countInBars + 1))}
            className="w-[26px] h-[28px] flex items-center justify-center text-text-muted active:bg-bg-raised text-xs"
          >+</button>
        </div>
      </div>

      {/* Swing */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Swing</span>
          <span className="font-mono text-[10px] text-text-muted">
            {swing === 0 ? 'Straight' : `${Math.round(swing * 100)}%`}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(swing * 100)}
          onChange={(e) => setSwing(Number(e.target.value) / 100)}
          className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                     [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* Gap Click */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Gap Click</span>
          <Toggle enabled={gapClickEnabled} onChange={(v) => setGapClick(v)} />
        </div>
        {gapClickEnabled && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-text-muted">Mute probability</span>
              <span className="font-mono text-[10px] text-text-muted">{Math.round(gapClickProbability * 100)}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="80"
              value={Math.round(gapClickProbability * 100)}
              onChange={(e) => setGapClick(true, Number(e.target.value) / 100)}
              className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                         [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Random Mute */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Random Mute</span>
          <Toggle enabled={randomMuteEnabled} onChange={(v) => setRandomMute(v)} />
        </div>
        {randomMuteEnabled && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-text-muted">Measure mute %</span>
              <span className="font-mono text-[10px] text-text-muted">{Math.round(randomMuteProbability * 100)}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="75"
              value={Math.round(randomMuteProbability * 100)}
              onChange={(e) => setRandomMute(true, Number(e.target.value) / 100)}
              className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                         [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
}
