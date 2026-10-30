import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { submitForSeparation, checkSeparationStatus } from './mvsep';

const settings = vi.hoisted(() => new Map<string, unknown>());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
vi.mock('../store/db', () => ({
  getSetting: vi.fn(async (key: string) => settings.get(key)),
  setSetting: vi.fn(async (key: string, value: unknown) => { settings.set(key, value); }),
}));
beforeEach(() => {
  settings.clear(); settings.set('mvsepConsent', { granted: true });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ task_id: 'task' }), { status: 200 })));
});

it('rejects malformed PCM instead of leaving submission pending', async () => {
  await expect(submitForSeparation('take', new Blob([new Uint8Array(3)]))).rejects.toBeInstanceOf(RangeError);
  expect(fetch).not.toHaveBeenCalled();
});

it('propagates audio-read failures instead of leaving submission pending', async () => {
  const blob = new Blob([new Float32Array([0.5]).buffer]);
  vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('Audio unavailable'));
  await expect(submitForSeparation('take', blob)).rejects.toThrow('Audio unavailable');
  expect(fetch).not.toHaveBeenCalled();
});

it('uploads a clipped mono PCM WAV only after consent', async () => {
  const pcm = new Blob([new Float32Array([-1, -0.5, 0, 0.5, 1, 2]).buffer]);
  settings.set('mvsepConsent', { granted: false });
  await expect(submitForSeparation('take', pcm)).rejects.toThrow('consented');
  expect(fetch).not.toHaveBeenCalled();
  settings.set('mvsepConsent', { granted: true });
  await submitForSeparation('take', pcm);
  const form = vi.mocked(fetch).mock.calls[0][1]!.body as FormData;
  const wav = new DataView(await (form.get('audio_file') as Blob).arrayBuffer());
  expect(wav.getUint32(24, true)).toBe(48000);
  expect(wav.getUint32(40, true)).toBe(12);
  expect(Array.from({ length: 6 }, (_, i) => wav.getInt16(44 + i * 2, true))).toEqual([-32768, -16384, 0, 16383, 32767, 32767]);
});

it('reports a status failure even when a pending result is cached', async () => {
  settings.set('mvsep:take', { sessionId: 'take', completed: false, requestedAt: '2026-10-30' });
  settings.set('mvsep_task:take', 'task');
  vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
  expect(await checkSeparationStatus('take')).toMatchObject({ completed: false, requestedAt: '2026-10-30', error: 'Status check failed' });
});
