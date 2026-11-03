/**
 * Admin messages (en) of the finance file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 */
export const messages = {
  /* ---- notifications (OPE-§21.4) ---- */
  "notify.fin.profit_alert.title": "Profit alert: {alertKind}",
  "notify.fin.profit_alert.body": "A figure crossed your threshold: {value} against {threshold} (n = {n}). Open Profit to see the detail.",
} as const satisfies Record<string, string>;
