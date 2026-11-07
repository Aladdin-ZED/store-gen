/**
 * E-mail and transactional tokens (design.md DES-§18, DG-14; R2). Track S2 BRAND & LOGO owns this file in R2: inline
 * styles only, no CSS variables, table layout, 600 px; brand colours on a forced light base, every pair ≥ 4.5:1 (an
 * accent that fails as a button ground becomes a hairline + ink button); Latin and Arabic web-safe stacks with the
 * brand family first; the logo = the `primary-png` export or a PNG rendition of the uploaded logo (DES-R14), absolute
 * platform media URL. The contract step (C2-C) froze the API other tracks build against:
 *   - S5 INTEGRATIONS 2: the Mailer's HTML bodies (`emailHtml(emailTokens(scope, locale), renderMail(…))`, adoptable
 *     after S2 merges; R2 mail stays text/plain until then);
 *   - S4 LOGISTICS: the packing slip and picking list (`slipTokens`: ink only, mono logo, grayscale-safe).
 * Stubs until S2 merges: throw `NotBuiltYet("S2", …)`. No R1 path calls them.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { Locale } from "@/lib/page/schema";
import type { StoreScope } from "@/lib/tenancy/types";
import type { Hex } from "@/lib/theme/color";

export interface EmailTokens {
  width: 600;
  dir: "ltr" | "rtl";
  bg: Hex;
  card: Hex;
  ink: Hex;
  inkSoft: Hex;
  line: Hex;
  accent: Hex;
  accentInk: Hex;
  button: { bg: Hex; ink: Hex; radius: 8 | 12 };
  font: string;
  fontAr: string;
  logo: { url: string; width: number; height: number; alt: string } | null;
}

export type EmailRole = "body" | "card" | "title" | "text" | "muted" | "button" | "link" | "rule" | "footer";

/** Optional parts of an e-mail body (S2 may add optional fields through a CCR). */
export interface EmailHtmlOptions {
  /** hidden preview text shown by mail clients after the subject */
  preheader?: string;
}

/** Print tokens of the packing slip / picking list (ink only, mono logo; DES-§18 consumers). */
export interface SlipTokens {
  dir: "ltr" | "rtl";
  ink: Hex;
  inkSoft: Hex;
  line: Hex;
  font: string;
  fontAr: string;
  /** the mono logo, or null */
  logo: { url: string; width: number; height: number; alt: string } | null;
}

/** The store's e-mail tokens from the brand setting / the active store theme. S2 (stub: NotBuiltYet). */
export async function emailTokens(scope: StoreScope, locale: Locale): Promise<EmailTokens> {
  void scope;
  void locale;
  return notBuiltYet("S2", "emailTokens");
}

/** The inline `style` value of one role, e.g. "background:#…;color:#…;…". S2 (stub: NotBuiltYet). */
export function inlineStyle(role: EmailRole, t: EmailTokens): string {
  void role;
  void t;
  return notBuiltYet("S2", "inlineStyle");
}

/** The full HTML body of a rendered mail (HTML-escaped text, `dir` from the tokens, no `<style>`, no `var(`). S2 (stub: NotBuiltYet). */
export function emailHtml(t: EmailTokens, mail: { subject: string; text: string; cta?: { label: string; href: string } }, opts?: EmailHtmlOptions): string {
  void t;
  void mail;
  void opts;
  return notBuiltYet("S2", "emailHtml");
}

/** The slip / picking-list tokens derived from the e-mail tokens. S2 (stub: NotBuiltYet). */
export function slipTokens(t: EmailTokens): SlipTokens {
  void t;
  return notBuiltYet("S2", "slipTokens");
}
