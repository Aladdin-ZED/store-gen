/**
 * Integration failure causes in plain words (P5 INTEGRATIONS; operations.md OPE-§28.1 "What to check", §28.2, OD40).
 * Pure and isomorphic: the health strip, the deliveries log, the health rules and the handlers share one vocabulary.
 *
 * - A failure is stored as a cause CODE (`integration_status.last_error_code`, the outbox's `last_error` written by
 *   P5's handlers), never as the raw error text: a provider's message can quote a token, a phone or a payload.
 * - `causeKey(code)` is the message `int.cause.<code>` every surface shows; an unknown or legacy code reads
 *   `int.cause.unknown`, never the stored string.
 * - `whatToCheck(kind, code)` lists the three most likely causes of a failing kind in the owner's words, each with
 *   what to do (`int.hint.<code>`) and where (`path` under `/app/<h>`, label `int.link.<page>`); the cause the last
 *   error names comes first.
 * - The classifiers turn a provider's answer (HTTP status, Google's reason, Meta's error code, Telegram's
 *   description) into a code. They read the message only to classify it and never return it.
 */
import type { IntegrationKind } from "./health";
import type { MessageKey } from "@/lib/tenancy/types";

/** Every cause code (≤ 48 chars, `int.cause.<code>` in en and fr; ar falls back until R3, OD58). */
export const CAUSE_CODES = [
  // Google Sheets
  "sheet_not_shared",
  "sheet_not_found",
  "sheet_tab_missing",
  "sheet_is_xlsx",
  "binding_conflict",
  "sheets_api_disabled",
  "sa_invalid",
  "not_configured",
  "breaker",
  // Conversions API (Meta)
  "token_revoked",
  "token_invalid",
  "pixel_not_found",
  "permission_denied",
  "event_rejected",
  "stale_event",
  // Telegram
  "bot_token_revoked",
  "chat_not_found",
  "bot_blocked",
  // any kind
  "rate_limited",
  "timeout",
  "network",
  "server_error",
  "refused",
  "unknown",
] as const;
export type CauseCode = (typeof CAUSE_CODES)[number];

const CODES: ReadonlySet<string> = new Set(CAUSE_CODES);

export function isCauseCode(value: unknown): value is CauseCode {
  return typeof value === "string" && CODES.has(value);
}

/** The plain-words message of a stored code; null when nothing failed. Never the stored string itself. */
export function causeKey(code: string | null | undefined): MessageKey | null {
  if (code === null || code === undefined || code === "") return null;
  return `int.cause.${isCauseCode(code) ? code : "unknown"}`;
}

/** What 401 / 403 / 404 mean per kind (Telegram answers 404 to a bot token it does not know). */
const AUTH_CODES: Partial<Record<IntegrationKind, Partial<Record<401 | 403 | 404, CauseCode>>>> = {
  sheets: { 401: "sa_invalid", 403: "sheet_not_shared", 404: "sheet_not_found" },
  capi: { 401: "token_invalid", 403: "permission_denied", 404: "pixel_not_found" },
  telegram: { 401: "bot_token_revoked", 403: "bot_blocked", 404: "bot_token_revoked" },
};

/** A code from an HTTP status alone (an outbox row whose handler stored no code; status 0 = no answer). */
export function causeFromStatus(status: number | null | undefined, kind?: IntegrationKind | null): CauseCode {
  if (status === null || status === undefined) return "unknown";
  if (status === 0) return "network";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403 || status === 404) return (kind ? AUTH_CODES[kind]?.[status] : undefined) ?? "refused";
  if (status >= 500) return "server_error";
  if (status >= 400) return "refused";
  return "unknown";
}

/**
 * Google Sheets (src/lib/sheets/client.ts `SheetsError`: status, Google's `status` reason, message). The same
 * conditions as the R1.0 `explain()` of src/lib/sheets/orders-sheet.ts, as codes.
 */
export function classifySheetsError(e: { status?: number | null; reason?: string | null; message?: string | null }): CauseCode {
  const m = e.message ?? "";
  const status = e.status ?? null;
  if (e.reason === "invalid_grant" || e.reason === "disabled_client" || e.reason === "unauthorized_client") return "sa_invalid";
  if (status === 0) return "network";
  if (status === 403 && /SERVICE_DISABLED|has not been used|accessNotConfigured/i.test(m)) return "sheets_api_disabled";
  if (status === 403) return "sheet_not_shared";
  if (status === 404) return "sheet_not_found";
  if (status === 400 && /not supported for this document/i.test(m)) return "sheet_is_xlsx";
  if (status === 400 && /Unable to parse range/i.test(m)) return "sheet_tab_missing";
  return causeFromStatus(status, "sheets");
}

/**
 * Meta's Conversions API (Graph API errors: `error.code`, `error.error_subcode`). 190 is an OAuth failure (subcodes
 * 458-467: the token was revoked, expired or its session ended); 10 / 200-299 are permissions; 4 / 17 / 32 / 613 are
 * rate limits; 100 with "does not exist" is an unknown pixel or dataset; other 100s are a refused event.
 */
export function classifyMetaError(e: { status?: number | null; code?: number | null; subcode?: number | null; message?: string | null }): CauseCode {
  const code = e.code ?? null;
  if (code === 190) return e.subcode !== null && e.subcode !== undefined && e.subcode >= 458 && e.subcode <= 467 ? "token_revoked" : "token_invalid";
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) return "permission_denied";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "rate_limited";
  if (code === 100 && /does not exist|cannot be loaded|unknown path|missing permissions/i.test(e.message ?? "")) return "pixel_not_found";
  if (code === 100) return "event_rejected";
  return causeFromStatus(e.status, "capi");
}

/** Telegram Bot API (`ok: false`, `error_code`, `description`). OPE-§21.3: 401, 403 and "chat not found" are final. */
export function classifyTelegramError(e: { status?: number | null; description?: string | null }): CauseCode {
  const d = e.description ?? "";
  if (e.status === 401) return "bot_token_revoked";
  if (e.status === 403) return "bot_blocked";
  if (/chat not found/i.test(d)) return "chat_not_found";
  if (e.status === 400 && /bot was (?:blocked|kicked)|not a member/i.test(d)) return "bot_blocked";
  return causeFromStatus(e.status, "telegram");
}

/** The codes after which Telegram never recovers by itself: the row turns `failing` at once (OPE-§28.2). */
export const TELEGRAM_FINAL_CODES: ReadonlySet<CauseCode> = new Set<CauseCode>(["bot_token_revoked", "bot_blocked", "chat_not_found"]);

/** One "What to check" line: the cause, what to do, and the screen that does it. */
export interface CheckItem {
  code: CauseCode;
  text: MessageKey;
  hint: MessageKey;
  /** under `/app/<h>` (appHref) */
  path: `/${string}`;
  link: MessageKey;
}

const PATHS = {
  sheets: "/integrations/sheets",
  pixels: "/integrations/pixels",
  telegram: "/integrations/telegram",
} as const satisfies Record<string, `/${string}`>;

/** Per kind, the three most likely causes in order (OPE-§28.1), and the extra causes a last error may name first. */
const CHECKS: Partial<Record<IntegrationKind, { page: keyof typeof PATHS; likely: readonly CauseCode[]; named: readonly CauseCode[] }>> = {
  sheets: { page: "sheets", likely: ["sheet_not_shared", "sheet_not_found", "sheet_tab_missing"], named: ["binding_conflict", "sheet_is_xlsx"] },
  capi: { page: "pixels", likely: ["token_revoked", "pixel_not_found", "permission_denied"], named: ["token_invalid"] },
  telegram: { page: "telegram", likely: ["bot_token_revoked", "chat_not_found", "bot_blocked"], named: [] },
};

/** The causes that carry an `int.hint.<code>` (what to do); the rest are explained by their cause text alone. */
const CHECKED: readonly CauseCode[] = Object.values(CHECKS).flatMap((c) => [...c.likely, ...c.named]);
export const HINTED_CAUSES: readonly CauseCode[] = CHECKED.filter((c, i) => CHECKED.indexOf(c) === i);

/**
 * Up to three likely causes of a failing `kind`: the cause the last error names first when it is one of the kind's
 * checks, then the kind's usual suspects. Empty for a kind without checks (R2 / R3 kinds bring theirs).
 */
export function whatToCheck(kind: IntegrationKind, code?: string | null): CheckItem[] {
  const spec = CHECKS[kind];
  if (!spec) return [];
  const first = isCauseCode(code) && (spec.likely.includes(code) || spec.named.includes(code)) ? [code] : [];
  const order = [...new Set<CauseCode>([...first, ...spec.likely])].slice(0, 3);
  return order.map((c) => ({ code: c, text: `int.cause.${c}`, hint: `int.hint.${c}`, path: PATHS[spec.page], link: `int.link.${spec.page}` }));
}
