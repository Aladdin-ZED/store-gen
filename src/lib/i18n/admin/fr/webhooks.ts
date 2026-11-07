/**
 * Admin messages (fr) of the webhooks file (S5 INTEGRATIONS 2, operations.md OPE-§P; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at the R2 contract step (C2-D) and spread by
 * src/lib/i18n/admin/fr.ts; a partial of ../en/webhooks.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/webhooks";

export const messages: Partial<Record<keyof typeof en, string>> = {};
