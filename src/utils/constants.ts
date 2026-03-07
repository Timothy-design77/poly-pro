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
// Signal chain: sample → per-beat gain → master gain → limiter → destination
//
// Design: samples are normalized WAVs. Per-beat ACCENT=1.0 plays at
// full sample level. Master gain scales 0-1 from volume slider.
// Brickwall limiter at -1dB catches overlapping peaks only.
// No unnecessary amplification = clean, loud, punchy output.
//
// Maximum loudness comes from the system volume, not digital gain.
// Boosting digital gain above 0dBFS just causes compression/distortion.
export const COMPRESSOR_THRESHOLD = -1;   // dB — brickwall limiter, only catches true peaks
export const COMPRESSOR_KNEE = 0;         // hard knee — immediate limiting
export const COMPRESSOR_RATIO = 20;       // effectively infinite — brickwall
export const COMPRESSOR_ATTACK = 0.001;   // 1ms — fast enough to catch transients
export const COMPRESSOR_RELEASE = 0.01;   // 10ms — fast release, no pumping
export const OUTPUT_GAIN = 1.0;           // unity — no amplification after limiter
// Samples peak at -0.8 to -3.1 dB — already near 0dBFS. No amplification needed.
export const MASTER_GAIN_MULTIPLIER = 1.0; // unity — volume slider maps 0-1 directly

// ─── Meter Defaults ───
export const DEFAULT_METER_NUMERATOR = 4;
export const DEFAULT_METER_DENOMINATOR = 4;
export const DEFAULT_SUBDIVISION = 1;
export const DEFAULT_VOLUME = 0.8;

// ─── Sound Defaults ───
export const DEFAULT_CLICK_SOUND = 'woodblock';
export const DEFAULT_ACCENT_SOUND = 'woodblock';
