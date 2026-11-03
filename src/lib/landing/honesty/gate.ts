/**
 * The landing honesty gate's rules (P3 LANDING; landing.md LAN-§3.2, LAN-§3.2.1, LAN-§6.1 to §6.4, LAN-§3.5 OF2 to
 * OF4; docs/STORE-SAAS.md §M.1, §M.3, §M.5, D51): one pure evaluator over a document and what the store says, read by
 * both sides of the publish contract, so the builder's checklist and the server's refusal show the same items with the
 * same ids and the same levels (§M.5):
 *
 *   honestyItems(doc, honestyContextOf(doc, facts, { now, theme }))   → GateItem[]
 *     - the publish check (src/lib/render/prepublish/landing.ts) builds `facts` with `loadLandingGateInputs`;
 *     - the builder checklist (src/lib/editor/checklist.ts) reads the same facts from the editor's preload
 *       (CCR docs/saas/ccr/r1-p3-3.md), or a partial context while the preload does not ship them yet.
 *
 * Levels are decided by rule, never by mode (LAN-§3.2.1): example proof, missing proof material, unplaced callouts,
 * library figures, a restarted or doubled countdown, an untyped stock figure, a password field and every conflict are
 * hard; a number or a promise is hard when the field is generated or the claim contradicts a policy the owner set, and
 * soft with a one-tap fix when the owner typed it and the policy is merely unset (rev 3, ENGP-8). The `urgency:*`,
 * `delivery:*`, `policies:*`, `thanks:*` and `form:F2` rows are notes. A fact this side does not know (a field of a
 * partial context left null) silences the rows that need it: nothing is guessed, so a partial context never shows an
 * error the full one would not.
 *
 * Pure and isomorphic, ≤ 40 ms on a 40-section page. Item titles are message keys `landing.gate.<group>.<rule>.*` in
 * src/lib/i18n/admin/<locale>/landing.ts (LAN-§6.5).
 */
import { getSection } from "@/landing/registry";
import { orderFormBand, orderFormEstimate } from "@/landing/sections/orderForm/height";
import type { DeliveryZoneRow, Range } from "@/lib/delivery/types";
import { variantFeatures } from "@/lib/design/features";
import { formatMoney } from "@/lib/markets/money";
import { estimateHeights } from "@/lib/design/heights";
import { isChoiceGroup, type PageDoc } from "@/lib/page/schema";
import { policyAllows, policyClaims, type PolicyClaim, type PolicyClaimKind, type PromiseFacts } from "@/lib/policies";
import { originFrom, type GenerationRecord } from "@/lib/render/origin";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import { contrast, isHex } from "@/lib/theme/color";
import type { GateItem } from "@/lib/tenancy/types";
import type { PrePublishCtx } from "@/lib/render/prepublish";
import type { LandingGateInputs } from "@/lib/render/prepublish/landing";
import { promiseWindowOf } from "@/lib/landing/hours";
import { allowedNumbersFor, auditNumbers, PROOF_SECTIONS, sensitiveFields, visibleTexts, type AllowedNumbers } from "./numbers";

/* ------------------------------------------------------------------ */
/* ids                                                                 */
/* ------------------------------------------------------------------ */

/** The rows the gate can refuse a page for (LAN-§3.2.1); `form:*` live here because this track owns the form. */
export const HONESTY_GATE_IDS = [
  "honesty:sample",
  "honesty:I4",
  "honesty:I5",
  "honesty:D1",
  "honesty:D2",
  "honesty:countdown_reset",
  "honesty:countdown_twice",
  "honesty:promise",
  "honesty:stock_untyped",
  "honesty:password_field",
  "form:F1",
  "form:F3",
] as const;
export type HonestyGateId = (typeof HONESTY_GATE_IDS)[number];

/**
 * The other LAN-§3.2 rows: notes the dialog lists and re-renders store (core §H.3), and `wa:no-number`, an error of
 * the table (a WhatsApp order button with no number to open), which the server enforces like every error row.
 */
export const LANDING_NOTE_IDS = [
  "urgency:extended",
  "urgency:far",
  "urgency:stock-stale",
  "delivery:zones-empty",
  "delivery:fee_mismatch",
  "delivery:lead-unset",
  "policies:unreviewed",
  "thanks:no-caller",
  "thanks:no-window",
  "wa:no-number",
  "form:F2",
] as const;
export type LandingNoteId = (typeof LANDING_NOTE_IDS)[number];

/**
 * Rev 1's `rating:unattested`, renamed. It is never emitted: since rev 3 an unattested `product.rating` is a proof
 * class owner rule 4 refuses (core §M.1 rule 2), which the `honesty:D2` row states ("product.rating rendering a
 * library default or an unattested value"), so the rating raises `honesty:D2` on `product.rating`. The catalogs keep
 * its message for notes stored before.
 */
export const RETIRED_IDS = ["honesty:rating_unattested"] as const;

export type LandingItemId = HonestyGateId | LandingNoteId;

/** The message key of an item: `landing.gate.honesty.D1.title`, `landing.gate.honesty.D1.conflict.detail`. */
export function gateKey(id: string, part: "title" | "detail", variant?: string): string {
  return `landing.gate.${id.replace(":", ".")}${variant ? `.${variant}` : ""}.${part}`;
}

/* ------------------------------------------------------------------ */
/* the context                                                         */
/* ------------------------------------------------------------------ */

/** What the generator wrote into the page's newest `generation` version (who typed a value is read from it). */
export interface GeneratedSnapshot {
  stockLeft?: number;
  countdownEnd?: string;
  rating?: { value: number; count: number };
  /** the hotspot pins as the generator placed them: section id → points */
  points: Record<string, readonly { x: number; y: number }[]>;
}

/** The live version's values (LP-21): its countdown end, its stock and since when that stock figure is live. */
export interface LiveFacts {
  countdownEnd?: string;
  stockLeft?: number;
  stockChangedAt?: string;
}

/** The calling window as a promise may rest on it (`promiseWindowOf`, src/lib/landing/hours.ts). */
export interface PromiseWindow {
  configured: boolean;
  empty: boolean;
  ranges: readonly Range[];
}

/**
 * The store's side, JSON-safe: what `loadLandingGateInputs` reads and the editor's preload ships to the builder. Every
 * value comes from the scope's store (its settings, zones, calling window, the page's audit rows and versions).
 */
export interface GateFacts {
  zones: DeliveryZoneRow[];
  zonesEnabled: boolean;
  /** the market has a city list (the delivery line can show a date per city) */
  hasMarketList: boolean;
  /** the zone fee in cents of each of the five main city keys (`zoneFeesFor`) */
  feesByTopCity: Record<string, number | null>;
  /** display names of those keys ("casablanca" → "Casablanca") */
  cityNames: Record<string, string>;
  policies: StorePolicyFacts;
  confirmationCall: boolean;
  confirmation: { callerPhone?: string; whatsapp?: string; withinHours?: number };
  /** `store.whatsapp` is set */
  storeWhatsapp: boolean;
  /** `landing.thankYou.expectation`: the thank-you page says when the store calls */
  expectation: boolean;
  waOrder: boolean;
  /** `checkout.calendar.confirmationLeadDays` (null = never answered) */
  leadDays: number | null;
  addressMode: "required" | "optional";
  callWindow: PromiseWindow;
  /** `page.proof_attested` targets of the page: section ids and "rating" */
  attested: string[];
  /** the page's merchant facts as typed (`factTexts(await factsFor(scope, pageId))`) */
  facts: string[];
  /** the page's generation record (`generationRecordFor`), the input of the core's `originFrom` */
  gen: GenerationRecord | null;
  generated: GeneratedSnapshot | null;
  live: LiveFacts | null;
}

/** The store's side as the rules read it; a null field is not known on this side and silences its rows. */
export interface StoreSide {
  zones: readonly DeliveryZoneRow[] | null;
  zonesEnabled: boolean;
  zoneCount: number;
  hasMarketList: boolean;
  feesByTopCity: Readonly<Record<string, number | null>>;
  cityNames: Readonly<Record<string, string>>;
  policies: StorePolicyFacts | null;
  policiesReviewed: boolean;
  confirmationCall: boolean | null;
  withinHours: number | null;
  callerPhone: boolean;
  /** a WhatsApp number to open: `store.whatsapp` or `store.confirmation.whatsapp` */
  whatsapp: boolean;
  callWindow: PromiseWindow | null;
  expectation: boolean | null;
  waOrder: boolean;
  /** undefined = not known on this side */
  leadDays: number | null | undefined;
}

export interface HonestyContext {
  now: number;
  store: StoreSide;
  /** the numerals the page may show (`allowedNumbersFor`); null = the numbers audit is not run on this side */
  allowed: AllowedNumbers | null;
  /** who wrote each text field (the fold of the core's `originFrom`); null = unknown */
  origin: ReadonlyMap<string, "generated" | "owner"> | null;
  /** the proof the owner attested (section ids and "rating"); null = unknown */
  attested: ReadonlySet<string> | null;
  /** the generator's values; null = the page has no generation version; undefined = unknown */
  generated: GeneratedSnapshot | null | undefined;
  live: LiveFacts | null;
  /** the order form's estimated height in its default state (`formHeightOf`), px at 390 */
  formHeightPx: number | null;
  /** the built theme's tokens (form:F3); null = unknown */
  tokens: Readonly<Record<string, string>> | null;
  /** the rendered document, when the caller has it (`honesty:password_field` scans it) */
  html?: string;
  /** what the gate knows of the referenced assets (a video slot must hold a video) */
  assets?: ReadonlyMap<string, { mime: string | null }>;
}

/** The fold of design's five origin classes to the two the honesty rules read (core §M.1 rule 2). */
export function foldOrigin(origin: ReadonlyMap<string, string>): Map<string, "generated" | "owner"> {
  const out = new Map<string, "generated" | "owner">();
  for (const [path, o] of origin) out.set(path, o === "owner" ? "owner" : "generated");
  return out;
}

/** The store side of full facts. */
export function storeSideOf(f: GateFacts): StoreSide {
  return {
    zones: f.zones,
    zonesEnabled: f.zonesEnabled,
    zoneCount: f.zones.length,
    hasMarketList: f.hasMarketList,
    feesByTopCity: f.feesByTopCity,
    cityNames: f.cityNames,
    policies: f.policies,
    policiesReviewed: !!f.policies.reviewedAt,
    confirmationCall: f.confirmationCall,
    withinHours: f.confirmation.withinHours ?? null,
    callerPhone: !!f.confirmation.callerPhone,
    whatsapp: f.storeWhatsapp || !!f.confirmation.whatsapp,
    callWindow: f.callWindow,
    expectation: f.expectation,
    waOrder: f.waOrder,
    leadDays: f.leadDays,
  };
}

/**
 * The full context of `doc` from the store's facts: the numbers it may show (`allowedNumbersFor`, the attested rating
 * included), who wrote each field (`originFrom` over the generation record, unless the caller already folded it) and
 * the rest as given.
 */
export function honestyContextOf(
  doc: PageDoc,
  f: GateFacts,
  opts: {
    now: number;
    tokens?: Readonly<Record<string, string>> | null;
    formHeightPx?: number | null;
    origin?: ReadonlyMap<string, "generated" | "owner">;
    html?: string;
    assets?: ReadonlyMap<string, { mime: string | null }>;
  },
): HonestyContext {
  const attested = new Set(f.attested);
  const allowed = allowedNumbersFor(doc, {
    policies: f.policies,
    zones: f.zones,
    zonesEnabled: f.zonesEnabled,
    confirmation: f.confirmation,
    facts: f.facts,
    ratingAttested: attested.has("rating"),
  });
  return {
    now: opts.now,
    store: storeSideOf(f),
    allowed,
    origin: opts.origin ?? foldOrigin(originFrom(null, doc, f.gen)),
    attested,
    generated: f.generated,
    live: f.live,
    formHeightPx: opts.formHeightPx ?? null,
    tokens: opts.tokens ?? null,
    ...(opts.html !== undefined ? { html: opts.html } : {}),
    ...(opts.assets ? { assets: opts.assets } : {}),
  };
}

/** The JSON-safe facts of the inputs, as the builder's preload ships them (one conversion for both sides). */
export function gateFactsOf(inputs: LandingGateInputs, now: Date): GateFacts {
  const { checkout, landing, confirmation } = inputs;
  return {
    zones: inputs.zones,
    zonesEnabled: checkout.zonesEnabled,
    hasMarketList: inputs.hasMarketList,
    feesByTopCity: inputs.feesByTopCity,
    cityNames: inputs.cityNames,
    policies: inputs.policies,
    confirmationCall: checkout.confirmationCall,
    confirmation: {
      ...(confirmation.callerPhone ? { callerPhone: confirmation.callerPhone } : {}),
      ...(confirmation.whatsapp ? { whatsapp: confirmation.whatsapp } : {}),
      ...(confirmation.withinHours !== undefined ? { withinHours: confirmation.withinHours } : {}),
    },
    storeWhatsapp: inputs.storeWhatsapp,
    expectation: landing.thankYou.expectation,
    waOrder: landing.waOrder.enabled,
    leadDays: checkout.calendar.confirmationLeadDays,
    // the market default is `required` for every R1 market (UX-31)
    addressMode: checkout.addressMode ?? "required",
    callWindow: promiseWindowOf(inputs.callingWindow, now),
    attested: [...inputs.attested].sort(),
    facts: inputs.facts.length ? inputs.facts : [...inputs.attestedFacts],
    gen: inputs.gen,
    generated: inputs.generated,
    live: inputs.live,
  };
}

/**
 * The gate's items for one document (pure over `ctx` and `inputs`, ≤ 40 ms; `landingGateItems` of
 * src/lib/render/prepublish/landing.ts). The live version's countdown and stock are `ctx.prev`'s (the version this
 * publish replaces); the stock's age comes from the version history.
 */
export function gateItemsOf(ctx: Pick<PrePublishCtx, "doc" | "prev" | "now" | "theme" | "html" | "assets">, inputs: LandingGateInputs): GateItem[] {
  // StoreDocBranch (R2 contract step): `readPageDoc(kind, ctx.doc)`; a store kind runs the section rows only over
  // `doc.sections` with the bound product's facts (`inputs.product`), and the six utility kinds yield no item.
  const facts = gateFactsOf(inputs, ctx.now);
  const prevUrgency = ctx.prev?.offers.urgency;
  facts.live = ctx.prev
    ? {
        ...(prevUrgency?.countdownEnd ? { countdownEnd: prevUrgency.countdownEnd } : {}),
        ...(prevUrgency?.stockLeft !== undefined ? { stockLeft: prevUrgency.stockLeft } : {}),
        ...(inputs.live?.stockChangedAt && inputs.live.stockLeft === prevUrgency?.stockLeft ? { stockChangedAt: inputs.live.stockChangedAt } : {}),
      }
    : null;
  const context = honestyContextOf(ctx.doc, facts, {
    now: ctx.now.getTime(),
    tokens: ctx.theme?.tokens ?? null,
    formHeightPx: formHeightOf(ctx.doc, facts.addressMode),
    origin: inputs.origin,
    ...(ctx.html !== undefined ? { html: ctx.html } : {}),
    assets: ctx.assets,
  });
  return honestyItems(ctx.doc, context);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

type Section = PageDoc["sections"][number];
type Data = Record<string, unknown>;
type Ref = { id?: unknown } | undefined | null;

const dataOf = (s: Section): Data => (s.data && typeof s.data === "object" ? (s.data as Data) : {});
const refId = (r: unknown): string | null => {
  const id = (r as Ref)?.id;
  return typeof id === "string" && id ? id : null;
};
const labelOf = (type: string) => getSection(type)?.label ?? type;
const DAY = 86_400_000;
/** LAN-§3.2 `urgency:far` and `urgency:stock-stale` (LD36). */
export const FAR_COUNTDOWN_MS = 30 * DAY;
export const STALE_STOCK_MS = 14 * DAY;

/** The sections that show figures as a claim: owner-typed and attested, or nothing (LAN-§6.1 D2). */
function isFigureSection(s: Section): boolean {
  return s.type === "stats" || (s.type === "socialProof" && s.variant === "counter") || (s.type === "reviews" && s.variant === "summary");
}

/** Distinct photos a gallery shows: its items' own photos, else the next unused product photo, then (fill) the rest. */
function galleryPhotos(doc: PageDoc, data: Data): number {
  const items = Array.isArray(data.items) ? (data.items as { image?: unknown }[]) : [];
  const own = items.map((it) => refId(it?.image));
  const taken = new Set(own.filter((x): x is string => !!x));
  const photos = [...new Set(doc.product.images.map((r) => r.id))];
  const cutout = doc.product.cutout?.id;
  const pool = [...(photos.length >= 3 || !cutout ? photos : [...photos, cutout])].filter((id) => !taken.has(id));
  const shown = new Set<string>();
  own.forEach((id) => {
    const pick = id ?? pool.shift() ?? null;
    if (pick) shown.add(pick);
  });
  if (data.fill !== false) for (const id of pool) shown.add(id);
  return shown.size;
}

/** The section a doc path belongs to (`<section id>.<path>`), or undefined for `product.*`, `offers.*`, … */
function sectionOfPath(doc: PageDoc, path: string): string | undefined {
  const head = path.split(".")[0] ?? "";
  return doc.sections.some((s) => s.id === head) ? head : undefined;
}

/** The order form renders a countdown end while it is ahead (the renderers' `liveEnd`). */
const ahead = (iso: string | undefined, now: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > now;
};

/** The Policies card a claim kind is set in (`/settings/policies?card=<card>`), or null when it lives elsewhere. */
const CLAIM_CARD: Record<PolicyClaimKind, string | null> = {
  delivery_time: "delivery",
  free_delivery: "delivery",
  return_window: "returns",
  exchange: "returns",
  inspection: "inspection",
  warranty: "warranty",
  refund: "refund",
  confirmation_call: null,
};

/** The promise facts of the page and its store (`policyAllows`, LAN-§3.3). */
export function promiseFactsOf(doc: PageDoc, store: StoreSide): PromiseFacts | null {
  if (!store.policies || store.confirmationCall === null) return null;
  return {
    policies: store.policies,
    confirmationCall: store.confirmationCall,
    withinHours: store.withinHours,
    ...(store.callWindow ? { callWindow: store.callWindow } : {}),
    page: { shippingFee: doc.offers.shippingFee, freeOffer: doc.offers.bundles.some((b) => b.freeShipping) },
    ...(store.zones
      ? {
          zones: {
            enabled: store.zonesEnabled,
            days: store.zones.filter((z) => !z.notServed && z.etaMinDays !== null && z.etaMaxDays !== null).map((z) => [z.etaMinDays!, z.etaMaxDays!] as const),
          },
        }
      : {}),
  };
}

/** The ratio of the form fields' boundary (`--sec-line-strong`) to the form panel (`--sec-card`) on the form's ground. */
export function formBoundaryRatio(tokens: Readonly<Record<string, string>>, bg: string): number | null {
  const line = tokens[`${bg}:sec-line-strong`] ?? tokens["sec-line-strong"] ?? tokens["lp-line-strong"];
  const card = tokens[`${bg}:sec-card`] ?? tokens["sec-card"];
  if (!line || !card || !isHex(line) || !isHex(card)) return null;
  return contrast(line, card);
}
/** OF4: visible boundaries ≥ 3:1 (LAN-§3.5). */
export const FORM_BOUNDARY_MIN = 3;

/**
 * The order form's estimated default-state height at 390 px (`form:F1`, LAN-§3.5 OF2): design's height model when it
 * is real (the multiplier-free `orderForm` entry, `formHeight`), this track's additive `orderFormEstimate` while the
 * model is the P0 stub. Null when the page shows no form.
 */
export function formHeightOf(doc: PageDoc, addressMode: "required" | "optional" | null): number | null {
  const form = doc.sections.find((s) => s.type === "orderForm" && !s.hidden);
  if (!form) return null;
  const report = estimateHeights(doc, { look: doc.theme.look ?? null, locale: doc.locale, features: variantFeatures });
  if (!report.stub) {
    const h = report.formHeight ?? report.sections.find((s) => s.id === form.id)?.height;
    if (typeof h === "number" && Number.isFinite(h)) return h;
  }
  return orderFormEstimate(doc, addressMode).px;
}

/* ------------------------------------------------------------------ */
/* the rules                                                           */
/* ------------------------------------------------------------------ */

const CC_RE = /<input\b[^>]*\btype\s*=\s*["']?password\b|<[a-z]+\b[^>]*\bautocomplete\s*=\s*["']?(?:cc-[a-z-]+|one-time-code)\b/gi;

/**
 * Every LAN-§3.2 row the page trips, in rule order then document order: one item per section or field, each with its
 * level, message keys, the values its message shows (`vars`) and where its fix leads.
 */
export function honestyItems(doc: PageDoc, c: HonestyContext): GateItem[] {
  const out: GateItem[] = [];
  const push = (id: LandingItemId, level: "hard" | "soft", o: { variant?: string; detail?: boolean; vars?: GateItem["vars"]; field?: string; sectionId?: string; fix?: GateItem["fix"] } = {}) => {
    const item: GateItem = { id, level, title: gateKey(id, "title", o.variant) };
    if (o.detail !== false) item.detail = gateKey(id, "detail", o.variant);
    if (o.vars) item.vars = o.vars;
    if (o.field) item.field = o.field;
    if (o.sectionId) item.sectionId = o.sectionId;
    if (o.fix) item.fix = o.fix;
    out.push(item);
  };
  const visible = doc.sections.filter((s) => !s.hidden);
  const origin = c.origin;
  const generatedField = (path: string) => origin?.get(path) === "generated";
  const now = c.now;

  /* ---- honesty:sample (LD17, LAN-§6.1) ---- */
  const refused = new Set<string>();
  for (const s of visible) {
    if (dataOf(s).sample !== true) continue;
    const proof = PROOF_SECTIONS.has(s.type);
    if (proof) refused.add(s.id);
    push("honesty:sample", proof ? "hard" : "soft", { variant: proof ? undefined : "other", vars: { section: labelOf(s.type) }, sectionId: s.id, fix: { sectionId: s.id, ...(proof ? { actionId: "landing:attest-proof" } : {}) } });
  }

  /* ---- honesty:I4 proof material (DB I4); a proof section refused as example content is judged once it is real ---- */
  for (const s of visible) {
    if (refused.has(s.id)) continue;
    const d = dataOf(s);
    const need = (kind: "photos" | "video" | "credit", needed: number, given: number) =>
      push("honesty:I4", "hard", { variant: kind, vars: { section: labelOf(s.type), needed, given }, sectionId: s.id, fix: { sectionId: s.id } });
    if (s.type === "beforeAfter") {
      const ids = new Set([refId((d.before as Data | undefined)?.image), refId((d.after as Data | undefined)?.image)].filter((x): x is string => !!x));
      if (ids.size < 2) need("photos", 2, ids.size);
      if (typeof d.who === "string" && d.who.trim() && generatedField(`${s.id}.who`)) need("credit", 1, 0);
    } else if (s.type === "video") {
      const id = refId(d.video);
      const meta = id ? c.assets?.get(id) : undefined;
      const isVideo = !!id && (meta ? (meta.mime ?? "video/").startsWith("video/") : true);
      if (!isVideo) need("video", 1, 0);
      if (typeof d.creatorName === "string" && d.creatorName.trim() && generatedField(`${s.id}.creatorName`)) need("credit", 1, 0);
    } else if (s.type === "gallery") {
      const n = galleryPhotos(doc, d);
      if (n < 3) need("photos", 3, n);
    } else if (s.type === "socialProof" && s.variant === "ugc") {
      const stories = Array.isArray(d.stories) ? (d.stories as { image?: unknown }[]) : [];
      const n = new Set(stories.map((x) => refId(x?.image)).filter((x): x is string => !!x)).size;
      if (n < 3) need("photos", 3, n);
    }
  }

  /* ---- honesty:I5 callouts on merchant-placed anchors ---- */
  if (c.generated !== undefined) {
    for (const s of visible) {
      if (s.type !== "showcase" || s.variant !== "hotspots") continue;
      const points = Array.isArray(dataOf(s).points) ? (dataOf(s).points as { x?: unknown; y?: unknown; anchor?: { by?: unknown } }[]) : [];
      const was = c.generated?.points[s.id];
      const placed = (p: (typeof points)[number], i: number) => {
        if (p?.anchor?.by === "owner") return true;
        const g = was?.[i];
        // the owner moved the pin away from where the generator put it (a page never generated has no owner pins)
        return !!was && (!g || g.x !== p?.x || g.y !== p?.y);
      };
      const loose = points.filter((p, i) => !placed(p, i)).length;
      if (loose > 0) push("honesty:I5", "hard", { vars: { section: labelOf(s.type), given: points.length - loose, needed: points.length }, sectionId: s.id, fix: { sectionId: s.id } });
    }
  }

  /* ---- honesty:D2 library figures (DB D2) ---- */
  const attested = c.attested;
  for (const s of visible) {
    if (!isFigureSection(s)) continue;
    const unattested = dataOf(s).sample === true || (attested !== null && !attested.has(s.id));
    if (!unattested) continue;
    refused.add(s.id);
    push("honesty:D2", "hard", { vars: { section: labelOf(s.type) }, sectionId: s.id, fix: { sectionId: s.id, actionId: "landing:attest-proof" } });
  }
  if (doc.product.rating && attested !== null && !attested.has("rating")) {
    push("honesty:D2", "hard", { variant: "rating", vars: { value: doc.product.rating.value, count: doc.product.rating.count }, field: "product.rating", fix: { tab: "product", actionId: "landing:attest-rating" } });
  }

  /* ---- honesty:D1 numbers (LAN-§6.4) ---- */
  if (c.allowed && origin) {
    // a section refused as a whole (example proof, library figures) is judged again once its content is the owner's
    const skip = new Set([...(attested ?? []), ...refused]);
    for (const f of auditNumbers(doc, c.allowed, doc.locale, origin, { attestedSections: skip })) {
      const sectionId = sectionOfPath(doc, f.path);
      if (f.why === "conflict") {
        push("honesty:D1", "hard", { variant: "conflict", vars: { a: f.conflictsWith ?? "", b: f.text, value: f.text }, field: f.path, sectionId, fix: sectionId ? { sectionId } : { tab: tabOfPath(f.path) } });
      } else if (f.level === "hard") {
        push("honesty:D1", "hard", { vars: { value: f.text }, field: f.path, sectionId, fix: sectionId ? { sectionId } : { tab: tabOfPath(f.path) } });
      } else {
        push("honesty:D1", "soft", { variant: "fact", vars: { value: f.text }, field: f.path, sectionId, fix: { ...(sectionId ? { sectionId } : { tab: tabOfPath(f.path) }), actionId: "landing:attest-fact" } });
      }
    }
  }

  /* ---- honesty:promise (LAN-§6.3) ---- */
  const promise = promiseFactsOf(doc, c.store);
  if (promise && origin) {
    const lang = doc.locale === "ar" || doc.locale === "en" ? doc.locale : "fr";
    for (const f of visibleTexts(doc)) {
      if (f.sectionId && refused.has(f.sectionId)) continue;
      const seen = new Set<PolicyClaimKind>();
      for (const claim of policyClaims(f.text, lang)) {
        if (seen.has(claim.kind)) continue;
        const verdict = policyAllows(promise, claim);
        if (verdict === "allowed") continue;
        seen.add(claim.kind);
        const sectionId = f.sectionId ?? undefined;
        const at = sectionId ? { sectionId } : { tab: tabOfPath(f.path) };
        const vars = claimVars(claim);
        if (verdict === "contradicted") {
          push("honesty:promise", "hard", { variant: "contradicted", vars, field: f.path, sectionId, fix: { ...at, actionId: claimAction(claim.kind) } });
        } else {
          const hours = claim.kind === "confirmation_call" && (claim.times.length > 0 || claim.qualifier === "today") && !c.store.callWindow?.configured;
          push("honesty:promise", generatedField(f.path) ? "hard" : "soft", {
            variant: hours ? "hours" : undefined,
            vars,
            field: f.path,
            sectionId,
            fix: { ...at, actionId: hours ? "landing:use-hours" : claimAction(claim.kind) },
          });
        }
      }
    }
  }

  /* ---- time and stock (LP-21, LAN-§6.2) ---- */
  const end = doc.offers.urgency.countdownEnd;
  const endMs = end ? Date.parse(end) : NaN;
  const liveEnd = c.live?.countdownEnd ? Date.parse(c.live.countdownEnd) : NaN;
  if (Number.isFinite(liveEnd) && Number.isFinite(endMs) && endMs > liveEnd) {
    if (liveEnd <= now) push("honesty:countdown_reset", "hard", { fix: { tab: "offers", actionId: "landing:remove-countdown" } });
    else push("urgency:extended", "soft", { fix: { tab: "offers" } });
  }
  if (ahead(end, now)) {
    const stock = doc.offers.urgency.stockLeft;
    const shows = visible.filter(
      (s) => (s.type === "announcement" && dataOf(s).countdown !== false) || (s.type === "urgency" && !(s.variant === "stock" && typeof stock === "number" && stock > 0)),
    );
    if (shows.length > 1) {
      const [a, b] = shows as [Section, Section];
      push("honesty:countdown_twice", "hard", { vars: { a: labelOf(a.type), b: labelOf(b.type) }, sectionId: b.id, fix: { sectionId: b.id } });
    }
  }
  if (Number.isFinite(endMs) && endMs - now > FAR_COUNTDOWN_MS) push("urgency:far", "soft", { fix: { tab: "offers" } });
  const stock = doc.offers.urgency.stockLeft;
  if (stock !== undefined && (generatedField("offers.urgency.stockLeft") || (c.generated && c.generated.stockLeft === stock))) {
    push("honesty:stock_untyped", "hard", { vars: { value: stock }, field: "offers.urgency.stockLeft", fix: { tab: "offers" } });
  }
  const live = c.live;
  const since = live?.stockChangedAt ? Date.parse(live.stockChangedAt) : NaN;
  if (live?.stockLeft !== undefined && live.stockLeft > 0 && stock === live.stockLeft && Number.isFinite(since) && now - since > STALE_STOCK_MS) {
    push("urgency:stock-stale", "soft", { vars: { value: live.stockLeft }, fix: { tab: "offers" } });
  }

  /* ---- honesty:password_field (SEC-18) ---- */
  for (const f of sensitiveFields(doc)) push("honesty:password_field", "hard", { vars: { label: f.label }, field: f.path, fix: { tab: f.path.startsWith("offers.") ? "offers" : "product" } });
  if (c.html) {
    const found = new Set<string>();
    for (const m of c.html.matchAll(CC_RE)) found.add(/password/i.test(m[0]) ? "password" : (/autocomplete\s*=\s*["']?([a-z-]+)/i.exec(m[0])?.[1] ?? "cc").toLowerCase());
    for (const label of found) push("honesty:password_field", "hard", { vars: { label }, field: "html", fix: { tab: "form" } });
  }

  /* ---- the order form (LAN-§3.5) ---- */
  const form = doc.sections.find((s) => s.type === "orderForm");
  if (form && !form.hidden) {
    if (c.formHeightPx !== null) {
      const band = orderFormBand(c.formHeightPx);
      if (band) push("form:F1", band, { vars: { px: Math.round(c.formHeightPx), estimated: 1 }, sectionId: form.id, fix: { tab: "form" } });
    }
    if (c.tokens) {
      const ratio = formBoundaryRatio(c.tokens, form.bg);
      if (ratio !== null && ratio < FORM_BOUNDARY_MIN) push("form:F3", "hard", { vars: { ratio: Math.round(ratio * 100) / 100, needed: FORM_BOUNDARY_MIN }, sectionId: form.id, fix: { sectionId: form.id } });
    }
  }
  doc.items.forEach((it, i) =>
    it.groups.forEach((g, j) => {
      if (isChoiceGroup(g) && g.options.length === 1) push("form:F2", "soft", { vars: { label: g.name }, field: `items.${i}.groups.${j}`, fix: { tab: "product" } });
    }),
  );

  /* ---- the store's side (delivery, policies, thank-you, WhatsApp) ---- */
  const st = c.store;
  if (st.hasMarketList && (!st.zonesEnabled || st.zoneCount === 0)) push("delivery:zones-empty", "soft", { fix: { actionId: "landing:open-delivery" } });
  const pageFee = Math.round(doc.offers.shippingFee * 100);
  if (pageFee > 0 && st.zonesEnabled) {
    for (const [city, zoneFee] of Object.entries(st.feesByTopCity)) {
      if (zoneFee === null || zoneFee === pageFee) continue;
      // the amounts as the page writes them ("29 DH"), so the sentence reads the same in the dialog and the panel
      const money = (cents: number) => formatMoney(cents / 100, doc.currency, doc.locale);
      push("delivery:fee_mismatch", "soft", { vars: { city: st.cityNames[city] ?? city, page: money(pageFee), zone: money(zoneFee) }, field: "offers.shippingFee", fix: { tab: "offers" } });
      break;
    }
  }
  if (st.zones && st.leadDays === null && st.confirmationCall === true && st.zonesEnabled && st.zones.some((z) => !z.notServed && z.etaMinDays !== null)) {
    push("delivery:lead-unset", "soft", { fix: { actionId: "landing:open-delivery-lead" } });
  }
  if (!st.policiesReviewed) push("policies:unreviewed", "soft", { fix: { actionId: "landing:open-policies" } });
  if (st.expectation === true) {
    if (!st.callerPhone) push("thanks:no-caller", "soft", { fix: { actionId: "landing:open-general" } });
    if (st.confirmationCall !== false && st.callWindow && (!st.callWindow.configured || st.callWindow.empty)) {
      push("thanks:no-window", "soft", { variant: st.callWindow.configured ? undefined : "unsaved", fix: { actionId: "landing:open-calling-window" } });
    }
  }
  if (st.waOrder && !doc.form.whatsapp?.number && !st.whatsapp) push("wa:no-number", "hard", { fix: { actionId: "landing:open-general" } });

  return out;
}

/** The builder tab of a document path outside the sections. */
function tabOfPath(path: string): string {
  if (path.startsWith("offers.")) return "offers";
  if (path.startsWith("form.") || path.startsWith("thankYou.")) return "form";
  if (path.startsWith("seo.")) return "seo";
  return "product";
}

const claimAction = (kind: PolicyClaimKind) => (kind === "confirmation_call" ? "landing:open-checkout" : "landing:open-policies");

/** The claim as written, its Policies card and the number to prefill (`/settings/policies?card=returns&value=7`). */
function claimVars(claim: PolicyClaim): Record<string, string | number> {
  const vars: Record<string, string | number> = { claim: claim.text.trim().slice(0, 60), kind: claim.kind };
  const card = CLAIM_CARD[claim.kind];
  if (card) vars.card = card;
  if (claim.max !== null) vars.value = claim.max;
  return vars;
}

/** Where a LAN-§3.2 row's fix leads outside the builder (`ctx.appHref` of the checklist), by fix action. */
export function settingsPathOf(item: Pick<GateItem, "fix" | "vars">): `/${string}` | null {
  switch (item.fix?.actionId) {
    case "landing:open-delivery":
      return "/settings/delivery";
    case "landing:open-delivery-lead":
      return "/settings/delivery#lead";
    case "landing:open-policies": {
      const card = item.vars?.card;
      if (card === undefined) return "/settings/policies";
      const q = new URLSearchParams({ card: String(card) });
      if (item.vars?.value !== undefined) q.set("value", String(item.vars.value));
      return `/settings/policies?${q.toString()}`;
    }
    case "landing:open-checkout":
    case "landing:use-hours":
    case "landing:open-calling-window":
      return "/settings/checkout#calling-window";
    case "landing:open-general":
      return "/settings/general";
    default:
      return null;
  }
}
