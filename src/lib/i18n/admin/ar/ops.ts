/**
 * Admin messages (ar) of the ops file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/ops.ts (a missing key falls back to English). The agent-facing texts are in Darija-friendly
 * Arabic (the call-centre floor), as OPE-§N and §6.4 write them.
 */
import type { messages as en } from "../en/ops";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- أسباب الإلغاء (OPE-§6.4) ---- */
  "ops.reason.changed_mind": "بدّل رأيو",
  "ops.reason.price": "الثمن",
  "ops.reason.mistake": "طلب بالغلط",
  "ops.reason.bought_elsewhere": "شرا من بلاصة أخرى",
  "ops.reason.not_ordered": "كيقول ما طلبش",
  "ops.reason.wrong_number": "رقم غالط",
  "ops.reason.out_of_zone": "خارج منطقة التوصيل",
  "ops.reason.delay": "التوصيل طويل بزاف",
  "ops.reason.see_first": "بغا يشوف المنتوج قبل",
  "ops.reason.customer_request": "طلب الإلغاء",
  "ops.reason.other": "سبب آخر",
  "ops.reason.blocked": "رقم محظور",
  "ops.reason.attempts_exhausted": "ما جاوبش من بعد كاع المحاولات",

  /* ---- أسباب الرفض والرجوع (OD50) ---- */
  "ops.reason.return.customer_absent": "الكليان ما كانش",
  "ops.reason.return.refused_price": "رفض الثمن",
  "ops.reason.return.changed_mind": "بدّل رأيو",
  "ops.reason.return.wrong_item": "سلعة غالطة",
  "ops.reason.return.damaged": "مخسّر",
  "ops.reason.return.unreachable": "ما كيجاوبش",
  "ops.reason.return.no_cash": "ما عندو فلوس",
  "ops.reason.return.address_wrong": "العنوان غالط",
  "ops.reason.return.not_ordered": "كيقول ما طلبش",
  "ops.reason.return.other": "سبب آخر",
  "ops.reason.return.none": "بلا سبب",

  /* ---- حالات التوصيل ---- */
  "ops.ship.none": "ما تصيفطاتش",
  "ops.ship.to_pack": "خاصها تتوجّد",
  "ops.ship.packed": "موجّدة",
  "ops.ship.shipped": "تصيفطات",
  "ops.ship.in_transit": "ف الطريق",
  "ops.ship.out_for_delivery": "خارجة للتوصيل",
  "ops.ship.attempt_failed": "المحاولة ما نجحاتش",
  "ops.ship.postponed": "مأجّلة",
  "ops.ship.delivered": "توصلات",
  "ops.ship.refused": "ترفضات",
  "ops.ship.returned": "رجعات",
  "ops.ship.lost": "ضاعت",

  /* ---- الخطر (OPE-§10.2) ---- */
  "ops.risk.check": "خاصو تحقق",
  "ops.risk.high": "خطر مرتفع",
  "ops.risk.calibration": "ف المتجر ديالك، الطلبات بحال هادي خرجو وهميين ولا تلغاو ولا ما تجاوبوش ف {share} ديال الحالات ({n} طلب)",
  "ops.risk.honeypot": "تعمّرات خانة مخبّية ضد الروبوات",
  "ops.risk.too_fast": "تعمّرات الاستمارة ف أقل من 3 ثواني",
  "ops.risk.fast": "تعمّرات الاستمارة بزربة بزاف",
  "ops.risk.no_ua": "تصيفطات من أداة أوتوماتيكية",
  "ops.risk.bot_ua": "تصيفطات من أداة أوتوماتيكية",
  "ops.risk.captcha_missing": "التحقق ضد السبام ناقص",
  "ops.risk.captcha_unverified": "التحقق ضد السبام ما تأكدش",
  "ops.risk.no_origin": "ما تصيفطاتش من صفحة ويب",
  "ops.risk.ip_repeat": "بزاف ديال الطلبات من نفس الشبكة اليوم",
  "ops.risk.history_bad": "هاد الرقم عندو {n} طلبات ما وصلوش",
  "ops.risk.history_bad_nocount": "هاد الرقم عندو طلبات ما وصلوش",
  "ops.risk.page_burst": "طلبات بزاف ف وقت قصير على هاد الصفحة",
  "ops.risk.duplicate": "نفس الرقم طلب من هاد الصفحة ف 12 ساعة اللخرة",
  "ops.risk.returning_customer": "كليان قديم: {n} توصلو",
  "ops.risk.returning_customer_nocount": "كليان قديم",
};
