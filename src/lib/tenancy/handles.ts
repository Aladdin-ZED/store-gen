/**
 * Store handles (docs/STORE-SAAS.md §C.7, R-D53): the `<handle>` of `/s/<handle>`, `/app/<handle>` and
 * `<handle>.<STORE_ROOT_DOMAIN>`. The format and the static reserved lists are pure and isomorphic (the edge
 * classifier and the signup form use them); availability, brand protection and renames are T1's
 * (signatures frozen at C0a, bodies until T1 merges are typed stubs).
 */
import type { StoreCtx } from "./types";

/** 3-30 chars of a-z 0-9 and inner hyphens; see isHandle for the "--" rule. */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** The handle format: HANDLE_RE and no "--" at positions 3-4 (blocks `xn--` punycode and look-alike IDNs). */
export function isHandle(value: string): boolean {
  return HANDLE_RE.test(value) && value.slice(2, 4) !== "--";
}

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

/** Format, reserved (static list, ADMIN_GATE, `platform.reservedHandles`), protected brands; T1. */
export function handleProblem(value: string, opts: { allowProtected?: boolean }): HandleProblem {
  void value;
  void opts;
  throw new Error("not implemented: T1 (handleProblem)");
}

/** Never says why a handle is taken (no oracle); T1. */
export async function checkHandleAvailable(value: string): Promise<"available" | "unavailable"> {
  void value;
  throw new Error("not implemented: T1 (checkHandleAvailable)");
}

/** `domains.manage`, 1 rename / 30 days (the conversion's one free rename honoured once); T1. */
export async function renameHandle(ctx: StoreCtx, next: string): Promise<void> {
  void ctx;
  void next;
  throw new Error("not implemented: T1 (renameHandle)");
}
