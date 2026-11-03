/**
 * The honesty gate of landing pages (P3 LANDING; landing.md LAN-§3.2.1, LAN-§6, LAN-§3.5; docs/STORE-SAAS.md §M.1,
 * §M.3, D51). Extension file of the one publish registry (src/lib/render/prepublish.ts imports it for its side
 * effects): it registers the check "landing" and the listener "landing" at import.
 *
 *   registerPrePublishCheck("landing")   every LAN-§3.2 row over the document and its store: `honesty_blocked` with
 *                                        every item when one is hard, else `{ ok: true, notes }`. Hard and soft are
 *                                        decided by rule, never by `mode`: a re-render (`warn`) keeps the items and
 *                                        stores them as notes itself (`rerenderInPlace`), a publish and an export
 *                                        refuse.
 *   registerPublishListener("landing")   after the commit: Store Health is marked dirty, a running countdown moved
 *                                        later is audited (`page.countdown_extended`), kits are told the page
 *                                        changed (wave 2). Never throws.
 *
 * The rules themselves are the pure evaluator src/lib/landing/honesty/gate.ts, which the builder checklist runs too,
 * so the panel and the dialog show one item set (§M.5). This file reads what they judge against, every value through
 * the scope's store: the zones, the policies / checkout / landing / store settings, the calling window, the page's
 * attestations and facts (audit rows), its generation record and versions.
 *
 * Store documents (R2, ENGP-1): `PrePublishCtx.doc` is a `PageDoc` in R1. The R2 contract step widens it to
 * `PageDoc | StorePageDoc` and branches here on `readPageDoc(kind, doc)` (STO-§6.2), which does not exist yet; see
 * `StoreDocBranch` below.
 */
import { desc, eq, sql } from "drizzle-orm";
import { auditIn } from "@/lib/admin-data/store-audit";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { db } from "@/lib/db/client";
import { pages, pageVersions } from "@/lib/db/schema";
import { citiesOfMarket, listZones, topCityKeysFor, zoneFeesFor } from "@/lib/delivery/zones.server";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import { attestedProofFor, factsFor, factTexts } from "@/lib/landing/honesty/facts.server";
import { foldOrigin, gateFactsOf as factsOfInputs, gateItemsOf, type GateFacts, type GeneratedSnapshot, type HonestyGateId, type LiveFacts } from "@/lib/landing/honesty/gate";
import { cityKey } from "@/lib/orders/address";
import { errorSummary } from "@/lib/orders/log";
import type { PageDoc } from "@/lib/page/schema";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { getStoreSettings } from "@/lib/settings";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { StoreSetting } from "@/lib/settings/keys/store";
import type { StoreSettingValue } from "@/lib/settings/store-registry";
import { getStoreById } from "@/lib/tenancy/public";
import { whereStore } from "@/lib/tenancy/sql";
import type { GateItem, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { originFrom } from "../origin";
import { generationRecordFor, registerPrePublishCheck, registerPublishListener, type GenerationRecord, type PrePublishCtx, type PrePublishResult } from "../prepublish";

export type { GateFacts, HonestyGateId } from "@/lib/landing/honesty/gate";

/** What the gate judges a document against (LAN-§3.2.1), read once per publish by `loadLandingGateInputs`. */
export interface LandingGateInputs {
  zones: DeliveryZoneRow[];
  policies: StorePolicyFacts;
  confirmation: StoreSetting["confirmation"];
  checkout: StoreSettingValue<"checkout">;
  landing: StoreSettingValue<"landing">;
  /** `callingWindowFor(scope)`, never null; "no hours" = `noShopperHours(w, now)` */
  callingWindow: EffectiveWindow;
  /** "<sectionId>" | "rating" from audit `page.proof_attested` */
  attested: ReadonlySet<string>;
  /** normalised numerals of audit `page.fact_attested` (`factsFor`, the wizard's merchant facts included) */
  attestedFacts: ReadonlySet<string>;
  /** the fold of the core's `originFrom(prev, doc, generationRecordFor(…))`: cloud / local / engine / library → generated */
  origin: ReadonlyMap<string, "generated" | "owner">;
  /** ENGP-1: the bound product of a store section (R2; always null in R1) */
  product?: { doc: { price: number; compareAt?: number }; facts: string[] } | null;
  /* ---- this track's additions (the same reads, kept for the rules) ---- */
  /** the page's merchant facts as typed (`factTexts`), which `allowedNumbersFor` reads with their units */
  facts: string[];
  /** the generation record the origin was folded from (the builder recomputes the fold as the owner edits) */
  gen: GenerationRecord | null;
  /** the page's newest `generation` version: who typed the stock, the rating and the callout pins */
  generated: GeneratedSnapshot | null;
  /** the live version's countdown, stock and since when that stock is live; null for a page never published */
  live: LiveFacts | null;
  /** `store.whatsapp` is set (the WhatsApp order button has a number to open) */
  storeWhatsapp: boolean;
  /** the store's market has a city list */
  hasMarketList: boolean;
  /** the zone fee (cents) of each city the page fee is compared with (`topCityKeysFor` → `zoneFeesFor`) */
  feesByTopCity: Record<string, number | null>;
  cityNames: Record<string, string>;
}

/** The JSON-safe facts of the inputs, as the builder's preload ships them (one conversion for both sides). */
export function gateFactsOf(inputs: LandingGateInputs, now: Date): GateFacts {
  return factsOfInputs(inputs, now);
}

/**
 * TODO(R2 contract step, ENGP-1, STO-§6.2): `PrePublishCtx.doc` widens to `PageDoc | StorePageDoc` and
 * `landingGateItems` branches on `readPageDoc(kind, doc)`, which main does not have in R1. The branch is typed here so
 * the R2 step fills it rather than designs it (LAN-§3.2.1 "Store documents"): a landing page runs every row; a store
 * page runs only the section rows below over `doc.sections`, each section's numbers against its bound product
 * (`LandingGateInputs.product`) plus the store's facts; the six utility kinds (`product`, `collection`, `search`,
 * `cart`, `checkout`, `not_found`) yield no item.
 */
export type StoreDocBranch = { kind: "landing"; rows: "all" } | { kind: "store"; rows: readonly HonestyGateId[] } | { kind: "utility"; rows: readonly [] };
export const STORE_DOC_BRANCHES = {
  landing: { kind: "landing", rows: "all" },
  store: { kind: "store", rows: ["honesty:sample", "honesty:I4", "honesty:I5", "honesty:D1", "honesty:D2", "honesty:countdown_twice", "honesty:promise", "honesty:password_field"] },
  utility: { kind: "utility", rows: [] },
} as const satisfies Record<StoreDocBranch["kind"], StoreDocBranch>;

/**
 * The gate's items for one document (pure over `ctx` and `inputs`, ≤ 40 ms): src/lib/landing/honesty/gate.ts
 * `gateItemsOf`, which the builder checklist's tests run too.
 */
export function landingGateItems(ctx: PrePublishCtx, inputs: LandingGateInputs): GateItem[] {
  return gateItemsOf(ctx, inputs);
}

/* ------------------------------------------------------------------ */
/* reads                                                               */
/* ------------------------------------------------------------------ */

/** Publish versions read for the stock history (newest first; more than 14 days of daily publishes). */
const STOCK_HISTORY = 40;

const asNumber = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const asString = (v: unknown): string | undefined => (typeof v === "string" && v && v !== "null" ? v : undefined);

/** The live version's countdown end and stock, and since when that stock figure has been live (only the values, never the documents). */
async function liveFactsFor(scope: StoreScope, pageId: string): Promise<LiveFacts | null> {
  const [page] = await db.select({ live: pages.publishedVersionId }).from(pages).where(whereStore(pages, scope, eq(pages.id, pageId))).limit(1);
  if (!page?.live) return null;
  const rows = await db
    .select({
      id: pageVersions.id,
      at: pageVersions.createdAt,
      end: sql<unknown>`JSON_UNQUOTE(JSON_EXTRACT(${pageVersions.doc}, '$.offers.urgency.countdownEnd'))`,
      stock: sql<unknown>`JSON_EXTRACT(${pageVersions.doc}, '$.offers.urgency.stockLeft')`,
    })
    .from(pageVersions)
    .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, pageId), eq(pageVersions.kind, "publish")))
    .orderBy(desc(pageVersions.createdAt), desc(pageVersions.id))
    .limit(STOCK_HISTORY);
  // the live version first (normally the newest publish; a restored older one leads its own run)
  const at = rows.findIndex((r) => r.id === page.live);
  if (at < 0) return {};
  const head = rows[at]!;
  const countdownEnd = asString(head.end);
  const stockLeft = asNumber(head.stock);
  let since = head.at;
  if (stockLeft !== undefined) {
    for (const r of rows.slice(at + 1)) {
      if (asNumber(r.stock) !== stockLeft) break;
      since = r.at;
    }
  }
  return { ...(countdownEnd ? { countdownEnd } : {}), ...(stockLeft !== undefined ? { stockLeft, stockChangedAt: new Date(since).toISOString() } : {}) };
}

/** What the generator wrote: the page's newest `generation` version (its stock, countdown, rating and callout pins). */
async function generatedSnapshotFor(scope: StoreScope, pageId: string): Promise<GeneratedSnapshot | null> {
  const [row] = await db
    .select({ doc: pageVersions.doc })
    .from(pageVersions)
    .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, pageId), eq(pageVersions.kind, "generation")))
    .orderBy(desc(pageVersions.createdAt), desc(pageVersions.id))
    .limit(1);
  const doc = row?.doc as unknown as { offers?: { urgency?: Record<string, unknown> }; product?: { rating?: unknown }; sections?: unknown } | undefined;
  if (!doc || typeof doc !== "object") return null;
  const urgency = doc.offers?.urgency ?? {};
  const rating = doc.product?.rating as { value?: unknown; count?: unknown } | undefined;
  const points: GeneratedSnapshot["points"] = {};
  for (const s of Array.isArray(doc.sections) ? (doc.sections as { id?: unknown; type?: unknown; data?: { points?: unknown } }[]) : []) {
    if (s?.type !== "showcase" || typeof s.id !== "string" || !Array.isArray(s.data?.points)) continue;
    points[s.id] = (s.data.points as { x?: unknown; y?: unknown }[]).map((p) => ({ x: asNumber(p?.x) ?? 50, y: asNumber(p?.y) ?? 50 }));
  }
  const stockLeft = asNumber(urgency.stockLeft);
  const countdownEnd = asString(urgency.countdownEnd);
  const value = asNumber(rating?.value);
  const count = asNumber(rating?.count);
  return {
    ...(stockLeft !== undefined ? { stockLeft } : {}),
    ...(countdownEnd ? { countdownEnd } : {}),
    ...(value !== undefined && count !== undefined ? { rating: { value, count } } : {}),
    points,
  };
}

/** The display name of a city key in the store's market ("fes" → "Fès"). */
function cityNamesOf(market: string, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const cities = citiesOfMarket(market) ?? [];
  for (const k of keys) out[k] = cities.find((c) => cityKey(c.value) === k)?.value ?? k;
  return out;
}

/**
 * Everything the gate judges `doc` against, read through the scope (≤ 8 indexed reads, the settings and zones cached):
 * the settings, the zones and the fees of the main cities, the calling window, the page's attested proof and facts,
 * its generation record, its newest generation version and its live version's history. `prev` is the version the
 * publish replaces (part of the core's `originFrom` signature, not consulted in R1).
 */
export async function loadLandingGateInputs(scope: StoreScope, pageId: string, doc: PageDoc, prev: PageDoc | null = null): Promise<LandingGateInputs> {
  const [settings, zones, callingWindow, facts, gen, generated, live, store, top] = await Promise.all([
    getStoreSettings(scope, ["store", "policies", "checkout", "landing"] as const),
    listZones(scope),
    callingWindowFor(scope),
    factsFor(scope, pageId),
    generationRecordFor(scope, pageId),
    generatedSnapshotFor(scope, pageId),
    liveFactsFor(scope, pageId),
    getStoreById(scope.storeId),
    topCityKeysFor(scope),
  ]);
  const attested = await attestedProofFor(scope, pageId, doc.product.rating ?? null);
  const feesByTopCity = top.keys.length ? await zoneFeesFor(scope, top.keys) : {};
  const market = store?.market ?? doc.market;
  return {
    zones,
    policies: settings.policies,
    confirmation: settings.store.confirmation,
    checkout: settings.checkout,
    landing: settings.landing,
    callingWindow,
    attested,
    attestedFacts: new Set(facts.flatMap((f) => (f.value ? [f.value] : []))),
    origin: foldOrigin(originFrom(prev, doc, gen)),
    product: null,
    facts: factTexts(facts),
    gen,
    generated,
    live,
    storeWhatsapp: !!settings.store.whatsapp,
    hasMarketList: !!citiesOfMarket(market),
    feesByTopCity: { ...feesByTopCity },
    cityNames: cityNamesOf(market, top.keys),
  };
}

/**
 * The gate's facts of a page as JSON, for the builder's preload (`CheckContextData.gate`, CCR r1-p3-3): the builder
 * runs the same evaluator over them, so the checklist panel shows the dialog's items before a publish (§M.5).
 */
export async function landingGateFactsFor(scope: StoreScope, pageId: string, doc: PageDoc, now: Date = new Date()): Promise<GateFacts> {
  return gateFactsOf(await loadLandingGateInputs(scope, pageId, doc), now);
}

/* ------------------------------------------------------------------ */
/* the check and the listener                                          */
/* ------------------------------------------------------------------ */

/** The registered check: every item, refused when one is hard (honesty has no warn mode, §M.1 rule 3). */
export async function landingCheck(ctx: PrePublishCtx): Promise<PrePublishResult> {
  const items = landingGateItems(ctx, await loadLandingGateInputs(ctx.scope, ctx.pageId, ctx.doc, ctx.prev));
  return items.some((i) => i.level === "hard") ? { ok: false, code: "honesty_blocked", items } : { ok: true, notes: items };
}

/**
 * Campaign kits built from this page learn it changed (LAN-§13.1 "page changed since", by `offers_hash`). Wave 2
 * (p3-w2-campaign-kit) fills it; until then there is no kit to tell.
 */
export async function markKitsStaleFor(scope: WriteScope, pageId: string, doc: PageDoc): Promise<void> {
  void scope;
  void pageId;
  void doc;
}

/**
 * After the commit (§M.1 rule 4): Store Health recomputes within one cycle, a countdown still running on the replaced
 * version and moved later is audited (`page.countdown_extended`, LAN-§6.2), kits are told. Each step is isolated and
 * logged; nothing here can fail a publish.
 */
export async function landingPublishListener(ctx: PrePublishCtx & { versionId: string; event: "published" | "unpublished" }): Promise<void> {
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[publish] landing listener, ${name}:`, errorSummary(err));
    }
  };
  await step("health", () => markHealthDirty(ctx.scope.storeId));
  if (ctx.event !== "published") return;
  await step("countdown", async () => {
    const before = ctx.prev?.offers.urgency.countdownEnd;
    const after = ctx.doc.offers.urgency.countdownEnd;
    const from = before ? Date.parse(before) : NaN;
    const to = after ? Date.parse(after) : NaN;
    if (Number.isFinite(from) && Number.isFinite(to) && from > ctx.now.getTime() && to > from) {
      await auditIn(ctx.scope, ctx.actor, "page.countdown_extended", { target: ctx.pageId, meta: { pageId: ctx.pageId, versionId: ctx.versionId, from: before, to: after } });
    }
  });
  await step("kits", () => markKitsStaleFor(ctx.scope, ctx.pageId, ctx.doc));
}

registerPrePublishCheck("landing", landingCheck);
registerPublishListener("landing", landingPublishListener);
