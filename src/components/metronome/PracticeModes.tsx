import { useMetronomeStore } from '../../store/metronome-store';
import { Toggle } from '../ui/Toggle';

const sliderClass = `w-full accent-accent h-2 bg-bg-raised rounded-full appearance-none
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                     [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer`;

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
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const playMuteCycleEnabled = useMetronomeStore((s) => s.playMuteCycleEnabled);
  const playMuteCyclePlayBars = useMetronomeStore((s) => s.playMuteCyclePlayBars);
  const playMuteCycleMuteBars = useMetronomeStore((s) => s.playMuteCycleMuteBars);
  const setPlayMuteCycle = useMetronomeStore((s) => s.setPlayMuteCycle);

  const stepperButton = 'w-[48px] h-[44px] flex items-center justify-center text-text-primary active:bg-bg-raised text-lg font-bold touch-manipulation';

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Count-in Bars</span>
        </div>
        <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
          <button type="button" onClick={() => setCountInBars(Math.max(0, countInBars - 1))} className={stepperButton}>−</button>
          <span className="flex-1 text-center font-mono text-base text-text-primary font-bold">
            {countInBars === 0 ? 'Off' : countInBars}
          </span>
          <button type="button" onClick={() => setCountInBars(Math.min(8, countInBars + 1))} className={stepperButton}>+</button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Swing</span>
          <span className="font-mono text-xs text-text-muted">
            {swing === 0 ? 'Straight' : `${Math.round(swing * 100)}%`}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(swing * 100)}
          onChange={(event) => setSwing(Number(event.target.value) / 100)}
          className={sliderClass}
        />
        {swing > 0 && subdivision <= 1 && (
          <div className="text-[11px] text-warning mt-1.5">
            Swing requires a subdivision (8ths, triplets, etc.)
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Play / Mute Cycle</span>
          <Toggle enabled={playMuteCycleEnabled} onChange={(value) => setPlayMuteCycle(value)} />
        </div>
        {playMuteCycleEnabled && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase mb-1 block">Play Bars</label>
              <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <button type="button" onClick={() => setPlayMuteCycle(true, Math.max(1, playMuteCyclePlayBars - 1))} className={stepperButton}>−</button>
                <span className="flex-1 text-center font-mono text-base text-text-primary font-bold">{playMuteCyclePlayBars}</span>
                <button type="button" onClick={() => setPlayMuteCycle(true, Math.min(16, playMuteCyclePlayBars + 1))} className={stepperButton}>+</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase mb-1 block">Mute Bars</label>
              <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <button type="button" onClick={() => setPlayMuteCycle(true, undefined, Math.max(1, playMuteCycleMuteBars - 1))} className={stepperButton}>−</button>
                <span className="flex-1 text-center font-mono text-base text-text-primary font-bold">{playMuteCycleMuteBars}</span>
                <button type="button" onClick={() => setPlayMuteCycle(true, undefined, Math.min(16, playMuteCycleMuteBars + 1))} className={stepperButton}>+</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Gap Click</span>
          <Toggle enabled={gapClickEnabled} onChange={(value) => setGapClick(value)} />
        </div>
        {gapClickEnabled && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">Mute probability</span>
              <span className="font-mono text-xs text-text-muted">{Math.round(gapClickProbability * 100)}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="80"
              value={Math.round(gapClickProbability * 100)}
              onChange={(event) => setGapClick(true, Number(event.target.value) / 100)}
              className={sliderClass}
            />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Random Mute</span>
          <Toggle enabled={randomMuteEnabled} onChange={(value) => setRandomMute(value)} />
        </div>
        {randomMuteEnabled && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">Measure mute %</span>
              <span className="font-mono text-xs text-text-muted">{Math.round(randomMuteProbability * 100)}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="75"
              value={Math.round(randomMuteProbability * 100)}
              onChange={(event) => setRandomMute(true, Number(event.target.value) / 100)}
              className={sliderClass}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function usePracticeBadge(): string {
  const countIn = useMetronomeStore((s) => s.countInBars);
  const gap = useMetronomeStore((s) => s.gapClickEnabled);
  const mute = useMetronomeStore((s) => s.randomMuteEnabled);
  const swing = useMetronomeStore((s) => s.swing);
  const pmCycle = useMetronomeStore((s) => s.playMuteCycleEnabled);
  const pmPlay = useMetronomeStore((s) => s.playMuteCyclePlayBars);
  const pmMute = useMetronomeStore((s) => s.playMuteCycleMuteBars);
  const parts: string[] = [];
  if (countIn > 0) parts.push(`${countIn}-bar`);
  if (swing > 0) parts.push('Swing');
  if (pmCycle) parts.push(`${pmPlay}/${pmMute}`);
  if (gap) parts.push('Gap');
  if (mute) parts.push('Mute');
  return parts.length > 0 ? parts.join(' · ') : 'Off';
}
