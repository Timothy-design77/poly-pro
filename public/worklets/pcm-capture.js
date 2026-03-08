/**
 * PCM Capture AudioWorklet Processor
 *
 * Captures raw float32 PCM from mic input, sends to main thread
 * via MessagePort in 1-second chunks.
 *
 * 48kHz, 128 samples per block (2.67ms per process() call).
 *
 * Phase 5 addition: Mode 1 real-time onset detection.
 * Simple energy threshold — for visual feedback only (beat dots flash).
 * NOT used for scoring. Post-processing (Mode 2) handles all metrics.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(48000); // 1 second at 48kHz
    this._writePos = 0;
    this._isCapturing = false;
    this._blockCount = 0;

    // ─── Mode 1: Real-time onset detection ───
    this._onsetDetectionEnabled = false;
    this._energyHistory = new Float32Array(16); // Ring buffer of recent energy values
    this._energyPos = 0;
    this._lastOnsetBlock = -100; // Cooldown tracking (block count)
    this._cooldownBlocks = 15;   // ~40ms cooldown at 128-sample blocks (2.67ms each)
    this._noiseFloor = 0.005;    // Will be calibrated from first ~100 blocks
    this._calibrationBlocks = 0;
    this._calibrationSum = 0;
    this._isCalibrated = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this._isCapturing = true;
        this._writePos = 0;
        this._blockCount = 0;
        this._onsetDetectionEnabled = true;
        this._lastOnsetBlock = -100;
        this._calibrationBlocks = 0;
        this._calibrationSum = 0;
        this._isCalibrated = false;
        this._energyHistory.fill(0);
        this._energyPos = 0;
      } else if (e.data.type === 'stop') {
        if (this._writePos > 0) {
          const chunk = this._buffer.slice(0, this._writePos);
          this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
        }
        this._isCapturing = false;
        this._onsetDetectionEnabled = false;
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

    // Compute RMS energy for this block
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < channelData.length; i++) {
      const val = channelData[i];
      sumSq += val * val;
      const abs = val < 0 ? -val : val;
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / channelData.length);

    // Peak level every ~21ms (8 blocks) for waveform display
    if (this._blockCount % 8 === 0) {
      this.port.postMessage({ type: 'level', peak });
    }

    // ─── Mode 1: Real-time onset detection ───
    if (this._onsetDetectionEnabled) {
      // Noise floor calibration from first ~100 blocks (~267ms)
      if (!this._isCalibrated) {
        this._calibrationSum += rms;
        this._calibrationBlocks++;
        if (this._calibrationBlocks >= 100) {
          const avgNoise = this._calibrationSum / this._calibrationBlocks;
          // Set floor at 3x average noise
          this._noiseFloor = Math.max(avgNoise * 3, 0.005);
          this._isCalibrated = true;
        }
      }

      // Store energy in ring buffer
      this._energyHistory[this._energyPos % 16] = rms;
      this._energyPos++;

      // Only check after calibration and cooldown
      if (
        this._isCalibrated &&
        (this._blockCount - this._lastOnsetBlock) > this._cooldownBlocks
      ) {
        // Compute running average of recent energy (last 8 blocks)
        let recentSum = 0;
        let count = 0;
        for (let i = 0; i < 8; i++) {
          const idx = ((this._energyPos - 1 - i) + 16 * 100) % 16;
          recentSum += this._energyHistory[idx];
          count++;
        }
        const recentAvg = count > 0 ? recentSum / count : 0;

        // Onset: current energy significantly above recent average AND noise floor
        // Threshold: 2.5x the recent average, minimum noise floor
        const threshold = Math.max(recentAvg * 2.5, this._noiseFloor);

        if (rms > threshold && peak > this._noiseFloor * 2) {
          this._lastOnsetBlock = this._blockCount;

          // Post onset event with approximate time
          // currentTime is available in AudioWorkletGlobalScope
          this.port.postMessage({
            type: 'onset',
            time: currentTime,
            peak: peak,
            energy: rms,
          });
        }
      }
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
