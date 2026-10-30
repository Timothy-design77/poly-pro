// Detection test patterns. Each evaluates the detected onsets for one short take.
import type { DetectedOnset, AnalysisConfig } from '../../../analysis/types';

export interface TestPattern {
  id: string;
  name: string;
  instruction: string;
  detail: string;
  durationS: number;
  expectedCount: number | 'range';
  /** For 'range' type: [min, max] */
  expectedRange?: [number, number];
  /** Pass criteria */
  evaluate: (detections: DetectedOnset[], config: AnalysisConfig) => TestResult;
}

export interface TestResult {
  pass: boolean;
  label: string;
  detail: string;
  suggestion?: string;
}

export const PATTERNS: TestPattern[] = [
  {
    id: 'single',
    name: 'Single hit',
    instruction: 'Play one hit',
    detail: 'One clean hit, any drum. Should detect exactly 1.',
    durationS: 3,
    expectedCount: 1,
    evaluate: (d) => {
      if (d.length === 1) return { pass: true, label: '1 detected', detail: `Peak: ${d[0].peak.toFixed(3)}` };
      if (d.length === 0) return { pass: false, label: '0 detected', detail: 'Hit was below noise gate', suggestion: 'Lower Noise gate or Noise floor' };
      return { pass: false, label: `${d.length} detected`, detail: 'Decay retriggered', suggestion: 'Raise Post-hit mask or Minimum gap between hits' };
    },
  },
  {
    id: 'flam',
    name: 'Flam',
    instruction: 'Play a flam',
    detail: 'Grace note + main hit. Should merge to 1 detection.',
    durationS: 3,
    expectedCount: 1,
    evaluate: (d) => {
      if (d.length === 1) {
        const label = d[0].isFlam ? '1 flam detected' : '1 detected';
        return { pass: true, label, detail: `Peak: ${d[0].peak.toFixed(3)}` };
      }
      if (d.length === 2) {
        const gap = (d[1].time - d[0].time) * 1000;
        return { pass: false, label: `2 detected (${gap.toFixed(0)}ms gap)`, detail: 'Flam not merged', suggestion: 'Raise Flam merge or Minimum gap between hits' };
      }
      if (d.length === 0) return { pass: false, label: '0 detected', detail: 'Too quiet', suggestion: 'Lower Noise gate' };
      return { pass: false, label: `${d.length} detected`, detail: 'Multiple retriggers', suggestion: 'Raise Post-hit mask and Minimum gap between hits' };
    },
  },
  {
    id: 'double',
    name: 'Double stroke',
    instruction: 'Play two deliberate hits',
    detail: 'Two separate strokes. Should detect exactly 2.',
    durationS: 3,
    expectedCount: 2,
    evaluate: (d) => {
      if (d.length === 2) {
        const gap = (d[1].time - d[0].time) * 1000;
        return { pass: true, label: `2 detected (${gap.toFixed(0)}ms apart)`, detail: `Peaks: ${d[0].peak.toFixed(3)}, ${d[1].peak.toFixed(3)}` };
      }
      if (d.length === 1) return { pass: false, label: '1 detected', detail: 'Hits were merged', suggestion: 'Lower Minimum gap between hits or Post-hit mask' };
      if (d.length > 2) {
        return { pass: false, label: `${d.length} detected`, detail: 'Extra detections from decay', suggestion: 'Raise Mask strength' };
      }
      return { pass: false, label: '0 detected', detail: 'Too quiet', suggestion: 'Lower Noise gate' };
    },
  },
  {
    id: 'sixteenths',
    name: '16th notes',
    instruction: 'Play four even 16th notes at 120 BPM',
    detail: 'Four evenly spaced hits. Should detect 4.',
    durationS: 4,
    expectedCount: 4,
    evaluate: (d) => {
      if (d.length === 4) {
        const gaps = [];
        for (let i = 0; i < 3; i++) gaps.push((d[i + 1].time - d[i].time) * 1000);
        const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        const consistency = Math.sqrt(gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / gaps.length);
        return { pass: true, label: `4 detected`, detail: `Gaps: ${gaps.map((g) => g.toFixed(0) + 'ms').join(', ')} · σ ${consistency.toFixed(0)}ms` };
      }
      if (d.length < 4) return { pass: false, label: `${d.length} detected`, detail: 'Some hits merged or below gate', suggestion: d.length <= 2 ? 'Lower Minimum gap between hits' : 'Lower Noise gate' };
      return { pass: false, label: `${d.length} detected`, detail: 'Extra triggers from decay', suggestion: 'Raise Post-hit mask' };
    },
  },
  {
    id: 'accent',
    name: 'Accent pattern',
    instruction: 'Play one loud hit, then three soft ones',
    detail: 'One accented hit, three ghost notes. Should detect 4 with first louder.',
    durationS: 4,
    expectedCount: 4,
    evaluate: (d) => {
      if (d.length >= 3 && d.length <= 5) {
        const peaks = d.map((o) => o.peak);
        const maxPeak = Math.max(...peaks);
        const firstIsLoudest = d[0].peak === maxPeak || d[0].peak > peaks[1] * 1.3;
        const ratio = d.length >= 2 ? d[0].peak / d[1].peak : 0;
        const pass = d.length === 4 && firstIsLoudest;
        return {
          pass,
          label: `${d.length} detected`,
          detail: `Accent ratio: ${ratio.toFixed(1)}× · Peaks: ${peaks.map((p) => p.toFixed(3)).join(', ')}`,
          suggestion: !firstIsLoudest ? 'First hit should be clearly louder' : undefined,
        };
      }
      if (d.length < 3) return { pass: false, label: `${d.length} detected`, detail: 'Ghost notes below gate', suggestion: 'Lower Noise gate so ghost notes are detected' };
      return { pass: false, label: `${d.length} detected`, detail: 'Too many triggers', suggestion: 'Raise Post-hit mask' };
    },
  },
  {
    id: 'ghost',
    name: 'Ghost notes',
    instruction: 'Play four very soft taps',
    detail: 'As quiet as you would play ghost notes. Should still detect 4.',
    durationS: 4,
    expectedCount: 4,
    evaluate: (d) => {
      if (d.length >= 3 && d.length <= 5) {
        const peaks = d.map((o) => o.peak);
        const maxPeak = Math.max(...peaks);
        return {
          pass: d.length === 4,
          label: `${d.length} detected`,
          detail: `Peak range: ${Math.min(...peaks).toFixed(4)} – ${maxPeak.toFixed(4)}`,
        };
      }
      if (d.length < 3) return { pass: false, label: `${d.length} detected`, detail: 'Ghosts are too quiet for current gate', suggestion: 'Lower Noise gate and/or Noise floor' };
      return { pass: false, label: `${d.length} detected`, detail: 'Retriggers on soft hits', suggestion: 'Raise Flux threshold' };
    },
  },
  {
    id: 'buzz',
    name: 'Buzz roll',
    instruction: 'Play a buzz roll for about 2 seconds',
    detail: 'Dense, fast strokes. Should detect many hits without runaway triggering.',
    durationS: 4,
    expectedCount: 'range',
    expectedRange: [10, 80],
    evaluate: (d) => {
      if (d.length >= 10 && d.length <= 80) {
        const peaks = d.map((o) => o.peak);
        const avgGap = d.length > 1 ? ((d[d.length - 1].time - d[0].time) / (d.length - 1)) * 1000 : 0;
        return {
          pass: true,
          label: `${d.length} detected`,
          detail: `Avg gap: ${avgGap.toFixed(0)}ms · Peak range: ${Math.min(...peaks).toFixed(3)} – ${Math.max(...peaks).toFixed(3)}`,
        };
      }
      if (d.length < 10) return { pass: false, label: `${d.length} detected`, detail: 'Too few — strokes being merged', suggestion: 'Lower Minimum gap between hits and Post-hit mask' };
      return { pass: false, label: `${d.length} detected`, detail: 'Runaway detection from resonance', suggestion: 'Raise Post-hit mask and Flux threshold' };
    },
  },
];

// ─── Component ───
