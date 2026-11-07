/**
 * Admin messages (fr) of the logo file (S2 BRAND & LOGO, design.md DES-§26; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at the R2 contract step (C2-D) and spread by
 * src/lib/i18n/admin/fr.ts; a partial of ../en/logo.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/logo";

export const messages: Partial<Record<keyof typeof en, string>> = {
  // moved from ./design.ts at the R2 contract step (C2-D)
  "logo.trademark": "Nous ne vérifions pas les marques déposées. Assurez-vous que le nom et le logo vous appartiennent.",
  "logo.moreLikeThis": "Plus dans ce style",
  "logo.use": "Utiliser ce logo",
};
