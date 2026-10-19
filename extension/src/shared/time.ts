/** Formats seconds as `m:ss` or `h:mm:ss`. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Parses `ss`, `m:ss` or `h:mm:ss`. Returns null when the input is not a valid time. */
export function parseTime(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length === 0 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d{1,5}$/.test(p))) return null;
  const nums = parts.map(Number);
  // Minutes and seconds after the first field must be < 60.
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}
