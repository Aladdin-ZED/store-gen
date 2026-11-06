import "server-only";
/**
 * The brand kit's reads and writes (P6 DESIGN; design.md DES-§12.1-§12.5, DES-§11.6, DS17, DS45, BK-1; core §E.2, §E.3
 * rule 5, §G.4, §G.5, §H.3). Every write takes the caller's `WriteScope` (the actions in src/app/app/[store]/brand
 * wrap them in `storeAction("brand.write", …)`), so a store only ever reads and writes its own `brand` setting, its own
 * assets and its own `asset_refs`.
 *
 *  - `bindLogo`: the upload already went through the core media endpoint; the id passes `assertOwned`, must be a
 *    raster image ≥ 256 px on its short side; the primary logo's palette (the pipeline's 96 × 96 `extractPalette`)
 *    becomes `colors.fromLogo` through `nearestAllowed`; `asset_refs` (owner_kind 'brand') are rewritten from the
 *    four logo slots; an identity change enqueues `render_jobs` reason 'brand' for every live page (P8's
 *    `enqueueRenders`; a failure there never fails the brand write).
 *  - `saveColors` / `saveFonts` / `saveGenes`: the pure rules of ./brand-kit.ts; unknown gene values come back as
 *    `dropped` (the warning item).
 *  - `saveVoice`: the store voice (`store_ai.voice`, the one source of truth, DS45); P7's `updateStoreAiAction`
 *    replaces this write at the P7 merge (CCR r1-p6-13).
 *  - Every write audits `store.brand.updated` with the changed roles only.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { fail } from "@/lib/admin-data/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { assetRefs, pages } from "@/lib/db/schema";
import { enqueueRenders } from "@/lib/jobs/renders";
import { logError } from "@/lib/orders/log";
import { assetToJson, getAsset, getAssetsByIds } from "@/lib/media";
import { toCents } from "@/lib/page/money";
import { getPlatformSetting, getStoreSettings, updateStoreSetting, type SettingsActor } from "@/lib/settings";
import type { BrandSetting } from "@/lib/settings/keys/brand";
import type { StoreAiSetting } from "@/lib/settings/keys/store_ai";
import { assertOwned } from "@/lib/tenancy/owned";
import { SeamError } from "@/lib/tenancy/seam";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { applyBase, applyColor, applyLock, applyNeutral, changedRoles, cleanGenes, cleanHex, identityChanged, logoContrast, logoPalette, type BrandColors, type ColorResult, type ColorRoleKey } from "./brand-kit";
import { loadCatalogue } from "./pairings";

export type LogoSlot = "primary" | "mark" | "wordmark" | "inverse";
export const LOGO_MIN_SIDE = 256;
const RASTER = new Set(["image/png", "image/webp", "image/jpeg", "image/avif"]);

export interface LogoView {
  id: string;
  url: string | null;
  width: number;
  height: number;
  alpha: boolean;
}

export interface BrandKitView {
  brand: BrandSetting;
  voice: { register: StoreAiSetting["voice"]["register"]; darija: StoreAiSetting["voice"]["darija"] };
  logos: Partial<Record<LogoSlot, LogoView>>;
  /** < 3:1 on the light / the dark ground (a transparent primary logo only) */
  contrast: { light: boolean; dark: boolean };
  /** "From your product photos": the last 3 pages' first photo, allowed colours, ≤ 6 */
  photoSwatches: string[];
  /** the archetypes of the store's latest pages, newest first (the Type tab's order) */
  topVibes: string[];
  /** the latest page's unit price in integer cents, or null (the specimen shows no price) */
  price: { cents: number; currency: string } | null;
  /** platform `allowSellerBrandOrange`: read only, R1 shows "Not available yet" */
  orangeRequested: boolean;
}

export interface BrandWriteResult {
  view: BrandKitView;
  moved: ColorResult["moved"];
  /** gene values outside GENE_VOCAB that were dropped (`G1=foo`) */
  dropped: string[];
}

/* ------------------------------------------------------------------ */
/* reads                                                               */
/* ------------------------------------------------------------------ */

interface DraftLite {
  theme?: { archetype?: unknown };
  items?: { price?: unknown; images?: { id?: unknown }[] }[];
  product?: { price?: unknown; images?: { id?: unknown }[] };
}

const firstImage = (d: DraftLite): string | null => {
  const id = d.items?.[0]?.images?.[0]?.id ?? d.product?.images?.[0]?.id;
  return typeof id === "string" ? id : null;
};
const unitPrice = (d: DraftLite): number | null => {
  const p = d.items?.[0]?.price ?? d.product?.price;
  return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
};

async function latestDrafts(scope: StoreScope): Promise<DraftLite[]> {
  const rows = await db
    .select({ draft: pages.draft })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.kind, "landing"), inArray(pages.status, ["draft", "published"])))
    .orderBy(desc(pages.updatedAt))
    .limit(3);
  return rows.map((r) => (r.draft && typeof r.draft === "object" ? (r.draft as DraftLite) : {}));
}

function logoView(a: Awaited<ReturnType<typeof getAsset>>): LogoView | null {
  if (!a) return null;
  const j = assetToJson(a);
  return { id: a.id, url: j.thumbUrl ?? j.url, width: a.width, height: a.height, alpha: a.alpha };
}

/** Everything the brand page shows, for the caller's store. */
export async function brandKitView(scope: StoreScope, currency: string): Promise<BrandKitView> {
  const [{ brand, store_ai }, drafts, orange] = await Promise.all([
    getStoreSettings(scope, ["brand", "store_ai"]),
    latestDrafts(scope),
    getPlatformSetting("platform")
      .then((p) => p.allowSellerBrandOrange === true)
      .catch(() => false),
  ]);
  const slots = (["primary", "mark", "wordmark", "inverse"] as const).filter((k) => brand.logo[k]);
  const photoIds = drafts.map(firstImage).filter((x): x is string => !!x);
  const files = await getAssetsByIds(scope, [...slots.map((k) => brand.logo[k]!), ...photoIds]);
  const byId = new Map(files.map((f) => [f.id, f]));
  const logos: BrandKitView["logos"] = {};
  for (const k of slots) {
    const v = logoView(byId.get(brand.logo[k]!) ?? null);
    if (v) logos[k] = v;
  }
  const primary = brand.logo.primary ? byId.get(brand.logo.primary) : undefined;
  const swatches: string[] = [];
  for (const id of photoIds) {
    for (const hex of logoPalette(byId.get(id)?.palette as { colors?: { hex: string; weight?: number }[] } | null).slice(0, 2)) if (!swatches.includes(hex)) swatches.push(hex);
  }
  const vibes: string[] = [];
  for (const d of drafts) {
    const a = d.theme?.archetype;
    if (typeof a === "string" && !vibes.includes(a)) vibes.push(a);
  }
  const p = drafts.map(unitPrice).find((x) => x !== null) ?? null;
  return {
    brand,
    voice: { register: store_ai.voice.register ?? null, darija: store_ai.voice.darija },
    logos,
    contrast: logoContrast(primary ? { alpha: primary.alpha, palette: primary.palette as { colors?: { hex: string; weight?: number }[] } | null, dominant: primary.dominant } : null),
    photoSwatches: swatches.slice(0, 6),
    topVibes: vibes,
    price: p === null ? null : { cents: toCents(p), currency },
    orangeRequested: orange,
  };
}

/* ------------------------------------------------------------------ */
/* writes                                                              */
/* ------------------------------------------------------------------ */

const actorKind = (scope: WriteScope) => (scope.kind === "member" ? "user" : "system") as "user" | "system";

/** The write shared by every tab: one locked merge of `brand`, the audit of the changed roles, the identity effects. */
async function writeBrand(scope: WriteScope, actor: SettingsActor, change: (cur: BrandSetting) => BrandSetting): Promise<{ before: BrandSetting; after: BrandSetting }> {
  let before: BrandSetting | null = null;
  const after = await updateStoreSetting(
    scope,
    "brand",
    (cur) => {
      before = structuredClone(cur);
      const next = change(structuredClone(cur));
      return { logo: next.logo, colors: next.colors, fonts: next.fonts, genes: next.genes };
    },
    actor,
  );
  const prev = before ?? after;
  const roles = changedRoles(prev, after);
  if (roles.length) {
    await audit("store.brand.updated", { userId: actor.id === "system" ? null : actor.id, target: "brand", meta: { roles }, ip: actor.ip, scope: { storeId: scope.storeId, actorKind: actorKind(scope) } });
  }
  if (identityChanged(prev, after)) {
    await syncBrandRefs(scope, after);
    try {
      await enqueueRenders(scope, "all-live", "brand");
    } catch (err) {
      // the render queue is P8's; until it lands (or when it fails) the brand write stands and pages pick the logo
      // up at their next publish
      logError("design.brand.renders", err);
    }
  }
  return { before: prev, after };
}

/** `asset_refs` of the brand (owner_kind 'brand', owner_id 'brand', live): exactly the four logo slots. */
export async function syncBrandRefs(scope: WriteScope, brand: BrandSetting): Promise<number> {
  const ids = [...new Set([brand.logo.primary, brand.logo.mark, brand.logo.wordmark, brand.logo.inverse].filter((x): x is string => !!x))];
  await db.transaction(async (tx) => {
    await tx.delete(assetRefs).where(whereStore(assetRefs, scope, and(eq(assetRefs.ownerKind, "brand"), eq(assetRefs.ownerId, "brand"))));
    if (ids.length) await tx.insert(assetRefs).values(ids.map((assetId) => storeValues(scope, { assetId, ownerKind: "brand" as const, ownerId: "brand", live: true, updatedAt: new Date() })));
  });
  return ids.length;
}

async function result(scope: WriteScope, currency: string, moved: ColorResult["moved"] = null, dropped: string[] = []): Promise<BrandWriteResult> {
  return { view: await brandKitView(scope, currency), moved, dropped };
}

/** Binds an uploaded raster logo to a slot, or unbinds it (null). */
export async function bindLogo(scope: WriteScope, actor: SettingsActor, currency: string, slot: LogoSlot, assetId: string | null): Promise<BrandWriteResult> {
  let palette: string[] | null = null;
  if (assetId) {
    await assertOwned(scope, "asset", [assetId]);
    const a = await getAsset(scope, assetId);
    if (!a) throw new SeamError("not_found");
    if (a.kind !== "image" || !RASTER.has(a.mime)) fail("Use a PNG, WebP, JPEG or AVIF logo. SVG files are not accepted.");
    if (Math.min(a.width, a.height) < LOGO_MIN_SIDE) fail(`The logo needs at least ${LOGO_MIN_SIDE} px on its short side.`);
    if (slot === "primary") palette = logoPalette(a.palette as { colors?: { hex: string; weight?: number }[] } | null);
  }
  await writeBrand(scope, actor, (cur) => {
    cur.logo = { ...cur.logo, [slot]: assetId, source: "upload" };
    if (slot === "primary") cur.colors = { ...cur.colors, fromLogo: palette ?? [] };
    return cur;
  });
  return result(scope, currency);
}

export interface ColorPatch {
  role: ColorRoleKey;
  /** accent / pop: a hex (null clears); neutral: a hue 0-360 (null clears); base: light | tinted | dark | null */
  value?: string | number | null;
  lock?: boolean;
}

export async function saveColors(scope: WriteScope, actor: SettingsActor, currency: string, patch: ColorPatch): Promise<BrandWriteResult> {
  let moved: ColorResult["moved"] = null;
  const at = new Date().toISOString();
  await writeBrand(scope, actor, (cur) => {
    let colors: BrandColors = cur.colors;
    if (patch.value !== undefined) {
      if (patch.role === "accent" || patch.role === "pop") {
        const hex = patch.value === null ? null : cleanHex(String(patch.value));
        if (patch.value !== null && !hex) fail("Enter a colour as #RRGGBB.");
        const r = applyColor(colors, patch.role, hex, at);
        colors = r.colors;
        moved = r.moved;
      } else if (patch.role === "neutral") {
        colors = applyNeutral(colors, patch.value === null ? null : Number(patch.value));
      } else {
        const v = patch.value;
        if (v !== null && v !== "light" && v !== "tinted" && v !== "dark") fail("Pick light, tinted or dark.");
        colors = applyBase(colors, v as BrandColors["base"]);
      }
    }
    if (patch.lock !== undefined) colors = applyLock(colors, patch.role, patch.lock);
    cur.colors = colors;
    return cur;
  });
  return result(scope, currency, moved);
}

export async function saveFonts(scope: WriteScope, actor: SettingsActor, currency: string, patch: { pairing?: string | null; locked?: boolean }): Promise<BrandWriteResult> {
  if (patch.pairing) {
    const p = loadCatalogue().byId.get(patch.pairing);
    if (!p) fail("This type pairing is not available.");
  }
  await writeBrand(scope, actor, (cur) => {
    cur.fonts = { pairing: patch.pairing === undefined ? cur.fonts.pairing : patch.pairing, locked: patch.locked === undefined ? cur.fonts.locked : patch.locked };
    if (!cur.fonts.pairing) cur.fonts.locked = false;
    return cur;
  });
  return result(scope, currency);
}

export async function saveGenes(scope: WriteScope, actor: SettingsActor, currency: string, input: Readonly<Record<string, string | null>>): Promise<BrandWriteResult> {
  const { genes, dropped } = cleanGenes(input);
  await writeBrand(scope, actor, (cur) => {
    const next = { ...cur.genes } as Record<string, string>;
    for (const [g, v] of Object.entries(input)) if (v === null) delete next[g];
    Object.assign(next, genes);
    cur.genes = next as BrandSetting["genes"];
    return cur;
  });
  return result(scope, currency, null, dropped);
}

export async function saveVoice(scope: WriteScope, actor: SettingsActor, currency: string, patch: { register?: StoreAiSetting["voice"]["register"]; darija?: StoreAiSetting["voice"]["darija"] }): Promise<BrandWriteResult> {
  // P7's updateStoreAiAction replaces this write at the P7 merge (CCR r1-p6-13); the voice stays in store_ai (DS45)
  await updateStoreSetting(
    scope,
    "store_ai",
    (cur) => ({ voice: { ...cur.voice, ...(patch.register !== undefined ? { register: patch.register } : {}), ...(patch.darija !== undefined ? { darija: patch.darija } : {}) } }),
    actor,
  );
  await audit("store.brand.updated", { userId: actor.id === "system" ? null : actor.id, target: "brand", meta: { roles: Object.keys(patch).map((k) => `voice.${k}`) }, ip: actor.ip, scope: { storeId: scope.storeId, actorKind: actorKind(scope) } });
  return result(scope, currency);
}

