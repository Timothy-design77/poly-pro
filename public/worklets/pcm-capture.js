/**
 * Raw PCM capture AudioWorklet. Chunks follow the AudioContext's real sample
 * rate instead of assuming 48 kHz. Post-session scoring uses the persisted
 * sample rate from the same context.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(sampleRate);
    this._writePos = 0;
    this._isCapturing = false;
    this._blockCount = 0;
    this._capturedSamples = 0;

    this._onsetDetectionEnabled = false;
    this._energyHistory = new Float32Array(16);
    this._energyPos = 0;
    this._lastOnsetBlock = -100;
    this._cooldownBlocks = Math.max(1, Math.round((0.04 * sampleRate) / 128));
    this._noiseFloor = 0.003;
    this._calibrationBlocks = 0;
    this._calibrationSum = 0;
    this._isCalibrated = false;

    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this._isCapturing = true;
        this._writePos = 0;
        this._blockCount = 0;
        this._capturedSamples = 0;
        this._onsetDetectionEnabled = true;
        this._lastOnsetBlock = -100;
        this._calibrationBlocks = 0;
        this._calibrationSum = 0;
        this._isCalibrated = false;
        this._energyHistory.fill(0);
        this._energyPos = 0;
      } else if (event.data.type === 'stop') {
        if (this._writePos > 0) {
          const chunk = this._buffer.slice(0, this._writePos);
          this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
        }
        this._isCapturing = false;
        this._onsetDetectionEnabled = false;
        this._writePos = 0;
        this.port.postMessage({ type: 'done', totalSamples: this._capturedSamples, sampleRate });
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];
    this._blockCount++;

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < channelData.length; i++) {
      const value = channelData[i];
      sumSq += value * value;
      const abs = value < 0 ? -value : value;
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / channelData.length);

    if (this._blockCount % 8 === 0) this.port.postMessage({ type: 'level', peak });

    if (this._onsetDetectionEnabled) {
      if (!this._isCalibrated) {
        this._calibrationSum += rms;
        this._calibrationBlocks++;
        if (this._calibrationBlocks >= 100) {
          const avgNoise = this._calibrationSum / this._calibrationBlocks;
          this._noiseFloor = Math.max(avgNoise * 2, 0.003);
          this._isCalibrated = true;
        }
      }

      this._energyHistory[this._energyPos % 16] = rms;
      this._energyPos++;

      if (this._isCalibrated && (this._blockCount - this._lastOnsetBlock) > this._cooldownBlocks) {
        let recentSum = 0;
        for (let i = 0; i < 8; i++) {
          const idx = ((this._energyPos - 1 - i) + 1600) % 16;
          recentSum += this._energyHistory[idx];
        }
        const recentAvg = recentSum / 8;
        const threshold = Math.max(recentAvg * 1.8, this._noiseFloor);
        if (rms > threshold && peak > this._noiseFloor) {
          this._lastOnsetBlock = this._blockCount;
          this.port.postMessage({ type: 'onset', time: currentTime, peak, energy: rms });
        }
      }
    }

    if (!this._isCapturing) return true;

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writePos++] = channelData[i];
      this._capturedSamples++;
      if (this._writePos >= this._buffer.length) {
        const chunk = new Float32Array(this._buffer);
        this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
        this._buffer = new Float32Array(sampleRate);
        this._writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
