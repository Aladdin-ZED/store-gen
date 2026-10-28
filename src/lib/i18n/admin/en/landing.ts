/**
 * Admin messages (en) of the landing file (P3 LANDING, landing.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 */
export const messages = {
  /* ---- notifications (LAN-§23.6) ---- */
  "notify.delivery.holidays_review.title": "Check your holidays for {year}",
  "notify.delivery.holidays_review.body": "Delivery dates skip the holidays in your calendar. Add this year's dates, then mark them reviewed.",
} as const satisfies Record<string, string>;
