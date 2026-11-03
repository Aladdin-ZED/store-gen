/**
 * Default copy of the offer showcase (ar · fr · en). Short, concrete, no numbers that would go
 * stale when the merchant edits a pack. Lines are picked for the product (consumable, giftable or
 * durable) and for the real bundle ladder (a duo, bigger packs, or a single offer).
 */
import { offerUnits } from "@/lib/page/catalog";
import type { Locale, Offers, Product, ProductCategory } from "@/lib/page/schema";

type L = { ar: string; fr: string; en: string };

/** The phrase in the page language; English for locales without a written line yet. */
const say = (locale: Locale, p: L): string => (p as Partial<Record<Locale, string>>)[locale] ?? p.en;

const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

/** Products used up and re-bought (routines), and products people offer. */
const CONSUMABLE: ReadonlySet<ProductCategory> = new Set(["skincare", "haircare", "health", "supplements", "organic-food", "cleaning", "grooming"]);
const GIFTABLE: ReadonlySet<ProductCategory> = new Set(["fragrance", "jewelry", "watches", "bags", "fashion", "decor", "traditional", "beauty"]);

export interface OfferCopy {
  kicker: string;
  title: string;
  lead: string;
}

export function offerCopy(locale: Locale, product: Product, offers: Offers, rng: () => number): OfferCopy {
  const qtys = offers.bundles.map((b) => offerUnits(b));
  const multi = qtys.some((q) => q > 1);
  const kind = CONSUMABLE.has(product.category) ? "use" : GIFTABLE.has(product.category) ? "gift" : "keep";

  const titles: L[] = multi
    ? [
        { ar: "كلما أخذت أكثر، *دفعت أقل*", fr: "Plus vous en prenez, *moins vous payez*", en: "The more you take, *the less you pay*" },
        ...(kind === "use"
          ? [
              { ar: "خذ احتياطك، *وادفع أقل*", fr: "Faites le plein, *payez moins*", en: "Stock up, *pay less*" },
              { ar: "روتينك اليومي *بلا انقطاع*", fr: "Votre routine, *sans rupture*", en: "Your routine, *without running out*" },
            ]
          : kind === "gift"
            ? [
                { ar: "واحدة لك، *وأخرى هدية*", fr: "Un pour vous, *un à offrir*", en: "One for you, *one to give*" },
                { ar: "هدية جاهزة، *بثمن أفضل*", fr: "Le cadeau tout trouvé, *à meilleur prix*", en: "The gift sorted, *for less*" },
              ]
            : [{ ar: "واحدة لك، *وأخرى لمن تحب*", fr: "Un pour vous, *un pour un proche*", en: "One for you, *one for someone close*" }]),
        ...(qtys.includes(2) ? [{ ar: "اثنتان *أفضل من واحدة*", fr: "À deux, *c'est plus malin*", en: "Two is *the smart move*" }] : []),
      ]
    : [
        { ar: "عرضك يصل *حتى باب الدار*", fr: "Votre offre, *livrée à la porte*", en: "Your offer, *delivered to the door*" },
        { ar: "ثمن واضح، *بلا مفاجآت*", fr: "Un prix clair, *sans surprise*", en: "One clear price, *no surprises*" },
      ];

  const kickers: L[] = multi
    ? [
        { ar: "اختر عرضك", fr: "Choisissez votre pack", en: "Pick your pack" },
        { ar: "عروض التوفير", fr: "Packs & économies", en: "Packs & savings" },
      ]
    : [{ ar: "عرضك", fr: "Votre offre", en: "Your offer" }];

  const leads: L[] = multi
    ? [
        {
          ar: "كل العروض بالدفع عند الاستلام. اختر عرضك ونتصل بك للتأكيد.",
          fr: "Tous les packs se paient à la livraison. Choisissez, on vous appelle pour confirmer.",
          en: "Every pack is cash on delivery. Pick one, we call you to confirm.",
        },
        {
          ar: "نفس الجودة، ثمن أفضل للقطعة، والدفع فقط عند الاستلام.",
          fr: "La même qualité, un meilleur prix à la pièce, et vous payez seulement à la réception.",
          en: "Same quality, a better price per piece, and you only pay when it arrives.",
        },
        kind === "use"
          ? {
              ar: "مع العرض يدوم روتينك أطول، بثمن أفضل للقطعة.",
              fr: "Avec un pack, votre routine tient plus longtemps, à un meilleur prix la pièce.",
              en: "A pack keeps your routine going longer, at a better price per piece.",
            }
          : kind === "gift"
            ? {
                ar: "احتفظ بواحدة وأهدِ الأخرى. كل عرض يُدفع عند الاستلام.",
                fr: "Gardez-en un, offrez l'autre. Chaque pack se paie à la livraison.",
                en: "Keep one, give the other. Every pack is paid on delivery.",
              }
            : {
                ar: "واحدة للدار وأخرى لمن تحب. كل عرض يُدفع عند الاستلام.",
                fr: "Un pour la maison, un pour un proche. Chaque pack se paie à la livraison.",
                en: "One for home, one for someone close. Every pack is paid on delivery.",
              },
      ]
    : [
        {
          ar: "تدفع عند الاستلام، بعد معاينة طلبيتك.",
          fr: "Vous payez à la livraison, après avoir vérifié votre commande.",
          en: "You pay on delivery, after checking your order.",
        },
      ];

  return {
    kicker: say(locale, pick(rng, kickers)),
    title: say(locale, pick(rng, titles)),
    lead: say(locale, pick(rng, leads)),
  };
}

/** Button text of each pack when the merchant leaves it empty. */
export const chooseLabel = (locale: Locale, single: boolean): string =>
  say(
    locale,
    single
      ? { ar: "اطلب دابا", fr: "Je commande", en: "Order now" }
      : { ar: "بغيت هاد العرض", fr: "Je prends ce pack", en: "I'll take this one" },
  );

/** Field labels of the wallet passes (the values are the pack's real figures). */
export const passLabels = (locale: Locale) => ({
  total: say(locale, { ar: "المجموع", fr: "Total", en: "Total" }),
  unit: say(locale, { ar: "ثمن القطعة", fr: "La pièce", en: "Per piece" }),
  save: say(locale, { ar: "التوفير", fr: "Économie", en: "You save" }),
  qty: say(locale, { ar: "الكمية", fr: "Quantité", en: "Quantity" }),
});

/** The quiet link under the showcase row (sheet S4): the picker lives in the order form. */
export const showcaseLink = (locale: Locale): string =>
  say(locale, { ar: "اختار العرض ديالك فاستمارة الطلب", fr: "Choisissez votre pack dans le formulaire", en: "Choose your pack in the order form" });
