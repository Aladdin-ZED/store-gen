/**
 * Admin messages (en) of the logo file (S2 BRAND & LOGO, design.md DES-§26; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at the R2 contract step (C2-D) and spread by
 * src/lib/i18n/admin/en.ts; English is the reference: the fr and ar files type their keys against this one.
 */
export const messages = {
  // moved from ./design.ts at the R2 contract step (C2-D), S2's prefixes logo. and theme. (DES-§26)
  "logo.trademark": "We can't check trademarks. Make sure the name and the logo are yours to use.",
  "logo.moreLikeThis": "More like this",
  "logo.use": "Use this logo",
} as const satisfies Record<string, string>;
