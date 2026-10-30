import { afterEach, expect, it, vi } from 'vitest';
import { getPreferredMicStream } from './mic';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const devices = [{ kind: 'audioinput', label: 'Built-in microphone', deviceId: 'internal' }];

it('explains microphone support requirements when mediaDevices is unavailable', async () => {
  vi.stubGlobal('navigator', {});
  await expect(getPreferredMicStream()).rejects.toThrow('Microphone access requires a supported browser and a secure connection.');
});

it('does not retry permission denial with weaker audio constraints', async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => devices, getUserMedia } });
  await expect(getPreferredMicStream()).rejects.toMatchObject({ name: 'NotAllowedError' });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it('releases a late stream after microphone setup is cancelled', async () => {
  const stop = vi.fn();
  let resolveStream!: (value: MediaStream) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => devices, getUserMedia } });
  const controller = new AbortController();
  const pending = getPreferredMicStream(controller.signal);
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});
