/**
 * Admin messages (fr) of the brief file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts.
 * R1-complete (PLA-§N.1): typed against every key of ../en/brief.ts.
 */
import type { messages as en } from "../en/brief";

export const messages: { [K in keyof typeof en]: string } = {
  "brief.title": "Aujourd'hui",
  "brief.orders": "{confirmed, plural, one {# commande confirmée aujourd'hui} other {# commandes confirmées aujourd'hui}} · {callbacks, plural, one {# rappel à faire} other {# rappels à faire}}",
  "brief.confirmed": "{count, plural, one {# commande confirmée aujourd'hui} other {# commandes confirmées aujourd'hui}}",
  "brief.callbacks": "{count, plural, one {# rappel à faire} other {# rappels à faire}}",
  "brief.queue": "{count, plural, one {# commande en attente dans la file} other {# commandes en attente dans la file}}",
  "brief.health": "À corriger en premier : {issue}",
  "brief.opportunity": "{a} livré à {rateA} % contre {rateB} % pour {b} (n = {n})",
  "brief.empty": "Pas encore de commandes. Publiez une page pour commencer.",
  "brief.open": "Ouvrir",
};
