import "server-only";
/**
 * Keyset cursors of the console lists (platform.md PLA-§4.5, PD26): the URL carries `?cursor=<token>` and the list
 * function asks for the rows after `[sortValue, id]`, never an OFFSET.
 *
 *   const token = encodeCursor([row.createdAt.toISOString(), row.id]);   // "eyJrIjpb…In1d.3f9a0c…"
 *   const keys = decodeCursor(searchParams.cursor);                       // unknown[] | null → page 1
 *
 * Token = base64url(JSON `{ "k": values }`) + "." + the first 16 hex characters of `hmac(json, "console-cursor")`
 * (src/lib/security/crypto.ts, keyed by APP_SECRET). A tampered, truncated, oversized or foreign token decodes to
 * null and the list answers page 1. The values are only ever primitives (a date travels as its ISO string); the
 * caller validates their types (zod) before building SQL, so a forged cursor can never reach a query anyway.
 */
import { hmac, safeEqual } from "@/lib/security/crypto";

const PURPOSE = "console-cursor";
/** a cursor never carries more than a sort key or two and the id */
const MAX_VALUES = 4;
const MAX_TOKEN = 512;

export type CursorValue = string | number | boolean | null;

const signature = (json: string) => hmac(json, PURPOSE).slice(0, 16);

function isCursorValue(v: unknown): v is CursorValue {
  return v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

/** The opaque token of `values` (1-4 primitives, e.g. `[createdAtIso, id]`). Throws on anything else: a caller bug. */
export function encodeCursor(values: readonly CursorValue[]): string {
  if (values.length === 0 || values.length > MAX_VALUES || !values.every(isCursorValue)) throw new Error("cursor: 1-4 primitive values");
  const json = JSON.stringify({ k: values });
  return `${Buffer.from(json, "utf8").toString("base64url")}.${signature(json)}`;
}

/** The values of a token this process signed, or null (absent, malformed, tampered: the list starts at page 1). */
export function decodeCursor(token: string | null | undefined): CursorValue[] | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[0-9a-f]{16}$/.test(sig)) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    if (!safeEqual(sig, signature(json))) return null;
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || !("k" in parsed)) return null;
    const k = (parsed as { k: unknown }).k;
    if (!Array.isArray(k) || k.length === 0 || k.length > MAX_VALUES || !k.every(isCursorValue)) return null;
    return k;
  } catch {
    return null;
  }
}
