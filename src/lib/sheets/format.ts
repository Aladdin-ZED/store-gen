/**
 * Pure helpers for the Sheets integration (no I/O): link parsing, cell text hygiene, serial dates.
 */

export type SheetLinkError = "not_a_url" | "not_google" | "published_link" | "not_a_sheet" | "no_id";
export type ParsedSheetLink = { ok: true; spreadsheetId: string; gid: number | null } | { ok: false; error: SheetLinkError };

const ID_RE = /^[a-zA-Z0-9_-]{25,100}$/;
const GOOGLE_HOSTS = new Set(["docs.google.com", "drive.google.com", "sheets.google.com", "spreadsheets.google.com"]);

/**
 * Accepts any Google Sheets URL form or a bare spreadsheet id:
 *   docs.google.com/spreadsheets/d/<id>/edit#gid=0 · /spreadsheets/u/1/d/<id> · drive.google.com/file/d/<id>
 *   drive.google.com/open?id=<id> · legacy ?key=<id>
 * Rejects "Publish to web" links (/d/e/2PACX-…, unusable by the API) and non-Google hosts.
 */
export function parseSheetUrl(input: string): ParsedSheetLink {
  const s = String(input ?? "").trim();
  if (!s || s.length > 2000) return { ok: false, error: "not_a_url" };
  if (ID_RE.test(s)) return { ok: true, spreadsheetId: s, gid: null };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, error: "not_a_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "not_a_url" };
  if (!GOOGLE_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, error: "not_google" };
  if (/^\/(?:spreadsheets\/)?(?:u\/\d+\/)?d\/e\//.test(url.pathname)) return { ok: false, error: "published_link" };
  if (url.hostname === "docs.google.com" && /^\/(?:document|presentation|forms)\//.test(url.pathname)) {
    return { ok: false, error: "not_a_sheet" };
  }
  const m = url.pathname.match(/\/(?:spreadsheets|file)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  const id = m?.[1] ?? url.searchParams.get("id") ?? url.searchParams.get("key");
  if (!id || !ID_RE.test(id)) return { ok: false, error: "no_id" };
  const g = `${url.hash}&${url.search}`.match(/[#&?]gid=(\d{1,12})/);
  return { ok: true, spreadsheetId: id, gid: g ? Number(g[1]) : null };
}

/**
 * Neutralise spreadsheet-formula triggers and control characters in free text.
 * Values are written with valueInputOption=RAW (never parsed), but call centers export sheets to
 * CSV/Excel, where a leading = + - @ (or full-width variants) would become a formula.
 */
export function cleanText(v: unknown, max = 500): string {
  let s = String(v ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^[=+\-@＝＋－＠\s]+/, "");
  return s.slice(0, max);
}

// the last zone's formatter: building an Intl.DateTimeFormat costs far more than using it, and a run formats up to
// 300 rows of one store (one zone). It holds no store data, only the zone name.
let lastClock: { timeZone: string; f: Intl.DateTimeFormat } | null = null;
function wallClock(timeZone: string): Intl.DateTimeFormat {
  if (lastClock?.timeZone !== timeZone) {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    lastClock = { timeZone, f };
  }
  return lastClock.f;
}

/** The wall-clock parts of `d` in `timeZone` (year, month, day, hour, minute, second; zero-padded strings). */
export function wallParts(d: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    wallClock(timeZone)
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
}

/** Google Sheets serial date (days since 1899-12-30) in the wall-clock time of `timeZone`. */
export function toSheetsSerial(d: Date, timeZone: string): number {
  const p = wallParts(d, timeZone);
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((wall / 86_400_000 + 25_569) * 1e6) / 1e6; // 25569 = days 1899-12-30 → 1970-01-01
}

/** 0-based column index → A1 letters (0 → "A", 26 → "AA"). */
export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Quoted A1 range on a tab: 'My tab'!A1:C */
export const a1 = (title: string, range: string) => `'${title.replace(/'/g, "''")}'!${range}`;

/** Canonical link to open a spreadsheet (optionally at a tab). */
export const sheetUrl = (spreadsheetId: string, sheetId?: number | null) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit${sheetId != null ? `#gid=${sheetId}` : ""}`;
