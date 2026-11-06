/**
 * The page icon of the landing documents (P6 DESIGN; design.md DES-R11, DES-§12.5, DS32; docs/STORE-SAAS.md §K.2, §K.3).
 * `brandIcon` answers the `<link rel="icon">` of every landing, thank-you and legal document (src/landing/document.tsx).
 * Pure and isomorphic: everything comes from the render context and the built theme.
 *
 * The order of DES-§12.5: the brand's square `mark` when the context carries one (CCR r1-p6-14 adds it to the store
 * context), else the primary logo when its aspect is ≤ 1.6:1 (a wide wordmark is unreadable at 16 px), else the R1
 * grid monogram (./monogram-grid.ts) in the page's accent: path-only SVG, no fonts. The signature is frozen in
 * src/lib/contracts/r1-p0b-design.ts.
 */
import type { LandingRenderContext } from "@/landing/context";
import { brandName } from "@/landing/primitives/util";
import type { BuiltTheme } from "@/lib/theme";
import { monogramForTheme, svgDataUri } from "./monogram-grid";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** The widest logo used as an icon (DES-§12.5). */
export const ICON_MAX_ASPECT = 1.6;

export interface IconAsset {
  id: string;
  width: number;
  height: number;
}

/** Which source the icon comes from (pure; `brandIcon` and the brand kit's previews share it). */
export function iconSource(mark: IconAsset | null | undefined, logo: IconAsset | null | undefined): "mark" | "logo" | "monogram" {
  if (mark) return "mark";
  if (logo && logo.width > 0 && logo.height > 0 && Math.max(logo.width, logo.height) / Math.min(logo.width, logo.height) <= ICON_MAX_ASPECT) return "logo";
  return "monogram";
}

export function brandIcon(ctx: LandingRenderContext, theme: BuiltTheme): { href: string; type: string } {
  const mark = ctx.store.mark ?? null;
  const logo = ctx.store.logo;
  const source = iconSource(mark, logo);
  const asset = source === "mark" ? mark : source === "logo" ? logo : null;
  const file = asset ? ctx.assets.url({ id: asset.id, alt: "" }, 64) : null;
  if (file) return { href: file.url, type: file.mime };
  const ground = HEX6.test(theme.tokens["lp-accent"] ?? "") ? theme.tokens["lp-accent"]! : HEX6.test(theme.tokens["lp-ink"] ?? "") ? theme.tokens["lp-ink"]! : "#1f2a37";
  const ink = HEX6.test(theme.tokens["lp-accent-ink"] ?? "") ? theme.tokens["lp-accent-ink"]! : "#ffffff";
  const m = monogramForTheme(brandName(ctx), theme.attrs, ground, ink);
  return { href: svgDataUri(m.svg), type: "image/svg+xml" };
}
