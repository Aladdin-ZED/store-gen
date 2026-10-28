/**
 * Admin messages (ar) of the brief file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts.
 * R1-complete (PLA-§N.1): typed against every key of ../en/brief.ts.
 */
import type { messages as en } from "../en/brief";

export const messages: { [K in keyof typeof en]: string } = {
  "brief.title": "اليوم",
  "brief.orders": "{confirmed, plural, zero {لا طلبات مؤكدة اليوم} one {طلب واحد مؤكد اليوم} two {طلبان مؤكدان اليوم} few {# طلبات مؤكدة اليوم} many {# طلبًا مؤكدًا اليوم} other {# طلب مؤكد اليوم}} · {callbacks, plural, zero {لا مكالمات متابعة مستحقة} one {مكالمة متابعة واحدة مستحقة} two {مكالمتا متابعة مستحقتان} few {# مكالمات متابعة مستحقة} many {# مكالمة متابعة مستحقة} other {# مكالمة متابعة مستحقة}}",
  "brief.confirmed": "{count, plural, zero {لا طلبات مؤكدة اليوم} one {طلب واحد مؤكد اليوم} two {طلبان مؤكدان اليوم} few {# طلبات مؤكدة اليوم} many {# طلبًا مؤكدًا اليوم} other {# طلب مؤكد اليوم}}",
  "brief.callbacks": "{count, plural, zero {لا مكالمات متابعة مستحقة} one {مكالمة متابعة واحدة مستحقة} two {مكالمتا متابعة مستحقتان} few {# مكالمات متابعة مستحقة} many {# مكالمة متابعة مستحقة} other {# مكالمة متابعة مستحقة}}",
  "brief.queue": "{count, plural, zero {لا طلبات في الانتظار} one {طلب واحد في الانتظار} two {طلبان في الانتظار} few {# طلبات في الانتظار} many {# طلبًا في الانتظار} other {# طلب في الانتظار}}",
  "brief.health": "أصلح أولًا: {issue}",
  "brief.opportunity": "{a} تم توصيله بنسبة {rateA}% مقابل {rateB}% لـ {b} (n = {n})",
  "brief.empty": "لا طلبات بعد. انشر صفحة للبدء.",
  "brief.open": "فتح",
};
