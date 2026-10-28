/**
 * Admin messages (fr) of the ops file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/ops.ts (a missing key falls back to English). Every `ops.` key ships in French in R1 (OD58).
 */
import type { messages as en } from "../en/ops";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- motifs d'annulation (OPE-§6.4) ---- */
  "ops.reason.changed_mind": "A changé d'avis",
  "ops.reason.price": "Prix",
  "ops.reason.mistake": "Commande par erreur",
  "ops.reason.bought_elsewhere": "Acheté ailleurs",
  "ops.reason.not_ordered": "Dit ne pas avoir commandé",
  "ops.reason.wrong_number": "Mauvais numéro",
  "ops.reason.out_of_zone": "Hors zone de livraison",
  "ops.reason.delay": "Délai trop long",
  "ops.reason.see_first": "Veut voir le produit avant",
  "ops.reason.customer_request": "A demandé l'annulation",
  "ops.reason.other": "Autre",
  "ops.reason.blocked": "Numéro bloqué",
  "ops.reason.attempts_exhausted": "Injoignable après toutes les tentatives",

  /* ---- motifs de refus et de retour (OD50) ---- */
  "ops.reason.return.customer_absent": "Client absent",
  "ops.reason.return.refused_price": "Prix refusé",
  "ops.reason.return.changed_mind": "A changé d'avis",
  "ops.reason.return.wrong_item": "Mauvais article",
  "ops.reason.return.damaged": "Endommagé",
  "ops.reason.return.unreachable": "Injoignable",
  "ops.reason.return.no_cash": "Pas d'argent",
  "ops.reason.return.address_wrong": "Mauvaise adresse",
  "ops.reason.return.not_ordered": "Dit ne pas avoir commandé",
  "ops.reason.return.other": "Autre",
  "ops.reason.return.none": "Sans motif",

  /* ---- états de livraison ---- */
  "ops.ship.none": "Non expédiée",
  "ops.ship.to_pack": "À préparer",
  "ops.ship.packed": "Emballée",
  "ops.ship.shipped": "Expédiée",
  "ops.ship.in_transit": "En transit",
  "ops.ship.out_for_delivery": "En cours de livraison",
  "ops.ship.attempt_failed": "Tentative échouée",
  "ops.ship.postponed": "Reportée",
  "ops.ship.delivered": "Livrée",
  "ops.ship.refused": "Refusée",
  "ops.ship.returned": "Retournée",
  "ops.ship.lost": "Perdue",

  /* ---- risque (OPE-§10.2) ---- */
  "ops.risk.check": "À vérifier",
  "ops.risk.high": "Risque élevé",
  "ops.risk.calibration": "Dans votre boutique, les commandes comme celle-ci ont fini fausses, annulées ou injoignables dans {share} des cas ({n} commandes)",
  "ops.risk.honeypot": "Un champ anti-robot caché a été rempli",
  "ops.risk.too_fast": "Formulaire rempli en moins de 3 secondes",
  "ops.risk.fast": "Formulaire rempli très vite",
  "ops.risk.no_ua": "Envoyée par un outil automatique",
  "ops.risk.bot_ua": "Envoyée par un outil automatique",
  "ops.risk.captcha_missing": "Vérification anti-spam absente",
  "ops.risk.captcha_unverified": "Vérification anti-spam non confirmée",
  "ops.risk.no_origin": "Pas envoyée depuis une page web",
  "ops.risk.ip_repeat": "Plusieurs commandes du même réseau aujourd'hui",
  "ops.risk.history_bad": "Ce numéro a eu {n, plural, one {# commande non aboutie} other {# commandes non abouties}}",
  "ops.risk.history_bad_nocount": "Ce numéro a eu des commandes non abouties",
  "ops.risk.page_burst": "Afflux inhabituel de commandes sur cette page",
  "ops.risk.duplicate": "Même numéro sur cette page dans les 12 dernières heures",
  "ops.risk.returning_customer": "Client fidèle : {n} livrées",
  "ops.risk.returning_customer_nocount": "Client fidèle",
};
