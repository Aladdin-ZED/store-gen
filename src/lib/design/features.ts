/**
 * Section variant features (P6 DESIGN; design.md DES-§8.4, DS33; docs/STORE-SAAS.md §K.2 P0 design stubs, §M.2,
 * DES-R19): the one data source the design gates, the core's budget gate and Store Health read. Every variant of the
 * registry declares its `features` (src/landing/registry.ts `VARIANT_FEATURES`; the order form's as an overlay there,
 * since orderForm/** is P3's); this resolves an entry to the frozen `VariantFeaturesResolved` and applies the data
 * toggles of the section instance:
 *  - `decor` paths: a decoration whose path holds `false`, `""`, `0` or an empty list is off (`ghost` → ghostWord,
 *    `ring` → ring, `chips` → overlayChips, a list at `chips` caps the count, `dots` → dots, `aurora` → aurora,
 *    `ticker` → the "marquee" text run);
 *  - `optIn` paths (the redraws' off-by-default devices, DES-§4.5.4, DS56): `ghost` → the ghost word and its text run
 *    only when the path holds `true`; `chips` → the number at the path, capped by `overlayChipsMax` and by the list
 *    at the `decor` chips path;
 *  - `data.cta`: `false` → 0 primary CTAs, `true` → at least 1 (the sections' optional closing button);
 *  - `data.opener`: narrows `openers` to that one opener when the variant supports it.
 * The signature is frozen (src/lib/contracts/r1-p0.ts) and the shape is the maintainer's (./types.frozen.ts).
 *
 * A type or variant the registry does not know answers the documented defaults (every optional field 0 / false,
 * `family: "grid"`), with the two fixed layers DES-§8.4 names, so a fixed layer is never counted as in-flow.
 */
import { VARIANT_FEATURES } from "@/landing/registry";
import { OPENERS } from "./consts";
import type { Opener } from "./genome";
import type { VariantFeatures } from "./types";
import type { VariantFeaturesResolved } from "./types.frozen";

const FIXED_LAYERS: ReadonlyMap<string, "bar" | "float"> = new Map([
  ["stickyCta", "bar"],
  ["whatsappFloat", "float"],
]);

/** `Required<…>` defaults of DES-§8.4 ("optional fields default to 0 / false"). */
function resolve(f: VariantFeatures | undefined, type: string): VariantFeaturesResolved {
  const out: VariantFeaturesResolved = {
    glass: f?.glass ?? 0,
    aurora: false,
    centered: f?.centered ?? false,
    equalCards: f?.equalCards ?? 0,
    iconHeads: f?.iconHeads ?? false,
    bento: f?.bento ?? false,
    scroller: f?.scroller ?? false,
    signature: f?.signature ?? 0,
    details: f?.details ?? 0,
    ghostWord: f?.ghostWord ?? false,
    ring: f?.ring ?? false,
    overlayChips: f?.overlayChips ?? 0,
    dots: f?.dots ?? false,
    numberedEyebrow: f?.numberedEyebrow ?? false,
    animatesLayout: f?.animatesLayout ?? false,
    family: f?.family ?? "grid",
    ctas: f?.ctas ?? 0,
    cardGrid: f?.cardGrid ?? false,
    picker: f?.picker ?? false,
    fixed: f ? (f.fixed ?? null) : (FIXED_LAYERS.get(type) ?? null),
    fixedPx: f?.fixedPx ?? 0,
    revealNodes: f?.revealNodes ?? 0,
  };
  if (f?.slots) out.slots = f.slots.map((s) => ({ ...s }));
  if (f?.fold !== undefined) out.fold = f.fold ? { rows: f.fold.rows.map((r) => ({ ...r })) } : null;
  if (f?.openers) out.openers = [...f.openers];
  if (f?.textRuns) out.textRuns = [...f.textRuns];
  if (f?.h !== undefined) out.h = typeof f.h === "number" ? f.h : { ...f.h, ...(f.h.per ? { per: { ...f.h.per } } : {}) };
  return out;
}

/** The value at a dotted path of the section data (`notes`, `media.ghost`). */
function at(data: unknown, path: string): unknown {
  let v: unknown = data;
  for (const k of path.split(".")) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

/** A decoration is off when its data path holds false, "", 0 or an empty list (an absent value keeps the default). */
const isOff = (v: unknown) => v === false || v === "" || v === 0 || (Array.isArray(v) && v.length === 0);

/** The registry entry of a variant (undefined for an unknown type or variant). */
export function registeredFeatures(type: string, variant: string): VariantFeatures | undefined {
  return VARIANT_FEATURES[type]?.[variant];
}

export function variantFeatures(type: string, variant: string, data: unknown): VariantFeaturesResolved {
  const f = registeredFeatures(type, variant);
  const out = resolve(f, type);
  if (!f || data === null || typeof data !== "object") return out;
  for (const [key, path] of Object.entries(f.decor ?? {}) as [keyof NonNullable<VariantFeatures["decor"]>, string][]) {
    const v = at(data, path);
    if (v === undefined) continue;
    const off = isOff(v);
    switch (key) {
      case "ghost":
        if (off) out.ghostWord = false;
        if (off && out.textRuns) out.textRuns = out.textRuns.filter((r) => r !== "ghost");
        break;
      case "ring":
        if (off) out.ring = false;
        break;
      case "chips":
        if (off) out.overlayChips = 0;
        else if (Array.isArray(v)) out.overlayChips = Math.min(out.overlayChips, v.length);
        break;
      case "dots":
        if (off) out.dots = false;
        break;
      case "aurora":
        out.aurora = false;
        break;
      case "ticker":
        if (off && out.textRuns) out.textRuns = out.textRuns.filter((r) => r !== "marquee");
        break;
    }
  }
  if (f.optIn?.ghost && at(data, f.optIn.ghost) === true && !(f.decor?.ghost && isOff(at(data, f.decor.ghost)))) {
    out.ghostWord = true;
    out.textRuns = [...new Set([...(out.textRuns ?? []), "ghost" as const])];
  }
  if (f.optIn?.chips) {
    const n = at(data, f.optIn.chips);
    const list = f.decor?.chips ? at(data, f.decor.chips) : undefined;
    const want = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    out.overlayChips = Math.min(want, f.overlayChipsMax ?? want, Array.isArray(list) ? list.length : want);
  }
  const d = data as Record<string, unknown>;
  if (d.cta === false) out.ctas = 0;
  else if (d.cta === true) out.ctas = Math.max(1, out.ctas);
  if (typeof d.opener === "string" && (OPENERS as readonly string[]).includes(d.opener)) {
    const o = d.opener as Opener;
    if (!out.openers || out.openers.includes(o)) out.openers = [o];
  }
  return out;
}
