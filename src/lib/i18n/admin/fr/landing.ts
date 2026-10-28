/**
 * Admin messages (fr) of the landing file (P3 LANDING, landing.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/landing.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/landing";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- notifications (LAN-§23.6) ---- */
  "notify.delivery.holidays_review.title": "Vérifiez vos jours fériés de {year}",
  "notify.delivery.holidays_review.body": "Les dates de livraison sautent les jours fériés de votre calendrier. Ajoutez ceux de cette année, puis marquez-les vérifiés.",
};
