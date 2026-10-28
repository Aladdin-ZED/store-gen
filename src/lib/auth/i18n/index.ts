/**
 * The identity surfaces' lookup (docs/STORE-SAAS.md §I.5, D36, D65): `/login`, `/signup`, `/invite`, `/reset`, the
 * store picker, `/app/new`, the account pages, the team page (ar / fr / en) and the console's R1.0 screens (en, the
 * others fall back). Isomorphic.
 *
 * Since P0b (CCR P2-15, D67) the keys live in their owners' files, spread by the base catalogs
 * (`src/lib/i18n/admin/{en,fr,ar}.ts`): `auth.*`, `team.*` (+ `notify.invite.*`, `notify.member.*`), `account.*`,
 * `app.*` and `store.security.*` in P2's `<locale>/{auth,team,shell}.ts`, `console.*` and the other `notify.*` keys
 * in P1's `<locale>/{console,notify}.ts`, `error.*` among the core keys. `./{en,fr,ar}.ts` stay as empty headers. The
 * lookup is the skeleton's, unchanged: the reader's locale, then English, then the key itself.
 *
 *   const t = authTranslator(locale);   t("auth.login.title")   t("team.invite.expires", { date })
 */
import { formatMessage, messageOf, type AdminLocale, type MessageKey, type MessageVars } from "@/lib/i18n/admin";

/** Every identity key is a base catalog key since P0b (the owners' files are spread there). */
export type AuthMessageKey = MessageKey;

/** The raw template of `key` in `locale`, falling back to English; undefined when no catalog has it. */
export function authTemplate(key: MessageKey, locale: AdminLocale): string | undefined {
  return messageOf(key, locale);
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
