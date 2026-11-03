/**
 * The photo-use plan (P6 DESIGN; design.md DES-§5.10, G33, H30, H36; I1, I2, V11-V14). Pure, isomorphic.
 *
 * Each in-flow section asks for a number of distinct assets in one role (the hero 1, a contact sheet 3-4, a gallery
 * all of them, a zigzag or hanging list up to 3, a figure 1, the offer showcase 1, a before / after pair 2). An asset
 * appears in a section at most once (that is one appearance), and:
 *  - the primary photo takes `hero` once and at most one more role, at a different crop (≤ 2 appearances); a cutout
 *    is its own asset and serves the stage heroes and the showcase;
 *  - every other asset ≤ 3 appearances; the sticky bar and form thumbnails are not counted;
 *  - a section the caps cannot serve is switched before any document exists (H30): `gallery` → `showcase:figure` (or
 *    dropped when the page already has a showcase), `beforeAfter` → removed, `story:image-text` → `story:letter`, a
 *    photo-per-item benefits list → `benefits:numbered`; the media-hungriest first, ≤ 3 rounds;
 *  - crops: the hero at `bleed` (full-bleed treatments and cinema) or `full`; a `tight` crop only when its effective
 *    pixels cover the slot at DPR 2 (`0.5 × width ≥ 1.5 × slot × 2`), else it is dropped without penalty for
 *    `context`; with one asset (H36) exactly two uses at two crops, `full` and `context`.
 * Treatment coherence (G18) is the compile step's and the renderers': `tonal-duotone` tints only secondary roles.
 */
import { variantFeatures } from "./features";
import type { Aspect, PhotoPlan, PhotoRole, Treatment } from "./genome";

export interface PhotoAsset {
  id: string;
  /** px; 0 when unknown (no tight crop is planned on an unknown size) */
  width: number;
}

export interface PhotoBlock {
  id: string;
  type: string;
  variant: string;
}

export interface PhotoSwitch {
  id: string;
  type: string;
  /** the photo-free variant, or null = the section leaves the page */
  to: string | null;
}

export interface PhotoPlanResult {
  plan: PhotoPlan;
  switches: PhotoSwitch[];
  /** every asset within its cap after the switches */
  ok: boolean;
}

type Crop = PhotoPlan["uses"][string][number]["crop"];

/** Heroes that show the product cutout on a stage (with an alpha asset). */
const CUTOUT_HEROES: ReadonlySet<string> = new Set(["stage", "spec", "poster"]);

/** The distinct assets a section shows and their role; null = no product photo. */
export function photoDemand(type: string, variant: string, photos: number): { count: number; role: PhotoRole } | null {
  switch (type) {
    case "hero":
      return { count: variant === "contact" ? Math.min(4, Math.max(1, photos)) : 1, role: "hero" };
    case "showcase":
      return { count: 1, role: "detail" };
    case "gallery":
      return { count: Math.min(6, photos), role: "context" };
    case "story":
      return variant === "image-text" ? { count: 1, role: "context" } : null;
    case "benefits":
      return variant === "zigzag" || variant === "stack" || variant === "hanging" ? { count: Math.min(3, photos), role: "detail" } : null;
    case "beforeAfter":
      return { count: 2, role: "proof" };
    case "offer":
      return variant === "showcase" ? { count: 1, role: "offer" } : null;
    default:
      return null;
  }
}

/** The photo-free replacement of a section (H30), null = it leaves the page. */
function switchOf(b: PhotoBlock, blocks: readonly PhotoBlock[]): string | null {
  switch (b.type) {
    case "gallery":
      return blocks.some((x) => x.type === "showcase") ? null : "showcase:figure";
    case "story":
      return "story:letter";
    case "benefits":
      return "benefits:numbered";
    case "showcase":
      return null;
    default:
      return null;
  }
}

/** A `tight` crop (the inner 50 %) serves a slot only when its pixels cover it at DPR 2 with 1.5 × headroom (UX-7). */
export const tightCovers = (assetWidth: number, slotCss: number) => assetWidth > 0 && 0.5 * assetWidth >= 1.5 * slotCss * 2;

const aspectOf = (type: string, variant: string): Aspect => {
  const a = variantFeatures(type, variant, null).slots?.[0]?.aspect;
  return a && a !== "free" ? a : "4:5";
};
const slotWidth = (type: string, variant: string) => variantFeatures(type, variant, null).slots?.[0]?.cssWidth390 ?? 358;

/**
 * The photo plan of an in-flow sequence. `assets` are the product photos (the primary first), `cutout` the cutout's
 * asset id when the product has one.
 */
export function planPhotos(blocks: readonly PhotoBlock[], assets: readonly PhotoAsset[], opts: { treatment: Treatment; cutout?: string | null }): PhotoPlanResult {
  let current = [...blocks];
  const switches: PhotoSwitch[] = [];
  for (let round = 0; round <= 3; round++) {
    const { plan, short } = assign(current, assets, opts);
    if (!short.length || round === 3) return { plan, switches, ok: short.length === 0 };
    // the media-hungriest short section switches first
    const hungry = [...short].sort((a, b) => (photoDemand(b.type, b.variant, assets.length)?.count ?? 0) - (photoDemand(a.type, a.variant, assets.length)?.count ?? 0))[0]!;
    const to = switchOf(hungry, current);
    switches.push({ id: hungry.id, type: hungry.type, to });
    current = to === null ? current.filter((b) => b !== hungry) : current.map((b) => (b === hungry ? { ...b, type: to.split(":")[0]!, variant: to.split(":")[1]! } : b));
  }
  return { plan: { max: 3, uses: {} }, switches, ok: false };
}

function assign(blocks: readonly PhotoBlock[], assets: readonly PhotoAsset[], opts: { treatment: Treatment; cutout?: string | null }): { plan: PhotoPlan; short: PhotoBlock[] } {
  const uses: PhotoPlan["uses"] = {};
  const count = new Map<string, number>();
  const crops = new Map<string, Set<Crop>>();
  const short: PhotoBlock[] = [];
  const primary = assets[0]?.id;
  const one = assets.length === 1;
  const cap = (id: string) => (id === primary ? 2 : 3);
  const put = (id: string, role: PhotoRole, crop: Crop, b: PhotoBlock) => {
    (uses[id] ??= []).push({ role, aspect: aspectOf(b.type, b.variant), crop, section: b.id });
    count.set(id, (count.get(id) ?? 0) + 1);
    (crops.get(id) ?? crops.set(id, new Set()).get(id)!).add(crop);
  };
  const cropFor = (a: PhotoAsset, b: PhotoBlock): Crop => {
    const used = crops.get(a.id) ?? new Set<Crop>();
    if (one) return used.size ? "context" : "full";
    if (!used.has("full") && a.id !== primary) return "full";
    if (!used.has("tight") && tightCovers(a.width, slotWidth(b.type, b.variant))) return "tight";
    return "context";
  };
  // the primary's one more role: a different crop from the hero's (tight when its pixels cover the slot, else context)
  const primarySecond = (a: PhotoAsset, b: PhotoBlock): Crop => {
    const used = crops.get(a.id);
    if (!used?.size) return "full";
    return !one && !used.has("tight") && tightCovers(a.width, slotWidth(b.type, b.variant)) ? "tight" : "context";
  };
  for (const b of blocks) {
    const d = photoDemand(b.type, b.variant, assets.length);
    if (!d) continue;
    if (b.type === "hero") {
      if (opts.cutout && CUTOUT_HEROES.has(b.variant)) put(opts.cutout, "hero", "full", b);
      else if (primary) put(primary, "hero", opts.treatment === "full-bleed-crop" || b.variant === "cinema" ? "bleed" : "full", b);
      // a contact sheet's other cells
      if (d.count > 1) for (const a of assets.slice(1, d.count)) put(a.id, "detail", cropFor(a, b), b);
      continue;
    }
    if (b.type === "showcase" && opts.cutout && (count.get(opts.cutout) ?? 0) < 3) {
      put(opts.cutout, d.role, "full", b);
      continue;
    }
    // secondary photos first, the primary last (it keeps its one extra appearance for a different crop)
    const order = [...assets].sort((x, y) => (x.id === primary ? 1 : 0) - (y.id === primary ? 1 : 0) || (count.get(x.id) ?? 0) - (count.get(y.id) ?? 0));
    const free = order.filter((a) => (count.get(a.id) ?? 0) < cap(a.id));
    // H36: one asset is used exactly twice (the hero and one context use), never in a grid
    const need = one ? 1 : d.count;
    if (free.length === 0 || (one && (count.get(primary!) ?? 0) >= 2) || (d.role === "context" && b.type === "gallery" && free.length < 3)) {
      short.push(b);
      continue;
    }
    for (const a of free.slice(0, need)) put(a.id, d.role, a.id === primary ? primarySecond(a, b) : cropFor(a, b), b);
  }
  return { plan: { max: 3, uses }, short };
}
