import { afterEach, expect, it, vi } from 'vitest';
import { clearBufferCache, forgetCustomBuffer, getBuffer, loadSound, registerCustomBuffer } from './sounds';
import * as db from '../store/db';

vi.mock('../store/db', () => ({ getCustomSample: vi.fn() }));
afterEach(() => { clearBufferCache(); vi.restoreAllMocks(); });

it('does not restore a deleted custom sound when decoding finishes late', async () => {
  const buffer = { duration: 1 } as AudioBuffer;
  let finishDecode!: (value: AudioBuffer) => void;
  const decodeAudioData = vi.fn(() => new Promise<AudioBuffer>((resolve) => { finishDecode = resolve; }));
  vi.mocked(db.getCustomSample).mockResolvedValue({ id: 'custom:deleted', blob: new Blob([new Uint8Array(8)]) } as db.CustomSampleRecord);
  const pending = loadSound({ decodeAudioData } as unknown as AudioContext, 'custom:deleted');
  await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
  forgetCustomBuffer('custom:deleted');
  finishDecode(buffer);
  await pending;
  expect(getBuffer('custom:deleted')).toBeNull();
});

it('does not overwrite a newly registered custom sound with an older decode', async () => {
  const older = { duration: 1 } as AudioBuffer, newer = { duration: 2 } as AudioBuffer;
  let finishDecode!: (value: AudioBuffer) => void;
  const decodeAudioData = vi.fn(() => new Promise<AudioBuffer>((resolve) => { finishDecode = resolve; }));
  vi.mocked(db.getCustomSample).mockResolvedValue({ id: 'custom:replaced', blob: new Blob([new Uint8Array(8)]) } as db.CustomSampleRecord);
  const pending = loadSound({ decodeAudioData } as unknown as AudioContext, 'custom:replaced');
  await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
  registerCustomBuffer('custom:replaced', newer);
  finishDecode(older);
  await pending;
  expect(getBuffer('custom:replaced')).toBe(newer);
});
