export const PREPARATION_DELAYS = [0, 3, 5, 10] as const;
export const TAKE_LENGTHS = [0, 15, 30, 60, 120, 300] as const;

export interface RecordingPreferences {
  preparationSeconds: number;
  takeSeconds: number;
}

const STORAGE_KEY = 'polypro-recording-setup';
const defaults: RecordingPreferences = { preparationSeconds: 0, takeSeconds: 0 };

export function readRecordingPreferences(): RecordingPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return {
      preparationSeconds: PREPARATION_DELAYS.includes(saved?.preparationSeconds) ? saved.preparationSeconds : 0,
      takeSeconds: TAKE_LENGTHS.includes(saved?.takeSeconds) ? saved.takeSeconds : 0,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveRecordingPreferences(preferences: RecordingPreferences): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
  catch { /* Recording still works when browser preferences cannot be stored. */ }
}

export function takeLengthLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${seconds / 60} min`;
}
