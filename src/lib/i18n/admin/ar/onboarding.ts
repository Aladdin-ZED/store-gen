/**
 * Admin messages (ar) of the onboarding file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts.
 * R1-complete (PLA-§N.1, §22.2): typed against every key of ../en/onboarding.ts.
 */
import type { messages as en } from "../en/onboarding";

export const messages: { [K in keyof typeof en]: string } = {
  "onboarding.meta": "مرحبًا بك",
  "onboarding.continue": "متابعة",
  "onboarding.back": "رجوع",
  "onboarding.saving": "جارٍ الحفظ…",
  "onboarding.skip": "تخطَّ الآن",
  "onboarding.done": "اذهب إلى لوحة التحكم",
  "onboarding.progress": "تقدّم الإعداد",

  /* ---- الصور ---- */
  "onboarding.photos.title": "أضف من صورة واحدة إلى 5 صور للمنتج",
  "onboarding.photos.hint": "الصور الواضحة للمنتج تعطي أفضل نتيجة. صور الهاتف مناسبة.",
  "onboarding.photos.pick": "اختر الصور",
  "onboarding.photos.camera": "التقط صورة",
  "onboarding.photos.skip": "ابدأ بدون صور",
  "onboarding.photos.uploading": "{count, plural, zero {لا صور قيد الرفع} one {جارٍ رفع صورة واحدة…} two {جارٍ رفع صورتين…} few {جارٍ رفع # صور…} many {جارٍ رفع # صورة…} other {جارٍ رفع # صورة…}}",
  "onboarding.photos.failed": "تعذّر رفع هذه الصورة. جرّب صورة أخرى.",
  "onboarding.photos.too_many": "5 صور كحد أقصى. احذف واحدة لإضافة أخرى.",
  "onboarding.photos.remove": "احذف الصورة",
  "onboarding.analyzing": "نحلّل صورك…",
  "onboarding.refining": "نحسّن الاقتراحات",

  /* ---- التفاصيل ---- */
  "onboarding.category.title": "ماذا تبيع؟",
  "onboarding.category.suggested": "مقترحة",
  "onboarding.category.hint": "اختر واحدة للمتابعة.",
  "onboarding.product_name": "اسم المنتج",
  "onboarding.use_suggestion": "استعمل الاقتراح",
  "onboarding.price": "الثمن",
  "onboarding.price_hint": "الثمن الذي يدفعه الزبناء، بـ {currency}.",
  "onboarding.price_required": "أدخل الثمن الذي تبيع به.",
  "onboarding.compare_at": "الثمن قبل (اختياري)",
  "onboarding.compare_hint": "فقط ثمن بعتَ به فعلًا من قبل.",
  "onboarding.compare_invalid": "يجب أن يكون الثمن قبل أعلى من الثمن الحالي.",
  "onboarding.fact": "معلومة عن المنتج (اختياري)",
  "onboarding.fact_hint": "شيء صحيح يجب أن يعرفه الزبون، مثل المقاس أو محتوى العلبة.",
  "onboarding.suggested_facts": "اقتراحات يمكنك اختيارها",

  /* ---- العرض ---- */
  "onboarding.reveal.title": "هذه صفحتك",
  "onboarding.reveal.analysing": "نحضّر ثلاثة تصاميم…",
  "onboarding.reveal.error": "تعذّر تحضير التصاميم.",
  "onboarding.reveal.retry": "أعد المحاولة",
  "onboarding.reveal.direction": "التصميم {n}",
  "onboarding.reveal.prev": "التصميم السابق",
  "onboarding.reveal.next": "التصميم التالي",
  "onboarding.reveal.use": "اختر هذا التصميم",
  "onboarding.reveal.more": "اعرض 3 تصاميم أخرى",
  "onboarding.reveal.dna": "لماذا هذا التصميم",
  "onboarding.reveal.saved": "تم حفظ صفحتك كمسودة. يصبح النشر متاحًا بعد الموافقة.",
  "onboarding.reveal.saved_product": "تم حفظ منتجك الأول وصفحته كمسودة؛ الصفحة الرئيسية لمتجرك قيد الإنشاء. يصبح النشر متاحًا بعد الموافقة.",
  "onboarding.reveal.saved_sales_page": "صفحتك الأولى صفحة بيع؛ الصفحة الرئيسية لمتجرك قيد الإنشاء. يصبح النشر متاحًا بعد الموافقة.",
  "onboarding.reveal.submit": "أرسل للمراجعة",
  "onboarding.reveal.builder": "افتح في المحرّر",

  /* ---- التواصل ---- */
  "onboarding.contact.title": "أين يتواصل معك الزبناء؟",
  "onboarding.contact.whatsapp": "رقم واتساب",
  "onboarding.contact.hint": "يضغط عليه الزبناء في صفحاتك لطرح سؤال أو تأكيد طلب.",
  "onboarding.contact.use_phone": "استعمل رقمي {phone} لطلبات واتساب",
  "onboarding.fee_note": "أضف ثمن التوصيل في «الطلب والتوصيل» عندما تعرفه.",

  /* ---- النهاية ---- */
  "onboarding.done_title": "متجرك جاهز للبناء",
  "onboarding.done_lead": "هذا ما تم إعداده وما بقي.",
};
