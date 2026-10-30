/**
 * The built-in call script (P4 CALL CENTER; operations.md OPE-§7.3, OD34): the six steps and the six objection answers,
 * verbatim in fr / ar (Darija-friendly) / en. Code constants (no seeding write): a store without an active
 * `call_script` row of its own is handed these (OPE-§7.2 selection), and the editor's "Reset to built-in" goes back to
 * them. Pure and isomorphic (P3's kit and the editor may import it).
 *
 * The texts carry no claim the store has not stated: no "most customers add…", no delivery promise without a zone ETA
 * (`eta_text` sits in optional blocks, so an empty ETA removes every sentence about delivery timing), no courier
 * behaviour, no comparative or quality claim in `cheaper_elsewhere` and `trust`. Policy lines (inspection, exchange
 * window) are the manager's to add from `policies` facts (OPE-§7.4).
 *
 * The step titles and the tick-box labels are not given by the spec table beyond "Accueil / Greeting" etc.; the ar
 * titles below are this file's wording (short Darija nouns an agent reads at a glance).
 */
import type { ScriptDoc, ScriptLocale } from "./script";

export const builtinScriptId = (locale: ScriptLocale): string => `builtin:script:${locale}`;

export const BUILTIN_SCRIPTS: Readonly<Record<ScriptLocale, ScriptDoc>> = {
  fr: {
    v: 1,
    steps: [
      {
        id: "greeting",
        title: "Accueil",
        say: "Bonjour {customer_first_name}, ici[[ {agent_first_name} de]] {store_name}. Vous avez commandé {offer_label} chez nous. Vous avez une minute pour confirmer ?",
        checks: [],
        when: "always",
        action: "none",
      },
      { id: "recap", title: "Récapitulatif", say: "Je récapitule : {units_text}, total {total}[[, {shipping_text}]].", checks: [], when: "always", action: "none" },
      {
        id: "address",
        title: "Adresse",
        say: "Vous êtes bien à {city} ? Pouvez-vous me donner l'adresse exacte et un repère proche ?",
        checks: ["Ville", "Adresse et repère"],
        when: "always",
        action: "edit_address",
      },
      {
        id: "availability",
        title: "Disponibilité",
        say: "[[La livraison est prévue {eta_text}. ]]Vous serez joignable à ce numéro pour le livreur ?",
        checks: [],
        when: "always",
        action: "none",
      },
      {
        id: "offer",
        title: "Proposition",
        say: "Nous proposons aussi {upsell_title} à {upsell_price}. Voulez-vous l'ajouter à la commande ?",
        checks: [],
        when: "upsell",
        action: "add_upsell",
      },
      {
        id: "close",
        title: "Clôture",
        say: "Merci {customer_first_name}, votre commande est confirmée.[[ Livraison prévue {eta_text}.]] Bonne journée !",
        checks: [],
        when: "always",
        action: "none",
      },
    ],
    objections: [
      { id: "price", say: "Le prix de {offer_label} est {total}[[, {shipping_text}]]. Vous payez à la réception, rien avant." },
      { id: "trust", say: "Vous payez le livreur en main propre après avoir vu le colis.[[ Pour toute question : {confirm_number}.]]" },
      { id: "delivery_time", say: "[[La livraison est prévue {eta_text}. ]]Nous vous prévenons le jour de la livraison." },
      { id: "think", say: "Pas de souci. Je peux vous rappeler à quelle heure ?" },
      { id: "cheaper_elsewhere", say: "Je comprends. Ce que vous payez ici : {total}, à la réception, avec {store_name} comme interlocuteur." },
      { id: "wrong_size", say: "Dites-moi la taille ou la couleur que vous voulez, je corrige la commande maintenant." },
    ],
  },
  ar: {
    v: 1,
    steps: [
      {
        id: "greeting",
        title: "السلام",
        say: "السلام {customer_first_name}، معاك[[ {agent_first_name} من]] {store_name}. درتي عندنا طلب ديال {offer_label}. عندك دقيقة باش نأكدو؟",
        checks: [],
        when: "always",
        action: "none",
      },
      { id: "recap", title: "مراجعة الطلب", say: "غادي نعاود ليك الطلب: {units_text}، المجموع {total}[[، {shipping_text}]].", checks: [], when: "always", action: "none" },
      {
        id: "address",
        title: "العنوان",
        say: "واش انت ف {city}؟ عطيني العنوان بالضبط وشي علامة قريبة.",
        checks: ["المدينة", "العنوان والعلامة"],
        when: "always",
        action: "edit_address",
      },
      { id: "availability", title: "التوفر", say: "[[التوصيل متوقع {eta_text}. ]]واش غادي تكون متوفر ف هاد الرقم للموزع؟", checks: [], when: "always", action: "none" },
      { id: "offer", title: "عرض إضافي", say: "عندنا حتى {upsell_title} ب {upsell_price}. بغيتي نزيدوه ليك ف الطلب؟", checks: [], when: "upsell", action: "add_upsell" },
      { id: "close", title: "الختام", say: "شكرا {customer_first_name}، الطلب ديالك تأكد.[[ التوصيل متوقع {eta_text}.]] نهارك مبروك!", checks: [], when: "always", action: "none" },
    ],
    objections: [
      { id: "price", say: "ثمن {offer_label} هو {total}[[، {shipping_text}]]. كتخلص غير ملي يوصلك، والو قبل." },
      { id: "trust", say: "كتخلص الموزع يد بيد من بعد ما تشوف الكولي.[[ لأي سؤال: {confirm_number}.]]" },
      { id: "delivery_time", say: "[[التوصيل متوقع {eta_text}. ]]غادي نخبروك نهار التوصيل." },
      { id: "think", say: "ماشي مشكل. إمتى نقدر نعاود نعيط ليك؟" },
      { id: "cheaper_elsewhere", say: "فهمتك. اللي كتخلص هنا: {total}، ملي يوصلك، و{store_name} هي اللي مسؤولة." },
      { id: "wrong_size", say: "قول لي القياس ولا اللون اللي بغيتي، نصحح الطلب دابا." },
    ],
  },
  en: {
    v: 1,
    steps: [
      {
        id: "greeting",
        title: "Greeting",
        say: "Hello {customer_first_name}, this is[[ {agent_first_name} from]] {store_name}. You ordered {offer_label} from us. Do you have a minute to confirm?",
        checks: [],
        when: "always",
        action: "none",
      },
      { id: "recap", title: "Check", say: "Let me read it back: {units_text}, total {total}[[, {shipping_text}]].", checks: [], when: "always", action: "none" },
      {
        id: "address",
        title: "Address",
        say: "You're in {city}, right? Could you give me the exact address and a landmark nearby?",
        checks: ["City", "Address and landmark"],
        when: "always",
        action: "edit_address",
      },
      {
        id: "availability",
        title: "Availability",
        say: "[[Delivery is planned {eta_text}. ]]Will you be reachable on this number for the courier?",
        checks: [],
        when: "always",
        action: "none",
      },
      { id: "offer", title: "Offer", say: "We also offer {upsell_title} for {upsell_price}. Would you like to add it?", checks: [], when: "upsell", action: "add_upsell" },
      {
        id: "close",
        title: "Close",
        say: "Thank you {customer_first_name}, your order is confirmed.[[ Delivery is planned {eta_text}.]] Have a good day!",
        checks: [],
        when: "always",
        action: "none",
      },
    ],
    objections: [
      { id: "price", say: "{offer_label} is {total}[[, {shipping_text}]]. You pay on delivery, nothing before." },
      { id: "trust", say: "You pay the courier in person after seeing the parcel.[[ Any question: {confirm_number}.]]" },
      { id: "delivery_time", say: "[[Delivery is planned {eta_text}. ]]We let you know on the delivery day." },
      { id: "think", say: "No problem. When may I call you back?" },
      { id: "cheaper_elsewhere", say: "I understand. What you pay here is {total}, on delivery, with {store_name} answering for it." },
      { id: "wrong_size", say: "Tell me the size or colour you want and I correct the order now." },
    ],
  },
};
