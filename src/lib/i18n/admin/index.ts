/**
 * Admin internationalisation (docs/STORE-SAAS.md §I.5, D36, D67): the catalogs and `t()`. Isomorphic (server pages
 * call `t`, client components `useT()` from ./client). Catalogs: `en` is the reference, `fr` and `ar` are partials
 * that fall back to it, and a missing key renders as the key itself (never a crash; `test:i18n-coverage`, P2, keeps
 * the R1-complete surfaces complete).
 *
 *   t("error.quota")                                   // "You've reached a limit of your plan."
 *   t("ops.callbacks_due", { count: 3 }, "fr")         // fr: "{count, plural, one {# rappel} other {# rappels}}" → "3 rappels"
 *
 * `MessageKey` lists the catalog's keys for autocomplete and still accepts any string, like `ActionErrorCode` and
 * `AuditAction`: R1.0 tracks have no catalog files of their own yet. P0 narrows it to the strict key union once the
 * per-track files `./<locale>/<track>.ts` are pre-registered here (C0a maintainer decision).
 */
import { messages as ar } from "./ar";
import { messages as en } from "./en";
import { messages as fr } from "./fr";

export const ADMIN_LOCALES = ["en", "fr", "ar"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

export type BaseMessages = { [K in keyof typeof en]: string };
export type BaseMessageKey = keyof typeof en;
export type MessageKey = BaseMessageKey | (string & {});
export type MessageVars = Record<string, string | number>;

const CATALOGS: Record<AdminLocale, Partial<Record<string, string>>> = { en, fr, ar };

export function isAdminLocale(value: unknown): value is AdminLocale {
  return typeof value === "string" && (ADMIN_LOCALES as readonly string[]).includes(value);
}

/** `rtl` for Arabic. */
export function dirOf(locale: AdminLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** The raw template of `key` in `locale` (falling back to English), or undefined when no catalog has it. */
export function messageOf(key: MessageKey, locale: AdminLocale = "en"): string | undefined {
  return CATALOGS[locale][key] ?? CATALOGS.en[key];
}

const pluralRules: Partial<Record<AdminLocale, Intl.PluralRules>> = {};
const rulesFor = (locale: AdminLocale) => (pluralRules[locale] ??= new Intl.PluralRules(locale));

const PLURAL_RE = /\{(\w+),\s*plural,\s*((?:[a-z]+\s*\{[^{}]*\}\s*)+)\}/g;
const FORM_RE = /([a-z]+)\s*\{([^{}]*)\}/g;
const VAR_RE = /\{(\w+)\}/g;

/** ICU-lite: `{var}`, and `{n, plural, zero {…} one {…} … other {…}}` with `#` = the number (Latin digits). */
export function formatMessage(template: string, vars: MessageVars | undefined, locale: AdminLocale): string {
  const withPlurals = template.replace(PLURAL_RE, (_whole, name: string, body: string) => {
    const forms: Record<string, string> = {};
    for (const m of body.matchAll(FORM_RE)) forms[m[1]!] = m[2]!;
    const n = Number(vars?.[name]);
    if (!Number.isFinite(n)) return forms.other ?? "";
    const form = (n === 0 ? forms.zero : undefined) ?? forms[rulesFor(locale).select(n)] ?? forms.other ?? "";
    return form.replace(/#/g, String(n));
  });
  return withPlurals.replace(VAR_RE, (whole, name: string) => (vars && Object.hasOwn(vars, name) ? String(vars[name]) : whole));
}

/** The message of `key` in `locale` with `vars`; the key itself when no catalog has it. */
export function t(key: MessageKey, vars?: MessageVars, locale: AdminLocale = "en"): string {
  const template = messageOf(key, locale);
  return template === undefined ? key : formatMessage(template, vars, locale);
}

/** `t` bound to one locale (server components rendering many strings). */
export function translator(locale: AdminLocale): (key: MessageKey, vars?: MessageVars) => string {
  return (key, vars) => t(key, vars, locale);
}
