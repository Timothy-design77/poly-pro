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
// Chain: per-beat gain → masterGain (vol² × 8) → compressor (0dB, 2:1) → outputGain (×10) → destination
export const COMPRESSOR_THRESHOLD = 0;
export const COMPRESSOR_KNEE = 3;
export const COMPRESSOR_RATIO = 2;
export const COMPRESSOR_ATTACK = 0.002;
export const COMPRESSOR_RELEASE = 0.05;
export const OUTPUT_GAIN = 10.0;
export const MASTER_GAIN_MULTIPLIER = 8.0;

// ─── Meter Defaults ───
export const DEFAULT_METER_NUMERATOR = 4;
export const DEFAULT_METER_DENOMINATOR = 4;
export const DEFAULT_SUBDIVISION = 1;
export const DEFAULT_VOLUME = 0.8;

// ─── Sound Defaults ───
export const DEFAULT_CLICK_SOUND = 'woodblock';
export const DEFAULT_ACCENT_SOUND = 'woodblock';
