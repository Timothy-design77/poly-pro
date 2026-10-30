import { useMetronomeStore } from '../../store/metronome-store';
import { Toggle } from '../ui/Toggle';
import { Range } from '../ui/Range';

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

  const stepperButton = 'w-[48px] h-[44px] flex items-center justify-center text-text-primary active:bg-bg-raised text-lg font-semibold touch-manipulation';

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Count-in bars</span>
        </div>
        <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
          <button type="button" aria-label="Decrease count-in bars" onClick={() => setCountInBars(Math.max(0, countInBars - 1))} className={stepperButton}>−</button>
          <span className="flex-1 text-center font-mono text-base text-text-primary font-semibold">
            {countInBars === 0 ? 'Off' : countInBars}
          </span>
          <button type="button" aria-label="Increase count-in bars" onClick={() => setCountInBars(Math.min(8, countInBars + 1))} className={stepperButton}>+</button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Swing</span>
          <span className="font-mono text-xs text-text-muted">
            {swing === 0 ? 'Straight' : `${Math.round(swing * 100)}%`}
          </span>
        </div>
        <Range aria-label="Swing" min={0} max={100} value={Math.round(swing * 100)} onChange={(value) => setSwing(value / 100)} />
        {swing > 0 && subdivision <= 1 && (
          <div className="text-xs text-warning mt-1.5">
            Swing requires a subdivision (8ths, triplets, etc.)
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Play and mute cycle</span>
          <Toggle label="Play and mute cycle" enabled={playMuteCycleEnabled} onChange={(value) => setPlayMuteCycle(value)} />
        </div>
        {playMuteCycleEnabled && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="ui-label mb-1 block">Play bars</label>
              <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <button type="button" aria-label="Decrease play bars" onClick={() => setPlayMuteCycle(true, Math.max(1, playMuteCyclePlayBars - 1))} className={stepperButton}>−</button>
                <span className="flex-1 text-center font-mono text-base text-text-primary font-semibold">{playMuteCyclePlayBars}</span>
                <button type="button" aria-label="Increase play bars" onClick={() => setPlayMuteCycle(true, Math.min(16, playMuteCyclePlayBars + 1))} className={stepperButton}>+</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="ui-label mb-1 block">Mute bars</label>
              <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <button type="button" aria-label="Decrease mute bars" onClick={() => setPlayMuteCycle(true, undefined, Math.max(1, playMuteCycleMuteBars - 1))} className={stepperButton}>−</button>
                <span className="flex-1 text-center font-mono text-base text-text-primary font-semibold">{playMuteCycleMuteBars}</span>
                <button type="button" aria-label="Increase mute bars" onClick={() => setPlayMuteCycle(true, undefined, Math.min(16, playMuteCycleMuteBars + 1))} className={stepperButton}>+</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Gap click</span>
          <Toggle label="Gap click" enabled={gapClickEnabled} onChange={(value) => setGapClick(value)} />
        </div>
        {gapClickEnabled && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="ui-label">Mute probability</span>
              <span className="font-mono text-xs text-text-muted">{Math.round(gapClickProbability * 100)}%</span>
            </div>
            <Range aria-label="Gap click mute probability" min={5} max={80} value={Math.round(gapClickProbability * 100)} onChange={(value) => setGapClick(true, value / 100)} />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">Random mute</span>
          <Toggle label="Random mute" enabled={randomMuteEnabled} onChange={(value) => setRandomMute(value)} />
        </div>
        {randomMuteEnabled && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="ui-label">Measures muted</span>
              <span className="font-mono text-xs text-text-muted">{Math.round(randomMuteProbability * 100)}%</span>
            </div>
            <Range aria-label="Random measure mute probability" min={10} max={75} value={Math.round(randomMuteProbability * 100)} onChange={(value) => setRandomMute(true, value / 100)} />
          </div>
        )}
      </div>
    </div>
  );
}
