import { expect, it, vi } from 'vitest';
import { renderTimeline } from './renderers';
import type { SessionRecord } from '../../../store/db';

it('draws captured beat positions and the configured window, including an intentionally empty grid', () => {
  vi.stubGlobal('window', { devicePixelRatio: 3 });
  const context = { scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
  const canvas = { getContext: () => context, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const params = { canvas, session: { bpm: 120, subdivision: 1, meter: '4/4', durationMs: 1000 } as SessionRecord,
    spectrogramData: { windowCount: 1, bass: new Float32Array(1), mid: new Float32Array(1), high: new Float32Array(1) } as any,
    totalWidth: 1000, zoom: 1, latencyOffsetMs: 50, scoringWindowPct: 10, showBass: true, showMid: true, showHigh: true,
    onsets: [], rawPcm: null, gridBeats: [{ time: 0.125, beatIndex: 0, measure: 0, isMainBeat: true, isDownbeat: true, trackId: 'track-0' }] };
  renderTimeline(params);
  expect(context.moveTo).toHaveBeenCalledWith(175, 0);
  expect(context.fillRect).toHaveBeenCalledWith(125, 0, 100, expect.any(Number));
  context.moveTo.mockClear();
  renderTimeline({ ...params, gridBeats: [], totalWidth: 40000 });
  expect(context.moveTo).not.toHaveBeenCalled();
  expect(canvas.width).toBeLessThanOrEqual(16384);
  vi.unstubAllGlobals();
});
