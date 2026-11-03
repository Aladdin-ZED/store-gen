/**
 * Admin messages (en) of the design file (P6 DESIGN, design.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 */
export const messages = {
  // the reveal (DES-§14.3; the P0 stub of RevealFolds uses these, P6 keeps or extends them)
  "design.reveal.use": "Use this design",
  "design.reveal.analysing": "Reading your photos",
  "design.reveal.error": "The designs could not be prepared.",
  "design.reveal.retry": "Try again",
  // the copy items of the design check (DES-§9.4, §9.7, §9.8, §20.1)
  "design.copy.C01": "Replace long dashes with a full stop, a comma or a colon.",
  "design.copy.C02": "“{phrase}” sounds generic. Say something specific about your product.",
  "design.copy.C03": "Several headlines are built the same way. Vary one: a plain statement, an instruction or a short word with a line under it.",
  "design.copy.C04": "Few lines name a real detail of the product. Add a material, a size, a scent or how delivery and payment work.",
  "design.copy.C05": "Keep one exclamation mark at most, on the final button.",
  "design.copy.C06": "This headline repeats wording from another of your pages.",
  "design.copy.C07": "Use the middle dot once per line at most, and never in a headline.",
  "design.copy.C08": "This headline is close to wording already live on another store.",
  "design.copy.C09": "Remove the emoji: the page reads as a shop, not a message.",
  "design.copy.D1": "Some figures on the page are not among the facts you gave. Check them before publishing.",
  "design.copy.D3": "This question and its answer are written in different registers. Use the same one for both.",
  "design.copy.D4": "The article before the product name reads wrong. Pick “le” or “la” for the name, or rephrase.",
  "design.copy.N05": "This wording is common in your niche. Rewrite it in your own words to stand apart.",
  "design.copy.fixPunctuation": "Fix punctuation",
} as const satisfies Record<string, string>;
