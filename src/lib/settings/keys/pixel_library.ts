/**
 * Store setting `pixel_library` (docs/STORE-SAAS.md §D.10; owner: operations, P5): every pixel the store knows,
 * labels and test windows (docs/OFFERS.md §A.2). Per store from R1.0 and no longer a migration marker.
 * The legacy registry (src/lib/settings/schemas.ts) re-exports these schemas, so both read one definition.
 */
import { z } from "zod";
import { ID_HELP } from "@/lib/pixels/form";
import { PIXEL_ID_RE, PIXEL_PLATFORMS } from "@/lib/pixels/ids";

/** A per-page, time-boxed test window: events of THIS page carry the pixel's test code until `until`. */
export const PixelTestWindow = z.object({ pageId: z.string().length(26), until: z.iso.datetime({ offset: true }) });
export type PixelTestWindow = z.infer<typeof PixelTestWindow>;

export const PixelLibraryEntry = z
  .object({
    platform: z.enum(PIXEL_PLATFORMS),
    /** canonical (normalizePixelId); immutable once saved */
    id: z.string(),
    /** "Compte principal", "BM backup 2" */
    label: z.string().trim().max(40).default(""),
    addedAt: z.iso.datetime({ offset: true }),
    /** expired windows are pruned on every write */
    tests: z.array(PixelTestWindow).max(5).default([]),
  })
  .superRefine((e, c) => {
    if (!PIXEL_ID_RE[e.platform].test(e.id)) c.addIssue({ code: "custom", message: ID_HELP[e.platform], path: ["id"] });
  });
export type PixelLibraryEntry = z.infer<typeof PixelLibraryEntry>;

/** The UI adds up to 100; the schema keeps headroom so the migration never drops an id. */
export const PIXEL_LIBRARY_UI_MAX = 100;
export const PixelLibrarySettings = z
  .object({ v: z.literal(1).default(1), pixels: z.array(PixelLibraryEntry).max(200).default([]) })
  .refine((l) => new Set(l.pixels.map((p) => `${p.platform}:${p.id}`)).size === l.pixels.length, { error: "Duplicate pixel." });
