/**
 * Store Health rules of the landing track (P3 LANDING; landing.md LAN-§23.7, SF-03; docs/STORE-SAAS.md §I.7, D53, D67,
 * D75). Extension file (§K.3), imported by src/lib/health/registry.ts; never edits the registry.
 *
 * Seventeen rules over the store's own data: the live landing pages (their published versions), the zones, the
 * policies / checkout / landing / store settings, the leads and the WhatsApp intents. Every rule is
 * `collect(scope, inputs)`: the core's `HealthInputs` first (P1 reads the settings, the page counts and the zone fee
 * input in one pass), then this track's facts, read once per store and health pass (`landingHealthFacts`, memoised
 * on the pass's `inputs` object and the scope's store, ≤ 10 indexed reads, every one through the scope). Each rule is
 * then a pure function of the two, so it runs in well under 40 ms and reads no other store.
 *
 * Sentences are `health.landing.<rule>.{text,fix}` in src/lib/i18n/admin/<locale>/landing.ts with `{value}`,
 * `{baseline}` and `{n}` from the evidence. Fixes are store links (`appHref`). A page rule opens the builder of the
 * first page it names on the tab or section LAN-§23.7 names (`?tab=offers`, `?section=<id>`); the builder route reads
 * them once CCR docs/saas/ccr/r1-p3-5.md lands, and opens the page as today until then. The hard publish rows of
 * LAN-§3.2 never appear here: a page with a hard item is not live.
 *
 * Fixtures (`fixtures`, P1's `test:health`): every rule fires on its `fires` inputs and is silent on `silent` (below
 * its `minN` where it has one). This track's facts ride on the inputs as the extra key `landing` (`withLanding`),
 * which the rules read only for the store they name: facts of store A never answer for store B (`twoStoreFixture`).
 */
import { desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { db } from "@/lib/db/client";
import { auditLog, leads, pages, pageVersions } from "@/lib/db/schema";
import { localParts } from "@/lib/delivery/eta";
import { citiesOfMarket, listZones, topCityKeysFor, zoneFeesFor } from "@/lib/delivery/zones.server";
import { assetRefsIn } from "@/lib/editor/fields";
import { PROOF_SECTIONS } from "@/lib/landing/honesty/numbers";
import { callableMinutesSince } from "@/lib/landing/hours";
import type { LeftTab } from "@/lib/editor/store";
import type { PageDoc } from "@/lib/page/schema";
import { getStoreSettings } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import type { HealthFix, HealthGroup, HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

/* ------------------------------------------------------------------ */
/* the facts                                                           */
/* ------------------------------------------------------------------ */

/** One live landing page as the rules read it: its published document and what the audit log says about it. */
export interface LiveLandingPage {
  id: string;
  slug: string;
  /** the published version's document (validated at publish) */
  doc: PageDoc;
  /** section ids attested real (`page.proof_attested`) */
  attested: readonly string[];
  /** since when the live stock figure has been live (the publish history), null without a stock */
  stockChangedAt: string | null;
}

/** What the landing rules read beyond `HealthInputs`, for one store (JSON-safe, so a fixture can carry it). */
export interface LandingHealthFacts {
  storeId: string;
  /** the newest live landing pages (at most `LIVE_PAGES_READ`) */
  live: readonly LiveLandingPage[];
  /** `landing.thankYou.expectation` */
  expectation: boolean;
  /** `landing.leads.firstContactTargetMin` */
  firstContactTargetMin: number;
  zones: { count: number; enabled: boolean; hasMarketList: boolean };
  /** `checkout.calendar.holidaysReviewedYear` and the store-local year */
  holidaysReviewedYear: number | null;
  year: number;
  /** first-contact p50 in minutes of the store's real leads of 28 days (`is_test = 0`), and how many were contacted */
  leads: { p50Min: number | null; n: number };
  /** WhatsApp intents still `new` after 2 calling hours (`is_test = 0`) */
  waWaiting: number;
  /** cities among the five the page fee is compared with whose zone fee differs from a live page's flat fee */
  feeMismatch: readonly { cityKey: string; pageFeeCents: number; zoneFeeCents: number }[];
  /** the store's orders of 28 days (`opsAggregates`, dims city; the stub answers none) */
  orders28d: number;
}

/** Live pages read per pass (the newest first). */
export const LIVE_PAGES_READ = 25;
/** Publish versions read for the stock history of those pages. */
const STOCK_HISTORY = 300;
const DAY = 86_400_000;
const WINDOW_28D = 28 * DAY;
/** `landing:stock_stale` (LD36). */
export const STALE_STOCK_MS = 14 * DAY;
/** `landing:wa_intents_waiting`: calling minutes an intent may wait. */
export const WA_WAIT_CALLING_MIN = 120;
const WA_READ = 60;
const LEADS_READ = 2_000;

const asNumber = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The live pages of the scope's store, their published documents, attestations and stock history. */
async function livePagesOf(scope: StoreScope): Promise<LiveLandingPage[]> {
  const rows = await db
    .select({ id: pages.id, slug: pages.slug, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published"), eq(pages.kind, "landing"), isNotNull(pages.publishedVersionId)))
    .orderBy(desc(pages.updatedAt))
    .limit(LIVE_PAGES_READ);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const versionIds = rows.map((r) => r.versionId!).filter(Boolean);
  const [docs, proofs, history] = await Promise.all([
    db.select({ id: pageVersions.id, doc: pageVersions.doc }).from(pageVersions).where(whereStore(pageVersions, scope, inArray(pageVersions.id, versionIds))),
    db
      .select({ target: auditLog.target, meta: auditLog.meta })
      .from(auditLog)
      .where(whereStore(auditLog, scope, eq(auditLog.action, "page.proof_attested"), inArray(auditLog.target, ids)))
      .orderBy(desc(auditLog.id))
      .limit(500),
    db
      .select({
        id: pageVersions.id,
        pageId: pageVersions.pageId,
        at: pageVersions.createdAt,
        stock: sql<unknown>`JSON_EXTRACT(${pageVersions.doc}, '$.offers.urgency.stockLeft')`,
      })
      .from(pageVersions)
      .where(whereStore(pageVersions, scope, inArray(pageVersions.pageId, ids), eq(pageVersions.kind, "publish")))
      .orderBy(desc(pageVersions.createdAt), desc(pageVersions.id))
      .limit(STOCK_HISTORY),
  ]);
  const docOf = new Map(docs.map((d) => [d.id, d.doc as PageDoc]));
  const out: LiveLandingPage[] = [];
  for (const r of rows) {
    const doc = docOf.get(r.versionId!);
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.sections)) continue;
    const attested = proofs.filter((p) => p.target === r.id && typeof p.meta?.sectionId === "string").map((p) => String(p.meta!.sectionId));
    // the live version leads its run of equal stock figures; the oldest publish of the run is when it went live
    const runs = history.filter((h) => h.pageId === r.id);
    const at = runs.findIndex((h) => h.id === r.versionId);
    const stock = doc.offers?.urgency?.stockLeft;
    let since: Date | null = at >= 0 && stock !== undefined ? runs[at]!.at : null;
    if (since && at >= 0) {
      for (const h of runs.slice(at + 1)) {
        if (asNumber(h.stock) !== stock) break;
        since = h.at;
      }
    }
    out.push({ id: r.id, slug: r.slug, doc, attested: [...new Set(attested)], stockChangedAt: since ? new Date(since).toISOString() : null });
  }
  return out;
}

async function leadFacts(scope: StoreScope, now: Date): Promise<LandingHealthFacts["leads"]> {
  const rows = await db
    .select({ s: sql<number>`TIMESTAMPDIFF(SECOND, ${leads.createdAt}, ${leads.contactedAt})` })
    .from(leads)
    .where(whereStore(leads, scope, eq(leads.isTest, false), isNotNull(leads.contactedAt), gte(leads.createdAt, new Date(now.getTime() - WINDOW_28D))))
    .limit(LEADS_READ);
  const minutes = rows.map((r) => Number(r.s) / 60).filter((m) => Number.isFinite(m) && m >= 0);
  const p50 = median(minutes);
  return { p50Min: p50 === null ? null : Math.round(p50), n: minutes.length };
}

async function waWaitingOf(scope: StoreScope, now: Date): Promise<number> {
  const rows = await db
    .select({ at: leads.createdAt })
    .from(leads)
    .where(whereStore(leads, scope, eq(leads.kind, "whatsapp"), eq(leads.status, "new"), eq(leads.isTest, false), gte(leads.createdAt, new Date(now.getTime() - WINDOW_28D))))
    .orderBy(desc(leads.createdAt))
    .limit(WA_READ);
  // a lead younger than 2 h cannot have waited 2 calling hours: no window read for those
  const old = rows.filter((r) => now.getTime() - new Date(r.at).getTime() >= WA_WAIT_CALLING_MIN * 60_000);
  if (!old.length) return 0;
  const w = await callingWindowFor(scope);
  return old.filter((r) => callableMinutesSince(new Date(r.at), now, w, WA_WAIT_CALLING_MIN) >= WA_WAIT_CALLING_MIN).length;
}

/** The flat page fees (cents) of the live pages that charge one. */
const flatFees = (live: readonly LiveLandingPage[]) => [...new Set(live.map((p) => Math.round((p.doc.offers?.shippingFee ?? 0) * 100)).filter((c) => c > 0))];

async function feeFacts(scope: StoreScope, live: readonly LiveLandingPage[], zonesOn: boolean, now: Date): Promise<Pick<LandingHealthFacts, "feeMismatch" | "orders28d">> {
  const top = await topCityKeysFor(scope, now);
  const fees = flatFees(live);
  if (!zonesOn || !fees.length || !top.keys.length) return { feeMismatch: [], orders28d: top.orders };
  const byCity = await zoneFeesFor(scope, top.keys);
  const out: { cityKey: string; pageFeeCents: number; zoneFeeCents: number }[] = [];
  for (const key of top.keys) {
    const zone = byCity[key];
    if (zone === null || zone === undefined) continue;
    const page = fees.find((f) => f !== zone);
    if (page !== undefined) out.push({ cityKey: key, pageFeeCents: page, zoneFeeCents: zone });
  }
  return { feeMismatch: out, orders28d: top.orders };
}

/** Reads every fact of the scope's store (≤ 10 indexed reads; settings and zones from their caches). */
export async function loadLandingHealthFacts(scope: StoreScope, inputs: Pick<HealthInputs, "store" | "now">): Promise<LandingHealthFacts> {
  const now = inputs.now;
  const [live, settings, zones, leadStats, waWaiting] = await Promise.all([
    livePagesOf(scope),
    getStoreSettings(scope, ["landing", "checkout"] as const),
    listZones(scope),
    leadFacts(scope, now),
    waWaitingOf(scope, now),
  ]);
  const zonesOn = settings.checkout.zonesEnabled;
  const fee = await feeFacts(scope, live, zonesOn && zones.length > 0, now);
  const ymd = localParts(now, inputs.store.timezone || "Africa/Casablanca")?.ymd ?? now.toISOString().slice(0, 10);
  return {
    storeId: scope.storeId,
    live,
    expectation: settings.landing.thankYou.expectation,
    firstContactTargetMin: settings.landing.leads.firstContactTargetMin,
    zones: { count: zones.length, enabled: zonesOn, hasMarketList: !!citiesOfMarket(inputs.store.market) },
    holidaysReviewedYear: settings.checkout.calendar.holidaysReviewedYear,
    year: Number(ymd.slice(0, 4)),
    leads: leadStats,
    waWaiting,
    ...fee,
  };
}

/** The health pass's inputs with this track's facts on them (fixtures; P1 may fill the key itself). */
export type InputsWithLanding = HealthInputs & { landing?: LandingHealthFacts };

const memo = new WeakMap<object, Map<string, Promise<LandingHealthFacts>>>();

/**
 * The facts of the scope's store for this health pass: the ones the inputs carry when they name this store, else read
 * once and shared by the 17 rules of the pass (memoised on the `inputs` object and the store id).
 */
export function landingHealthFacts(scope: StoreScope, inputs: HealthInputs): Promise<LandingHealthFacts> {
  const given = (inputs as InputsWithLanding).landing;
  if (given) return given.storeId === scope.storeId ? Promise.resolve(given) : Promise.reject(new Error("landing health facts of another store"));
  let byStore = memo.get(inputs);
  if (!byStore) memo.set(inputs, (byStore = new Map()));
  let p = byStore.get(scope.storeId);
  if (!p) byStore.set(scope.storeId, (p = loadLandingHealthFacts(scope, inputs)));
  return p;
}

/* ------------------------------------------------------------------ */
/* the rules                                                           */
/* ------------------------------------------------------------------ */

type Severity = 1 | 2 | 3;
const POINTS: Record<Severity, 3 | 6 | 10> = { 1: 3, 2: 6, 3: 10 };

interface RuleSpec {
  rule: string;
  group: HealthGroup;
  severity: Severity;
  minN?: number;
  /** the store link of the fix (handle → href), with the page it names when the rule is about pages */
  fix: (page: LiveLandingPage | null) => (handle: string) => string;
  /** the evidence, or null (silent) */
  measure: (f: LandingHealthFacts, i: HealthInputs) => { metric: string; value: number; baseline?: number; window: string; n: number; page?: LiveLandingPage | null } | null;
}

const link = (path: `/${string}`) => () => (handle: string) => appHref(handle, path);
/**
 * The builder of the page the evidence names, on the tab (or section) of the fix (LAN-§23.7 "Fix" column); the pages
 * list when no page is named.
 */
const pageLink =
  (at: { tab: LeftTab } | { section: (p: LiveLandingPage) => string | null }) =>
  (page: LiveLandingPage | null) =>
  (handle: string) => {
    if (!page) return appHref(handle, "/pages");
    const q = new URLSearchParams();
    if ("tab" in at) q.set("tab", at.tab);
    else {
      const id = at.section(page);
      if (id) q.set("section", id);
    }
    const query = q.toString();
    return appHref(handle, `/pages/${page.id}/edit${query ? `?${query}` : ""}`);
  };

const visible = (doc: PageDoc) => doc.sections.filter((s) => !s.hidden);
const dataOf = (s: PageDoc["sections"][number]) => (s.data && typeof s.data === "object" ? (s.data as Record<string, unknown>) : {});
const pixelIds = (t: PageDoc["tracking"] | undefined) => [t?.metaPixelId, t?.tiktokPixelId, t?.snapPixelId, t?.ga4Id].some((ids) => Array.isArray(ids) && ids.length > 0);

/** Live pages matching `pred`: the evidence counts them and the fix opens the first. */
function pagesWhere(f: LandingHealthFacts, metric: string, pred: (p: LiveLandingPage) => boolean) {
  const hit = f.live.filter(pred);
  return hit.length ? { metric, value: hit.length, window: "now", n: f.live.length, page: hit[0]! } : null;
}

/** The images of a live page's hero and gallery (and the product photos they show) that have no alt text. */
function imagesWithoutAlt(doc: PageDoc): number {
  const refs = [...(doc.product?.images ?? []), ...visible(doc).filter((s) => s.type === "hero" || s.type === "gallery").flatMap((s) => assetRefsIn(s.data))];
  return new Set(refs.filter((r) => !r.alt?.trim()).map((r) => r.id)).size;
}

/** Visible proof sections shown as real (not `sample`) whose owner never attested them (pre-R1 documents). */
function unattestedProofSections(p: LiveLandingPage): PageDoc["sections"] {
  const attested = new Set(p.attested);
  return visible(p.doc).filter((s) => PROOF_SECTIONS.has(s.type) && dataOf(s).sample !== true && !attested.has(s.id));
}
const unattestedProof = (p: LiveLandingPage) => unattestedProofSections(p).length;
/** The section the fix opens: the first proof section to attest or hide. */
const firstUnattestedProof = (p: LiveLandingPage) => unattestedProofSections(p)[0]?.id ?? null;

const RULES: readonly RuleSpec[] = [
  /* ---- setup ---- */
  {
    rule: "no_live_page",
    group: "setup",
    severity: 3,
    fix: link("/pages"),
    measure: (f, i) => {
      if (i.store.status !== "active") return null;
      const published = i.pages ? i.pages.published : f.live.length;
      return published === 0 ? { metric: "landing.live_pages", value: 0, window: "now", n: i.pages ? i.pages.drafts : 0 } : null;
    },
  },
  {
    rule: "zones_empty",
    group: "setup",
    severity: 2,
    fix: link("/settings/delivery"),
    measure: (f) => {
      const fee = f.live.filter((p) => (p.doc.offers?.shippingFee ?? 0) > 0);
      if (!f.zones.hasMarketList || (f.zones.enabled && f.zones.count > 0) || !fee.length) return null;
      return { metric: "landing.zones_count", value: f.zones.enabled ? f.zones.count : 0, window: "now", n: fee.length };
    },
  },
  {
    rule: "holidays_unreviewed",
    group: "setup",
    severity: 1,
    fix: link("/settings/delivery"),
    measure: (f) => (f.zones.enabled && (f.holidaysReviewedYear ?? 0) < f.year ? { metric: "landing.holidays_year", value: f.year, window: "year", n: f.zones.count } : null),
  },
  {
    rule: "policies_unreviewed",
    group: "setup",
    severity: 1,
    fix: link("/settings/policies"),
    measure: (f, i) => {
      const live = i.pages ? i.pages.published : f.live.length;
      if (!i.settings || i.settings.policies.reviewedAt || live < 1) return null;
      return { metric: "landing.policies_reviewed", value: 0, window: "now", n: live };
    },
  },
  {
    rule: "no_caller",
    group: "setup",
    severity: 1,
    fix: link("/settings/checkout"),
    measure: (f, i) => {
      if (!i.settings || !f.expectation || i.settings.store.confirmation?.callerPhone) return null;
      return { metric: "landing.caller_phone", value: 0, window: "now", n: f.live.length };
    },
  },
  /* ---- trust ---- */
  {
    rule: "countdown_ended",
    group: "trust",
    severity: 3,
    fix: pageLink({ tab: "offers" }),
    measure: (f, i) =>
      pagesWhere(f, "landing.countdown_ended_pages", (p) => {
        const end = p.doc.offers?.urgency?.countdownEnd;
        const t = end ? Date.parse(end) : NaN;
        return Number.isFinite(t) && t <= i.now.getTime();
      }),
  },
  {
    rule: "compare_not_higher",
    group: "trust",
    severity: 2,
    fix: pageLink({ tab: "product" }),
    measure: (f) => pagesWhere(f, "landing.compare_not_higher_pages", (p) => (p.doc.items ?? []).some((it) => it.compareAt !== undefined && it.compareAt <= it.price)),
  },
  {
    rule: "stock_zero",
    group: "trust",
    severity: 2,
    fix: pageLink({ tab: "offers" }),
    measure: (f) => pagesWhere(f, "landing.stock_zero_pages", (p) => p.doc.offers?.urgency?.stockLeft === 0),
  },
  {
    rule: "stock_stale",
    group: "trust",
    severity: 1,
    fix: pageLink({ tab: "offers" }),
    measure: (f, i) =>
      pagesWhere(f, "landing.stock_stale_pages", (p) => {
        const stock = p.doc.offers?.urgency?.stockLeft;
        const since = p.stockChangedAt ? Date.parse(p.stockChangedAt) : NaN;
        return typeof stock === "number" && stock > 0 && Number.isFinite(since) && i.now.getTime() - since > STALE_STOCK_MS;
      }),
  },
  {
    rule: "proof_unattested",
    group: "trust",
    severity: 2,
    fix: pageLink({ section: firstUnattestedProof }),
    measure: (f) => {
      const hit = f.live.filter((p) => unattestedProof(p) > 0);
      if (!hit.length) return null;
      return { metric: "landing.proof_unattested_sections", value: hit.reduce((n, p) => n + unattestedProof(p), 0), window: "now", n: f.live.length, page: hit[0]! };
    },
  },
  /* ---- conversion ---- */
  {
    rule: "no_seo",
    group: "conversion",
    severity: 1,
    fix: pageLink({ tab: "seo" }),
    measure: (f) => pagesWhere(f, "landing.no_seo_pages", (p) => !p.doc.seo?.title?.trim() || !p.doc.seo?.description?.trim()),
  },
  {
    rule: "no_alt",
    group: "conversion",
    severity: 1,
    fix: pageLink({ tab: "product" }),
    measure: (f) => {
      const hit = f.live.filter((p) => imagesWithoutAlt(p.doc) > 0);
      if (!hit.length) return null;
      return { metric: "landing.images_without_alt", value: hit.reduce((n, p) => n + imagesWithoutAlt(p.doc), 0), window: "now", n: f.live.length, page: hit[0]! };
    },
  },
  {
    rule: "no_pixel",
    group: "conversion",
    severity: 2,
    fix: pageLink({ tab: "seo" }),
    measure: (f) => pagesWhere(f, "landing.no_pixel_pages", (p) => p.doc.tracking?.none !== true && !pixelIds(p.doc.tracking)),
  },
  {
    rule: "form_hidden",
    group: "conversion",
    severity: 3,
    fix: pageLink({ tab: "form" }),
    measure: (f) => pagesWhere(f, "landing.form_hidden_pages", (p) => !p.doc.sections.some((s) => s.type === "orderForm" && !s.hidden)),
  },
  {
    rule: "leads_slow",
    group: "conversion",
    severity: 1,
    minN: 20,
    fix: link("/leads"),
    measure: (f) => {
      const { p50Min, n } = f.leads;
      if (n < 20 || p50Min === null || p50Min <= f.firstContactTargetMin) return null;
      return { metric: "landing.lead_first_contact_p50_min", value: p50Min, baseline: f.firstContactTargetMin, window: "28d", n };
    },
  },
  {
    rule: "wa_intents_waiting",
    group: "conversion",
    severity: 1,
    minN: 3,
    fix: link("/leads?kind=whatsapp"),
    measure: (f) => (f.waWaiting >= 3 ? { metric: "landing.wa_intents_waiting", value: f.waWaiting, window: "28d", n: f.waWaiting } : null),
  },
  {
    rule: "fee_mismatch",
    group: "conversion",
    severity: 1,
    minN: 20,
    fix: pageLink({ tab: "offers" }),
    measure: (f, i) => {
      if (f.orders28d < 20) return null;
      // P1's input when it computed it (the same `zoneFeesFor` join over the same top-5 keys), else this track's
      const rows = i.zones ? (i.zones.pageShowsFlatFee ? i.zones.feeMismatchTop5 : []) : f.feeMismatch;
      if (!rows.length) return null;
      const page = f.live.find((p) => rows.some((r) => Math.round((p.doc.offers?.shippingFee ?? 0) * 100) === r.pageFeeCents)) ?? null;
      return { metric: "fee_mismatch_cities", value: new Set(rows.map((r) => r.cityKey)).size, window: "28d", n: f.orders28d, page };
    },
  },
];

/** The issue of one rule over the facts and the inputs, or null (pure). */
export function landingIssue(spec: RuleSpec, f: LandingHealthFacts, inputs: HealthInputs): HealthIssue | null {
  const m = spec.measure(f, inputs);
  if (!m) return null;
  if (spec.minN !== undefined && m.n < spec.minN) return null;
  const fix: HealthFix = { kind: "link", href: spec.fix(m.page ?? null), label: `health.landing.${spec.rule}.fix` as MessageKey };
  return {
    id: `landing:${spec.rule}`,
    group: spec.group,
    severity: spec.severity,
    points: POINTS[spec.severity],
    evidence: { metric: m.metric, value: m.value, ...(m.baseline !== undefined ? { baseline: m.baseline } : {}), window: m.window, n: m.n },
    fix,
    text: `health.landing.${spec.rule}.text` as MessageKey,
  };
}

/** Every issue of the store at once (the local runner and the console's preview). */
export function landingIssues(f: LandingHealthFacts, inputs: HealthInputs): HealthIssue[] {
  return RULES.map((r) => landingIssue(r, f, inputs)).filter((x): x is HealthIssue => x !== null);
}

/** The rules' ids, severities and groups (LAN-§23.7), for the tests. */
export const LANDING_HEALTH_TABLE: readonly { id: string; group: HealthGroup; severity: Severity; points: 3 | 6 | 10; minN?: number }[] = RULES.map((r) => ({
  id: `landing:${r.rule}`,
  group: r.group,
  severity: r.severity,
  points: POINTS[r.severity],
  ...(r.minN !== undefined ? { minN: r.minN } : {}),
}));

export const rules: HealthRule[] = RULES.map((spec) => ({
  id: `landing:${spec.rule}`,
  group: spec.group,
  release: "R1",
  mode: "landing",
  ...(spec.minN !== undefined ? { minN: spec.minN } : {}),
  async collect(scope, inputs) {
    return landingIssue(spec, await landingHealthFacts(scope, inputs), inputs);
  },
}));

/* ------------------------------------------------------------------ */
/* fixtures (P1's test:health)                                         */
/* ------------------------------------------------------------------ */

// P1's harness runs every fixture in the scope of its fixture store (src/lib/health/fixtures.ts `fixtureStore().id`)
const FIXTURE_STORE = "01JH000000000000000000STA1";
const FIXTURE_NOW = new Date("2026-10-20T10:00:00.000Z");

/** A live page document with nothing to say: SEO, alt texts, a pixel, the form, no countdown or stock. */
export function cleanLiveDoc(): PageDoc {
  return {
    locale: "fr",
    market: "MA",
    product: { name: "Huile d'argan", images: [{ id: "a".repeat(26), alt: "Flacon d'huile d'argan" }] },
    items: [{ id: "i1", name: "Huile d'argan", price: 149, groups: [] }],
    offers: { bundles: [], shippingFee: 0, urgency: {} },
    sections: [
      { id: "hero", type: "hero", variant: "split", bg: "base", hidden: false, data: { image: { id: "b".repeat(26), alt: "Flacon sur une table" } } },
      { id: "reviews", type: "reviews", variant: "cards", bg: "base", hidden: false, data: { sample: false } },
      { id: "orderForm", type: "orderForm", variant: "card", bg: "base", hidden: false, data: {} },
    ],
    seo: { title: "Huile d'argan pure", description: "Pressée à froid à Essaouira." },
    tracking: { metaPixelId: ["123456789012345"] },
  } as unknown as PageDoc;
}

/** One live page with its doc patched by `edit`. */
export function livePage(edit: (d: PageDoc) => void = () => {}, over: Partial<LiveLandingPage> = {}): LiveLandingPage {
  const doc = cleanLiveDoc();
  edit(doc);
  return { id: "PAGEHEALTHAAAAAAAAAAAAAAAA", slug: "argan", doc, attested: ["reviews"], stockChangedAt: null, ...over };
}

/** Facts of a store where every landing rule is silent. */
export function quietFacts(over: Partial<LandingHealthFacts> = {}): LandingHealthFacts {
  return {
    storeId: FIXTURE_STORE,
    live: [livePage()],
    expectation: true,
    firstContactTargetMin: 30,
    zones: { count: 2, enabled: true, hasMarketList: true },
    holidaysReviewedYear: 2026,
    year: 2026,
    leads: { p50Min: 12, n: 40 },
    waWaiting: 0,
    feeMismatch: [],
    orders28d: 60,
    ...over,
  };
}

/** `HealthInputs` parts these rules read, for a quiet store (merged over P1's empty base inputs). */
export function quietInputs(over: Partial<HealthInputs> = {}): Partial<HealthInputs> {
  return {
    store: { id: FIXTURE_STORE, handle: "argan", status: "active", mode: "landing", market: "MA", timezone: "Africa/Casablanca" } as HealthInputs["store"],
    now: FIXTURE_NOW,
    pages: { published: 1, drafts: 0, lastPublishAt: FIXTURE_NOW, renderFailed: 0, live: [] },
    settings: {
      store: { confirmation: { callerPhone: "+212522000000" } },
      policies: { reviewedAt: "2026-09-01T09:00:00.000Z" },
      checkout: { zonesEnabled: true },
      conversions: {},
    } as unknown as HealthInputs["settings"],
    zones: null,
    ...over,
  };
}

/** Inputs carrying this track's facts on the extra `landing` key (typed through the intersection, never a cast). */
export function withLanding(over: Partial<HealthInputs>, landing: LandingHealthFacts): Partial<HealthInputs> {
  const inputs: Partial<HealthInputs> & { landing: LandingHealthFacts } = { ...quietInputs(over), landing };
  return inputs;
}

const ended = new Date(FIXTURE_NOW.getTime() - DAY).toISOString();

/** Each rule: `fires` raises it, `silent` does not (below `minN` where the rule has one). */
export const fixtures: HealthRuleFixture[] = [
  { rule: "landing:no_live_page", fires: withLanding({ pages: { published: 0, drafts: 2, lastPublishAt: null, renderFailed: 0, live: [] } }, quietFacts({ live: [] })), silent: withLanding({}, quietFacts()), expect: { severity: 3, metric: "landing.live_pages" } },
  {
    rule: "landing:zones_empty",
    fires: withLanding({}, quietFacts({ zones: { count: 0, enabled: false, hasMarketList: true }, live: [livePage((d) => (d.offers.shippingFee = 29))] })),
    silent: withLanding({}, quietFacts({ zones: { count: 0, enabled: false, hasMarketList: false }, live: [livePage((d) => (d.offers.shippingFee = 29))] })),
    expect: { severity: 2, metric: "landing.zones_count" },
  },
  { rule: "landing:holidays_unreviewed", fires: withLanding({}, quietFacts({ holidaysReviewedYear: null })), silent: withLanding({}, quietFacts()), expect: { severity: 1, metric: "landing.holidays_year" } },
  {
    rule: "landing:policies_unreviewed",
    fires: withLanding({ settings: { ...quietInputs().settings!, policies: { reviewedAt: null } } as unknown as HealthInputs["settings"] }, quietFacts()),
    silent: withLanding({ pages: { published: 0, drafts: 1, lastPublishAt: null, renderFailed: 0, live: [] }, settings: { ...quietInputs().settings!, policies: { reviewedAt: null } } as unknown as HealthInputs["settings"] }, quietFacts({ live: [] })),
    expect: { severity: 1, metric: "landing.policies_reviewed" },
  },
  {
    rule: "landing:no_caller",
    fires: withLanding({ settings: { ...quietInputs().settings!, store: { confirmation: {} } } as unknown as HealthInputs["settings"] }, quietFacts()),
    silent: withLanding({ settings: { ...quietInputs().settings!, store: { confirmation: {} } } as unknown as HealthInputs["settings"] }, quietFacts({ expectation: false })),
    expect: { severity: 1, metric: "landing.caller_phone" },
  },
  {
    rule: "landing:countdown_ended",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.offers.urgency = { countdownEnd: ended }))] })),
    silent: withLanding({}, quietFacts({ live: [livePage((d) => (d.offers.urgency = { countdownEnd: new Date(FIXTURE_NOW.getTime() + DAY).toISOString() }))] })),
    expect: { severity: 3, metric: "landing.countdown_ended_pages" },
  },
  {
    rule: "landing:compare_not_higher",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.items[0]!.compareAt = 149))] })),
    silent: withLanding({}, quietFacts({ live: [livePage((d) => (d.items[0]!.compareAt = 199))] })),
    expect: { severity: 2, metric: "landing.compare_not_higher_pages" },
  },
  {
    rule: "landing:stock_zero",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.offers.urgency = { stockLeft: 0 }))] })),
    silent: withLanding({}, quietFacts({ live: [livePage((d) => (d.offers.urgency = { stockLeft: 4 }))] })),
    expect: { severity: 2, metric: "landing.stock_zero_pages" },
  },
  {
    rule: "landing:stock_stale",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.offers.urgency = { stockLeft: 7 }), { stockChangedAt: new Date(FIXTURE_NOW.getTime() - 20 * DAY).toISOString() })] })),
    silent: withLanding({}, quietFacts({ live: [livePage((d) => (d.offers.urgency = { stockLeft: 7 }), { stockChangedAt: new Date(FIXTURE_NOW.getTime() - 10 * DAY).toISOString() })] })),
    expect: { severity: 1, metric: "landing.stock_stale_pages" },
  },
  {
    rule: "landing:proof_unattested",
    fires: withLanding({}, quietFacts({ live: [livePage(() => {}, { attested: [] })] })),
    silent: withLanding({}, quietFacts()),
    expect: { severity: 2, metric: "landing.proof_unattested_sections" },
  },
  {
    rule: "landing:no_seo",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.seo = { ...d.seo, description: "" }))] })),
    silent: withLanding({}, quietFacts()),
    expect: { severity: 1, metric: "landing.no_seo_pages" },
  },
  {
    rule: "landing:no_alt",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.product.images = [{ id: "a".repeat(26), alt: "" }]))] })),
    silent: withLanding({}, quietFacts()),
    expect: { severity: 1, metric: "landing.images_without_alt" },
  },
  {
    rule: "landing:no_pixel",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.tracking = {}))] })),
    silent: withLanding({}, quietFacts({ live: [livePage((d) => (d.tracking = { none: true }))] })),
    expect: { severity: 2, metric: "landing.no_pixel_pages" },
  },
  {
    rule: "landing:form_hidden",
    fires: withLanding({}, quietFacts({ live: [livePage((d) => (d.sections.find((s) => s.type === "orderForm")!.hidden = true))] })),
    silent: withLanding({}, quietFacts()),
    expect: { severity: 3, metric: "landing.form_hidden_pages" },
  },
  {
    rule: "landing:leads_slow",
    fires: withLanding({}, quietFacts({ leads: { p50Min: 95, n: 24 } })),
    // the same slow p50 over 12 leads: below minN 20
    silent: withLanding({}, quietFacts({ leads: { p50Min: 95, n: 12 } })),
    expect: { severity: 1, metric: "landing.lead_first_contact_p50_min" },
  },
  {
    rule: "landing:wa_intents_waiting",
    fires: withLanding({}, quietFacts({ waWaiting: 4 })),
    silent: withLanding({}, quietFacts({ waWaiting: 2 })),
    expect: { severity: 1, metric: "landing.wa_intents_waiting" },
  },
  {
    rule: "landing:fee_mismatch",
    fires: withLanding({}, quietFacts({ feeMismatch: [{ cityKey: "rabat", pageFeeCents: 2_900, zoneFeeCents: 3_900 }], live: [livePage((d) => (d.offers.shippingFee = 29))] })),
    // the same mismatch with 12 orders in 28 days: below minN 20 (and the P4 stub's empty cells answer 0)
    silent: withLanding({}, quietFacts({ orders28d: 12, feeMismatch: [{ cityKey: "rabat", pageFeeCents: 2_900, zoneFeeCents: 3_900 }], live: [livePage((d) => (d.offers.shippingFee = 29))] })),
    expect: { severity: 1, metric: "fee_mismatch_cities" },
  },
];

/**
 * Two stores (§I.7 "a two-store fixture proves no cross-store evidence"): store A trips every page rule, store B is
 * quiet. Run for B's scope with A's facts on the inputs, every rule must refuse them (they name another store), and
 * with B's own facts every rule is silent.
 */
export function twoStoreFixture(): { a: LandingHealthFacts; b: LandingHealthFacts; inputsB: Partial<HealthInputs> } {
  const a = quietFacts({
    storeId: "STOREHEALTHAAAAAAAAAAAAAAA",
    live: [livePage((d) => {
      d.offers.urgency = { countdownEnd: ended, stockLeft: 0 };
      d.seo = { ...d.seo, title: "", description: "" };
      d.tracking = {};
    }, { attested: [] })],
    leads: { p50Min: 120, n: 50 },
    waWaiting: 9,
  });
  const b = quietFacts({ storeId: "STOREHEALTHBBBBBBBBBBBBBBB" });
  return { a, b, inputsB: quietInputs({ store: { ...(quietInputs().store as HealthInputs["store"]), id: b.storeId } }) };
}
