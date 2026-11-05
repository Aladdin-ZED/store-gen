/**
 * Admin messages (ar) of the finance file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/finance.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/finance";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- notifications (OPE-§21.4) ---- */
  "notify.fin.profit_alert.title": "تنبيه الربح: {alertKind}",
  "notify.fin.profit_alert.body": "شي رقم فات الحد ديالك: {value} مقابل {threshold} (n = {n}). حل الربح باش تشوف التفاصيل.",

  /* ---- alerts ---- */
  "fin.alert.cpa_over_breakeven": "تكلفة الطلب فوق نقطة التعادل ديالك هادي يوماين: {value} والحد هو {threshold}.",
  "fin.alert.refusal_spike": "الرفض طالع: {value} % ف 7 أيام الأخيرة مقابل {threshold} % ف 28 يوم (n = {n}).",
  "fin.alert.city_refusal": "{city} كترفض كثر من المدن الأخرى: {value} % مقابل {threshold} % (n = {n}).",
  "fin.alert.city_refusal.reasons": "{count} من {total} رفض: {reason}",
  "fin.alert.city_refusal.fix": "دير المدينة ما كتوصلهاش ولا زيد ف ثمن التوصيل ديالها",

  /* ---- what is missing ---- */
  "fin.missing.title": "زيد التكاليف ديالك باش تشوف الربح",
  "fin.missing.item_costs": "تكلفة الوحدة ديال كل منتوج بعتيه",
  "fin.missing.packaging": "تكلفة التغليف ديال كل طلب",
  "fin.missing.delivery_fee": "ثمن التوصيل ديال شركة التوصيل",
  "fin.missing.return_fee": "ثمن الرجوع ديال شركة التوصيل",
  "fin.missing.confirm_n": "{n} طلبات تحسمو حتى لدابا: نسبة التأكيد خاصها 30",
  "fin.missing.delivery_n": "{n} توصيلات سالاو حتى لدابا: نسبة التوصيل خاصها 30",

  /* ---- break-even card ---- */
  "fin.be.headline": "تقدر تخلص حتى {placed} على كل طلب تدار ({delivered} على كل طلب توصل).",
  "fin.be.paid": "ف 28 يوم الأخيرة خلصتي {cpa} على كل طلب تدار.",
  "fin.be.interval": "غالبا بين {low} و {high}",
  "fin.be.rateN": "{rate} % على {n} طلب",
  "fin.be.noSpend": "كتب مصاريف الإشهار باش تقارنها مع نقطة التعادل.",
  "fin.be.converted": "المصاريف تحولات بالسعر ديالك 1 {currency} = {rate} {storeCurrency} (من {day})",
  "fin.be.daysNotCounted": "{n, plural, one {نهار واحد ما تحسبش: خاصو سعر} other {# أيام ما تحسبوش: خاصهم سعر}}",
  "fin.be.outcomesAsOf": "نتائج التوصيل حسب آخر مزامنة، {time}",
  "fin.be.byAngle": "حسب الزاوية",
  "fin.be.byAngle.note": "المصاريف مازال ما مقسماش على الزوايا، داكشي علاش ما كاينش تكلفة الطلب هنا.",
  "fin.be.suppressed": "{n, plural, one {مجموعة صغيرة مخبية (أقل من 5 طلبات)} other {# مجموعات صغيرة مخبية (أقل من 5 طلبات)}}",

  /* ---- costs ---- */
  "fin.costs.bySku": "التكاليف حسب SKU",
  "fin.costs.fromSku": "من SKU {sku}، {cost}",
  "fin.costs.packaging": "التغليف ديال كل طلب",
  "fin.costs.notSet": "ما محددش",
  "fin.carrier.title": "شركة التوصيل ديالي",
  "fin.carrier.default": "باقي المدن",
  "fin.carrier.feeCharged": "شحال كتاخد من الزبون",
  "fin.carrier.feePaid": "شحال كتخلص",
  "fin.carrier.codFee": "{bp} % من المبلغ اللي تقبض، الحد الأدنى {min}، وزيد {flat} على كل كولي",
  "fin.settlement.question": "شكون كيبقاو عندو الفلوس من بعد التوصيل؟",
  "fin.settlement.at_delivery": "كنوصل براسي، ولا الليفرور كيعطيني الفلوس",
  "fin.settlement.statement": "شركة التوصيل كتخلصني من بعد بكشف",
  "fin.cash.marked": "{n, plural, one {طلب واحد تسجل بلي الفلوس وصلات} other {# طلبات تسجلو بلي الفلوس وصلات}}",

  /* ---- ad spend ---- */
  "fin.ads.billedIn": "الفاتورة ب {currency}",
  "fin.ads.needsRate": "خاصو سعر",
  "fin.ads.rateEstimate": "السعر ديالك، تقدير",
  "fin.ads.rateLine": "1 {currency} = {rate} {storeCurrency} من {day}",

  /* ---- errors ---- */
  "fin.error.feature_off": "الربح مازال ما متوفرش لهاد المتجر.",
  "fin.error.invalid": "شوف المبلغ وعاود.",
  "fin.error.not_found": "هاد الصفحة ولا هاد المنتوج ما بقاش منشور.",

  /* ---- Store Health ---- */
  "health.ops.fin_costs_missing.text": "{n, plural, one {منتوج واحد كتبيعو ما عندوش تكلفة} other {# منتوجات كتبيعهم ما عندهمش تكلفة}}: الربح ديال الطلبات ديالهم ما يقدرش يبان.",
  "health.ops.fin_costs_missing.fix": "زيد التكاليف",
  "health.ops.fin_settlement_check.text": "{n} طلب توصل وما قلتيش شكون كيبقاو عندو الفلوس من بعد التوصيل.",
  "health.ops.fin_settlement_check.fix": "جاوب ف شركة التوصيل ديالي",
  "health.ops.fin_fee_gap.text": "{n, plural, one {مدينة وحدة من المدن الكبار كتخلص} other {# مدن من المدن الكبار كيخلصو}} أقل من اللي كتكلفك شركة التوصيل (حتى {baseline} على الطلب).",
  "health.ops.fin_fee_gap.fix": "قارن الأثمنة",
  "health.ops.fin_ad_rate_missing.text": "{n, plural, one {نهار واحد ديال مصاريف الإشهار بعملة أخرى ما عندوش سعر} other {# أيام ديال مصاريف الإشهار بعملة أخرى ما عندهمش سعر}} وما داخلينش ف تكلفة الطلب.",
  "health.ops.fin_ad_rate_missing.fix": "زيد سعر",
};
