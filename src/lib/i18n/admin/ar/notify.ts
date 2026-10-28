/**
 * Admin messages (ar) of the notify file (P1 CONSOLE, platform.md PLA-§18.2, §N.1-§N.3; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/notify.ts (a missing key falls back to English). Complete for the tenant kinds and their labels
 * (clear Arabic with the everyday Moroccan words of PLA-§N.1: الطلبات، الزبناء); the staff kinds stay English.
 */
import type { messages as en } from "../en/notify";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- التسجيل والمراجعة ---- */
  "notify.signup.received.title": "توصلنا بمتجرك",
  "notify.signup.received.body": "سيراجعه فريق Store Gen. يمكنك متابعة تجهيز صفحاتك في انتظار ذلك.",
  "notify.signup.info_requested.title": "لدى Store Gen سؤال حول متجرك",
  "notify.signup.info_requested.body": "افتح لوحة التحكم لقراءته والرد عليه.",
  "notify.signup.approved.title": "تمت الموافقة على متجرك",
  "notify.signup.approved.body": "انشر صفحتك الأولى لتبدأ في استقبال الطلبات.",
  "notify.signup.rejected.title": "لم تتم الموافقة على متجرك",
  "notify.signup.rejected.body": "افتح لوحة التحكم لتعرف السبب وما يمكنك فعله بعد ذلك.",
  "notify.signup.reopened.title": "متجرك قيد المراجعة من جديد",
  "notify.signup.reopened.body": "سيراجعه فريق Store Gen مرة أخرى. يمكنك متابعة تجهيز صفحاتك في انتظار ذلك.",

  /* ---- حالة المتجر ---- */
  "notify.store.restricted.title": "تم تقييد متجرك",
  "notify.store.restricted.body": "السبب: {reason}. صفحاتك تبقى منشورة، وبعض الإجراءات موقوفة مؤقتًا.",
  "notify.store.suspended.title": "تم إيقاف متجرك",
  "notify.store.suspended.body": "السبب: {reason}. صفحاتك غير متاحة إلى أن يعيد Store Gen تفعيل المتجر.",
  "notify.store.restored.title": "تمت إعادة تفعيل متجرك",
  "notify.store.restored.body": "السبب: {reason}. كل شيء يعمل كما كان.",
  "notify.store.closed.title": "تم إغلاق متجرك",
  "notify.store.closed.body": "السبب: {reason}. صفحاتك غير متاحة. يمكنك إعادة فتح المتجر من لوحة التحكم.",
  "notify.store.reopened.title": "متجرك مفتوح من جديد",
  "notify.store.reopened.body": "السبب: {reason}. رجعت صفحاتك كما كانت.",
  "notify.store.deletion_scheduled.title": "تمت برمجة حذف متجرك",
  "notify.store.deletion_scheduled.body": "السبب: {reason}. تواصل مع دعم Store Gen إذا كان هذا خطأ.",
  "notify.store.deletion_cancelled.title": "تم إلغاء حذف متجرك",
  "notify.store.deletion_cancelled.body": "السبب: {reason}. يبقى متجرك مغلقًا إلى أن تعيد فتحه.",

  /* ---- اطّلاع الدعم والتصدير ---- */
  "notify.store.impersonation_started.title": "اطّلع دعم Store Gen على متجرك",
  "notify.store.impersonation_started.body": "السبب: {reason}. من {from} إلى {to}. للقراءة فقط. كانت بيانات الزبناء مخفية.",
  "notify.store.impersonation_ended.title": "أنهى دعم Store Gen الاطّلاع على متجرك",
  "notify.store.impersonation_ended.body": "السبب: {reason}. من {from} إلى {to}. للقراءة فقط.",
  "notify.store.export_by_platform.title": "صدّر Store Gen بيانات متجرك",
  "notify.store.export_by_platform.body": "السبب: {reason}. تجد هذا التصدير في سجل نشاط متجرك.",

  /* ---- الطلبات المقدّمة والباقة والحصص ---- */
  "notify.request.answered.title": "تم الرد على طلبك",
  "notify.request.answered.body": "{requestKind}: {outcome}.",
  "notify.plan.changed.title": "تغيّرت باقتك",
  "notify.plan.changed.body": "متجرك الآن على باقة {plan}.",
  "notify.plan.boost_granted.title": "حصلت باقتك على زيادة مؤقتة",
  "notify.plan.boost_granted.body": "تبقى سارية إلى غاية {until}.",
  "notify.plan.boost_ending.title": "الزيادة المؤقتة لباقتك تنتهي قريبًا",
  "notify.plan.boost_ending.body": "تنتهي في {until}. بعدها تُطبَّق الحدود المعتادة لباقتك.",
  "notify.quota.80.title": "{metric} ممتلئ بنسبة {percent}%",
  "notify.quota.80.body": "افتح صفحة الباقة والاستهلاك لترى ما تشمله باقتك أو لتطلب المزيد.",
  "notify.quota.100.title": "{metric} وصل إلى حد باقتك",
  "notify.quota.100.body": "افتح صفحة الباقة والاستهلاك لترى ما تشمله باقتك أو لتطلب المزيد.",

  /* ---- صحة المتجر ---- */
  "notify.health.issue_new.title": "متجرك يحتاج انتباهك",
  "notify.health.issue_new.body": "ظهرت مشكلة جديدة يجب إصلاحها الآن في فحص صحة متجرك.",

  /* ---- الفريق ---- */
  "notify.member.joined.title": "انضمّ {member} إلى فريقك",
  "notify.member.joined.body": "الدور: {role}.",

  /* ---- أمان الحساب ---- */
  "notify.security.2fa_required.title": "أصبح التحقق بخطوتين إلزاميًا",
  "notify.security.2fa_required.body": "هذا المتجر يطلبه من كل عضو. فعّله من صفحة الأمان في حسابك.",
  "notify.user.password_reset.title": "تمت إعادة تعيين كلمة المرور",
  "notify.user.password_reset.body": "تم تسجيل خروج كل أجهزتك. سجّل الدخول بكلمة المرور الجديدة.",
  "notify.user.2fa_reset.title": "تمت إعادة ضبط التحقق بخطوتين",
  "notify.user.2fa_reset.body": "أوقفه فريق المنصة بطلب منك. أعد تفعيله من صفحة الأمان.",

  /* ---- الوثائق القانونية ---- */
  "notify.legal.updated.title": "قمنا بتحديث {kind}",
  "notify.legal.updated.body": "النسخة {version}. افتحها لترى ما الذي تغيّر.",

  /* ---- رسالة من Store Gen ---- */
  "notify.staff.message.title": "رسالة من Store Gen",
  "notify.staff.message.body": "افتحها لقراءة الرسالة.",

  /* ---- تسميات الرموز ---- */
  "notify.reason.fake_orders": "طلبات وهمية",
  "notify.reason.customer_complaints": "شكايات من الزبناء",
  "notify.reason.policy_review": "مراجعة القواعد",
  "notify.reason.brand_complaint": "شكاية من علامة تجارية",
  "notify.reason.other": "سبب آخر",
  "notify.reason.scam_suspected": "شبهة نصب",
  "notify.reason.phishing": "تصيّد احتيالي",
  "notify.reason.prohibited_goods": "منتجات ممنوعة",
  "notify.reason.counterfeit": "منتجات مقلّدة",
  "notify.reason.legal_request": "طلب قانوني",
  "notify.reason.security_incident": "حادث أمني",
  "notify.reason.owner_banned": "تم حظر حساب المالك",
  "notify.reason.issue_resolved": "تم حل المشكلة",
  "notify.reason.appeal_accepted": "تم قبول الطعن",
  "notify.reason.mistake": "خطأ من جهتنا",
  "notify.reason.owner_request": "بطلب من المالك",
  "notify.reason.abandoned": "متجر غير نشيط",
  "notify.reason.terms_violation": "مخالفة شروط الاستخدام",
  "notify.reason.retention": "انتهاء مدة الاحتفاظ بالبيانات",
  "notify.reason.owner_request_urgent": "طلب مستعجل من المالك",
  "notify.reason.abuse": "إساءة استخدام",
  "notify.reason.approved": "تمت الموافقة",
  "notify.reason.rejected": "لم تتم الموافقة",
  "notify.reason.appeal": "طعن",
  "notify.reason.console_created": "أنشأه Store Gen",
  "notify.reason.owner_closed": "أغلقه المالك",
  "notify.reason.expired": "انتهت المدة",
  "notify.visit_reason.onboarding": "المساعدة في الانطلاق",
  "notify.visit_reason.ticket": "طلب الدعم الذي أرسلته",
  "notify.visit_reason.abuse_review": "مراجعة أمنية",
  "notify.visit_reason.bug": "إصلاح خلل",
  "notify.visit_reason.other": "سبب آخر",
  "notify.request_kind.signup": "مراجعة المتجر",
  "notify.request_kind.reopen": "مراجعة المتجر",
  "notify.request_kind.go_live": "النشر",
  "notify.request_kind.plan_change": "تغيير الباقة",
  "notify.request_kind.limit_raise": "رفع الحد",
  "notify.request_kind.mode_change": "تغيير نوع المتجر",
  "notify.request_kind.domain": "النطاق",
  "notify.outcome.granted": "تم القبول",
  "notify.outcome.declined": "تم الرفض",
  "notify.metric.media_bytes": "تخزين الصور والفيديو",
  "notify.metric.pages": "عدد الصفحات",
  "notify.metric.products": "عدد المنتجات",
  "notify.metric.members": "عدد أعضاء الفريق",
  "notify.metric.agents": "عدد وكلاء مركز الاتصال",
  "notify.metric.webhooks": "عدد الـ Webhooks",
  "notify.metric.custom_domains": "عدد النطاقات",
  "notify.metric.campaigns": "عدد الحملات",
  "notify.metric.short_links": "عدد الروابط القصيرة",
  "notify.metric.exports": "رصيد تصديرات هذا الشهر",
  "notify.metric.ai_credits": "رصيد الذكاء الاصطناعي لهذا الشهر",
  "notify.metric.orders": "رصيد طلبات هذا الشهر",
  "notify.legal_kind.tos": "شروط الاستخدام",
  "notify.legal_kind.privacy": "سياسة الخصوصية",
  "notify.legal_kind.aup": "سياسة الاستخدام المقبول",
  "notify.legal_kind.dpa": "اتفاقية معالجة البيانات",
};
