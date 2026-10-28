/**
 * Admin messages (fr) of the notify file (P1 CONSOLE, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/notify.ts (a missing key falls back to English).
 * P0b (CCR P2-15, D67): holds the identity keys moved from src/lib/auth/i18n/fr.ts, without renames and with the
 * same values.
 */
import type { messages as en } from "../en/notify";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- notifications ---- */
  "notify.store.impersonation_started.title": "Le support consulte votre boutique",
  "notify.store.impersonation_started.body": "En lecture seule, pour le motif « {reason} ». Les données des clients étaient masquées.",
  "notify.store.impersonation_ended.title": "Le support a terminé la consultation",
  "notify.store.impersonation_ended.body": "La consultation en lecture seule est terminée.",
  "notify.user.password_reset.title": "Votre mot de passe a été réinitialisé",
  "notify.user.password_reset.body": "Tous vos appareils ont été déconnectés. Connectez-vous avec le nouveau mot de passe.",
  "notify.user.2fa_reset.title": "La validation en deux étapes a été réinitialisée",
  "notify.user.2fa_reset.body": "L'équipe de la plateforme l'a désactivée à votre demande. Réactivez-la dans Sécurité.",
};
