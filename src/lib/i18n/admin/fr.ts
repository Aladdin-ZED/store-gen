/**
 * French catalog (docs/STORE-SAAS.md §I.5): a partial of the English one, every missing key falls back to `en`.
 * One spread per track file `./fr/<file>.ts` (D67, written at P0).
 */
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
  // les codes d'action de l'identité de T2 (D65 ; déplacés de src/lib/auth/i18n/fr.ts au P0b, CCR P2-15)
  "error.challenge": "Validez la vérification anti-robot, puis réessayez.",
  "error.totp_required": "Utilisez le code de votre application d'authentification.",
  "error.last_owner": "Une boutique a besoin d'au moins un propriétaire. Nommez d'abord un autre propriétaire.",
  "error.owns_store": "Vous êtes encore propriétaire d'une boutique. Fermez-la ou transférez-la d'abord.",
  "error.is_staff": "C'est un compte de l'équipe. Retirez d'abord son rôle.",
  "error.member_2fa_required": "Cette boutique exige la validation en deux étapes. Activez-la pour continuer.",
  "error.platform_read_only": "Les modifications sont suspendues pour maintenance. Réessayez sous peu.",
  "error.closed": "C'est fermé pour le moment. Réessayez un peu plus tard.",
  "error.impersonation_member": "Vous êtes membre de cette boutique. Ouvrez-la depuis vos boutiques.",
  "error.impersonation_state": "Cette boutique ne peut pas être consultée dans son état actuel.",
  // T1 lifecycle and handle refusals (CCR r1.0-t1-2; mapped in seam.ts actionFailure by T2)
  "error.status_changed": "Cette boutique vient d'être modifiée par quelqu'un d'autre. Vérifiez son état actuel et réessayez.",
  "error.handle_format": "Utilisez 3 à 30 lettres minuscules, chiffres ou tirets, en commençant et en terminant par une lettre ou un chiffre.",
  "error.handle_reserved": "Cette adresse est réservée. Choisissez-en une autre.",
  "error.handle_protected": "Cette adresse contient une marque protégée. Utilisez votre propre marque, ou contactez le support Store Gen si cette marque vous appartient.",
  "error.handle_unavailable": "Cette adresse n'est pas disponible. Choisissez-en une autre.",
  "error.handle_too_soon": "Vous pouvez changer l'adresse de votre boutique une fois tous les 30 jours.",
  // P4 CALL CENTER's action codes (CCRs r1-p4-6, r1-p4-9 item 5; texts as in ops.error.<code>)
  "error.blocked": "Ce numéro est bloqué dans votre boutique",
  "error.duplicate": "Ce client a déjà une commande ouverte. Vérifiez-la, ou créez quand même celle-ci.",
  "error.locked": "Cette commande est chez le transporteur. Seuls l'adresse, le repère et la note peuvent encore changer.",
  "error.bad_hold": "Choisissez une date dans les 60 prochains jours, sur une commande confirmée pas encore partie.",
  "error.bad_adjust": "Une remise ne peut pas dépasser le sous-total de la commande.",
  "error.reason_required": "Indiquez la raison, en 3 caractères au moins.",
  "error.already_converted": "Ce prospect est déjà une commande.",
  "error.illegal": "Ce changement n'est pas possible depuis l'état actuel de la commande.",
  "error.bad_due": "Choisissez une heure de rappel dans au moins 5 minutes et dans les 30 jours.",
  "error.bad_duplicate": "Choisissez une autre commande ouverte du même client.",
  "error.held": "Un autre agent a cette commande en ce moment.",
  "error.not_callable": "Cette commande ne peut pas être prise depuis la file maintenant.",
  "error.too_short": "Saisissez au moins 8 chiffres du numéro",
  // les éléments du contrôle de budget (cœur §M.2 ; src/lib/render/prepublish/budget.ts)
  "budget.F5.weight": "Poids de la page {kb} Ko compressé · limite {limit} Ko",
  "budget.F5.pictures": "{count} images sur la page · limite {limit}",
  "budget.F5.fonts": "{families} familles de polices en {files} fichiers · limite 2 familles et 4 fichiers",
  "budget.C3.sections": "{count} sections sur la page · limite {limit}",
  "budget.C3.height": "Hauteur estimée de la page {px} px sur mobile · limite {limit} px",
  "budget.F1.missing": "La page n'a pas de formulaire de commande",
  "budget.F1.position": "Le formulaire de commande commence vers {px} px sur mobile (estimation) · limite {limit} px",
  "budget.C2.image": "La photo du produit commence vers {px} px (estimation) · elle doit apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.C2.price": "Le prix commence vers {px} px (estimation) · il doit apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.C2.cta": "Le bouton de commande commence vers {px} px (estimation) · il doit apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.C2.cod": "La mention paiement à la livraison commence vers {px} px (estimation) · elle doit apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.C2.name": "Le nom du produit commence vers {px} px (estimation) · il doit apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.C2.identity": "Le nom ou le logo de la boutique commence vers {px} px (estimation) · il doit apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.C2.collections": "Les collections commencent vers {px} px (estimation) · elles doivent apparaître dans les {limit} premiers px de l'écran mobile",
  "budget.R1.ctas": "{count} boutons de commande sur la page · limite {limit}",
  "budget.R4.glass": "{count} surfaces en verre dépoli · limite {limit}",
  "budget.R5.reveals": "{count} éléments animés · limite {limit}",
  "budget.K2.moments": "{count} bandes de couleur pleine largeur · limite {limit}",
  "budget.I1.reuse": "Une même photo apparaît {count} fois · limite {limit}",
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
