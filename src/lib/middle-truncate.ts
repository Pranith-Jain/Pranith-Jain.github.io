/**
 * Middle-truncate a string so both ends stay legible — e.g. a hash or URL
 * renders as `a1b2c3d4…9f8e7d6c` instead of losing its tail to a trailing
 * ellipsis. Returns the input unchanged when it already fits or `max` is
 * non-positive / non-finite.
 */
export function middleTruncate(value: string, max: number): string {
  if (!Number.isFinite(max) || max <= 0 || value.length <= max) return value;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}
