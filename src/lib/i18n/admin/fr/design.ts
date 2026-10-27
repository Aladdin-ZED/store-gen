/**
 * Admin messages (fr) of the design file (P6 DESIGN, design.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/design.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/design";

export const messages: Partial<Record<keyof typeof en, string>> = {
  "design.reveal.use": "Utiliser ce design",
  "design.reveal.analysing": "Lecture de vos photos",
  "design.reveal.error": "Les designs n’ont pas pu être préparés.",
  "design.reveal.retry": "Réessayer",
};
