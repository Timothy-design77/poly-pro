import { describe, expect, it } from 'vitest';
import source from '../../public/worklets/pcm-capture.js?raw';

interface CaptureMessage {
  type: string;
  samples?: Float32Array;
  reason?: string;
  totalSamples?: number;
  sampleRate?: number;
}

function captureProcessor(sampleRate: number) {
  const messages: CaptureMessage[] = [];
  class ProcessorHost {
    port = { postMessage: (message: CaptureMessage) => messages.push(message), onmessage: (_event: { data: object }) => {} };
    process(_inputs: Float32Array[][]): boolean { return true; }
  }
  let Processor = ProcessorHost;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime', source)(
    ProcessorHost,
    (_name: string, processor: typeof ProcessorHost) => { Processor = processor; },
    sampleRate,
    2,
  );
  const processor = new Processor();
  return {
    messages,
    start: (maxSamples?: number) => processor.port.onmessage({ data: { type: 'start', maxSamples } }),
    stop: () => processor.port.onmessage({ data: { type: 'stop' } }),
    process: (samples: number) => processor.process([[new Float32Array(samples).fill(0.25)]]),
  };
}

describe('PCM take duration', () => {
  it.each([44100, 48000])('stops at the exact sample limit at %i Hz and flushes the final partial chunk', (sampleRate) => {
    const capture = captureProcessor(sampleRate);
    const limit = sampleRate + 73;
    capture.start(limit);
    for (let count = 0; count < Math.ceil(limit / 128) + 5; count++) capture.process(128);
    expect(capture.messages.filter((message) => message.type === 'pcm').reduce((total, message) => total + message.samples!.length, 0)).toBe(limit);
    expect(capture.messages.filter((message) => message.type === 'done')).toEqual([{ type: 'done', reason: 'limit', totalSamples: limit, sampleRate }]);
    capture.stop();
    expect(capture.messages.filter((message) => message.type === 'done')).toHaveLength(1);
  });

  it('manual stop keeps the captured audio when a musician ends a timed take early', () => {
    const capture = captureProcessor(48000);
    capture.start(48000 * 15);
    capture.process(128);
    capture.process(128);
    capture.stop();
    expect(capture.messages.find((message) => message.type === 'pcm')?.samples).toHaveLength(256);
    expect(capture.messages.find((message) => message.type === 'done')).toMatchObject({ reason: 'manual', totalSamples: 256 });
  });

  it('keeps existing untimed capture behavior and resets the limit on reuse', () => {
    const capture = captureProcessor(48000);
    capture.start(100);
    capture.process(128);
    capture.start();
    capture.process(128);
    capture.process(128);
    capture.stop();
    expect(capture.messages.filter((message) => message.type === 'done').map((message) => [message.reason, message.totalSamples])).toEqual([['limit', 100], ['manual', 256]]);
  });
});
