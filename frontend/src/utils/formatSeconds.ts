/** Formats a non-negative duration as `HH:MM:SS`. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(seconds, 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${sec}`;
}
