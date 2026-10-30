// Collapsed-section summaries for Practice settings. Kept apart from the
// section bodies so those can load on demand.
import { useMetronomeStore } from '../../store/metronome-store';

/** Badge text for the collapsed header */
export function useMeterBadge(): string {
  const num = useMetronomeStore((s) => s.meterNumerator);
  const den = useMetronomeStore((s) => s.meterDenominator);
  const sub = useMetronomeStore((s) => s.subdivision);
  const subLabels: Record<number, string> = { 1: '', 2: '8ths', 3: 'Triplets', 4: '16ths', 5: 'Quints', 6: 'Sextuplets' };
  const subText = subLabels[sub] || '';
  return `${num}/${den}${subText ? ' · ' + subText : ''}`;
}

export function useTrainerBadge(): string {
  const enabled = useMetronomeStore((s) => s.trainerEnabled);
  const start = useMetronomeStore((s) => s.trainerStartBpm);
  const end = useMetronomeStore((s) => s.trainerEndBpm);
  return enabled ? `${start}→${end}` : 'Off';
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

export function usePolyBadge(): string {
  const tracks = useMetronomeStore((s) => s.tracks);
  const numerator = useMetronomeStore((s) => s.meterNumerator);
  if (tracks.length <= 1) return 'Off';
  return `${numerator}:${tracks.filter((track) => track.id !== 'track-0').map((track) => track.beats).join(':')}`;
}
