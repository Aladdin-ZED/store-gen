/**
 * Store handles (docs/STORE-SAAS.md §C.7, R-D53): the `<handle>` of `/s/<handle>`, `/app/<handle>` and
 * `<handle>.<STORE_ROOT_DOMAIN>`. The format, the static reserved list and the rules of handleProblem are pure (the
 * edge classifier imports this module); availability and renames read the database through
 * src/lib/db/store-handles.ts, imported lazily by the two async functions so the edge path never loads it.
 *
 *   handleProblem("cih-bank", {})            // "protected" (the brand list, D76)
 *   await checkHandleAvailable("nour-shop")  // "available" | "unavailable" (never why: no oracle)
 *   await renameHandle(ctx, "nour-beauty")   // domains.manage; 1 rename / 30 days; old handle 308s for 12 months
 *
 * handleProblem is synchronous: the platform's extra reserved handles (`platform.reservedHandles`, PLA Q.30) and the
 * console's protected terms come from a snapshot that the async functions refresh (30 s, `loadHandleLists`); before
 * the first load the seeded brand list of src/lib/platform/data/protected-brands.ts applies.
 */
import { PROTECTED_BRANDS, type ProtectedBrandMatch } from "@/lib/platform/data/protected-brands";
import { HANDLE_RE, isHandle } from "@/lib/urls/handle";
import type { StoreCtx } from "./types";

// the format lives in src/lib/urls/handle.ts (client components import it there)
export { HANDLE_RE, isHandle };

/** The static (non-store) first segments under /app/ (§I.1); `/app/<one of these>` is never a store path. */
export const APP_STATIC_SEGMENTS: ReadonlySet<string> = new Set(["new", "account", "security", "two-factor", "sessions", "danger", "manifest.webmanifest"]);

/**
 * Never a store (domains.md §4.8 infrastructure list + TENANCY-MAP C4 + "d", "preview", "track"), plus the
 * static /app segments (a C0a addition: a store with such a handle would have an unreachable dashboard).
 * Entries shorter than 3 characters or with dots can't pass isHandle anyway; they stay listed so the list
 * reads as its sources. The ADMIN_GATE value and `platform.reservedHandles` are checked by handleProblem.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // domains.md §4.8
  "www", "app", "admin", "api", "console", "dashboard", "platform", "mail", "webmail", "smtp", "imap", "pop", "pop3", "mx",
  "ns1", "ns2", "ftp", "sftp", "cpanel", "hpanel", "autodiscover", "autoconfig", "cdn", "static", "assets", "media", "img",
  "images", "files", "uploads", "status", "health", "docs", "help", "support", "blog", "news", "login", "signin", "signup",
  "register", "auth", "sso", "oauth", "id", "account", "accounts", "billing", "pay", "payment", "checkout", "secure",
  "wallet", "stores", "store", "shop", "s", "go", "link", "links", "l", "preview", "staging", "dev", "test", "demo",
  "sandbox", "beta", "partners", "affiliates", "legal", "terms", "privacy", "security", "abuse", "postmaster",
  "hostmaster", "webmaster", "root", "system", "internal", "edge", "origin",
  // TENANCY-MAP C4 (platform-reserved top segments)
  "fonts", "_next", "invite", "reset", "setup", "pricing", "merci", "robots.txt", "sitemap.xml", "favicon.ico", "administrator",
  // §C.7
  "d", "track",
  // §I.1
  ...APP_STATIC_SEGMENTS,
]);

/** Page slugs a store page can never take (§C.4.1); slugs starting with "@" are internal template slugs. */
export const STORE_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "p", "c", "products", "collections", "policies", "legal", "cart", "checkout", "search", "track", "t", "go", "feeds",
  "reviews", "account", "pages", "merci", "media", "api", "preview", "d", "s", "app", "admin", "kit", "sitemap.xml",
  "robots.txt", "favicon.ico", "manifest.webmanifest", ".well-known",
  // locale prefixes (R3 sibling locales, STO-R14)
  "ar", "fr", "en", "es", "de", "it", "nl", "pt",
]);

export type HandleProblem = null | "format" | "reserved" | "protected" | "unavailable";

/* ------------------------------------------------------------------ */
/* Brand protection on handles (pure)                                  */
/* ------------------------------------------------------------------ */

export interface BrandTerm {
  term: string;
  match: ProtectedBrandMatch;
}

const LOOKALIKE: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** The brandTokens() folding of PLA-§3.4.2 on ASCII handles and terms: NFKC, lower case, no marks, 0→o 1→i 3→e … */
export function foldBrand(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[013457@$]/g, (c) => LOOKALIKE[c] ?? c);
}

/**
 * Every reading of a handle a person could take for a brand (pure): foldBrand (1→i), then 1→l instead, each with and
 * without the two-letter look-alikes vv→w and rn→m. "paypa1-shop" reads "paypal-shop", "vvhatsapp" reads "whatsapp".
 * CCR r1.0-m-1 asks PLA-§3.4.2 brandTokens and P1's checkBrandTerms to fold the same way.
 */
export function brandFoldings(value: string): string[] {
  const base = value.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
  const out = new Set<string>();
  for (const one of ["i", "l"]) {
    const single = base.replace(/[013457@$]/g, (c) => (c === "1" ? one : (LOOKALIKE[c] ?? c)));
    out.add(single);
    const w = single.replace(/vv/g, "w");
    const m = single.replace(/rn/g, "m");
    out.add(w).add(m).add(w.replace(/rn/g, "m"));
  }
  return [...out];
}

/**
 * true when `handle` uses a protected term: `exact` = a hyphen-separated part, or the whole handle without hyphens,
 * equals the term; `substring` = the handle without hyphens contains it (`skeleton` rows match like `exact` until
 * R3). Both sides are folded, so "face-b00k" is "facebook"; the handle is tested under each of its brandFoldings
 * ("paypa1-shop", "vvhatsapp-ma"), and any one matching refuses it. Pure.
 */
export function handleUsesBrand(handle: string, terms: readonly BrandTerm[]): boolean {
  const readings = brandFoldings(handle).map((f) => {
    const parts = f.split("-").filter(Boolean);
    return { parts, joined: parts.join("") };
  });
  for (const t of terms) {
    const term = foldBrand(t.term).replace(/[^a-z0-9]+/g, "");
    if (term.length < 2) continue;
    for (const { parts, joined } of readings) {
      if (t.match === "substring" ? joined.includes(term) : parts.includes(term) || joined === term) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* The list snapshot                                                   */
/* ------------------------------------------------------------------ */

/** The platform-tunable lists handleProblem reads (refreshed by src/lib/db/store-handles.ts, 30 s). */
export interface HandleLists {
  /** `platform.reservedHandles` (extra to RESERVED_HANDLES) */
  reserved: ReadonlySet<string>;
  /** the active protected terms: the seeded list minus rows staff disabled, plus the rows staff added */
  terms: readonly BrandTerm[];
  /** Date.now() of the load; 0 = the built-in defaults */
  at: number;
}

declare global {
  var __sgHandleLists: HandleLists | undefined;
}

const SEEDED_TERMS: readonly BrandTerm[] = PROTECTED_BRANDS.map((b) => ({ term: b.term, match: b.match }));

/** The current snapshot (the seeded brand list and no extra reserved handles until the first load). */
export function handleLists(): HandleLists {
  return globalThis.__sgHandleLists ?? { reserved: new Set(), terms: SEEDED_TERMS, at: 0 };
}

/** Replaces the snapshot (the loader, and tests). */
export function setHandleLists(lists: HandleLists): void {
  globalThis.__sgHandleLists = lists;
}

/** The ADMIN_GATE path segment in lower case, or null (a handle may never equal it, compared case-insensitively). */
function adminGate(): string | null {
  const gate = typeof process === "undefined" ? undefined : process.env.ADMIN_GATE?.trim();
  return gate ? gate.toLowerCase() : null;
}

/** RESERVED_HANDLES, the ADMIN_GATE value and `platform.reservedHandles` (from `lists`). Pure but for the env read. */
export function isReservedHandle(value: string, lists: HandleLists = handleLists()): boolean {
  return RESERVED_HANDLES.has(value) || lists.reserved.has(value) || value === adminGate();
}

/**
 * Format, reserved (static list, ADMIN_GATE, `platform.reservedHandles`), protected brands (unless staff pass
 * `allowProtected` for one signup, §C.7). Never "unavailable": whether a valid handle is free is
 * checkHandleAvailable's question (the database), so this stays synchronous for forms and the edge.
 */
export function handleProblem(value: string, opts: { allowProtected?: boolean }, lists: HandleLists = handleLists()): HandleProblem {
  if (typeof value !== "string" || !isHandle(value)) return "format";
  if (isReservedHandle(value, lists)) return "reserved";
  if (!opts.allowProtected && handleUsesBrand(value, lists.terms)) return "protected";
  return null;
}

/**
 * The handle a store name suggests (onboarding, the store #1 conversion, §D.8 S1 / ENGC-30): lower case, every run
 * of characters outside a-z 0-9 → "-", cut to 30, no leading or trailing "-"; null when the result has a problem
 * (then the conversion falls back to "store-1"). Accents are runs too ("Café Nour" → "caf-nour"), exactly as S1's SQL.
 */
export function handleFromName(name: string, lists: HandleLists = handleLists()): string | null {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
  return slug && handleProblem(slug, {}, lists) === null ? slug : null;
}

/**
 * Whether a handle with no problem is free (§C.7): not any store's current handle, and not in
 * `store_handle_history` with `reserved_until > now` (a store may take back its own old handle). Pure.
 */
export function handleFree(facts: { current: boolean; history: { storeId: string; reservedUntil: Date } | null; now: Date; ownStoreId?: string | null }): boolean {
  if (facts.current) return false;
  const h = facts.history;
  if (!h || h.reservedUntil.getTime() <= facts.now.getTime()) return true;
  return !!facts.ownStoreId && h.storeId === facts.ownStoreId;
}

/** The earliest next rename (1 / 30 days, counted from the store's creation or its last rename). Pure. */
export const RENAME_EVERY_DAYS = 30;
export function nextRenameAt(createdAt: Date, lastRenameAt: Date | null): Date {
  const from = Math.max(createdAt.getTime(), lastRenameAt?.getTime() ?? 0);
  return new Date(from + RENAME_EVERY_DAYS * 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Availability and renames (database)                                 */
/* ------------------------------------------------------------------ */

export type HandleErrorCode = "forbidden" | "invalid" | "unavailable" | "too_soon" | "status_changed";

/** A refused rename; `code` is the action error the caller answers, `problem` the handleProblem for `invalid`. */
export class HandleError extends Error {
  constructor(
    readonly code: HandleErrorCode,
    readonly problem: Exclude<HandleProblem, null> | null = null,
    readonly retryAt: Date | null = null,
  ) {
    super(`handle: ${code}${problem ? ` (${problem})` : ""}`);
    this.name = "HandleError";
  }
}

/** Never says why a handle is taken (no oracle). Bucketed by its callers (`p:handle:ip:<hash>` 60 / 10 min). */
export async function checkHandleAvailable(value: string): Promise<"available" | "unavailable"> {
  const repo = await import("@/lib/db/store-handles");
  const lists = await repo.loadHandleLists();
  if (handleProblem(value, {}, lists) !== null) return "unavailable";
  return (await repo.handleIsFree(value, null)) ? "available" : "unavailable";
}

/**
 * `domains.manage`, 1 rename / 30 days (the conversion's one free rename honoured once, ENGC-30). The old handle
 * moves to `store_handle_history` (`renamed`, 308 for 12 months, reserved as long), `address_version` is bumped and
 * the store's caches are dropped. Throws HandleError.
 */
export async function renameHandle(ctx: StoreCtx, next: string): Promise<void> {
  if (!ctx.can("domains.manage") || ctx.scope.kind !== "member") throw new HandleError("forbidden");
  if (next === ctx.store.handle) return;
  const repo = await import("@/lib/db/store-handles");
  const problem = handleProblem(next, {}, await repo.loadHandleLists());
  if (problem) throw new HandleError("invalid", problem);
  await repo.renameStoreHandle(ctx, next);
}
