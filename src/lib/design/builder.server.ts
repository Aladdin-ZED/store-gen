import "server-only";
/**
 * The builder's design reads and the DNA card's brand-lock write (P6 DESIGN; design.md DES-§15.1, DES-§15.4,
 * DES-§12.3; core §E store scope). Called only from ./actions.ts (`storeAction`, scoped, audited by the core).
 *
 *  - `designContextOf(scope, pageId, canBrand)`: the chosen row's generation record (the browser derives each
 *    field's origin from it, never stored in the doc), the provenance line's source, and the brand the card and
 *    "Apply my brand" read. A page of another store answers not_found.
 *  - `pageNovelty(scope, input)`: the panel's novelty bands (the page and its Differentiate variants) (context "theme", the `design:novelty`
 *    bucket, 60 / 10 min per store), in the niche the publish check uses.
 *  - `writeBrandLock(scope, actor, gene, on)`: G1 / G9 / G23 in `brand.genes`, G4 as `brand.fonts.locked`, G28 as the
 *    store voice's register; the page genes G2 / G18 are refused (page locks only).
 */
import { and, desc, eq } from "drizzle-orm";
import { copyFamily } from "@/lib/ai/copy-library";
import { db } from "@/lib/db/client";
import { designGenomes, pages, pageVersions } from "@/lib/db/schema";
import type { ProductCategory } from "@/lib/page/schema";
import { generationRecordFor } from "@/lib/render/prepublish";
import type { GenerationRecord } from "@/lib/render/origin";
import { getStoreSettings, updateStoreSetting, type SettingsActor } from "@/lib/settings";
import { fail } from "@/lib/admin-data/action";
import { SeamError } from "@/lib/tenancy/seam";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { BRAND_SETTING_GENES, PAGE_ONLY_GENES, validBrandGene, type BrandLite, type BrandSettingGene, type LockGene } from "./brand-apply";
import { nicheKey, unpackView } from "./distance";
import { storeNicheOf } from "./headlines.server";
import { checkNovelty, type NoveltyVerdict } from "./novelty.server";

export interface DesignContext {
  gen: GenerationRecord | null;
  /** the provenance line (DES-§15.4): engine, Director, or none (a page written by hand) */
  source: "engine" | "director" | null;
  brand: BrandLite;
  /** the viewer may write the brand side of the locks (`brand.write`) */
  canBrand: boolean;
}

async function assertPage(scope: StoreScope, pageId: string): Promise<void> {
  const [row] = await db.select({ id: pages.id }).from(pages).where(whereStore(pages, scope, eq(pages.id, pageId))).limit(1);
  if (!row) throw new SeamError("not_found");
}

/** The brand as the builder reads it (colours, pairing, gene locks, whether a voice register is set). */
export async function brandLiteOf(scope: StoreScope): Promise<BrandLite> {
  const { brand, store_ai } = await getStoreSettings(scope, ["brand", "store_ai"]);
  const genes: Partial<Record<BrandSettingGene, string>> = {};
  for (const g of BRAND_SETTING_GENES) {
    const v = brand.genes[g];
    if (typeof v === "string" && validBrandGene(g, v)) genes[g] = v;
  }
  return {
    accent: brand.colors.accent,
    pop: brand.colors.pop,
    base: brand.colors.base,
    neutralHue: brand.colors.neutralHue,
    pairing: brand.fonts.pairing,
    fontsLocked: brand.fonts.locked,
    colorLocks: brand.colors.locks,
    genes,
    voice: store_ai.voice.register !== null,
  };
}

export async function designContextOf(scope: StoreScope, pageId: string, canBrand: boolean): Promise<DesignContext> {
  await assertPage(scope, pageId);
  const [gen, version, chosen, brand] = await Promise.all([
    generationRecordFor(scope, pageId),
    db
      .select({ source: pageVersions.generationSource })
      .from(pageVersions)
      .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, pageId)))
      .orderBy(desc(pageVersions.createdAt))
      .limit(1),
    db
      .select({ id: designGenomes.id })
      .from(designGenomes)
      .where(whereStore(designGenomes, scope, and(eq(designGenomes.pageId, pageId), eq(designGenomes.kind, "page"), eq(designGenomes.source, "chosen"))))
      .limit(1),
    brandLiteOf(scope),
  ]);
  const vs = version[0]?.source ?? null;
  const source: DesignContext["source"] = vs === "director" || vs === "deep" ? "director" : vs === "instant" || chosen.length ? "engine" : null;
  return { gen, source, brand, canBrand };
}

export interface PageNoveltyInput {
  pageId: string;
  market: string | null;
  product: { category: ProductCategory | null; name: string | null; tagline: string | null };
  /** the page itself first, then up to 6 Differentiate variants (DES-§15.3) */
  candidates: readonly { key: string; vec: readonly number[] }[];
}

/** The bands of the page (and its Differentiate variants) in its niche, as the publish check computes the niche. */
export async function pageNovelty(scope: StoreScope, input: PageNoveltyInput): Promise<NoveltyVerdict[]> {
  await assertPage(scope, input.pageId);
  const candidates = input.candidates.map((c) => {
    try {
      return { key: c.key, view: unpackView(c.vec) };
    } catch {
      return fail("This design could not be checked.");
    }
  });
  const store = await storeNicheOf(scope);
  const family = copyFamily({ category: input.product.category ?? "other", productName: input.product.name, keywords: input.product.tagline }).family;
  const niche = nicheKey(input.market ?? store.market, store.category, family);
  return checkNovelty(scope, { niche, candidates, pageId: input.pageId }, "theme");
}

/**
 * One brand lock on or off (DES-§15.4 rev 4). `value` is the page's current value of the gene (G4: its pairing id);
 * the setting write is audited by the core (`store.settings.updated`).
 */
export async function writeBrandLock(scope: WriteScope, actor: SettingsActor, gene: LockGene, on: boolean, value: string | null): Promise<BrandLite> {
  if (PAGE_ONLY_GENES.has(gene)) fail("Page genes lock per page.");
  if (gene === "G4") {
    if (on && !value) fail("This lock could not be saved.");
    await updateStoreSetting(scope, "brand", (cur) => ({ fonts: { ...cur.fonts, ...(on && value ? { pairing: value } : {}), locked: on } }), actor);
  } else if (gene === "G28") {
    // the store voice's register (G28); P7's voice action replaces this write at the P7 / P6 merge (CCR r1-p6-13)
    const register = on ? value : null;
    if (on && !(register === "plain" || register === "warm" || register === "precise" || register === "bold" || register === "poetic-restrained")) fail("This lock could not be saved.");
    await updateStoreSetting(scope, "store_ai", (cur) => ({ voice: { ...cur.voice, register: register as typeof cur.voice.register } }), actor);
  } else {
    const g = gene as BrandSettingGene;
    if (on && !(value && validBrandGene(g, value))) fail("This lock could not be saved.");
    await updateStoreSetting(
      scope,
      "brand",
      (cur) => {
        const genes = { ...cur.genes };
        if (on && value) genes[g] = value;
        else delete genes[g];
        return { genes };
      },
      actor,
    );
  }
  return brandLiteOf(scope);
}
