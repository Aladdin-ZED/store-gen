/**
 * Texture on generated pages: none (core D60 rev 3, CRIT2-4; design.md DS4 rev 6, DES-§4.10.1).
 *
 * The engine used to emit an SVG `feTurbulence` grain tile (`--lp-grain`, `--lp-grain-opacity`) for archetypes and
 * builder specs with `texture: "grain"`. D60 removes aurora and grain from every generated page with no budget, so the
 * compiled theme always writes `data-texture="none"` and emits no grain token. `ThemeSpec.texture` still validates
 * `grain` on old documents (the value is kept in the doc and ignored at render; the builder shows a one-line notice
 * instead of the control), and `TEXTURE_KINDS` keeps it so DESIGN.md §2.5 and `THEME_ATTR_VALUES` stay one set.
 */
import type { TextureKind } from "./archetypes";

/** What a page renders for any texture setting: "none" (D60). */
export function renderedTexture(_requested: TextureKind): "none" {
  return "none";
}
