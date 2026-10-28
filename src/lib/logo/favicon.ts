/**
 * The page icon of the landing documents (P6 DESIGN; design.md DES-R11, DS32; docs/STORE-SAAS.md §K.2, §K.3).
 * `brandIcon` answers the `<link rel="icon">` of every landing, thank-you and legal document (src/landing/document.tsx).
 * Pure and isomorphic: everything comes from the render context and the built theme.
 *
 * P0b (CCR P6-6): document.tsx's `faviconHref` body moved here verbatim, so every document and every export stays
 * byte-identical. P6 replaces the body with the R1 grid monogram and keeps the signature (frozen in
 * src/lib/contracts/r1-p0b-design.ts).
 */
import type { LandingRenderContext } from "@/landing/context";
import { brandName } from "@/landing/primitives/util";
import type { BuiltTheme } from "@/lib/theme";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Store logo, or a monogram of the brand in the page accent (data: SVG — allowed by img-src): a soft
 * squircle with a top light, the initial set in the accent ink. Colors are theme tokens only.
 */
export function brandIcon(ctx: LandingRenderContext, theme: BuiltTheme): { href: string; type: string } {
  const logo = ctx.store.logo ? ctx.assets.url({ id: ctx.store.logo.id, alt: "" }, 64) : null;
  if (logo) return { href: logo.url, type: logo.mime };
  const bg = HEX6.test(theme.tokens["lp-accent"] ?? "") ? theme.tokens["lp-accent"]! : HEX6.test(theme.tokens["lp-ink"] ?? "") ? theme.tokens["lp-ink"]! : "#1f1d1b";
  const ink = HEX6.test(theme.tokens["lp-accent-ink"] ?? "") ? theme.tokens["lp-accent-ink"]! : "#fbfaf8";
  const letter = Array.from(brandName(ctx).trim())[0]?.toLocaleUpperCase(ctx.locale) ?? "*";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="l" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="18" fill="${bg}"/><rect width="64" height="64" rx="18" fill="url(#l)"/>` +
    `<text x="32" y="43.5" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Arial,sans-serif" font-size="34" font-weight="600" fill="${ink}">${xmlEscape(letter)}</text></svg>`;
  return { href: `data:image/svg+xml,${encodeURIComponent(svg)}`, type: "image/svg+xml" };
}
