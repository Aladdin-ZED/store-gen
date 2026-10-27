/**
 * French catalog (docs/STORE-SAAS.md §I.5): a partial of the English one, every missing key falls back to `en`.
 * One spread per track file `./fr/<file>.ts` (D67, written at P0).
 */
import { messages as identity } from "@/lib/auth/i18n/fr";
import { messages as aiMessages } from "./fr/ai";
import { messages as authMessages } from "./fr/auth";
import { messages as briefMessages } from "./fr/brief";
import { messages as consoleMessages } from "./fr/console";
import { messages as designMessages } from "./fr/design";
import { messages as financeMessages } from "./fr/finance";
import { messages as healthMessages } from "./fr/health";
import { messages as integrationsMessages } from "./fr/integrations";
import { messages as landingMessages } from "./fr/landing";
import { messages as notifyMessages } from "./fr/notify";
import { messages as onboardingMessages } from "./fr/onboarding";
import { messages as opsMessages } from "./fr/ops";
import { messages as shellMessages } from "./fr/shell";
import { messages as teamMessages } from "./fr/team";
import type { BaseMessages } from "./index";

export const messages: Partial<BaseMessages> = {
  // T2 identity surfaces (CCR r1.0-t2-9 item 1); the core keys below win on a clash
  ...identity,
  // the tracks' files ./fr/<file>.ts (D67; spread here at P0, `scripts/qa/registries-check.ts` proves none is left out):
  // P1 console + notify, P2 shell + auth + onboarding + team + health + brief, P3 landing, P4 ops + finance,
  // P5 integrations, P6 design, P7 ai; each owns the keys under its prefix, and the core keys below win on a clash
  ...consoleMessages,
  ...notifyMessages,
  ...shellMessages,
  ...authMessages,
  ...onboardingMessages,
  ...teamMessages,
  ...healthMessages,
  ...briefMessages,
  ...landingMessages,
  ...opsMessages,
  ...financeMessages,
  ...integrationsMessages,
  ...designMessages,
  ...aiMessages,
  "error.invalid": "Certains champs sont à corriger.",
  "error.not_found": "Cet élément n'existe pas ou n'est plus disponible.",
  "error.forbidden": "Votre rôle ne permet pas cette action.",
  "error.read_only": "Cette boutique est en lecture seule pour le moment.",
  "error.impersonation_read_only": "La vue boutique est en lecture seule.",
  "error.quota": "Vous avez atteint une limite de votre offre.",
  "error.feature_off": "Cette fonction n'est pas disponible pour cette boutique pour le moment.",
  "error.step_up": "Confirmez votre identité pour continuer.",
  "error.busy": "Nous sommes très sollicités. Réessayez dans quelques secondes.",
  "error.job_queued": "Cela prend un moment. Nous vous prévenons dès que c'est prêt.",
  "error.design_blocked": "Le design demande quelques corrections avant la publication.",
  "error.honesty_blocked": "Certaines affirmations de la page doivent être justifiées avant la publication.",
  "error.budget_blocked": "La page est trop longue ou trop lourde pour être publiée.",
  "error.rate_limited": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
  "error.conflict": "Cet élément a été modifié ailleurs. Rechargez puis réessayez.",
  "error.server": "Un problème est survenu de notre côté. Veuillez réessayer.",
  "error.session_ended": "Votre session a expiré. Reconnectez-vous.",
  "error.platform_2fa_required": "Activez la validation en deux étapes pour ouvrir la console.",
  // T1 lifecycle and handle refusals (CCR r1.0-t1-2; mapped in seam.ts actionFailure by T2)
  "error.status_changed": "Cette boutique vient d'être modifiée par quelqu'un d'autre. Vérifiez son état actuel et réessayez.",
  "error.handle_format": "Utilisez 3 à 30 lettres minuscules, chiffres ou tirets, en commençant et en terminant par une lettre ou un chiffre.",
  "error.handle_reserved": "Cette adresse est réservée. Choisissez-en une autre.",
  "error.handle_protected": "Cette adresse contient une marque protégée. Utilisez votre propre marque, ou contactez le support Store Gen si cette marque vous appartient.",
  "error.handle_unavailable": "Cette adresse n'est pas disponible. Choisissez-en une autre.",
  "error.handle_too_soon": "Vous pouvez changer l'adresse de votre boutique une fois tous les 30 jours.",
  // navigation du tableau de bord (CCR r1.0-t4-8)
  "nav.overview": "Vue d'ensemble",
  "nav.orders": "Commandes",
  "nav.pages": "Pages",
  "nav.generate": "Créer une page",
  "nav.media": "Médias",
  "nav.history": "Historique",
  "nav.exports": "Exports",
  "nav.team": "Membres et invitations",
  "nav.sheets": "Google Sheets",
  "nav.pixels": "Pixels",
  "nav.settings": "Paramètres",
  "nav.group.workspace": "Espace de travail",
  "nav.group.sell": "Ventes",
  "nav.group.landing": "Pages de vente",
  "nav.group.catalog": "Catalogue",
  "nav.group.library": "Bibliothèque",
  "nav.group.team": "Équipe",
  "nav.group.connect": "Connexions",
  "nav.group.money": "Finances",
  "nav.group.settings": "Paramètres",
};
