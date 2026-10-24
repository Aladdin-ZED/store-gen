/**
 * The identity surfaces' catalog (docs/STORE-SAAS.md §I.5, D36, D65): `/login`, `/signup`, `/invite`, `/reset`, the
 * store picker, `/app/new`, the account pages, the team page (ar / fr / en) and the console's R1.0 screens (en, the
 * others fall back). Isomorphic.
 *
 * It sits behind the admin i18n skeleton, not beside it: the base catalogs (`src/lib/i18n/admin/{en,fr,ar}.ts`) win
 * whenever they hold a key, so the day the maintainer spreads these files into them (CCR r1.0-t2-9; at P0 they move
 * to P2's `<locale>/{auth,team,onboarding}.ts` and P1's `<locale>/console.ts` without renames) nothing changes on
 * screen. The lookup order is the skeleton's: the reader's locale, then English, then the key itself.
 *
 *   const t = authTranslator(locale);   t("auth.login.title")   t("team.invite.expires", { date })
 */
import { formatMessage, type AdminLocale, type MessageKey, type MessageVars } from "@/lib/i18n/admin";
import { messages as baseAr } from "@/lib/i18n/admin/ar";
import { messages as baseEn } from "@/lib/i18n/admin/en";
import { messages as baseFr } from "@/lib/i18n/admin/fr";
import { messages as ar } from "./ar";
import { messages as en } from "./en";
import { messages as fr } from "./fr";

export type AuthMessageKey = keyof typeof en;

type Catalog = Partial<Record<string, string>>;
const BASE: Record<AdminLocale, Catalog> = { en: baseEn, fr: baseFr, ar: baseAr };
const OWN: Record<AdminLocale, Catalog> = { en, fr, ar };

/** The raw template of `key` in `locale`, falling back to English; undefined when no catalog has it. */
export function authTemplate(key: MessageKey, locale: AdminLocale): string | undefined {
  return BASE[locale][key] ?? OWN[locale][key] ?? BASE.en[key] ?? OWN.en[key];
}

/** The message of `key` (an identity key or any base key) in `locale`; the key itself when no catalog has it. */
export function authT(key: AuthMessageKey | MessageKey, vars?: MessageVars, locale: AdminLocale = "en"): string {
  const template = authTemplate(key, locale);
  return template === undefined ? key : formatMessage(template, vars, locale);
}

/** `authT` bound to one locale (server components rendering many strings). */
export function authTranslator(locale: AdminLocale): (key: AuthMessageKey | MessageKey, vars?: MessageVars) => string {
  return (key, vars) => authT(key, vars, locale);
}

/** Does any catalog hold `key`? (An action code without its `error.<code>` text falls back to the generic one.) */
export function hasAuthMessage(key: string): boolean {
  return authTemplate(key, "en") !== undefined;
}

/** The text of an action refusal: its message key when known, else `error.<code>`, else the generic server error. */
export function refusalText(result: { error: string; message?: string }, locale: AdminLocale): string {
  if (result.message && hasAuthMessage(result.message)) return authT(result.message, undefined, locale);
  const byCode = `error.${result.error}`;
  return authT(hasAuthMessage(byCode) ? byCode : "error.server", undefined, locale);
}
