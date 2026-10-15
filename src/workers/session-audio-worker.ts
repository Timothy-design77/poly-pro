import { computeSpectrogram } from '../components/session/Spectrogram';
self.onmessage = async ({ data }: MessageEvent<{ blob?: Blob; pcm?: Float32Array; sampleRate: number }>) => {
  try {
    const pcm = data.pcm ?? new Float32Array(await data.blob!.arrayBuffer());
    const spectrogram = computeSpectrogram(pcm, data.sampleRate);
    self.postMessage({ pcm, spectrogram }, { transfer: [pcm.buffer, spectrogram.bass.buffer, spectrogram.mid.buffer, spectrogram.high.buffer, spectrogram.total.buffer, spectrogram.miniMapEnvelope.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not prepare audio.' }); }
};
