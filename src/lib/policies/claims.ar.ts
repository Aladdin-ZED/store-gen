/**
 * Arabic policy-claim patterns, Moroccan Darija and MSA in Arabic script (P3 LANDING; landing.md LAN-§6.3 rev 3
 * ENGP-8, LD26): read by ./claims.ts for `ar` pages and, because Moroccan pages mix the two languages, for `fr`
 * pages too. ./claims.ts folds these words the way it folds the text (`normaliseClaimText`: no harakat or tatweel, a
 * bare alef for أ إ آ, ي for ى, Latin digits), so "حتى" and "حتي" are one word. Every rule needs a quantity or a
 * qualifier: "ضمان الجودة", "التوصيل لجميع
 * المدن" and a bare "اتصل" give nothing. Darija verbs that also mean something else ("ترجع" = becomes, "تبدل" =
 * changes, "يوصل" = reaches) only count with their object ("ترجعها", "تبدل المقاس") and their time right after.
 */
import type { ClaimLexicon } from "./claims";

export const AR_LEXICON: ClaimLexicon = {
  numbers: {
    واحد: 1,
    وحدة: 1,
    جوج: 2,
    زوج: 2,
    اثنين: 2,
    اثنان: 2,
    تلاتة: 3,
    تلت: 3,
    ثلاثة: 3,
    ثلاث: 3,
    ربعة: 4,
    اربعة: 4,
    اربع: 4,
    خمسة: 5,
    خمس: 5,
    ستة: 6,
    سبعة: 7,
    سبع: 7,
    تمنية: 8,
    ثمانية: 8,
    تسعة: 9,
    عشرة: 10,
    عشر: 10,
    خمستاش: 15,
    خمسطاش: 15,
    "خمسة عشر": 15,
    عشرين: 20,
    عشرون: 20,
    تلاتين: 30,
    ثلاثين: 30,
    ثلاثون: 30,
  },
  units: {
    h: "hour",
    ساعة: "hour",
    ساعه: "hour",
    ساعات: "hour",
    سوايع: "hour",
    سويعات: "hour",
    دقيقة: "minute",
    دقيقه: "minute",
    دقايق: "minute",
    دقائق: "minute",
    يوم: "day",
    ايام: "day",
    يام: "day",
    "ايام عمل": "day",
    "ايام العمل": "day",
    نهار: "day",
    اسبوع: "week",
    اسابيع: "week",
    سيمانة: "week",
    سيمانات: "week",
    شهر: "month",
    شهور: "month",
    اشهر: "month",
    سنة: "year",
    سنوات: "year",
    سنين: "year",
    عام: "year",
    اعوام: "year",
  },
  duals: {
    ساعتين: [2, "hour"],
    دقيقتين: [2, "minute"],
    يومين: [2, "day"],
    اسبوعين: [2, "week"],
    سيمانتين: [2, "week"],
    شهرين: [2, "month"],
    عامين: [2, "year"],
    سنتين: [2, "year"],
  },
  singles: {
    ساعة: "hour",
    نهار: "day",
    اسبوع: "week",
    سيمانة: "week",
    شهر: "month",
    سنة: "year",
    عام: "year",
  },
  qualifiers: {
    غدا: ["next_day", 1],
    غدوة: ["next_day", 1],
    "نهار الغد": ["next_day", 1],
    "نفس النهار": ["same_day", 0],
    "ف نفس النهار": ["same_day", 0],
    "فنفس النهار": ["same_day", 0],
    "نفس اليوم": ["same_day", 0],
    "في نفس اليوم": ["same_day", 0],
    "ف نهارها": ["same_day", 0],
    "فنهارها": ["same_day", 0],
    اليوم: ["today", null],
    "نهار اليوم": ["today", null],
    "ف هاد النهار": ["today", null],
    "فهاد النهار": ["today", null],
    مجاني: ["free", null],
    مجانية: ["free", null],
    مجانا: ["free", null],
    بالمجان: ["free", null],
    فابور: ["free", null],
    بلاش: ["free", null],
    علينا: ["free", null],
    "مدي الحياة": ["lifetime", null],
    "مدى الحياة": ["lifetime", null],
    للابد: ["lifetime", null],
    "طول العمر": ["lifetime", null],
  },
  rangeSeparators: ["-", "/", "حتى ل", "حتى", "ل", "الى", "و", "او", "ولا"],
  currency: "درهم|دراهم|دره|د\\.م|dh|dhs|mad",
  // one stem of every rule below: delivery, parcel arriving, shipping, returns, exchanges, paying, the parcel, warranty,
  // money back, the call (written folded, as `normaliseClaimText` reads the text)
  hint: "وصل|صلك|توصيل|تسليم|ليفريزون|شحن|رجع|رجاع|رجيع|ترد|تراجع|اعادة|استرداد|بدل|بديل|بدال|خلص|دفع|خلاص|كولي|طرد|كارطونة|باكية|ضمان|كارانتي|گارانتي|نردو|فلوس|اموال|عيط|تصل|تاصل|كلمو|اتصال|تواصل",
  rules: ({ B, E, R, U, D, S, W, T1, T2, C }) => {
    const AMOUNT = `(?:${R}${U}|${D}|${S})`;
    // prepositions before a duration; "ف" may be attached to the number ("ف24 ساعة")
    const IN = "(?:حتى\\s+ل|حتى|ف\\s*ظرف|في\\s+ظرف|ف\\s*اقل\\s+من|في\\s+اقل\\s+من|ف\\s*مدة|في\\s+مدة|لمدة|مدة|ما\\s+بين|بين|خلال|داخل|قبل|من|في|ف|غير\\s+ف)";
    // never "الشحن" here: it is also a battery's charging ("الشحن ف ساعتين"); it stays in the free-delivery rule
    const DELIVERY = "(?:التوصيل|توصيل|التسليم|الليفريزون|ليفريزون|(?:غادي\\s+|غا\\s+|ك)?(?:ي|ت)وصل(?:ك|كم|ليك)|(?:غادي\\s+|غا\\s+|ك)?نوصلو(?:ه|ها|ك|ليك)?|(?:ي|ت)صلك)";
    const PARCEL = "(?:الطلبية|طلبيتك|الطلب|طلبك|الكوموند|الكولي|الكولية|السلعة|الطرد|المنتج)";
    const RETURN_NOUN = "(?:الارجاع|ارجاع|الترجيع|ترجيع|اعادة\\s+(?:المنتج|السلعة)|استرجاع\\s+(?:المنتج|السلعة))";
    const RETURN_VERB = "(?:(?:تقدر|تقدري|يمكن\\s+ليك|يمكنك|تقدرو)\\s+)?(?:ترجع(?:ها|و|يها|ه|ي)|ترجع\\s+(?:السلعة|المنتج|الكولي|البضاعة|الطلبية))";
    const EXCHANGE_NOUN = "(?:التبديل|تبديل|الاستبدال|استبدال)";
    const EXCHANGE_VERB = "(?:(?:تقدر|تقدري|يمكن\\s+ليك|يمكنك)\\s+)?(?:تبدل(?:ها|و|يها|ه|ي)|(?:ك)?نبدلو(?:ها|ه)?\\s+ليك|تبدل\\s+(?:المقاس|اللون|السلعة|المنتج|القياس|النمرة))";
    const CHECK = "(?:حل|تحل|حلي|تحلي|افتح|تفتح|فتح|افتحي|شوف|تشوف|شوفي|عاين|تعاين|تاكد|تتاكد|تفقد|جرب|تجرب|قلب|تقلب|راقب)";
    const BEFORE_PAYING = "(?:قبل\\s+(?:ما\\s+)?(?:تخلص|تخلصي|تدفع|الدفع|الخلاص)|عاد\\s+(?:خلص|تخلص|خلصي)|(?:و\\s*)?من\\s+بعد\\s+(?:خلص|تخلص|خلصي|ادفع))";
    const WARRANTY = "(?:ضمانة|ضمان|الضمانة|الضمان|كارانتي|گارانتي)";
    const MONEY = "(?:ال)?(?:فلوس|اموال|مبلغ|المال|ثمن|نقود)";
    const WE_REFUND = "(?:(?:غادي|غا)\\s+|ك)?(?:نرجعو|نردو)\\s+(?:ليك|ليكم|لك|ليكي)\\s+(?:ال)?(?:فلوس(?:ك|كم)?|اموال(?:ك)?|المبلغ)";
    const WE_CALL = "(?:(?:غادي|غا)\\s+|ك|س)?(?:نعيطو|نتاصلو|نتصلو|نتصل|نكلمو|نعيط|يعيط|يتصل|يتاصل)\\s+(?:ليك|بيك|عليك|بك|معاك|ليكم|بيكم)";
    // the courier's call before he comes ("يتصل بك عامل التوصيل", "الليفرور غادي يعيط ليك") is not the store's confirmation call
    const COURIER = "(?:عامل\\s+التوصيل|الليفرور|الموزع|المندوب|الساعي)";
    const CALL_TAIL =`(?:${W}\\s+(?:${IN}\\s*${AMOUNT}|(?<q>اليوم|نهار\\s+اليوم|نفس\\s+النهار|ف\\s*نفس\\s+النهار|ف\\s*هاد\\s+النهار)${E}|(?:من|بين|ما\\s+بين|ابتداء\\s+من|مع)\\s+(?:الساعة\\s+)?${T1}(?:\\s*(?:حتى\\s+ل|حتى|ل|الى|و)\\s*(?:الساعة\\s+)?${T2})?))?`;
    return [
      /* delivery time: "التوصيل ف 24 ساعة", "كيوصلك خلال يومين", "التوصيل من 24 حتى ل 48 ساعة" */
      { kind: "delivery_time", re: `${B}${DELIVERY}${E}${W}\\s*:?\\s*(?:${IN}\\s*)?${AMOUNT}` },
      { kind: "delivery_time", re: `${B}${PARCEL}\\s+(?:ديالك\\s+)?(?:غادي\\s+|غا\\s+|ك)?(?:ي|ت)وصل(?:ك|ليك|كم)?${E}${W}\\s*(?:${IN}\\s*)?${AMOUNT}` },
      { kind: "delivery_time", re: `${B}${R}${U}\\s+(?:ديال\\s+|د\\s*)?(?:التوصيل|توصيل)${E}` },
      { kind: "delivery_time", re: `${B}${DELIVERY}${E}(?:\\s+[\\p{L}]+){0,2}?\\s+(?<q>غدا|غدوة|نهار\\s+الغد|نفس\\s+النهار|ف\\s*نفس\\s+النهار|نفس\\s+اليوم|في\\s+نفس\\s+اليوم|ف\\s*نهارها)${E}` },
      /* free delivery: "التوصيل مجاني", "توصيل فابور لجميع المدن", "مصاريف التوصيل علينا", "بلا مصاريف التوصيل" */
      {
        kind: "free_delivery",
        re: `${B}(?:التوصيل|توصيل|الشحن|شحن|الليفريزون|ليفريزون)(?:\\s+(?:لجميع|لكل|ف\\s*جميع|في\\s+جميع|ل\\s*كاع)\\s+(?:المدن|مدن\\s+المغرب|المغرب))?\\s+(?:ديما\\s+|دائما\\s+|غير\\s+|كيكون\\s+)?(?:مجاني|مجانية|مجانا|بالمجان|فابور|بلاش|علينا)${E}(?:\\s+(?:ابتداء\\s+من|ابتداءا\\s+من|من|الا\\s+(?:شريتي|تجاوزت)\\s+ب?)\\s*${C})?`,
      },
      { kind: "free_delivery", re: `${B}(?:بلا|بدون)\\s+(?:مصاريف|ثمن|فلوس|تكاليف)\\s+(?:ال)?(?:توصيل|شحن)${E}` },
      { kind: "free_delivery", re: `${B}(?:مصاريف|ثمن)\\s+(?:ال)?(?:توصيل|شحن)\\s+(?:مجانية|مجانا|فابور|علينا)${E}` },
      /* returns: "الارجاع خلال 7 ايام", "تقدر ترجعها ف 7 ايام", "عندك 7 ايام باش ترجع", "الارجاع مجاني" */
      { kind: "return_window", re: `${B}${RETURN_NOUN}${E}${W}\\s*:?\\s*(?:${IN}\\s*)?${AMOUNT}` },
      { kind: "return_window", re: `${B}${RETURN_VERB}${E}\\s*${IN}\\s*${AMOUNT}` },
      { kind: "return_window", re: `${B}(?:${R}${U}|${D})\\s+(?:باش|لكي|كي)\\s+(?:ترجع|ترد|تراجع|ترجعي)${E}` },
      { kind: "return_window", qualifier: "free", re: `${B}(?:الارجاع|ارجاع|الترجيع)\\s+(?:مجاني|مجانا|فابور|بلاش)${E}` },
      /* exchange: "التبديل خلال 7 ايام", "تقدر تبدل المقاس ف 3 ايام", "التبديل ديال المقاس فابور" */
      { kind: "exchange", re: `${B}${EXCHANGE_NOUN}${E}${W}\\s*:?\\s*(?:${IN}\\s*)?${AMOUNT}` },
      { kind: "exchange", re: `${B}${EXCHANGE_VERB}${E}\\s*${IN}\\s*${AMOUNT}` },
      { kind: "exchange", re: `${B}(?:${R}${U}|${D})\\s+(?:باش|لكي|كي)\\s+(?:تبدل|تبدلي)${E}` },
      { kind: "exchange", qualifier: "free", re: `${B}${EXCHANGE_NOUN}(?:\\s+(?:ديال|د)\\s*(?:المقاس|اللون|القياس|النمرة))?\\s+(?:مجاني|مجانا|فابور|بلاش)${E}` },
      /* inspection: "حل الكولي قبل ما تخلص", "شوف السلعة عاد خلص", "خلص غير ملي تشوف" */
      { kind: "inspection", qualifier: "before_paying", re: `${B}${CHECK}${E}(?:\\s+[\\p{L}]+){0,4}?\\s+${BEFORE_PAYING}${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}${CHECK}\\s+(?:ال)?(?:كولي|كولية|طرد|كارطونة|باكية|كوليس)(?:\\s+ديالك)?${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}ما\\s+(?:ت|ك)?(?:خلص|دفع)(?:ي)?(?:ش)?\\s+حتى\\s+(?:تشوف|تحل|تتاكد|تعاين|تفتح|تجرب)${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}(?:خلص|تخلص|خلصي|ادفع|الدفع)\\s+(?:غير\\s+)?(?:من\\s+)?(?:بعد|ملي)\\s+(?:ما\\s+)?(?:تشوف|تحل|تتاكد|تعاين|تفتح|تجرب|شفتي|حليتي)${E}` },
      /* warranty: "ضمان 6 شهور", "الضمانة ديال عامين", "سنة ديال الضمان", "ضمان مدى الحياة" */
      { kind: "warranty", re: `${B}${WARRANTY}${E}(?:\\s+(?:ديال|د|لمدة|مدة|ف|في|على|حتى))?\\s*${AMOUNT}` },
      { kind: "warranty", re: `${B}(?:${R}${U}|${D}|${S})\\s+(?:ديال\\s+|د\\s*|من\\s+)?(?:الضمان|الضمانة|ضمان|ضمانة)${E}` },
      { kind: "warranty", re: `${B}${WARRANTY}\\s+(?<q>مدى\\s+الحياة|مدي\\s+الحياة|للابد|طول\\s+العمر)${E}` },
      /* refund: "نرجعو ليك فلوسك", "استرجاع الفلوس خلال 7 ايام", "فلوسك كترجع ليك" */
      { kind: "refund", re: `${B}(?:(?:استرجاع|استرداد|ارجاع)\\s+${MONEY}|${WE_REFUND})${E}\\s*${IN}\\s*${AMOUNT}` },
      { kind: "refund", qualifier: "money_back", re: `${B}${WE_REFUND}${E}` },
      { kind: "refund", qualifier: "money_back", re: `${B}(?:فلوسك|الفلوس\\s+ديالك|اموالك)\\s+(?:كترجع|ترجع|غادي\\s+ترجع|مضمونة)(?:\\s+ليك)?${E}` },
      /* a bare "استرداد المبلغ" (a refund, a heading) is no claim: it needs the guarantee ("ضمان", "مضمون") or "كامل" */
      { kind: "refund", qualifier: "money_back", re: `${B}(?:ضمان\\s+(?:استرجاع|استرداد)\\s+${MONEY}|(?:استرجاع|استرداد)\\s+${MONEY}(?:\\s+(?:ديالك|ديالكم))?\\s+(?:مضمون|مضمونة|كامل|كاملة|بالكامل))${E}` },
      /* confirmation call: "غادي نعيطو ليك باش نأكدو", "نتاصلو بيك خلال ساعتين", "من 9 حتى ل 19" */
      { kind: "confirmation_call", re: `${B}(?<!${COURIER}\\s+(?:(?:غادي|غا)\\s+)?)${WE_CALL}${E}(?!\\s+${COURIER})${CALL_TAIL}` },
      { kind: "confirmation_call", re: `${B}(?:سيتم|غادي\\s+يتم|يتم)\\s+(?:الاتصال|التواصل)\\s+(?:بك|بيك|معاك|معك)${E}${CALL_TAIL}` },
    ];
  },
};
