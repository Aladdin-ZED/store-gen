/**
 * Console number and time formatting (platform.md PLA-§4.5 "Numbers" and "Time"): pure and isomorphic, Latin digits.
 *
 *   durationText(11_520_000)          // "3 h 12 min"
 *   countdownText(252_000)            // "4:12"
 *   compactCount(12_431)              // { text: "12.4k", exact: "12,431" }
 *   absoluteTime(iso, "Africa/Casablanca") // "3 Nov 2026, 14:05" (the hover title of every relative time)
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "45 s" is never shown: under a minute reads as `null` (the caller says "just now"). */
export function durationText(ms: number): string | null {
  const v = Math.max(0, Math.floor(ms));
  if (v < MIN) return null;
  if (v < HOUR) return `${Math.floor(v / MIN)} min`;
  if (v < DAY) {
    const h = Math.floor(v / HOUR);
    const m = Math.floor((v % HOUR) / MIN);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(v / DAY);
  const h = Math.floor((v % DAY) / HOUR);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** Minutes as a duration ("3 h 12 min"); `null` minutes stay `null`. */
export function minutesText(min: number | null): string | null {
  if (min === null || !Number.isFinite(min)) return null;
  return durationText(min * MIN) ?? "1 min";
}

/** "4:12" (or "1:04:12"), for the step-up and view-as timers. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const grouping = new Intl.NumberFormat("en-US");

/** Counts ≥ 10,000 as "12.4k" with the exact value for the `title` (PLA-§4.5). */
export function compactCount(n: number): { text: string; exact: string } {
  const exact = grouping.format(n);
  if (Math.abs(n) < 10_000) return { text: exact, exact };
  const k = n / 1000;
  const text = Math.abs(k) >= 1000 ? `${(k / 1000).toFixed(1).replace(/\.0$/, "")}M` : `${k.toFixed(Math.abs(k) >= 100 ? 0 : 1).replace(/\.0$/, "")}k`;
  return { text, exact };
}

/** "1.2 GB" (base 1024, one decimal from MB up). */
export function bytesText(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** The absolute time of a relative one, in the platform time zone ("3 Nov 2026, 14:05"). */
export function absoluteTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}
