/**
 * Admin messages (ar) of the landing file (P3 LANDING, landing.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/landing.ts (a missing key falls back to English). Darija in Arabic script (LAN-§24.2), no dash
 * in a sentence; numerals stay Latin (the admin's digits).
 */
import type { messages as en } from "../en/landing";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- notifications (LAN-§23.6) ---- */
  "notify.delivery.holidays_review.title": "راجع أيام العطل ديال {year}",
  "notify.delivery.holidays_review.body": "تواريخ التوصيل كتفوت أيام العطل اللي فالتقويم ديالك. زيد التواريخ ديال هاد العام، ومن بعد علّم بلي راجعتيهم.",

  /* ---- the honesty gate and the builder checklist (LAN-§3.2, §3.2.1, §6.5) ---- */
  "landing.gate.more": "و{n} بحالها فهاد الصفحة.",
  "landing.gate.honesty.sample.title": "قسم {section} مازال فيه أمثلة ماشي حقيقية.",
  "landing.gate.honesty.sample.detail": "بدّل الأمثلة بآراء، محادثات ولا أرقام حقيقية ديال الكليان ديالك، ومن بعد أكّد بلي حقيقية.",
  "landing.gate.honesty.sample.other.title": "قسم {section} مازال فيه كلام مقترح.",
  "landing.gate.honesty.sample.other.detail": "راجع كل سطر مع المنتوج ديالك وبدّل اللي ماشي صحيح.",
  "landing.gate.honesty.I4.photos.title": "قسم {section} خاصو تصاور حقيقية باش يتنشر.",
  "landing.gate.honesty.I4.photos.detail": "خاص {needed} تصاور مختلفين، عندك {given}.",
  "landing.gate.honesty.I4.video.title": "قسم {section} مازال ما فيه حتى فيديو.",
  "landing.gate.honesty.I4.video.detail": "حمّل ملف الفيديو. تصويرة فبلاصة الفيديو ماشي فيديو.",
  "landing.gate.honesty.I4.credit.title": "سطر السمية فقسم {section} ماشي نتا اللي كتبتيه.",
  "landing.gate.honesty.I4.credit.detail": "سمّي غير الكليان الحقيقيين، بالسمية اللي عطاوك، ولا خوي السطر.",
  "landing.gate.honesty.I5.title": "العلامات ما زال ما كتشير لحتى بلاصة.",
  "landing.gate.honesty.I5.detail": "حط كل علامة فوق التصويرة فالمحرر، ولا اختار شكل بلا علامات.",
  "landing.gate.honesty.D1.title": "«{value}» رقم ما كتبو حتى واحد.",
  "landing.gate.honesty.D1.detail": "الأرقام فالصفحة خاصها تجي من المعلومات ديال المنتوج، الأثمنة، مناطق التوصيل ولا السياسات ديالك.",
  "landing.gate.honesty.D1.conflict.title": "«{a}» و«{b}» كيهضرو على نفس الحاجة.",
  "landing.gate.honesty.D1.conflict.detail": "خلي قيمة وحدة فالصفحة كاملة.",
  "landing.gate.honesty.D1.fact.title": "واش «{value}» معلومة صحيحة على المنتوج ديالك؟",
  "landing.gate.honesty.D1.fact.detail": "أكّدها مرة وحدة والصفحة غادي تحتافظ بيها. الأرقام المخترعة ما كتتنشرش.",
  "landing.gate.honesty.D2.title": "الإحصائيات والتقييمات خاصها المعطيات الحقيقية ديالك.",
  "landing.gate.honesty.D2.detail": "كتب الأرقام ديالك فقسم {section} وأكّد بلي حقيقية، ولا خبّي القسم.",
  "landing.gate.honesty.D2.rating.title": "التقييم {value} ({count} رأي) ما مأكدش بلي حقيقي.",
  "landing.gate.honesty.D2.rating.detail": "أكّد بلي جاي من الكليان ديالك، ولا حيدو من خانة المنتوج.",
  "landing.gate.honesty.rating_unattested.title": "أكّد بلي التقييم حقيقي.",
  "landing.gate.honesty.rating_unattested.detail": "التقييم ما كيبانش حتى تأكد بلي جاي من الكليان ديالك.",
  "landing.gate.honesty.password_field.title": "صفحة الدفع عند الاستلام عمرها ما كتطلب «{label}».",
  "landing.gate.honesty.password_field.detail": "حيد هاد الخانة: حنا عمرنا ما كنجمعو كلمات السر، الكودات ولا أرقام البطاقات.",
  "landing.gate.honesty.countdown_reset.title": "العدّاد اللي سالا ما يمكنش يعاود يبدا فنفس الصفحة.",
  "landing.gate.honesty.countdown_reset.detail": "دير نسخة من الصفحة لحملة جديدة، ولا حيد العدّاد.",
  "landing.gate.honesty.countdown_twice.title": "العدّاد كيبان جوج مرات.",
  "landing.gate.honesty.countdown_twice.detail": "كيبان فقسم {a} وفقسم {b}. خليه فبلاصة وحدة.",
  "landing.gate.honesty.stock_untyped.title": "رقم السطوك ماشي نتا اللي كتبتيه.",
  "landing.gate.honesty.stock_untyped.detail": "كتب السطوك الحقيقي ولا حيدو.",
  "landing.gate.honesty.promise.title": "«{claim}» ماشي مكتوبة فالسياسات ديالك.",
  "landing.gate.honesty.promise.detail": "زيدها فالسياسات، ولا حيد الجملة.",
  "landing.gate.honesty.promise.contradicted.title": "«{claim}» كتقول العكس ديال السياسات ديالك.",
  "landing.gate.honesty.promise.contradicted.detail": "بدّل الجملة ولا السياسة. خاصهم بجوج يقولو نفس الحاجة.",
  "landing.gate.honesty.promise.hours.title": "«{claim}» كتوعد بوقت ديال الاتصال اللي ما أكدتيهش.",
  "landing.gate.honesty.promise.hours.detail": "أوقات الاتصال ديالك مازال هي ديال البداية. خدم بهاد الأوقات، ولا حيد الجملة.",
  "landing.gate.form.F1.title": "فورمولير الطلب طويل بزاف (تقريبا {px} px، تقدير).",
  "landing.gate.form.F1.detail": "خلي العرض، السمية، التيليفون، المدينة، العنوان والزر. دير الملاحظة ورا «زيد ملاحظة».",
  "landing.gate.form.F2.title": "«{label}» فيها اختيار واحد غير.",
  "landing.gate.form.F2.detail": "الزبون عمرو ما كيشوف اختيار بقيمة وحدة. زيد القيم الأخرى، ولا حيدو.",
  "landing.gate.form.F3.title": "خانات الفورمولير خاصها حدود باينة.",
  "landing.gate.form.F3.detail": "اختار شكل ديال الفورمولير بخانات محدودة: الحدود فيها {ratio}:1 وخاصها {needed}:1.",
  "landing.gate.urgency.extended.title": "العدّاد كيسالي من بعد ما فالصفحة المنشورة.",
  "landing.gate.urgency.extended.detail": "اللي شافو النهاية القديمة غادي يشوفوها تبدلات. النشر كيسجّل هاد التبديل.",
  "landing.gate.urgency.far.title": "العدّاد كيسالي من بعد أكثر من 30 يوم.",
  "landing.gate.urgency.far.detail": "عدّاد طويل بحال هادا قليل فين كيبان حقيقي. حط التاريخ الحقيقي ديال نهاية العرض.",
  "landing.gate.urgency.stock-stale.title": "«باقي {value}» ما تبدلاتش هادي أكثر من 14 يوم.",
  "landing.gate.urgency.stock-stale.detail": "حدّث السطوك باللي عندك بالصح، ولا حيدو.",
  "landing.gate.delivery.zones-empty.title": "الزبناء ما كيشوفو حتى تاريخ ديال التوصيل.",
  "landing.gate.delivery.zones-empty.detail": "زيد مناطق التوصيل ديالك، باش كل مدينة تبان بالتواريخ ديالها.",
  "landing.gate.delivery.fee_mismatch.title": "الزبناء فمدينة {city} كيخلصو {page} هنا و{zone} ملي كيطلبو.",
  "landing.gate.delivery.fee_mismatch.detail": "وافق ثمن التوصيل ديال هاد الصفحة مع المناطق ديالك، ولا بدّل ثمن المنطقة.",
  "landing.gate.delivery.lead-unset.title": "شحال كتاخد عادة باش تأكد الطلب فالتيليفون؟",
  "landing.gate.delivery.lead-unset.detail": "مدة التوصيل كتحسبها. جاوب عليها فالتوصيل.",
  "landing.gate.policies.unreviewed.title": "السياسات ديالك مازال ما تراجعاتش.",
  "landing.gate.policies.unreviewed.detail": "صفحة الشكر والذكاء الاصطناعي ما كيوعدو غير باللي كاين فالسياسات ديالك.",
  "landing.gate.thanks.no-caller.title": "الزبناء ما عارفينش شمن رقم غادي يعيط ليهم.",
  "landing.gate.thanks.no-caller.detail": "زيد الرقم اللي كتعيط منو، باش يبان فصفحة الشكر والزبون يهز.",
  "landing.gate.thanks.no-window.title": "أوقات الاتصال ديالك مسدودة فالجوج سيمانات الجايين.",
  "landing.gate.thanks.no-window.detail": "داكشي علاش صفحة الشكر ما تقدرش تقول إمتى غادي تعيط. حل شي أوقات فـ«من بعد الطلب».",
  "landing.gate.thanks.no-window.unsaved.title": "أوقات الاتصال ديالك مازال هي ديال البداية.",
  "landing.gate.thanks.no-window.unsaved.detail": "داكشي علاش صفحة الشكر ما كتقولش إمتى غادي تعيط. خدم بهاد الأوقات ولا بدّلهم.",
  "landing.gate.wa.no-number.title": "الطلب فواتساب مشعول، وما كاين حتى رقم يتحل.",
  "landing.gate.wa.no-number.detail": "زيد رقم الواتساب ديالك فالإعدادات، ولا طفي الزر.",

  /* ---- Store Health (LAN-§23.7) ---- */
  "health.landing.no_live_page.text": "حتى صفحة بيع ما منشورة دابا.",
  "health.landing.no_live_page.fix": "حل الصفحات ديالك",
  "health.landing.zones_empty.text": "صفحة منشورة كتحسب التوصيل، ولكن الزبناء ما كيشوفو حتى تاريخ ديال التوصيل.",
  "health.landing.zones_empty.fix": "زيد مناطق التوصيل",
  "health.landing.holidays_unreviewed.text": "أيام العطل ديال {value} ما تراجعاتش، يقدر تاريخ التوصيل يطيح فنهار مسدود.",
  "health.landing.holidays_unreviewed.fix": "راجع أيام العطل",
  "health.landing.policies_unreviewed.text": "السياسات ديالك ما تراجعاتش، داكشي علاش الصفحات ما كتوعد بوالو على الإرجاع ولا التوصيل.",
  "health.landing.policies_unreviewed.fix": "راجع السياسات",
  "health.landing.no_caller.text": "صفحة الشكر ما كتبينش الرقم اللي كتعيط منو.",
  "health.landing.no_caller.fix": "زيد رقم الاتصال",
  "health.landing.countdown_ended.text":
    "{value, plural, one {صفحة منشورة وحدة فيها} two {جوج صفحات منشورين فيهم} other {# ديال الصفحات المنشورة فيهم}} عدّاد سالا.",
  "health.landing.countdown_ended.fix": "حيد العدّاد",
  "health.landing.compare_not_higher.text":
    "{value, plural, one {صفحة منشورة وحدة فيها} two {جوج صفحات منشورين فيهم} other {# ديال الصفحات المنشورة فيهم}} «الثمن القديم» ماشي طالع على الثمن.",
  "health.landing.compare_not_higher.fix": "صلّح الأثمنة",
  "health.landing.stock_zero.text":
    "{value, plural, one {صفحة منشورة وحدة كتقول} two {جوج صفحات منشورين كيقولو} other {# ديال الصفحات المنشورة كيقولو}} باقي 0 فالسطوك.",
  "health.landing.stock_zero.fix": "حدّث السطوك",
  "health.landing.stock_stale.text":
    "{value, plural, one {صفحة منشورة وحدة خلات} two {جوج صفحات منشورين خلاو} other {# ديال الصفحات المنشورة خلاو}} نفس رقم السطوك أكثر من 14 يوم.",
  "health.landing.stock_stale.fix": "حدّث السطوك",
  "health.landing.proof_unattested.text":
    "{value, plural, one {قسم ديال الدلائل فيه} two {جوج أقسام ديال الدلائل فيهم} other {# ديال أقسام الدلائل فيهم}} آراء، محادثات ولا أرقام ما أكدتيهمش بلي حقيقيين.",
  "health.landing.proof_unattested.fix": "أكّدهم ولا خبّيهم",
  "health.landing.no_seo.text":
    "{value, plural, one {صفحة منشورة وحدة ما عندهاش} two {جوج صفحات منشورين ما عندهمش} other {# ديال الصفحات المنشورة ما عندهمش}} عنوان ولا وصف ديال البحث.",
  "health.landing.no_seo.fix": "زيدهم",
  "health.landing.no_alt.text":
    "{value, plural, one {تصويرة وحدة فالصفحات المنشورة ما عندهاش} two {جوج تصاور فالصفحات المنشورة ما عندهمش} other {# ديال التصاور فالصفحات المنشورة ما عندهمش}} وصف.",
  "health.landing.no_alt.fix": "وصف التصاور",
  "health.landing.no_pixel.text":
    "{value, plural, one {صفحة منشورة وحدة ما كتصيفط} two {جوج صفحات منشورين ما كيصيفطو} other {# ديال الصفحات المنشورة ما كيصيفطو}} حتى زيارة لبيكسل ديال الإعلانات.",
  "health.landing.no_pixel.fix": "اختار البيكسلات ديالها",
  "health.landing.form_hidden.text":
    "{value, plural, one {صفحة منشورة وحدة كتخبي} two {جوج صفحات منشورين كيخبيو} other {# ديال الصفحات المنشورة كيخبيو}} فورمولير الطلب، داكشي علاش حتى واحد ما يقدر يطلب منها.",
  "health.landing.form_hidden.fix": "بيّن الفورمولير",
  "health.landing.leads_slow.text": "كتوصل للزبناء الجداد من بعد {value} دقيقة، فوق الهدف ديالك ديال {baseline} دقيقة ({n} زبون، 28 يوم).",
  "health.landing.leads_slow.fix": "حل الزبناء المحتملين",
  "health.landing.wa_intents_waiting.text":
    "{value, plural, one {طلب واتساب واحد كيتسنى} two {جوج طلبات واتساب كيتسناو} other {# ديال طلبات الواتساب كيتسناو}} الجواب أكثر من 2 ساعات ديال الاتصال.",
  "health.landing.wa_intents_waiting.fix": "جاوب فواتساب",
  "health.landing.fee_mismatch.text":
    "ثمن التوصيل فالصفحة ماشي بحال ثمن المنطقة ف{value, plural, one {مدينة وحدة من المدن الكبار ديالك} two {جوج مدن من المدن الكبار ديالك} other {# ديال المدن الكبار ديالك}} ({n} طلب، 28 يوم).",
  "health.landing.fee_mismatch.fix": "وافق الأثمنة",
};
