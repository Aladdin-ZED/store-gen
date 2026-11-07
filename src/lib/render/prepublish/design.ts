import "server-only";
/**
 * Publish checks and listeners of the design track (P6 DESIGN; design.md DES-§7.5, DES-§7.8, DES-§7.9 step 4, DES-§8.7,
 * DES-§8.8, DES-§22; docs/STORE-SAAS.md §M.1-§M.5). Extension file imported for its side effects by
 * src/lib/render/prepublish.ts: it registers the check `design` and the listener `design` at import.
 *
 *  - `gateCtxFrom(ctx)`: the one way a PrePublishCtx becomes a GateInputCtx (kind from the doc, the theme and look, the
 *    origin through the core's `originFrom` and the chosen row's generation record, the merchant facts through the
 *    facts read API, `ownerProof` from the owner's own proof lines). `gateInputFor(doc, await gateCtxFrom(ctx))` is the
 *    only path from a PrePublishCtx to the gates.
 *  - The check (DES-§8.8 shape): pooled kinds (landing, home, page) get the one-candidate `checkNovelty` (publish is
 *    never rate limited), the exhaustion test on a niche-only `too_close`, and the headline check over every title and
 *    lead with its origin class; then `runGates` in the publish context. Hard items keep their level only by origin
 *    (`hardByOrigin`: N8 / D3 on engine, local and cloud text; V09 / V24 / V26 / V28 are the core budget's, soft here;
 *    V20 is landing's honesty). The niche band of N1 goes soft (`vars.fallback = 1`) only on the verified exhaustion
 *    path; the platform band and the clone flag never do. A clearing variant keeps N1 hard and names the variant.
 *  - Mode: the core's `warn` (re-renders) wins; else the flag `design_publish_gates` (a store override or the console
 *    default) and `platform_design.gatesAtPublish`, the weaker of the two (warn < block), so one store or the whole
 *    platform can be eased during an incident. In warn mode the hard items come back as notes that keep `level:
 *    "hard"` (the core audits `page.publish.design_override` from them, CCR r1-p6-11). Honesty is never this check's.
 *  - The listener: on publish the DES-§7.5 live flip and the `published` row with q / slop / report / novelty (and
 *    `fallback: true` on the exhaustion path), `first_published_at` from the page, `syncShingles`, `markHealthDirty`;
 *    on unpublish the 30-day reservation, `syncShingles`, `markHealthDirty`. It never throws: a failure is logged
 *    (area design) and `design.backfill` repairs the row.
 *
 * The check hands its verdict to the listener through a short-lived per-store cache keyed by page and doc hash, so the
 * listener records what the publisher saw; on a miss it recomputes the gates and stores the bands it can (no verdict).
 */
import type { NoveltyBands } from "@/lib/db/schema";
import type { DifferentiateVariant } from "@/lib/design/differentiate";
import { distanceView, nicheKey, type DistanceView } from "@/lib/design/distance";
import { designFlag } from "@/lib/design/flags.server";
import { gateInputFor, type GateInputCtx } from "@/lib/design/gate-input";
import { gateItemsOf, noveltyTerm, qScore, summarize, tellDevices, toGateItem } from "@/lib/design/gates";
import type { AssetMeta as GateAssetMeta, DesignGateItem, GateInput, GateReport, HeadlineVerdict, OriginClass, StorePageDoc } from "@/lib/design/gates/types";
import { isPageDoc } from "@/lib/design/gates/view";
import type { DesignGenome } from "@/lib/design/genome";
import { recordPublished, releasePage } from "@/lib/design/genomes.server";
import { NO_LOOK_PRIORS } from "@/lib/design/health.server";
import { checkHeadlineNovelty, docNiche, storeNicheOf, syncShingles } from "@/lib/design/headlines.server";
import { checkNovelty, exhaustionTest, type NoveltyVerdict } from "@/lib/design/novelty.server";
import { factsFor } from "@/lib/landing/honesty/facts.server";
import { errorSummary } from "@/lib/orders/log";
import { recordError } from "@/lib/jobs/errors";
import { MARKETS, type Market, type PageDoc } from "@/lib/page/schema";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import type { GateItem, StoreScope } from "@/lib/tenancy/types";
import { generationRecordFor, registerPrePublishCheck, registerPublishListener, type PrePublishCtx, type PrePublishResult, type PublishListener } from "../prepublish";
import { hash16, originFrom, textFieldsOf } from "../origin";

/** The kinds that are pooled, novelty-checked and written to `design_genomes` (DES-§8.13, ENGP-1). */
const POOLED: ReadonlySet<string> = new Set(["landing", "home", "page"]);
/** Classes of text the engine or a model wrote (DS50): only these make N8 / D3 hard. */
const GENERATED: ReadonlySet<OriginClass> = new Set(["engine", "local", "cloud"]);
/** Hard levels that belong to the core's budget gate (V09, V24, V26, V28) or to landing's honesty gate (V20): soft here. */
const NOT_OURS_HARD: ReadonlySet<string> = new Set(["V09", "V24", "V26", "V28", "V20"]);
/** Section types whose owner-typed lines are the store's own proof data (LP-02). */
const PROOF_TYPES: ReadonlySet<string> = new Set(["reviews", "socialProof", "stats"]);
/** A section's title and lead fields (top level), the lines the headline service judges. */
const LINE_KEY = /^[^.]+\.(title|headline|heading|lead|subtitle|sub|intro|description)$/;

/* ------------------------------------------------------------------ */
/* the context                                                         */
/* ------------------------------------------------------------------ */

/** The core's asset metadata as the gates read it (no bytes; unknown sizes read as 0). */
function gateAssets(assets: PrePublishCtx["assets"]): ReadonlyMap<string, GateAssetMeta> {
  const out = new Map<string, GateAssetMeta>();
  for (const [id, a] of assets) out.set(id, { id, width: a.width ?? 0, height: a.height ?? 0, alpha: a.hasAlpha === true });
  return out;
}

/** The owner typed at least one line of a proof section (reviews, social proof, stats): the store's own proof data. */
function ownerProofOf(doc: PageDoc, origin: ReadonlyMap<string, OriginClass>): boolean {
  const proofIds = new Set(doc.sections.filter((s) => PROOF_TYPES.has(s.type) && !s.hidden).map((s) => s.id));
  if (!proofIds.size) return false;
  for (const [path, text] of textFieldsOf(doc)) if (text.trim() && proofIds.has(path.split(".")[0]!) && origin.get(path) === "owner") return true;
  return false;
}

/**
 * The one way a PrePublishCtx becomes a GateInputCtx (core §M.1 rule 2, DES-§8.8): the kind from the doc, the theme and
 * the look, the origin map of the core (`originFrom` over the chosen row's generation record), the facts the seller
 * vouched for (P3's facts read API) and the proof data.
 */
export async function gateCtxFrom(ctx: PrePublishCtx): Promise<GateInputCtx> {
  const doc = ctx.doc as PageDoc | StorePageDoc;
  const assets = gateAssets(ctx.assets);
  if (!isPageDoc(doc)) {
    // a store template (R2): the store theme comes resolved in ctx.theme; no product, facts or proof lines
    // (the store's market: a StorePageDoc carries none, R2 contract step C2-B1)
    const market = (MARKETS as readonly string[]).includes(ctx.store.market) ? (ctx.store.market as Market) : "INTL";
    return { kind: doc.kind, theme: ctx.theme, look: null, assets, locale: doc.locale, context: "publish", origin: new Map(), facts: { facts: [] }, ownerProof: false, market };
  }
  const [gen, attested] = await Promise.all([generationRecordFor(ctx.scope, ctx.pageId), factsFor(ctx.scope, ctx.pageId).catch(() => [])]);
  const origin = originFrom(ctx.prev, doc, gen);
  const facts = { facts: attested.map((f) => f.text).filter(Boolean), productName: doc.product.name ?? null, price: doc.items[0]?.price ?? null };
  return { kind: "landing", theme: ctx.theme, look: doc.theme.look ?? null, assets, locale: doc.locale, context: "publish", origin, facts, ownerProof: ownerProofOf(doc, origin) };
}

/* ------------------------------------------------------------------ */
/* the pieces of the check                                             */
/* ------------------------------------------------------------------ */

/** The doc's niche (DES-§7.3): a landing's product family, a store template's store category. */
export async function nicheOfDoc(scope: StoreScope, doc: PageDoc | StorePageDoc): Promise<string> {
  const store = await storeNicheOf(scope);
  return isPageDoc(doc) ? docNiche(doc, store) : nicheKey(store.market, store.category);
}

/** Every title and lead of the doc with its path, the product name masked as the engine composes it (`{product}`). */
export function linesOf(doc: PageDoc): { path: string; text: string }[] {
  const name = (doc.product.name ?? "").trim();
  const out: { path: string; text: string }[] = [];
  for (const [path, text] of textFieldsOf(doc)) {
    if (!text.trim() || !LINE_KEY.test(path)) continue;
    out.push({ path, text: name.length >= 2 ? text.split(name).join("{product}") : text });
  }
  return out;
}

/** A verdict with only the niche band too close (platform not too close, no clone): the exhaustion path may soften it. */
export const nicheOnlyTooClose = (v: NoveltyVerdict) => v.niche === "too_close" && v.platform !== "too_close" && !v.clone;

/**
 * Rule 1 of DES-§8.8: does a hard item stay hard at publish? N8 and D3 only on engine / local / cloud text (DS50); the
 * budget-owned V09 / V24 / V26 / V28 and landing's V20 never.
 */
export function hardByOrigin(item: DesignGateItem, origin: ReadonlyMap<string, OriginClass>): boolean {
  if (item.level !== "hard") return false;
  if (NOT_OURS_HARD.has(String(item.id))) return false;
  const target = String(item.target ?? item.id);
  if (target === "N8" || target === "D3") return !!item.field && GENERATED.has(origin.get(item.field) ?? "library");
  return true;
}

/** The effective gate mode: the core's warn wins; else the flag and `platform_design.gatesAtPublish`, the weaker. */
export async function designGateMode(scope: StoreScope, core: "block" | "warn"): Promise<"block" | "warn"> {
  if (core === "warn") return "warn";
  const [flag, setting] = await Promise.all([designFlag("design_publish_gates", scope), getPlatformSetting("platform_design").catch(() => null)]);
  return flag === "warn" || setting?.gatesAtPublish === "warn" ? "warn" : "block";
}

/** What the check hands to the listener (per store, per page; the doc hash ties it to the version that publishes). */
interface Verdict {
  docHash: string;
  niche: string;
  bands: NoveltyBands | null;
  q: number;
  slop: number;
  report: ReturnType<typeof summarize>;
  tells: string[];
}
const handoff = scopedCache<Verdict>({ name: "design-publish-verdict", maxEntries: 2_000, ttlMs: 5 * 60_000 });
const docHash = (doc: unknown) => hash16(JSON.stringify(doc));

export interface DesignCheckResult {
  result: PrePublishResult;
  /** the gate report of the doc in the publish context (tests, the Design check panel) */
  report: GateReport;
  novelty: NoveltyVerdict | null;
  /** "exhausted", the clearing variant, or null (the exhaustion path did not run) */
  exhausted: DifferentiateVariant | "exhausted" | null;
  mode: "block" | "warn";
}

/**
 * The design check (DES-§8.8). Exported for `test:design-db`; the registry calls `designCheck(ctx).result`.
 * ≤ 60 ms in Node unit timing, ≤ 300 ms on the exhaustion path.
 */
export async function designCheck(ctx: PrePublishCtx): Promise<DesignCheckResult> {
  const doc = ctx.doc as PageDoc | StorePageDoc;
  const [gctx, mode] = await Promise.all([gateCtxFrom(ctx), designGateMode(ctx.scope, ctx.mode)]);
  const input = gateInputFor(doc, gctx);
  const pooled = POOLED.has(input.kind) && isPageDoc(doc);
  let novelty: NoveltyVerdict | null = null;
  let exhausted: DifferentiateVariant | "exhausted" | null = null;
  let headlines: HeadlineVerdict[] = [];
  let niche = "";
  let view: DistanceView | null = null;
  if (pooled && isPageDoc(doc)) {
    niche = await nicheOfDoc(ctx.scope, doc);
    view = distanceView(input.genome, { theme: doc.theme }, doc.locale);
    const lines = linesOf(doc);
    const [verdicts, perLine] = await Promise.all([
      checkNovelty(ctx.scope, { candidates: [{ key: ctx.pageId, view }], niche, pageId: ctx.pageId }, "publish"),
      lines.length ? checkHeadlineNovelty(ctx.scope, niche, lines.map((l) => l.text)) : Promise.resolve([]),
    ]);
    novelty = verdicts[0] ?? null;
    headlines = lines.map((l, i) => ({ path: l.path, verdict: perLine[i]?.verdict ?? "ok", band: perLine[i]?.band ?? null }));
    if (novelty && nicheOnlyTooClose(novelty)) exhausted = await exhaustionTest(ctx.scope, { pageId: ctx.pageId, doc, view }, niche);
  }
  const run: GateInput = { ...input, context: "publish", novelty, headlines };
  const { view: pageView, items: raw, slop, copy, comp } = gateItemsOf(run);
  // the exhaustion path: the niche band of N1 goes soft only when the server's own test found no clearing variant
  const all = raw.map((it): DesignGateItem => {
    if (it.id !== "N01" || !novelty || !nicheOnlyTooClose(novelty) || !exhausted) return it;
    if (exhausted === "exhausted") return { ...it, level: "soft", penalty: 2, msg: "design.novelty.niche.fallback", vars: { ...it.vars, fallback: 1 } };
    return { ...it, vars: { ...it.vars, gene: exhausted.gene, to: exhausted.to }, fix: [{ op: "differentiate", gene: exhausted.gene, seeds: 6 }] };
  });
  const hard = all.filter((it) => hardByOrigin(it, input.origin));
  const softened = all.filter((it) => it.level === "hard" && !hard.includes(it)).map((it) => ({ ...it, level: "soft" as const }));
  const soft = [...all.filter((it) => it.level === "soft"), ...softened];
  const info = all.filter((it) => it.level === "info");
  const q = qScore({ hard: hard.length, soft: soft.reduce((n, it) => n + it.penalty, 0), slop: slop.score, spec: copy.spec, nov: noveltyTerm(novelty), comp: comp.score });
  const report: GateReport = { v: 3, q, hard, soft, info, slop, copy, heights: pageView.heights, ms: 0, composition: { score: comp.score, items: comp.items } };
  const fallback = exhausted === "exhausted" && !!novelty && nicheOnlyTooClose(novelty);
  if (pooled) {
    const bands: NoveltyBands | null = novelty ? { v: 1, platform: novelty.platform, niche: novelty.niche, own: novelty.own, at: ctx.now.toISOString(), ...(fallback ? { fallback: true as const } : {}) } : null;
    handoff.set(ctx.scope.storeId, ctx.pageId, { docHash: docHash(doc), niche, bands, q, slop: slop.score, report: summarize(report), tells: tellDevices(pageView) });
  }
  const items: GateItem[] = hard.map(toGateItem);
  const notes: GateItem[] = [...soft, ...info].map(toGateItem);
  const result: PrePublishResult = items.length && mode === "block" ? { ok: false, code: "design_blocked", items: [...items, ...notes] } : { ok: true, notes: [...items, ...notes] };
  return { result, report, novelty, exhausted, mode };
}

registerPrePublishCheck("design", async (ctx) => (await designCheck(ctx)).result);

/* ------------------------------------------------------------------ */
/* the listener                                                        */
/* ------------------------------------------------------------------ */

/** The listener's record when the check's verdict is not at hand (a re-render, another process): gates only. */
function recompute(doc: PageDoc, gctx: GateInputCtx): { genome: DesignGenome; verdict: Omit<Verdict, "docHash" | "niche" | "bands"> } {
  const input = gateInputFor(doc, gctx);
  const { view, items, slop, copy, comp } = gateItemsOf({ ...input, context: "publish", novelty: null });
  const hard = items.filter((it) => hardByOrigin(it, input.origin));
  const soft = items.filter((it) => it.level === "soft" || (it.level === "hard" && !hard.includes(it)));
  const q = qScore({ hard: hard.length, soft: soft.reduce((n, it) => n + it.penalty, 0), slop: slop.score, spec: copy.spec, nov: noveltyTerm(null), comp: comp.score });
  const report: GateReport = { v: 3, q, hard, soft, info: items.filter((it) => it.level === "info"), slop, copy, heights: view.heights, ms: 0, composition: { score: comp.score, items: comp.items } };
  return { genome: input.genome, verdict: { q, slop: slop.score, report: summarize(report), tells: tellDevices(view) } };
}

/** The design listener (DES-§7.5, DES-§8.8 rule 3): never throws. */
export const designListener: PublishListener = async (ctx) => {
  try {
    const doc = ctx.doc as PageDoc | StorePageDoc;
    if (!isPageDoc(doc)) return; // a store template (R2): storefront's listener decides its kinds
    const scope = ctx.scope;
    if (ctx.event === "unpublished") {
      await releasePage(scope, ctx.pageId);
      await syncShingles(scope, await nicheOfDoc(scope, doc));
      await markHealthDirty(scope.storeId);
      return;
    }
    const memo = handoff.get(scope.storeId, ctx.pageId);
    handoff.delete(scope.storeId, ctx.pageId);
    const gctx = await gateCtxFrom(ctx);
    const read = gateInputFor(doc, gctx).genome;
    // a page without look: its row says so (designHealth's hasLook, the no_dna rule)
    const genome = doc.theme.look ? read : { ...read, priorsV: NO_LOOK_PRIORS };
    const hit = memo && memo.docHash === docHash(doc) ? memo : null;
    const niche = hit?.niche || (await nicheOfDoc(scope, doc));
    const v = hit ?? { ...recompute(doc, gctx).verdict, bands: null };
    const view = distanceView(genome, { theme: doc.theme }, doc.locale);
    await recordPublished(scope, { pageId: ctx.pageId, versionId: ctx.versionId, niche, genome, view, tells: v.tells, q: v.q, slop: v.slop, report: v.report, novelty: v.bands });
    await syncShingles(scope, niche);
    await markHealthDirty(scope.storeId);
  } catch (err) {
    // DES-§8.8 rule 3: the publish already committed; design.backfill writes the missing row later
    console.error(`[design] publish listener (${ctx.event}) failed:`, errorSummary(err));
    recordError("design", err, { code: `listener_${ctx.event}`, storeId: ctx.scope.storeId });
  }
};

registerPublishListener("design", designListener);
