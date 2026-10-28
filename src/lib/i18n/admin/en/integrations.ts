/**
 * Admin messages (en) of the integrations file (P5 INTEGRATIONS, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 *
 * `int.wa.<kind>` are template sources of the template language (src/lib/integrations/template-lang.ts: `{var}`,
 * `[[ optional ]]`), the built-in WhatsApp texts of OPE-§22.2; read raw by src/lib/integrations/whatsapp/builtins.ts,
 * never through t(). `int.tpl.*` are the words of template variables (OPE-§7.1); `{amount}` is filled by the caller.
 */
export const messages = {
  // OPE-§22.2 built-in WhatsApp templates (shopper-facing: ar, fr and en in R1, OD34)
  "int.wa.confirm":
    "Hello {customer_first_name}, this is {store_name}. We received your order {order_id}: {offer_label}, total {total}.[[ Delivery is planned {eta_text}.]] Reply OK to confirm, or tell us what to change.",
  "int.wa.missed_call": "Hello {customer_first_name}, we tried to call you about your order {order_id}. When can we call you back?",
  "int.wa.address": "To deliver your order {order_id}, could you send us your exact address in {city} and a landmark nearby?",
  "int.wa.delivery_day": "Your order {order_id} is on its way[[ and arrives {eta_text}]]. Please stay reachable.",
  "int.wa.shipped": "Your order {order_id} has shipped.[[ Tracking: {tracking_link}]]",
  "int.wa.lead_recovery": "Hello {customer_first_name}, you started an order for {offer_label} at {store_name}. Shall we finish it together?",
  "int.wa.thank_you_confirm": "Hello, I confirm my order {order_id}.",
  // OPE-§7.1 `shipping_text`
  "int.tpl.shipping.paid": "delivery {amount}",
  "int.tpl.shipping.free": "free delivery",
} as const satisfies Record<string, string>;
