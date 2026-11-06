/**
 * Gallery — data model and photo resolution shared by the four compositions.
 *
 * Items are the merchant's curated photos (each optional: an item without a photo takes the next
 * product photo nobody else uses). With `fill`, the product photos not shown yet are appended
 * (without captions), so photos added to the product later appear on their own.
 */
import { z } from "zod";
import { AssetRef, type SectionBg } from "@/lib/page/schema";
import type { RenderContext, ResolvedAsset } from "../../types";

const text = (max: number) => z.string().max(max).default("");

export const Item = z.object({
  image: AssetRef.optional(),
  caption: text(90),
});

export const schema = z.object({
  kicker: text(60),
  title: text(140),
  lead: text(240),
  items: z.array(Item).max(12).default([]),
  /** append the product photos that no item shows yet */
  fill: z.boolean().default(true),
  cta: z.boolean().default(true),
  ctaLabel: text(60),
  /** contact (sheet S3): columns from 48rem, 2 or 3 (absent = 3; phones always 2) */
  cols: z.union([z.literal(2), z.literal(3)]).optional(),
});

export type Data = z.infer<typeof schema>;

/** Most photos each composition shows (bento templates exist for 1–8, lookbook = 3 spreads). */
export const MAX_SHOTS: Record<string, number> = { carousel: 12, masonry: 8, filmstrip: 12, lookbook: 9, contact: 6 };

export interface Shot {
  /** null only for preview placeholders (product without photos) */
  asset: ResolvedAsset | null;
  caption: string;
  /** data path of the caption for click-to-edit (null for auto-filled photos) */
  path: string | null;
  /** 0-based position in the gallery */
  n: number;
}

export interface ViewProps {
  ctx: RenderContext;
  data: Data;
  /** section id (anchors, uids) */
  id: string;
  variant: string;
  bg: SectionBg;
  titleId: string;
  shots: Shot[];
}

/**
 * Photos to show, in order: the items (own photo, else the next unused product photo), then — with
 * `fill` — the remaining product photos. Real photos first; a transparent cutout only rounds out a
 * thin set (it reads as a studio tile). Items whose photo cannot be resolved are skipped. A product
 * without any photo renders tinted placeholders in the editor preview only (live pages: nothing).
 */
export function resolveShots(ctx: RenderContext, data: Data, max: number): Shot[] {
  const own = data.items.map((it) => ctx.asset(it.image));
  const taken = new Set(own.filter((a): a is ResolvedAsset => !!a).map((a) => a.id));

  const photos: ResolvedAsset[] = [];
  const cutouts: ResolvedAsset[] = [];
  const seen = new Set<string>();
  for (const ref of [...ctx.product.images, ctx.product.cutout]) {
    const a = ctx.asset(ref);
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    (a.alpha ? cutouts : photos).push(a);
  }
  const pool = (photos.length >= 3 ? photos : [...photos, ...cutouts]).filter((a) => !taken.has(a.id));

  const shots: Shot[] = [];
  data.items.forEach((it, i) => {
    const asset = own[i] ?? pool.shift() ?? null;
    if (asset) shots.push({ asset, caption: it.caption.trim(), path: `items.${i}.caption`, n: shots.length });
  });
  if (data.fill) for (const asset of pool) shots.push({ asset, caption: "", path: null, n: shots.length });

  if (!shots.length && ctx.mode === "preview") {
    const count = Math.max(3, Math.min(data.items.length, max));
    for (let i = 0; i < count; i++) {
      const it = data.items[i];
      shots.push({ asset: null, caption: it?.caption.trim() ?? "", path: it ? `items.${i}.caption` : null, n: i });
    }
  }
  return shots.slice(0, max);
}

/**
 * Tall set → taller frames (3:4 instead of 4:5): at least half the photos are 2:3-ish portraits, where
 * a 4:5 window cannot hold a standing person's head and hands at once.
 */
export function isTall(shots: readonly Shot[]): boolean {
  let tall = 0;
  let known = 0;
  for (const s of shots) {
    if (!s.asset || s.asset.alpha || !(s.asset.width > 0 && s.asset.height > 0)) continue;
    known++;
    if (s.asset.width / s.asset.height < 0.74) tall++;
  }
  return known > 0 && tall * 2 >= known;
}

/** Landscape set → wider frames (most photos wider than tall). */
export function isLandscape(shots: readonly Shot[]): boolean {
  let wide = 0;
  let known = 0;
  for (const s of shots) {
    if (!s.asset || s.asset.alpha) continue;
    known++;
    if (s.asset.width > s.asset.height * 1.08) wide++;
  }
  return known > 0 && wide * 2 > known;
}
