/**
 * The last client error codes, in memory (P2 SHELL; platform.md PLA-§20.1): `use-action-error.ts` records the code of
 * every failed action, and the Help sheet's "Copy diagnostic info" lists the last five. Codes only (`forbidden`,
 * `quota`, `server`…): never a message, never customer data, never a token; nothing is stored on disk.
 *
 *   recordClientError("rate_limited");   recentClientErrors();   diagnosticText({ handle, path, build, ua, errors })
 */

export const CLIENT_ERROR_RING = 5;
const CODE_RE = /^[a-z][a-z0-9_]{1,47}$/;
const RING: string[] = [];

/** Keeps `code` (a well-formed error code only) as the newest of the last five. */
export function recordClientError(code: unknown): void {
  if (typeof code !== "string" || !CODE_RE.test(code)) return;
  RING.push(code);
  if (RING.length > CLIENT_ERROR_RING) RING.splice(0, RING.length - CLIENT_ERROR_RING);
}

/** The last five codes, oldest first. */
export function recentClientErrors(): string[] {
  return [...RING];
}

/** Empties the ring (a sign-out, a store switch, the selftest). */
export function clearClientErrors(): void {
  RING.length = 0;
}

export interface DiagnosticInfo {
  handle: string;
  /** the pathname on screen; a query string or fragment is cut (a search box may hold a phone number) */
  path: string;
  build: string | null;
  /** `describeUserAgent`'s label ("Chrome · Android") */
  ua: string;
  errors: readonly string[];
  locale: string;
}

/** The pathname without its query or fragment, and without anything that is not a path character. */
export function diagnosticPath(path: string): string {
  const bare = (path.split(/[?#]/)[0] ?? "").slice(0, 200);
  return bare.replace(/[^A-Za-z0-9/_.\-[\]]/g, "");
}

/** The block "Copy diagnostic info" puts on the clipboard: plain lines, no customer data, no tokens. */
export function diagnosticText(info: DiagnosticInfo): string {
  const errors = info.errors.filter((c) => CODE_RE.test(c)).slice(-CLIENT_ERROR_RING);
  return [
    `store: @${info.handle.replace(/[^a-z0-9-]/g, "")}`,
    `screen: ${diagnosticPath(info.path) || "/"}`,
    `version: ${(info.build ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "") || "unknown"}`,
    `device: ${info.ua.replace(/[\r\n]+/g, " ").slice(0, 80)}`,
    `language: ${info.locale}`,
    `recent errors: ${errors.length ? errors.join(", ") : "none"}`,
  ].join("\n");
}
