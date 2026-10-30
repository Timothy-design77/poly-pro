/**
 * Read a palette token from globals.css so canvas drawing uses the same
 * colors as the DOM. Call during drawing, not at module load.
 */
export function cssVar(name: `--${string}`, fallback = '#000'): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
