/**
 * Admin messages (fr) of the finance file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/finance.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/finance";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- notifications (OPE-§21.4) ---- */
  "notify.fin.profit_alert.title": "Alerte rentabilité : {alertKind}",
  "notify.fin.profit_alert.body": "Un chiffre a franchi votre seuil : {value} contre {threshold} (n = {n}). Ouvrez Rentabilité pour le détail.",

  /* ---- alerts ---- */
  "fin.alert.cpa_over_breakeven": "Coût par commande au-dessus de votre seuil depuis 2 jours : {value} pour un seuil de {threshold}.",
  "fin.alert.refusal_spike": "Les refus augmentent : {value} % sur 7 jours contre {threshold} % sur 28 jours (n = {n}).",
  "fin.alert.city_refusal": "{city} refuse plus que vos autres villes : {value} % contre {threshold} % (n = {n}).",
  "fin.alert.city_refusal.reasons": "{count} refus sur {total} : {reason}",
  "fin.alert.city_refusal.fix": "Marquer la ville comme non desservie ou augmenter ses frais",

  /* ---- what is missing ---- */
  "fin.missing.title": "Ajoutez vos coûts pour voir la rentabilité",
  "fin.missing.item_costs": "Le coût unitaire de chaque produit vendu",
  "fin.missing.packaging": "Votre coût d'emballage par commande",
  "fin.missing.delivery_fee": "Les frais de livraison de votre transporteur",
  "fin.missing.return_fee": "Les frais de retour de votre transporteur",
  "fin.missing.confirm_n": "{n} commandes décidées pour l'instant : le taux de confirmation en demande 30",
  "fin.missing.delivery_n": "{n} livraisons terminées pour l'instant : le taux de livraison en demande 30",

  /* ---- break-even card ---- */
  "fin.be.headline": "Vous pouvez payer jusqu'à {placed} par commande passée ({delivered} par commande livrée).",
  "fin.be.paid": "Ces 28 derniers jours, vous avez payé {cpa} par commande passée.",
  "fin.be.interval": "Probablement entre {low} et {high}",
  "fin.be.rateN": "{rate} % sur {n} commandes",
  "fin.be.noSpend": "Saisissez vos dépenses pub pour les comparer à votre seuil.",
  "fin.be.converted": "Dépenses converties à votre taux 1 {currency} = {rate} {storeCurrency} (depuis le {day})",
  "fin.be.daysNotCounted": "{n, plural, one {# jour non compté : il lui faut un taux} other {# jours non comptés : il leur faut un taux}}",
  "fin.be.outcomesAsOf": "Résultats de livraison à la dernière synchronisation, {time}",
  "fin.be.byAngle": "Par angle",
  "fin.be.byAngle.note": "Les dépenses ne sont pas encore réparties par angle : aucun coût par commande n'est affiché ici.",
  "fin.be.suppressed": "{n, plural, one {# petit groupe masqué (moins de 5 commandes)} other {# petits groupes masqués (moins de 5 commandes)}}",

  /* ---- costs ---- */
  "fin.costs.bySku": "Coûts par SKU",
  "fin.costs.fromSku": "Depuis le SKU {sku}, {cost}",
  "fin.costs.packaging": "Emballage par commande",
  "fin.costs.notSet": "Non renseigné",
  "fin.carrier.title": "Mon transporteur",
  "fin.carrier.default": "Toutes les autres villes",
  "fin.carrier.feeCharged": "Frais facturés",
  "fin.carrier.feePaid": "Frais payés",
  "fin.carrier.codFee": "{bp} % du montant encaissé, minimum {min}, plus {flat} par colis",
  "fin.settlement.question": "Qui garde l'argent après la livraison ?",
  "fin.settlement.at_delivery": "Je livre moi-même, ou mon livreur me remet l'argent",
  "fin.settlement.statement": "Un transporteur me paie plus tard sur relevé",
  "fin.cash.marked": "{n, plural, one {# commande marquée argent reçu} other {# commandes marquées argent reçu}}",

  /* ---- ad spend ---- */
  "fin.ads.billedIn": "Facturé en {currency}",
  "fin.ads.needsRate": "Taux manquant",
  "fin.ads.rateEstimate": "Votre taux, estimation",
  "fin.ads.rateLine": "1 {currency} = {rate} {storeCurrency} depuis le {day}",

  /* ---- errors ---- */
  "fin.error.feature_off": "La rentabilité n'est pas encore disponible pour cette boutique.",
  "fin.error.invalid": "Vérifiez le montant et réessayez.",
  "fin.error.not_found": "Cette page ou ce produit n'est plus en ligne.",

  /* ---- Store Health ---- */
  "health.ops.fin_costs_missing.text": "{n, plural, one {# produit vendu n'a pas encore de coût} other {# produits vendus n'ont pas encore de coût}} : la rentabilité de leurs commandes ne peut pas s'afficher.",
  "health.ops.fin_costs_missing.fix": "Ajouter les coûts",
  "health.ops.fin_settlement_check.text": "{n} commandes ont été livrées et vous n'avez pas indiqué qui garde l'argent après la livraison.",
  "health.ops.fin_settlement_check.fix": "Répondre dans Mon transporteur",
  "health.ops.fin_fee_gap.text": "{n, plural, one {# de vos principales villes paie} other {# de vos principales villes paient}} moins que ce que vous coûte le transporteur (jusqu'à {baseline} par commande).",
  "health.ops.fin_fee_gap.fix": "Comparer les frais",
  "health.ops.fin_ad_rate_missing.text": "{n, plural, one {# jour de dépenses pub dans une autre devise n'a pas de taux et n'est pas compté} other {# jours de dépenses pub dans une autre devise n'ont pas de taux et ne sont pas comptés}} dans votre coût par commande.",
  "health.ops.fin_ad_rate_missing.fix": "Ajouter un taux",
};
