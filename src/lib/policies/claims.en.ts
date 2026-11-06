/**
 * English policy-claim patterns (P3 LANDING; landing.md LAN-§6.3 rev 3 ENGP-8): read by ./claims.ts for `en` pages
 * (and pages in a locale without a lexicon of its own). Every rule needs a quantity or a qualifier next to its keyword,
 * so "the return of the classics", "delivery of the product", "quality guarantee" and "call to action" give nothing.
 * Patterns run on normalised text (lower case, Latin digits, straight apostrophes, plain spaces).
 */
import type { ClaimLexicon } from "./claims";

export const EN_LEXICON: ClaimLexicon = {
  numbers: {
    one: 1,
    a: 1,
    an: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    twelve: 12,
    fourteen: 14,
    fifteen: 15,
    twenty: 20,
    thirty: 30,
    sixty: 60,
  },
  units: {
    h: "hour",
    hr: "hour",
    hrs: "hour",
    hour: "hour",
    hours: "hour",
    min: "minute",
    mins: "minute",
    minute: "minute",
    minutes: "minute",
    day: "day",
    days: "day",
    "working days": "day",
    "business days": "day",
    week: "week",
    weeks: "week",
    month: "month",
    months: "month",
    year: "year",
    years: "year",
    yr: "year",
  },
  duals: {},
  singles: {},
  qualifiers: {
    "next-day": ["next_day", 1],
    "next day": ["next_day", 1],
    tomorrow: ["next_day", 1],
    overnight: ["next_day", 1],
    "same-day": ["same_day", 0],
    "same day": ["same_day", 0],
    today: ["today", null],
    "the same day": ["today", null],
    "within the hour": ["within_hour", 1],
    lifetime: ["lifetime", null],
    "for life": ["lifetime", null],
  },
  rangeSeparators: ["-", "/", "to", "or"],
  currency: "dh|mad|dirhams?|€|eur|euros?|\\$|usd|£|gbp",
  rules: ({ B, E, R, U, W, T1, T2, C }) => {
    const DELIVERY = "(?:deliver(?:y|ed|s)?|ship(?:s|ped|ping)?|dispatch(?:ed|es)?|arrives?\\s+at\\s+your\\s+door|at\\s+your\\s+door)";
    const BY = "(?:in\\s+(?:just\\s+|only\\s+|under\\s+)?|within|under|between|in\\s+less\\s+than)";
    const WITHIN = "(?:within|in|for\\s+up\\s+to|up\\s+to|for)";
    const CALLER = "(?:we(?:'ll|\\s+will)?|our\\s+(?:team|agents?|customer\\s+service)(?:\\s+will)?|an\\s+agent\\s+will|someone\\s+will)";
    const CALL_TAIL = `(?:${W}\\s+(?:(?:within|in)\\s+(?:the\\s+next\\s+|less\\s+than\\s+)?${R}${U}|(?<q>today|within\\s+the\\s+hour|the\\s+same\\s+day)${E}|(?:between|from|after)\\s+${T1}(?:\\s*(?:and|to|-)\\s*${T2})?))?`;
    return [
      /* delivery time: "delivered in 24 hours", "ships within 48h", "delivery in 2 to 4 days" */
      { kind: "delivery_time", re: `${B}${DELIVERY}${E}${W}\\s*:?\\s*(?:${BY}\\s*)?${R}${U}` },
      /* "24-48h delivery", "48-hour shipping" */
      { kind: "delivery_time", re: `${B}${R}${U}\\s+(?:express\\s+)?(?:delivery|shipping|dispatch)${E}` },
      /* "next-day delivery", "same-day shipping", "delivered tomorrow" */
      { kind: "delivery_time", re: `${B}(?<q>next[- ]day|same[- ]day|overnight)\\s+(?:delivery|shipping|dispatch)${E}` },
      { kind: "delivery_time", re: `${B}(?:delivered|ships|arrives)\\s+(?<q>tomorrow|the\\s+same\\s+day)${E}` },
      /* free delivery: "free delivery", "free shipping on orders over 300 MAD", "delivery is on us" */
      { kind: "free_delivery", re: `${B}free\\s+(?:home\\s+|express\\s+)?(?:delivery|shipping)${E}(?:\\s+(?:on\\s+(?:all\\s+)?orders\\s+(?:over|above|from)|over|from)\\s+${C})?` },
      { kind: "free_delivery", re: `${B}(?:delivery|shipping)\\s+(?:is\\s+)?(?:always\\s+)?(?:free|on\\s+us|included)${E}` },
      { kind: "free_delivery", re: `${B}(?:ships|delivered)\\s+(?:for\\s+)?free${E}` },
      /* returns: "return within 30 days", "30-day returns", "free returns", "30 days to change your mind" */
      { kind: "return_window", re: `${B}(?:returns?|return\\s+it|send\\s+it\\s+back)${E}(?:\\s+(?:accepted|are\\s+free|free))?\\s+${WITHIN}\\s+${R}${U}` },
      { kind: "return_window", re: `${B}${R}${U}\\s+(?:free\\s+|easy\\s+|money-back\\s+)?returns?${E}` },
      { kind: "return_window", re: `${B}${R}${U}\\s+to\\s+(?:return\\s+it|return|send\\s+it\\s+back|change\\s+your\\s+mind)${E}` },
      { kind: "return_window", qualifier: "free", re: `${B}free\\s+returns?${E}` },
      /* exchanges: "exchange within 14 days", "free size exchanges" */
      { kind: "exchange", re: `${B}(?:exchanges?|swap\\s+it)${E}(?:\\s+(?:accepted|are\\s+free))?\\s+${WITHIN}\\s+${R}${U}` },
      { kind: "exchange", re: `${B}${R}${U}\\s+(?:free\\s+)?exchanges?${E}` },
      { kind: "exchange", qualifier: "free", re: `${B}free\\s+(?:size\\s+|colou?r\\s+)?exchanges?${E}` },
      /* inspection: "open the parcel before paying", "check it before you pay", "pay only after you inspect" */
      { kind: "inspection", qualifier: "before_paying", re: `${B}(?:open|check|inspect|examine|try)\\p{L}*(?:\\s+[\\p{L}'-]+){0,4}?\\s+before\\s+(?:you\\s+)?pay(?:ing)?${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}(?:open|check|inspect|examine)\\s+(?:(?:the|your)\\s+)?(?:parcel|package)${E}` },
      { kind: "inspection", qualifier: "before_paying", re: `${B}pay\\s+only\\s+after\\s+(?:you\\s+)?(?:check|inspect|open|see)\\p{L}*${E}` },
      /* warranty: "2-year warranty", "warranty: 12 months", "guaranteed for 2 years", "lifetime warranty" */
      { kind: "warranty", re: `${B}${R}${U}\\s+(?:manufacturer\\s+|full\\s+)?(?:warranty|guarantee)${E}` },
      { kind: "warranty", re: `${B}(?:warranty|guaranteed)${E}\\s*(?::\\s*|of\\s+|for\\s+)?${R}${U}` },
      { kind: "warranty", re: `${B}(?<q>lifetime)\\s+(?:warranty|guarantee)${E}` },
      /* refund: "money-back guarantee", "full refund within 7 days", "satisfied or your money back" */
      { kind: "refund", qualifier: "money_back", re: `${B}money[- ]back\\s+guarantee${E}` },
      { kind: "refund", qualifier: "money_back", re: `${B}(?:satisfied|happy|love\\s+it)\\s+or\\s+(?:your\\s+money\\s+back|(?:fully\\s+)?refunded)${E}` },
      { kind: "refund", re: `${B}(?:full\\s+)?refund(?:ed|s)?${E}\\s+(?:within|in)\\s+${R}${U}` },
      { kind: "refund", qualifier: "money_back", re: `${B}(?:get\\s+)?your\\s+money\\s+back${E}` },
      /* confirmation call: "we'll call you to confirm", "we call you within 2 hours", "between 9am and 7pm" */
      { kind: "confirmation_call", re: `${B}${CALLER}\\s+(?:call|phone|ring|contact)s?\\s+you${E}${CALL_TAIL}` },
      { kind: "confirmation_call", re: `${B}you(?:'ll|\\s+will)\\s+(?:get|receive)\\s+a\\s+(?:confirmation\\s+)?call${E}${CALL_TAIL}` },
      { kind: "confirmation_call", re: `${B}(?:confirmation\\s+)?call\\s+(?:(?<q>today|within\\s+the\\s+hour)${E}|within\\s+${R}${U})` },
    ];
  },
};
