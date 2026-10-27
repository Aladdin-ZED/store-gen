/**
 * "Report this store" in the footer (P6 DESIGN; design.md DES-§4.5.4, landing.md LAN-§3.9; docs/STORE-SAAS.md D76,
 * §K.2 P0 maintainer CCR, CRIT15). Created at P0 so the document Shell (src/landing/document.tsx, maintainer) knows
 * who draws the link, and no track edits the Shell: every live, test and preview document carries the link exactly
 * once. While this is `false` the Shell draws its fallback row `<p class="lp-report">` on every such document; P6
 * sets it to `true` in the same change that makes `legalLinks(ctx)` append `ctx.links.report` to both footer
 * variants, and from then on the Shell draws the row only for a document whose footer is hidden or absent.
 */
export const FOOTER_RENDERS_REPORT: boolean = false;
