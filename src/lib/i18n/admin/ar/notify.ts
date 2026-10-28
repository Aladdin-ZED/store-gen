/**
 * Admin messages (ar) of the notify file (P1 CONSOLE, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/notify.ts (a missing key falls back to English).
 * P0b (CCR P2-15, D67): holds the identity keys moved from src/lib/auth/i18n/ar.ts, without renames and with the
 * same values.
 */
import type { messages as en } from "../en/notify";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- الإشعارات ---- */
  "notify.store.impersonation_started.title": "الدعم يعرض متجرك",
  "notify.store.impersonation_started.body": "للقراءة فقط، والسبب: «{reason}». كانت بيانات الزبائن مخفية.",
  "notify.store.impersonation_ended.title": "أنهى الدعم عرض متجرك",
  "notify.store.impersonation_ended.body": "انتهى العرض للقراءة فقط.",
  "notify.user.password_reset.title": "تمت إعادة تعيين كلمة المرور",
  "notify.user.password_reset.body": "تم تسجيل خروج كل أجهزتك. سجّل الدخول بكلمة المرور الجديدة.",
  "notify.user.2fa_reset.title": "تمت إعادة ضبط التحقق بخطوتين",
  "notify.user.2fa_reset.body": "أوقفه فريق المنصة بطلب منك. أعد تفعيله من صفحة الأمان.",
};
