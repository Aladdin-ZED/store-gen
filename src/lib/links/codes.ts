/**
 * Short-link codes (P3 LANDING; landing.md LAN-§12.2, §2.1 `short_links.code`): a generated code is 6 Crockford
 * base32 characters in lower case (no i, l, o, u: nothing to misread on a printed flyer); an owner-chosen code is
 * 3-16 characters of `[a-z0-9-]`, starting and ending with a letter or digit. Codes are unique per store
 * (`sl_store_code_uq`), compared in lower case, and the route segments and words a shopper could mistake for the
 * platform are refused. Isomorphic: the create sheet validates as the owner types.
 */
import { randomInt } from "@/lib/links/random";

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
export const GENERATED_LENGTH = 6;
export const CUSTOM_CODE_RE = /^[a-z0-9](?:[a-z0-9-]{1,14}[a-z0-9])$/;

/** Words no store may take as a code: route names, platform words and the ones a scam would want. */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  "admin", "api", "app", "apps", "auth", "billing", "cart", "checkout", "console", "dashboard", "dev", "help",
  "kit", "login", "logout", "merci", "new", "null", "official", "order", "orders", "page", "pages", "pay", "payment",
  "platform", "policies", "preview", "robots", "search", "settings", "signin", "signup", "sitemap", "staff",
  "store", "support", "test", "track", "undefined", "verify", "www",
]);

export type CodeProblem = "format" | "reserved";

/** Normalises an owner-typed code (trim, lower case); null when empty. */
export function normaliseCode(input: string | null | undefined): string | null {
  const v = (input ?? "").trim().toLowerCase();
  return v ? v : null;
}

/** Why an owner-chosen code is refused, or null when it may be used (uniqueness is the database's). */
export function codeProblem(code: string): CodeProblem | null {
  if (!CUSTOM_CODE_RE.test(code)) return "format";
  if (RESERVED_CODES.has(code)) return "reserved";
  return null;
}

/** A fresh generated code (6 Crockford characters, cryptographic randomness). */
export function generateCode(): string {
  let out = "";
  for (let i = 0; i < GENERATED_LENGTH; i++) out += CROCKFORD[randomInt(CROCKFORD.length)];
  return out;
}

/** Is `code` one a store link could carry (generated or chosen)? The route's cheap pre-check before any read. */
export function isLinkCode(code: string): boolean {
  return code.length >= 3 && code.length <= 16 && /^[a-z0-9-]+$/.test(code);
}
