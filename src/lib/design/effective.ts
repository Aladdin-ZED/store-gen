/**
 * Render-time theme resolution (design.md DES-§11.5, request DES-R4; pure). Track S2 BRAND & LOGO owns this file in R2.
 * For `theme_mode` store / campaign pages the renderer takes the brand part from the ACTIVE store theme, not from the
 * doc: `store` = palette, fonts, archetype and the brand fields of `look` from `active.spec`, page fields of `look`
 * from the doc; `campaign` = only the locked roles and genes replaced; `null` mode or no active theme = `doc.theme`
 * unchanged. The doc, its checksum and `runtime_v` never change (core D50).
 *
 * The contract step (C2-C) froze the signature for the render wiring (S2's DES-R4 seam in the renderer) and S1's store
 * render. The contract body returns `doc.theme`, which is the exact answer whenever `active` is null (every store
 * before S2 merges: no `store_themes` row exists in R1); S2 writes the `store` / `campaign` cases.
 */
import type { PageDoc, ThemeSpec } from "@/lib/page/schema";
import type { BrandLocks } from "./brand";

/** The theme a page renders with (contract body: the doc's own theme). */
export function effectiveTheme(doc: PageDoc, mode: "store" | "campaign" | null, active: { spec: ThemeSpec; locks: BrandLocks } | null): ThemeSpec {
  void mode;
  void active;
  return doc.theme;
}
