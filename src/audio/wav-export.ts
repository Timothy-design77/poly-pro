/** Encode a mono 16-bit WAV without a second, full-length float recording. */
export interface ExportClick {
  time: number;
  buffer: AudioBuffer;
  gain: number;
}

interface WavExportOptions {
  buffer: AudioBuffer;
  clicks?: readonly ExportClick[];
  signal: AbortSignal;
  onProgress?: (progress: number) => void;
}

const RENDER_SECONDS = 10;
const ENCODE_FRAMES = 131072;

async function yieldToBrowser(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

function wavHeader(frames: number, sampleRate: number): ArrayBuffer {
  const dataSize = frames * 2;
  if (!Number.isSafeInteger(frames) || frames < 1 || dataSize > 0xffffffff - 36) {
    throw new Error('This recording is too large for a WAV export.');
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true);
  return header;
}

async function renderSegment(buffer: AudioBuffer, clicks: readonly ExportClick[], start: number, length: number, signal: AbortSignal): Promise<Float32Array> {
  signal.throwIfAborted();
  // Native capture is mono. Raw export reads its existing PCM directly.
  if (!clicks.length && buffer.numberOfChannels === 1) return buffer.getChannelData(0).subarray(start, start + length);
  const context = new OfflineAudioContext(1, length, buffer.sampleRate);
  const nodes: AudioNode[] = [];
  const startTime = start / buffer.sampleRate;
  const endTime = (start + length) / buffer.sampleRate;
  try {
    const source = context.createBufferSource(); nodes.push(source);
    source.buffer = buffer; source.connect(context.destination); source.start(0, startTime);
    for (const click of clicks) {
      if (click.time >= endTime || click.time + click.buffer.duration <= startTime) continue;
      const clickSource = context.createBufferSource(); const gain = context.createGain();
      nodes.push(clickSource, gain);
      clickSource.buffer = click.buffer; gain.gain.value = click.gain;
      clickSource.connect(gain); gain.connect(context.destination);
      // Resume the tail when a click straddles a segment boundary.
      clickSource.start(Math.max(0, click.time - startTime), Math.max(0, startTime - click.time));
    }
    const rendered = await context.startRendering();
    signal.throwIfAborted();
    return rendered.getChannelData(0);
  } finally {
    for (const node of nodes) node.disconnect();
  }
}

export async function exportWav({ buffer, clicks = [], signal, onProgress }: WavExportOptions): Promise<Blob> {
  const header = wavHeader(buffer.length, buffer.sampleRate);
  const segmentFrames = Math.max(1, Math.round(buffer.sampleRate * RENDER_SECONDS));
  let peak = 0;
  // A first bounded pass preserves the previous export's global normalization.
  // Click mixes are rendered again while encoding, trading CPU for bounded RAM.
  for (let start = 0; start < buffer.length; start += segmentFrames) {
    const pcm = await renderSegment(buffer, clicks, start, Math.min(segmentFrames, buffer.length - start), signal);
    for (let from = 0; from < pcm.length; from += ENCODE_FRAMES) {
      const end = Math.min(from + ENCODE_FRAMES, pcm.length);
      for (let i = from; i < end; i++) peak = Math.max(peak, Math.abs(pcm[i]));
      onProgress?.((start + end) / buffer.length / 2);
      await yieldToBrowser(signal);
    }
  }
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  const parts: BlobPart[] = [header];
  for (let start = 0; start < buffer.length; start += segmentFrames) {
    const pcm = await renderSegment(buffer, clicks, start, Math.min(segmentFrames, buffer.length - start), signal);
    for (let from = 0; from < pcm.length; from += ENCODE_FRAMES) {
      const end = Math.min(from + ENCODE_FRAMES, pcm.length);
      const bytes = new ArrayBuffer((end - from) * 2);
      const view = new DataView(bytes);
      for (let i = from; i < end; i++) {
        const sample = pcm[i] * scale;
        view.setInt16((i - from) * 2, Math.max(-32768, Math.min(32767, sample < 0 ? sample * 0x8000 : sample * 0x7fff)), true);
      }
      parts.push(new Blob([bytes]));
      onProgress?.(0.5 + (start + end) / buffer.length / 2);
      await yieldToBrowser(signal);
    }
  }
  signal.throwIfAborted();
  return new Blob(parts, { type: 'audio/wav' });
}
