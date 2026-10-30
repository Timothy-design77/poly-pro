const cache = new Map<string, string>();

/**
 * Read a palette token from globals.css so canvas drawing uses the same
 * colors as the DOM. Values are cached: the palette is static (one light
 * theme), and canvas code calls this inside per-hit drawing loops.
 */
export function cssVar(name: `--${string}`, fallback = '#000'): string {
  const cached = cache.get(name);
  if (cached) return cached;
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value) cache.set(name, value);
  return value || fallback;
}

/** `#RRGGBB` token with an alpha channel, for canvas fills. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}
