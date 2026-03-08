/**
 * PCM Capture AudioWorklet Processor
 *
 * Captures raw float32 PCM from mic input, sends to main thread
 * via MessagePort in 1-second chunks.
 *
 * 48kHz, 128 samples per block (2.67ms per process() call).
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(48000); // 1 second at 48kHz
    this._writePos = 0;
    this._isCapturing = false;
    this._blockCount = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this._isCapturing = true;
        this._writePos = 0;
        this._blockCount = 0;
      } else if (e.data.type === 'stop') {
        if (this._writePos > 0) {
          const chunk = this._buffer.slice(0, this._writePos);
          this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
        }
        this._isCapturing = false;
        this._writePos = 0;
        this.port.postMessage({ type: 'done' });
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    this._blockCount++;

    // Peak level every ~21ms (8 blocks) for waveform display
    if (this._blockCount % 8 === 0) {
      let peak = 0;
      for (let i = 0; i < channelData.length; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > peak) peak = abs;
      }
      this.port.postMessage({ type: 'level', peak });
    }

    if (!this._isCapturing) return true;

    // Copy samples into accumulation buffer
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writePos++] = channelData[i];

      if (this._writePos >= 48000) {
        // Send 1-second chunk (transfer ownership for zero-copy)
        const chunk = new Float32Array(this._buffer);
        this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
        this._buffer = new Float32Array(48000);
        this._writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
