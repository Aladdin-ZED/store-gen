/**
 * French catalog (docs/STORE-SAAS.md §I.5): a partial of the English one, every missing key falls back to `en`.
 * From P0, one spread per track file `./fr/<track>.ts`.
 */
import type { BaseMessages } from "./index";

export const messages: Partial<BaseMessages> = {
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
};
