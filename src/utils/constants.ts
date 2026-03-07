// ─── Audio Scheduler ───
export const SCHEDULE_INTERVAL_MS = 25;
export const SCHEDULE_AHEAD_S = 0.1; // 100ms lookahead

// ─── BPM ───
export const BPM_MIN = 20;
export const BPM_MAX = 300;
export const BPM_STEP = 0.5;
export const BPM_DEFAULT = 120;

// ─── Hold-to-accelerate ───
export const HOLD_PHASE_1_DURATION = 500;  // ms before phase 2
export const HOLD_PHASE_2_DURATION = 2000; // ms before phase 3
export const HOLD_PHASE_1_STEP = 1;        // BPM per tick
export const HOLD_PHASE_1_INTERVAL = 200;  // ms between ticks
export const HOLD_PHASE_2_STEP = 5;
export const HOLD_PHASE_2_INTERVAL = 100;
export const HOLD_PHASE_3_STEP = 10;
export const HOLD_PHASE_3_INTERVAL = 80;

// ─── Tap Tempo ───
export const TAP_MIN_TAPS = 3;
export const TAP_MAX_TAPS = 8;
export const TAP_TIMEOUT_MS = 3000;

// ─── Audio Engine ───
// ─── Audio Tuning ───
// Web Audio on Android outputs quieter than native.
// getUserMedia triggers Android audio ducking (~50-70% volume reduction).
// RECORDING_GAIN_BOOST compensates to keep metronome audible while recording.
export const COMPRESSOR_THRESHOLD = -6;   // dB — catches overlapping peaks
export const COMPRESSOR_KNEE = 3;         // smooth transition
export const COMPRESSOR_RATIO = 8;        // strong limiting above threshold
export const COMPRESSOR_ATTACK = 0.001;   // 1ms
export const COMPRESSOR_RELEASE = 0.02;   // 20ms
export const OUTPUT_GAIN = 1.0;           // unity after compressor
export const MASTER_GAIN_MULTIPLIER = 6.0; // normal playback — confirmed loud enough
export const RECORDING_GAIN_BOOST = 3.0;  // extra multiplier during recording to offset ducking

// ─── Meter Defaults ───
export const DEFAULT_METER_NUMERATOR = 4;
export const DEFAULT_METER_DENOMINATOR = 4;
export const DEFAULT_SUBDIVISION = 1;
export const DEFAULT_VOLUME = 0.8;

// ─── Sound Defaults ───
export const DEFAULT_CLICK_SOUND = 'woodblock';
export const DEFAULT_ACCENT_SOUND = 'woodblock';
