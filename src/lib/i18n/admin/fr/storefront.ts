/**
 * Admin messages (fr) of the storefront file (S1 STOREFRONT, storefront.md STO-§27.2; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at the R2 contract step (C2-D) and spread by
 * src/lib/i18n/admin/fr.ts; a partial of ../en/storefront.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/storefront";

export const messages: Partial<Record<keyof typeof en, string>> = {};
