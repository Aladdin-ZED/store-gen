/**
 * Admin messages (en) of the notify file (P1 CONSOLE, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 * P0b (CCR P2-15, D67): holds the identity keys moved from src/lib/auth/i18n/en.ts, without renames and with the
 * same values.
 */
export const messages = {
  /* ---- notifications T2 sends (PLA-§18.2; P1 owns the kinds from P0) ---- */
  "notify.store.impersonation_started.title": "Support is viewing your store",
  "notify.store.impersonation_started.body": "Read-only, for the reason \"{reason}\". Customer details were hidden.",
  "notify.store.impersonation_ended.title": "Support finished viewing your store",
  "notify.store.impersonation_ended.body": "The read-only view has ended.",
  "notify.user.password_reset.title": "Your password was reset",
  "notify.user.password_reset.body": "All your devices were signed out. Sign in with the new password.",
  "notify.user.2fa_reset.title": "Two-step verification was reset",
  "notify.user.2fa_reset.body": "The platform team turned it off at your request. Turn it back on in Security.",
} as const satisfies Record<string, string>;
