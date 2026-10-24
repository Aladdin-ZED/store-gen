/**
 * Arabic catalog (docs/STORE-SAAS.md §I.5; `dir="rtl"`): a partial of the English one, every missing key falls back
 * to `en`. From P0, one spread per track file `./ar/<track>.ts`.
 */
import type { BaseMessages } from "./index";

export const messages: Partial<BaseMessages> = {
  "error.invalid": "بعض الحقول تحتاج إلى تصحيح.",
  "error.not_found": "هذا العنصر غير موجود أو لم يعد متاحًا.",
  "error.forbidden": "دورك لا يسمح بهذا الإجراء.",
  "error.read_only": "هذا المتجر للقراءة فقط حاليًا.",
  "error.impersonation_read_only": "عرض المتجر للقراءة فقط.",
  "error.quota": "لقد بلغت أحد حدود باقتك.",
  "error.feature_off": "هذه الميزة غير متاحة لهذا المتجر حاليًا.",
  "error.step_up": "أكّد هويتك للمتابعة.",
  "error.busy": "الضغط مرتفع الآن. أعد المحاولة بعد ثوانٍ.",
  "error.job_queued": "هذا يستغرق بعض الوقت. سنُعلمك عندما يصبح جاهزًا.",
  "error.design_blocked": "التصميم يحتاج إلى بعض التعديلات قبل النشر.",
  "error.honesty_blocked": "بعض المعلومات في الصفحة تحتاج إلى مصدر قبل النشر.",
  "error.budget_blocked": "الصفحة طويلة أو ثقيلة جدًا للنشر.",
  "error.rate_limited": "محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة.",
  "error.conflict": "تم تعديل هذا العنصر في مكان آخر. أعد التحميل ثم حاول مجددًا.",
  "error.server": "حدث خطأ من جهتنا. يرجى المحاولة مرة أخرى.",
  "error.session_ended": "انتهت جلستك. سجّل الدخول من جديد.",
  "error.platform_2fa_required": "فعّل التحقق بخطوتين لفتح لوحة الإدارة.",
};
