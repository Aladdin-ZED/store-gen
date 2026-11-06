/**
 * French policy-claim patterns (P3 LANDING; landing.md LAN-§6.3 rev 3 ENGP-8): read by ./claims.ts for `fr` pages and,
 * because Moroccan pages mix the two languages, for `ar` pages too. Every rule needs a quantity or a qualifier next to
 * its keyword, so "retour en force", "la livraison du produit", "garantie de qualité" and "appel à l'action" give
 * nothing. Patterns run on normalised text (./claims.ts `normaliseClaimText`: lower case, Latin digits, straight
 * apostrophes, plain spaces).
 */
import type { ClaimLexicon } from "./claims";

export const FR_LEXICON: ClaimLexicon = {
  numbers: {
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
    onze: 11,
    douze: 12,
    quinze: 15,
    vingt: 20,
    trente: 30,
    soixante: 60,
  },
  units: {
    h: "hour",
    hr: "hour",
    hrs: "hour",
    heure: "hour",
    heures: "hour",
    min: "minute",
    mn: "minute",
    minute: "minute",
    minutes: "minute",
    j: "day",
    jour: "day",
    jours: "day",
    "jours ouvrés": "day",
    "jours ouvrables": "day",
    semaine: "week",
    semaines: "week",
    mois: "month",
    an: "year",
    ans: "year",
    année: "year",
    années: "year",
  },
  duals: {},
  singles: {},
  qualifiers: {
    demain: ["next_day", 1],
    "le lendemain": ["next_day", 1],
    "le jour même": ["same_day", 0],
    "aujourd'hui": ["today", null],
    "dans la journée": ["today", null],
    "dans l'heure": ["within_hour", 1],
    "à vie": ["lifetime", null],
    gratuit: ["free", null],
    gratuits: ["free", null],
    gratuite: ["free", null],
    gratuites: ["free", null],
    offert: ["free", null],
    offerts: ["free", null],
    offerte: ["free", null],
    offertes: ["free", null],
    "sans frais": ["free", null],
  },
  rangeSeparators: ["-", "/", "à", "a", "et", "ou"],
  currency: "dh|mad|dhs|dirhams?|€|eur|euros?",
  rules: ({ B, E, R, U, W, T1, T2, C }) => {
    // never a bare "chez vous" ("utilisez-le chez vous en 5 minutes") or "livre" (a book, a pound)
    const DELIVERY = "(?:livraison|livrée?s?|livrons|expédi(?:tion|ée?s?|ons)|envoyée?s?|reçue?s?\\s+chez\\s+vous|à\\s+votre\\s+porte)";
    const BY = "(?:en\\s+moins\\s+de|en|sous|dans(?:\\s+les)?|d'ici|entre|de|en\\s+seulement|seulement\\s+en)";
    const RETURN = "(?:retours?|retourner|retournez(?:-le|-la|-les)?|renvoyer|renvoyez(?:-le|-la|-les)?|rétractation|droit\\s+de\\s+retour)";
    const WITHIN = "(?:sous|dans(?:\\s+les)?|pendant|durant|jusqu'à|en|d'ici|de|dans\\s+un\\s+délai\\s+de)";
    const CALLER = "(?:on|nous|notre\\s+(?:équipe|service\\s+client|conseill(?:er|ère))|une?\\s+conseill(?:er|ère)|le\\s+service\\s+client)";
    const CALLS = "vous\\s+(?:appel(?:le|lera|ons|lerons|leront)|rappel(?:le|lera|ons|lerons)|contact(?:e|era|ons|erons)|téléphon(?:e|era|ons|erons))";
    const CALL_TAIL = `(?:${W}\\s+(?:(?:dans|sous|en|d'ici)\\s+(?:les\\s+|moins\\s+de\\s+)?${R}${U}|(?<q>aujourd'hui|dans\\s+l'heure|le\\s+jour\\s+même|dans\\s+la\\s+journée)${E}|(?:entre|de|dès|à\\s+partir\\s+de)\\s+${T1}(?:\\s*(?:et|à|-)\\s*${T2})?))?`;
    return [
      /* delivery time: "Livraison en 24 h", "livrée sous 48 heures", "Livraison 24/48h", "expédié dans les 24 heures" */
      { kind: "delivery_time", re: `${B}${DELIVERY}${E}(?:\\s+express|\\s+rapide)?${W}\\s*:?\\s*(?:${BY}\\s+)?${R}${U}` },
      /* "24h chrono pour la livraison", "48 h de livraison" */
      { kind: "delivery_time", re: `${B}${R}${U}\\s+(?:chrono\\s+)?(?:pour\\s+(?:la\\s+|vous\\s+)?livr\\p{L}*|de\\s+livraison|livraison)${E}` },
      /* "livré demain", "livraison le jour même" */
      { kind: "delivery_time", re: `${B}${DELIVERY}${E}(?:\\s+(?:dès|chez\\s+vous|à\\s+domicile))?\\s+(?<q>demain|le\\s+lendemain|le\\s+jour\\s+même)${E}` },
      /* free delivery, with an optional threshold: "livraison gratuite", "frais de port offerts", "livraison offerte dès 300 DH" */
      {
        kind: "free_delivery",
        re: `${B}(?:livraison|livrée?s?|frais\\s+de\\s+(?:livraison|port)|port|expédition)(?:\\s+(?:express|à\\s+domicile|partout\\s+au\\s+maroc))?\\s+(?:est\\s+|sont\\s+|100\\s*%\\s+|toujours\\s+)?(?:gratuite?s?|offerte?s?|gratuitement|inclus(?:e|es)?|à\\s+0\\s*(?:dh|mad|€))${E}(?:\\s+(?:dès|à\\s+partir\\s+de|pour\\s+(?:tout\\s+)?(?:achat|commande)\\s+de|au-delà\\s+de)\\s+${C})?`,
      },
      { kind: "free_delivery", re: `${B}sans\\s+frais\\s+de\\s+(?:livraison|port)${E}` },
      { kind: "free_delivery", re: `${B}(?:gratuite|offerte)\\s*:\\s*la\\s+livraison${E}` },
      /* return window: "retour sous 7 jours", "retournez-le dans les 14 jours", "7 jours pour changer d'avis", "retour gratuit" */
      { kind: "return_window", re: `${B}${RETURN}${E}(?:\\s+(?:gratuits?|offerts?|possibles?|acceptés?|facile|simple|sans\\s+frais))?(?:\\s+(?:(?:de|d')\\s*)?(?:le|la|les|l'|votre|vos|du|des)\\s*(?:produit|article|colis|commande)s?)?\\s+${WITHIN}\\s+${R}${U}` },
      { kind: "return_window", re: `${B}${R}${U}\\s+pour\\s+(?:nous\\s+)?(?:le\\s+|la\\s+|les\\s+)?(?:retourner|renvoyer|changer\\s+d'avis|vous\\s+rétracter|nous\\s+le\\s+retourner)${E}` },
      { kind: "return_window", re: `${B}retours?\\s+(?<q>gratuits?|offerts?|sans\\s+frais)${E}` },
      /* exchange: "échange sous 7 jours", "échange de taille gratuit", "7 jours pour échanger" */
      { kind: "exchange", re: `${B}(?:échanges?|échanger|échangez)${E}(?:\\s+de\\s+(?:taille|couleur|pointure|modèle|produit))?(?:\\s+(?:gratuits?|offerts?|possibles?|acceptés?|facile|sans\\s+frais))?\\s+${WITHIN}\\s+${R}${U}` },
      { kind: "exchange", re: `${B}échanges?(?:\\s+de\\s+(?:taille|couleur|pointure|modèle|produit))?\\s+(?<q>gratuits?|offerts?|sans\\s+frais)${E}` },
      { kind: "exchange", re: `${B}${R}${U}\\s+pour\\s+(?:l')?échang\\p{L}*${E}` },
      /* inspection: "ouvrez le colis avant de payer", "vérifiez votre colis", "payez après avoir vérifié" */
      { kind: "inspection", qualifier: "before_paying", re: `${B}(?:ouvr|vérifi|inspect|contrôl|examin|essay)\\p{L}*(?:-\\p{L}+)?(?:\\s+[\\p{L}'-]+){0,4}?\\s+avant\\s+(?:de\\s+(?:(?:le|la|les)\\s+)?(?:payer|régler)|le\\s+paiement|paiement)${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}(?:ouvr|vérifi|inspect|contrôl|examin)\\p{L}*\\s+(?:(?:le|votre|vos|les|ton)\\s+)?(?:colis|paquet|carton)${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}pa(?:yez|yer|iement)\\s+(?:seulement\\s+|uniquement\\s+)?après\\s+(?:avoir\\s+)?(?:vérifié|ouvert|inspecté|contrôlé|essayé)${E}` },
      /* warranty: "garantie 2 ans", "12 mois de garantie", "garantie à vie" */
      { kind: "warranty", re: `${B}garanti(?:e|es|s)?${E}(?:\\s+(?:commerciale|constructeur|fabricant|totale|complète|pièces\\s+et\\s+main-d'oeuvre))?\\s*(?::\\s*|de\\s+|d'|pendant\\s+|sur\\s+)?${R}${U}` },
      { kind: "warranty", re: `${B}${R}${U}\\s+(?:de\\s+)?garanti(?:e|es)?${E}` },
      { kind: "warranty", re: `${B}garanti(?:e|es)?\\s+(?<q>à\\s+vie)${E}` },
      /* refund: "satisfait ou remboursé", "remboursé sous 7 jours", "remboursement garanti" */
      { kind: "refund", qualifier: "money_back", re: `${B}satisfaite?s?\\s+ou\\s+rembours(?:ée?s?|ement)${E}` },
      { kind: "refund", re: `${B}(?:rembours(?:ée?s?|ement|ons|erons|er)|argent\\s+rendu)${E}(?:\\s+(?:intégral(?:ement)?|complet|total))?\\s+(?:sous|en|dans(?:\\s+les)?|d'ici|pendant)\\s+${R}${U}` },
      { kind: "refund", qualifier: "money_back", re: `${B}(?:remboursement|argent)\\s+(?:intégral\\s+)?(?:garanti|rendu|remboursé)${E}` },
      /* confirmation call: "on vous appelle pour confirmer", "nous vous appelons dans l'heure", "entre 9h et 19h" */
      { kind: "confirmation_call", re: `${B}${CALLER}\\s+${CALLS}${E}${CALL_TAIL}` },
      { kind: "confirmation_call", re: `${B}vous\\s+serez\\s+(?:appelée?s?|rappelée?s?|contactée?s?)${E}${CALL_TAIL}` },
      { kind: "confirmation_call", re: `${B}(?:appel|rappel)\\s+(?:de\\s+confirmation\\s+)?(?:(?<q>aujourd'hui|dans\\s+l'heure|le\\s+jour\\s+même)${E}|(?:sous|dans|en)\\s+(?:les\\s+)?${R}${U})` },
    ];
  },
};
