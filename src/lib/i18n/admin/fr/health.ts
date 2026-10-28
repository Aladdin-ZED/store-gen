/**
 * Admin messages (fr) of the health file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts.
 * R1-complete (PLA-§N.1): typed against every key of ../en/health.ts, so a missing text fails tsc before
 * test:i18n-coverage.
 */
import type { messages as en } from "../en/health";

export const messages: { [K in keyof typeof en]: string } = {
  "health.title": "Santé de la boutique",
  "health.score": "{score} sur 100",
  "health.computing": "Votre premier bilan arrive dans les 5 minutes.",
  "health.recomputing": "Recalcul en cours. Prêt dans les 5 minutes.",
  "health.recompute": "Recalculer maintenant",
  "health.checked_at": "Vérifié à {time}",
  "health.stale": "Ce bilan est plus ancien que d'habitude. Recalculez-le pour voir le plus récent.",
  "health.score_later": "{count, plural, one {Le score apparaît après votre première commande.} other {Le score apparaît après # commandes.}}",
  "health.all_good": "Rien à corriger pour l'instant. Vérifié à {time} ; un nouveau bilan suit chaque modification.",
  "health.celebrate": "Votre boutique est en pleine forme.",
  "health.error": "Le bilan de santé n'a pas pu se charger. Le reste du tableau de bord fonctionne.",
  "health.retry": "Réessayer",
  "health.severity.3": "À corriger maintenant",
  "health.severity.2": "À corriger",
  "health.severity.1": "Suggestion",
  "health.group.setup": "Configuration",
  "health.group.trust": "Confiance",
  "health.group.design": "Design",
  "health.group.conversion": "Conversion",
  "health.group.operations": "Opérations",
  "health.group.integrations": "Intégrations",
  "health.group.quota": "Limites de la formule",
  "health.group.lost": "{lost} points sur {cap} à regagner",
  "health.after_approval": "Après validation",
  "health.issues": "À corriger",
  "health.snooze": "Mettre en pause 7 jours",
  "health.snoozed": "En pause pour 7 jours.",
  "health.snoozed_count": "{count, plural, one {# en pause} other {# en pause}}",
  "health.snoozed_until": "En pause jusqu'au {date}",
  "health.unsnooze": "Réactiver",
  "health.evidence.n": "n = {n}",
  "health.evidence.window": "{days, plural, one {dernier jour} other {# derniers jours}}",
};
