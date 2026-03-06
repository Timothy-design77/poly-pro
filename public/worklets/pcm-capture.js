/**
 * PCM Capture AudioWorklet Processor
 * 
 * Captures raw float32 PCM samples from the mic input and sends
 * them to the main thread via MessagePort in chunks.
 * 
 * Uses MessagePort.postMessage() (not SharedArrayBuffer) since
 * GitHub Pages doesn't support the required COOP/COEP headers.
 * 
 * Runs at 48kHz, 128 samples per block (2.67ms per process() call).
 */

class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(48000); // 1 second buffer
    this._writePos = 0;
    this._isCapturing = false;
    this._peakLevel = 0;
    this._sampleCount = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this._isCapturing = true;
        this._writePos = 0;
        this._sampleCount = 0;
      } else if (e.data.type === 'stop') {
        // Flush remaining samples
        if (this._writePos > 0) {
          const chunk = this._buffer.slice(0, this._writePos);
          this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
          this._buffer = new Float32Array(48000);
          this._writePos = 0;
        }
        this._isCapturing = false;
        this.port.postMessage({ type: 'done', totalSamples: this._sampleCount });
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // mono channel

    // Always compute peak level for waveform display (even when not capturing)
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    this._peakLevel = peak;

    // Send level for waveform display every ~21ms (8 blocks)
    this._sampleCount += samples.length;
    if (this._sampleCount % (128 * 8) < 128) {
      this.port.postMessage({ type: 'level', peak: this._peakLevel });
    }

    if (!this._isCapturing) return true;

    // Copy samples into buffer
    for (let i = 0; i < samples.length; i++) {
      this._buffer[this._writePos++] = samples[i];

      // When buffer is full (1 second), send to main thread
      if (this._writePos >= this._buffer.length) {
        const chunk = this._buffer;
        this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
        this._buffer = new Float32Array(48000);
        this._writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
