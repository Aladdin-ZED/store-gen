/**
 * Arabic catalog (docs/STORE-SAAS.md §I.5; `dir="rtl"`): a partial of the English one, every missing key falls back
 * to `en`. One spread per track file `./ar/<file>.ts` (D67, written at P0).
 */
import { messages as identity } from "@/lib/auth/i18n/ar";
import { messages as aiMessages } from "./ar/ai";
import { messages as authMessages } from "./ar/auth";
import { messages as briefMessages } from "./ar/brief";
import { messages as consoleMessages } from "./ar/console";
import { messages as designMessages } from "./ar/design";
import { messages as financeMessages } from "./ar/finance";
import { messages as healthMessages } from "./ar/health";
import { messages as integrationsMessages } from "./ar/integrations";
import { messages as landingMessages } from "./ar/landing";
import { messages as notifyMessages } from "./ar/notify";
import { messages as onboardingMessages } from "./ar/onboarding";
import { messages as opsMessages } from "./ar/ops";
import { messages as shellMessages } from "./ar/shell";
import { messages as teamMessages } from "./ar/team";
import type { BaseMessages } from "./index";

export const messages: Partial<BaseMessages> = {
  // T2 identity surfaces (CCR r1.0-t2-9 item 1); the core keys below win on a clash
  ...identity,
  // the tracks' files ./ar/<file>.ts (D67; spread here at P0, `scripts/qa/registries-check.ts` proves none is left out):
  // P1 console + notify, P2 shell + auth + onboarding + team + health + brief, P3 landing, P4 ops + finance,
  // P5 integrations, P6 design, P7 ai; each owns the keys under its prefix, and the core keys below win on a clash
  ...consoleMessages,
  ...notifyMessages,
  ...shellMessages,
  ...authMessages,
  ...onboardingMessages,
  ...teamMessages,
  ...healthMessages,
  ...briefMessages,
  ...landingMessages,
  ...opsMessages,
  ...financeMessages,
  ...integrationsMessages,
  ...designMessages,
  ...aiMessages,
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
  // T1 lifecycle and handle refusals (CCR r1.0-t1-2; mapped in seam.ts actionFailure by T2)
  "error.status_changed": "غيّر شخص آخر حالة هذا المتجر قبل لحظات. تحقّق من حالته الحالية ثم أعد المحاولة.",
  "error.handle_format": "استعمل من 3 إلى 30 حرفًا لاتينيًا صغيرًا أو رقمًا أو شرطة، يبدأ وينتهي بحرف أو رقم.",
  "error.handle_reserved": "هذا العنوان محجوز. اختر عنوانًا آخر.",
  "error.handle_protected": "يحتوي هذا العنوان على علامة تجارية محمية. استعمل علامتك الخاصة، أو تواصل مع دعم Store Gen إذا كانت العلامة ملكك.",
  "error.handle_unavailable": "هذا العنوان غير متاح. اختر عنوانًا آخر.",
  "error.handle_too_soon": "يمكنك تغيير عنوان متجرك مرة واحدة كل 30 يومًا.",
  // تنقّل لوحة التحكم (CCR r1.0-t4-8)
  "nav.overview": "نظرة عامة",
  "nav.orders": "الطلبات",
  "nav.pages": "الصفحات",
  "nav.generate": "إنشاء صفحة",
  "nav.media": "الوسائط",
  "nav.history": "السجل",
  "nav.exports": "التصدير",
  "nav.team": "الأعضاء والدعوات",
  "nav.sheets": "Google Sheets",
  "nav.pixels": "البكسلات",
  "nav.settings": "الإعدادات",
  "nav.group.workspace": "مساحة العمل",
  "nav.group.sell": "المبيعات",
  "nav.group.landing": "صفحات البيع",
  "nav.group.catalog": "الكتالوج",
  "nav.group.library": "المكتبة",
  "nav.group.team": "الفريق",
  "nav.group.connect": "الربط",
  "nav.group.money": "المالية",
  "nav.group.settings": "الإعدادات",
};
