/**
 * Admin messages (ar) of the console file (P1 CONSOLE, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/console.ts (a missing key falls back to English). The console reads English in R1 (PD9); the
 * R1 risk and reason labels are written in all three locales already, with the English placeholders (counts are
 * phrased as "label: n" so no Arabic plural form is needed).
 */
import type { messages as en } from "../en/console";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- store status reasons (PLA-§8.2) ---- */
  "console.reason.fake_orders": "طلبات وهمية",
  "console.reason.customer_complaints": "شكايات الزبناء",
  "console.reason.policy_review": "مراجعة القواعد",
  "console.reason.brand_complaint": "شكاية من علامة تجارية",
  "console.reason.other": "سبب آخر",
  "console.reason.scam_suspected": "اشتباه في احتيال",
  "console.reason.phishing": "تصيّد احتيالي",
  "console.reason.prohibited_goods": "منتجات ممنوعة",
  "console.reason.counterfeit": "منتجات مقلّدة",
  "console.reason.legal_request": "طلب قانوني",
  "console.reason.security_incident": "حادث أمني",
  "console.reason.owner_banned": "المالك محظور",
  "console.reason.issue_resolved": "تمّ حلّ المشكل",
  "console.reason.appeal_accepted": "قُبل الطعن",
  "console.reason.mistake": "طُبّق بالخطأ",
  "console.reason.owner_request": "بطلب من المالك",
  "console.reason.abandoned": "متجر مهجور",
  "console.reason.terms_violation": "مخالفة الشروط",
  "console.reason.retention": "انتهت مدة الاحتفاظ",
  "console.reason.owner_request_urgent": "طلب مستعجل من المالك",
  "console.reason.abuse": "إساءة الاستعمال",
  "console.reason.approved": "مقبول",
  "console.reason.rejected": "مرفوض",
  "console.reason.appeal": "طعن",
  "console.reason.console_created": "أُنشئ من لوحة الإدارة",
  "console.reason.owner_closed": "أغلقه المالك",
  "console.reason.expired": "انتهت صلاحيته",

  /* ---- signup risk flags (PLA-§3.4.1) ---- */
  "console.risk.disposable_email": "نطاق بريد مؤقت {domain}",
  "console.risk.null_mx": "{domain} يرفض كل الرسائل (سجل MX فارغ)",
  "console.risk.no_mx": "{domain} بلا خادم بريد",
  "console.risk.mx_unknown": "لم يُجب فحص خادم البريد في الوقت المحدد",
  "console.risk.brand_exact": "يستعمل الاسم المحمي «{term}» في {field}",
  "console.risk.brand_near": "يتضمن العبارة المحمية «{term}» في {field}",
  "console.risk.offensive_term": "كلمة مسيئة في {field}",
  "console.risk.dup_email_norm": "حسابات أخرى بنفس البريد: {users}",
  "console.risk.dup_phone": "حسابات أخرى بنفس رقم الهاتف: {users}",
  "console.risk.dup_network": "حسابات أخرى من نفس الشبكة خلال 24 ساعة: {users}",
  "console.risk.dup_device": "حسابات أخرى على نفس الجهاز: {users}",
  "console.risk.linked_banned": "حسابات محظورة مرتبطة به: {banned}",
  "console.risk.velocity_network": "3 تسجيلات من نفس الشبكة اليوم",
  "console.risk.turnstile_missing": "لا يوجد رمز التحقق البشري",
  "console.risk.turnstile_unverified": "فشل التحقق البشري",
  "console.risk.too_fast": "مُلئت الاستمارة في {ms} ملّي ثانية، أسرع من كتابة إنسان",
  "console.risk.fast": "مُلئت الاستمارة في {ms} ملّي ثانية، أقل من 10 ثوانٍ",
  "console.risk.bot_ua": "متصفح آلي ({uaLabel})",
  "console.risk.no_ua": "لا تعريف للمتصفح",
  "console.risk.phone_market_mismatch": "هاتف من {phoneCountry}، وسوق المتجر {market}",
  "console.risk.market_not_allowed": "السوق {market} غير مفتوح للتسجيل",
  "console.risk.invite_code": "سجّل بكود دعوة من المنصة",
  "console.risk.trusted_creator": "مالك متجر قائم دون أي مخالفة",
  "console.risk.mixed_script": "خلط بين الحروف اللاتينية والسيريلية أو اليونانية في اسم المتجر",
  "console.risk.field.store_name": "اسم المتجر",
  "console.risk.field.handle": "المعرّف",
  "console.risk.field.email": "عنوان البريد الإلكتروني",

  /* ---- R1: the public staff-invite page (PLA-§14.1) ---- */
  "console.staff.invite_invalid": "هاد الدعوة ما بقاتش صالحة. طلب دعوة جديدة.",
  "console.staff.invite_sign_in_first": "كاين حساب كيستعمل هاد البريد الإلكتروني. دخل بيه، ومن بعد حلّ الرابط مرة أخرى.",
  "console.staff.invite_wrong_account": "هاد الدعوة ديال عنوان بريد إلكتروني آخر.",
};
