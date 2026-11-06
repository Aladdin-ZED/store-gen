/**
 * The register classifier's fixtures (P6 DESIGN; design.md DES-§9.4 register row, D3). Data only, read by the copy
 * group of `test:design`.
 *
 *  - `LABELLED`: 60 lines (20 MSA, 20 Darija, 20 without a marker pair). Acceptance: `registerOf` agrees on ≥ 90 %.
 *  - `MIXED`: 200 sentences built from 20 MSA frames × 10 Darija lexis words (the routine Moroccan commercial MSA
 *    frame with one Darija word). Acceptance: ≤ 2 % false `darija` calls (`none`, `msa` and `mixed` are not errors).
 *
 * PENDING: the labels are the build agent's, not yet a native speaker's (`REGISTER_LABELS_PENDING`); test:design
 * reports the set as pending until the owner's reviewer signs it off.
 */
export const REGISTER_LABELS_PENDING = true;

export const LABELLED: readonly { t: string; label: "msa" | "darija" | "none" }[] = [
  // MSA
  { t: "هذا المنتج الذي يمكنك استعماله كل يوم.", label: "msa" },
  { t: "لقد صممنا هذه القطعة لكي تدوم طويلا.", label: "msa" },
  { t: "يمكنك أن تطلب الآن وسوف يصلك الطرد.", label: "msa" },
  { t: "هذه العباية التي تناسب كل المناسبات.", label: "msa" },
  { t: "لم نضف أي عطر إلى هذا الصابون.", label: "msa" },
  { t: "كما يمكنك استبدال المقاس إذا لم يناسبك.", label: "msa" },
  { t: "حيث إن الدفع يتم عند الاستلام.", label: "msa" },
  { t: "ذلك هو السبب الذي جعلنا نختاره.", label: "msa" },
  { t: "سوف تجد في هذه العلبة كل ما تحتاجه.", label: "msa" },
  { t: "لقد اخترنا هذا القماش لأنه خفيف.", label: "msa" },
  { t: "إذا كان لديك سؤال، يمكنك مراسلتنا.", label: "msa" },
  { t: "هذه الكريمة التي تحبها البشرة الجافة.", label: "msa" },
  { t: "لن تحتاج إلى أي أداة إضافية.", label: "msa" },
  { t: "يتم التوصيل إلى جميع المدن.", label: "msa" },
  { t: "قد يختلف اللون قليلا عن الصورة، كما هو مذكور.", label: "msa" },
  { t: "نحن نجهز طلبك في نفس اليوم، ثم يتم الشحن.", label: "msa" },
  { t: "هذا الطقم الذي طلبه الكثير من الزبائن.", label: "msa" },
  { t: "لكن هذه النسخة أخف وزنا.", label: "msa" },
  { t: "سيتم الاتصال بك لتأكيد الطلب، ثم يتم التوصيل.", label: "msa" },
  { t: "إن هذا الزيت معصور على البارد.", label: "msa" },
  // Darija
  { t: "واش بغيتي توصلك دابا؟", label: "darija" },
  { t: "خلّص ملي توصلك، ماشي قبل.", label: "darija" },
  { t: "هاد العباية مزيانة بزاف.", label: "darija" },
  { t: "كاين المقاس ديالك، غير قولي لينا.", label: "darija" },
  { t: "شحال الثمن ديال هاد الطقم؟", label: "darija" },
  { t: "بغيت نعرف فين كاين التوصيل.", label: "darija" },
  { t: "الطرد كيوصلك فوقاش بغيتي.", label: "darija" },
  { t: "ما تخافش، كتخلص غير ملي تشوف الطرد.", label: "darija" },
  { t: "دابا تقدري تطلبي بلا ما تخلصي قبل.", label: "darija" },
  { t: "واخا، غادي نوصلوه ليك غدا.", label: "darija" },
  { t: "هادي هي القطعة اللي بغيتي.", label: "darija" },
  { t: "علاش ما تجربيش هاد الزيت؟", label: "darija" },
  { t: "كولشي كيعجبهم هاد الريحة.", label: "darija" },
  { t: "راه كاين التوصيل لجميع المدن.", label: "darija" },
  { t: "عافاك صيفط لينا المقاس ديالك.", label: "darija" },
  { t: "شنو هو المقاس اللي كيناسبك؟", label: "darija" },
  { t: "غير خلّص ملي يوصلك الطرد.", label: "darija" },
  { t: "بصح، كاينين جوج ديال الألوان.", label: "darija" },
  { t: "مزيان بزاف للبشرة الجافة.", label: "darija" },
  { t: "بغيتي تعرفي كيفاش كيتستعمل؟", label: "darija" },
  // no marker pair: compatible with either register
  { t: "قطن ناعم بقصّة مستقيمة.", label: "none" },
  { t: "معصور على البارد.", label: "none" },
  { t: "عبوة 50 مل.", label: "none" },
  { t: "الدفع عند الاستلام.", label: "none" },
  { t: "توصيل لجميع المدن.", label: "none" },
  { t: "منتج مزيان.", label: "none" },
  { t: "زيت أركان طبيعي.", label: "none" },
  { t: "مقاسات من S إلى XL.", label: "none" },
  { t: "لون بيج.", label: "none" },
  { t: "شفرة من الفولاذ المقاوم للصدأ.", label: "none" },
  { t: "تبديل المقاس مجاني.", label: "none" },
  { t: "هدية بسيطة.", label: "none" },
  { t: "الطرد يصلك في 48 ساعة.", label: "none" },
  { t: "خشب دافئ، لمسة ورد.", label: "none" },
  { t: "ثلاثة ألوان متوفرة.", label: "none" },
  { t: "صنع في المغرب.", label: "none" },
  { t: "اطلب الآن.", label: "none" },
  { t: "شكرا على ثقتكم.", label: "none" },
  { t: "تأكيد الطلب بالهاتف.", label: "none" },
  { t: "غطاء محكم الإغلاق.", label: "none" },
];

const FRAMES: readonly string[] = [
  "هذا المنتج {x} مناسب للاستعمال اليومي.",
  "يمكنك طلب {x} القطعة من الموقع.",
  "التوصيل {x} إلى جميع المدن المغربية.",
  "هذه الكريمة {x} خفيفة على البشرة.",
  "الدفع عند الاستلام {x} بعد معاينة الطرد.",
  "لقد اخترنا هذا القماش {x} لراحتك.",
  "المقاسات متوفرة {x} من S إلى XL.",
  "العطر يدوم {x} طوال اليوم.",
  "نجهز الطلب {x} في نفس اليوم.",
  "اللون يشبه الصورة {x} إلى حد كبير.",
  "يتم الاتصال بك {x} لتأكيد الطلب.",
  "الزيت معصور على البارد {x} في المغرب.",
  "هذه العلبة تحتوي {x} على ثلاث قطع.",
  "القطعة مصنوعة {x} من القطن الطبيعي.",
  "يمكن استبدال المقاس {x} خلال سبعة أيام.",
  "الساعة مقاومة للماء {x} في الاستعمال اليومي.",
  "الخلاط سهل التنظيف {x} بعد كل استعمال.",
  "هذا الطقم مناسب {x} للبنات من أربع سنوات.",
  "نرسل لك رقم التتبع {x} بعد الشحن.",
  "الثمن يشمل التوصيل {x} إلى باب البيت.",
];
const LEXIS: readonly string[] = ["بزاف", "مزيان", "دابا", "غير", "واخا", "حتى", "شوية", "بحال", "ديالك", "كاين"];

export const MIXED: readonly string[] = FRAMES.flatMap((f) => LEXIS.map((x) => f.replace("{x}", x)));
