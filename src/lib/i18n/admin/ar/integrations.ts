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
  // OPE-§21.4 notifications (tenant-facing: ar in R1)
  "notify.int.sheets_failing.title": "مزامنة Google Sheets لا تعمل",
  "notify.int.sheets_failing.body":
    "لم تعد الطلبات الجديدة تصل إلى ورقتك منذ {sinceMinutes, plural, zero {أقل من دقيقة} one {دقيقة} two {دقيقتين} few {# دقائق} other {# دقيقة}}.{backlog, plural, zero {} other { الطلبات المنتظرة: #.}} افتح صفحة التكاملات لمعرفة ما يجب التحقق منه.",
  "notify.int.capi_failing.title": "أحداث الخادم لا تعمل",
  "notify.int.capi_failing.body": "لم يرسل أحد البكسلات أحداث الخادم منذ {sinceMinutes, plural, zero {أقل من دقيقة} one {دقيقة} two {دقيقتين} few {# دقائق} other {# دقيقة}}. افتح صفحة التكاملات لمعرفة ما يجب التحقق منه.",
  "notify.int.telegram_failing.title": "رسائل Telegram لا تصل",
  "notify.int.telegram_failing.body": "لم تعد رسائل الطلبات تصل إلى محادثتك على Telegram. افتح صفحة التكاملات لمعرفة ما يجب التحقق منه.",
  "notify.int.delivery_dead.title": "فشلت بعض الإرسالات نهائيًا",
  "notify.int.delivery_dead.body": "عدد الإرسالات التي لن تُعاد محاولتها: {count}. أصلح السبب ثم أعد إرسالها من صفحة التكاملات.",
  // OPE-§27.2 Store Health (tenant-facing: ar in R1)
  "health.integrations.sheets_backlog.text": "أقدم طلب ينتظر الوصول إلى ورقة Google منذ {value} دقيقة (الطلبات المنتظرة: {n}).",
  "health.integrations.capi_failing.text": "عدد البكسلات التي لم ترسل أي حدث خادم بنجاح خلال آخر 24 ساعة: {value}.",
  "health.integrations.telegram_failing.text": "رسائل الطلبات على Telegram تفشل (محاولات فاشلة متتالية: {value}).",
  "health.integrations.delivery_dead.text": "عدد الإرسالات التي فشلت نهائيًا: {value}. أعد إرسالها بعد إصلاح السبب.",
  "health.integrations.turnstile.text": "لم تتمكن الحماية من الروبوتات من التحقق من {value}% من طلبات يوم واحد (عدد الطلبات: {n}).",
  "health.integrations.trigger_hint.text":
    "تؤكد {value}% من الطلبات المعالَجة عبر الهاتف (عدد الطلبات: {n})، لكن حدث Purchase يُرسل عند تسجيل الطلب. إرساله عند التأكيد يحتسب الطلبات المؤكدة فقط.",
  "health.integrations.fix.sheets": "افتح Google Sheets",
  "health.integrations.fix.pixels": "افتح أحداث الخادم",
  "health.integrations.fix.telegram": "افتح Telegram",
  "health.integrations.fix.deliveries": "افتح الإرسالات",
  "health.integrations.fix.antispam": "افتح الحماية من الرسائل المزعجة",
  "health.integrations.fix.trigger": "راجع توقيت حدث Purchase",
  // OPE-§19.3: the one refusal of a spreadsheet another store holds (tenant-facing: ar in R1)
  "int.sheets.refused": "لا يمكن ربط هذه الورقة. أنشئ ورقة Google جديدة لهذا المتجر.",
};
