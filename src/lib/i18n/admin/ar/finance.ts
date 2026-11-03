/**
 * Admin messages (ar) of the finance file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/finance.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/finance";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- notifications (OPE-§21.4) ---- */
  "notify.fin.profit_alert.title": "تنبيه الربح: {alertKind}",
  "notify.fin.profit_alert.body": "شي رقم فات الحد ديالك: {value} مقابل {threshold} (n = {n}). حل الربح باش تشوف التفاصيل.",
};
