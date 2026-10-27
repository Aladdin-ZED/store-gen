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
} as const satisfies Record<string, string>;
