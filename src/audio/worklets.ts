const loading = new WeakMap<AudioContext, Promise<void>>();
const loaded = new WeakSet<AudioContext>();

/** Load the PCM capture worklet once per AudioContext. */
export async function ensurePcmCaptureWorklet(ctx: AudioContext): Promise<void> {
  if (loaded.has(ctx)) return;
  const existing = loading.get(ctx);
  if (existing) return existing;

  const basePath = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL || '/poly-pro/';
  const promise = ctx.audioWorklet.addModule(`${basePath}worklets/pcm-capture.js`)
    .then(() => { loaded.add(ctx); })
    .finally(() => { loading.delete(ctx); });
  loading.set(ctx, promise);
  return promise;
}
