/**
 * Admin messages (ar) of the health file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts.
 * R1-complete (PLA-§N.1): typed against every key of ../en/health.ts, so a missing text fails tsc before
 * test:i18n-coverage.
 */
import type { messages as en } from "../en/health";

export const messages: { [K in keyof typeof en]: string } = {
  "health.title": "صحة المتجر",
  "health.score": "{score} من أصل 100",
  "health.computing": "أول فحص لصحة متجرك سيجري خلال 5 دقائق.",
  "health.recomputing": "يُعاد الحساب الآن. سيكون جاهزًا خلال 5 دقائق.",
  "health.recompute": "أعد الحساب الآن",
  "health.checked_at": "آخر فحص: {time}",
  "health.stale": "هذا الفحص أقدم من المعتاد. أعد الحساب لرؤية آخر النتائج.",
  "health.score_later": "{count, plural, zero {تظهر النتيجة بعد أول طلب.} one {تظهر النتيجة بعد أول طلب.} two {تظهر النتيجة بعد طلبين.} few {تظهر النتيجة بعد # طلبات.} many {تظهر النتيجة بعد # طلبًا.} other {تظهر النتيجة بعد # طلب.}}",
  "health.all_good": "لا شيء يحتاج إصلاحًا الآن. آخر فحص على {time}، ويُعاد الفحص بعد كل تغيير تقوم به.",
  "health.celebrate": "متجرك في حالة ممتازة.",
  "health.error": "تعذّر تحميل فحص الصحة. باقي لوحة التحكم يعمل.",
  "health.retry": "أعد المحاولة",
  "health.severity.3": "أصلحه الآن",
  "health.severity.2": "يُستحسن إصلاحه",
  "health.severity.1": "اقتراح",
  "health.group.setup": "الإعداد",
  "health.group.trust": "الثقة",
  "health.group.design": "التصميم",
  "health.group.conversion": "التحويل",
  "health.group.operations": "العمليات",
  "health.group.integrations": "الربط مع الخدمات",
  "health.group.quota": "حدود الباقة",
  "health.group.lost": "{lost} من أصل {cap} نقطة يمكن استرجاعها",
  "health.after_approval": "بعد الموافقة",
  "health.issues": "ما يجب إصلاحه",
  "health.snooze": "تجاهل لمدة 7 أيام",
  "health.snoozed": "تم التأجيل لمدة 7 أيام.",
  "health.snoozed_count": "{count, plural, zero {لا شيء مؤجل} one {واحد مؤجل} two {اثنان مؤجلان} few {# مؤجلة} many {# مؤجلًا} other {# مؤجل}}",
  "health.snoozed_until": "مؤجل حتى {date}",
  "health.unsnooze": "إلغاء التأجيل",
  "health.evidence.n": "n = {n}",
  "health.evidence.window": "{days, plural, zero {اليوم} one {آخر يوم} two {آخر يومين} few {آخر # أيام} many {آخر # يومًا} other {آخر # يوم}}",
  "health.snoozed_by": "أجّله {role}",
  "health.snoozed_title": "النقاط المؤجّلة",
  "health.hide_snoozed": "إخفاء المؤجّلة",
  "health.all_good_short": "حتى حاجة ما خاصها إصلاح دابا.",
  "health.read_only": "آخر فحص، للقراءة فقط ما دام المتجر مسدود أو موقوف.",
};
