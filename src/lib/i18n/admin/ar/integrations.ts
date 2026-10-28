/**
 * Admin messages (ar) of the integrations file (P5 INTEGRATIONS, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/integrations.ts (a missing key falls back to English). The shopper-facing texts are Darija
 * (OPE-§22.2, OD34); the manager screens' Arabic is R3 (OD58).
 */
import type { messages as en } from "../en/integrations";

export const messages: Partial<Record<keyof typeof en, string>> = {
  "int.wa.confirm":
    "السلام {customer_first_name}، معاك {store_name}. توصلنا بالطلب ديالك {order_id}: {offer_label}، المجموع {total}.[[ التوصيل متوقع {eta_text}.]] جاوبنا ب OK باش نأكدو، ولا قول لينا شنو نبدلو.",
  "int.wa.missed_call": "السلام {customer_first_name}، عيطنا ليك على قبل الطلب ديالك {order_id}. إمتى نقدرو نعاودو نعيطو ليك؟",
  "int.wa.address": "باش نوصلو ليك الطلب {order_id}، صيفط لينا العنوان بالضبط ف {city} وشي علامة قريبة.",
  "int.wa.delivery_day": "الطلب ديالك {order_id} خرج[[ وغادي يوصل {eta_text}]]. خليك متوفر ف التيليفون عافاك.",
  "int.wa.shipped": "الطلب ديالك {order_id} تصيفط.[[ التتبع: {tracking_link}]]",
  "int.wa.lead_recovery": "السلام {customer_first_name}، بديتي طلب ديال {offer_label} عند {store_name}. بغيتي نكملوه مع بعض؟",
  "int.wa.thank_you_confirm": "السلام، كنأكد الطلب ديالي {order_id}.",
  "int.tpl.shipping.paid": "التوصيل {amount}",
  "int.tpl.shipping.free": "التوصيل فابور",
};
