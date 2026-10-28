/**
 * Admin messages (fr) of the integrations file (P5 INTEGRATIONS, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/integrations.ts (a missing key falls back to English). Every `int.` key exists in fr in R1 (OD58).
 */
import type { messages as en } from "../en/integrations";

export const messages: Partial<Record<keyof typeof en, string>> = {
  "int.wa.confirm":
    "Bonjour {customer_first_name}, ici {store_name}. Nous avons bien reçu votre commande {order_id} : {offer_label}, total {total}.[[ Livraison prévue {eta_text}.]] Répondez OK pour confirmer, ou dites-nous ce qu'il faut changer.",
  "int.wa.missed_call": "Bonjour {customer_first_name}, nous avons essayé de vous appeler pour votre commande {order_id}. Quand pouvons-nous vous rappeler ?",
  "int.wa.address": "Pour livrer votre commande {order_id}, pouvez-vous nous envoyer votre adresse exacte à {city} et un repère proche ?",
  "int.wa.delivery_day": "Votre commande {order_id} est en route[[ et arrive {eta_text}]]. Merci de rester joignable.",
  "int.wa.shipped": "Votre commande {order_id} a été expédiée.[[ Suivi : {tracking_link}]]",
  "int.wa.lead_recovery": "Bonjour {customer_first_name}, vous avez commencé une commande de {offer_label} chez {store_name}. Voulez-vous que nous la finalisions ensemble ?",
  "int.wa.thank_you_confirm": "Bonjour, je confirme ma commande {order_id}.",
  "int.tpl.shipping.paid": "livraison {amount}",
  "int.tpl.shipping.free": "livraison gratuite",
};
