import "server-only";
/**
 * Manual orders and lead conversion (P4 CALL CENTER; operations.md OPE-§11.1, §11.4, OD15, OD16, OD62; docs/STORE-SAAS.md
 * §K.2 P0, D72). `createManualOrder` validates against the page's published version with the public form's rules and
 * inserts through `createOrderRow(draft, ctx)` of src/lib/orders/create.ts (the only insert of an order row, never
 * edited here). `convertLeadToOrder` dispatches on `leads.sel.v` (v2 → createManualOrder; v3 → S1's
 * createManualOrderV3 in R2) and then calls P3's `markLeadConverted`.
 *
 * Both take a `WriteCtx` (D71 rev 4: an action whose permissions are all write permissions hands its body one), so
 * the insert needs no cast; OPE-§11.1 writes `StoreCtx`, which predates D71.
 *
 *   quoteManualOrder(ctx, input)         the summary of the new-order sheet: lines, totals, warnings; writes nothing
 *   createManualOrder(ctx, input)        §11.1 steps 1-7 (frozen at P0)
 *   createManualOrderWith(ctx, input, o) the same with the sheet's "Deliver from…" hold (OD49; the frozen input has no
 *                                        slot for it, so the action passes it here)
 *   convertLeadToOrder(ctx, leadId, in)  §11.4 (frozen at P0)
 *
 * Prices come only from the page's published version through `validateOrder` and the cents engine (OD15, owner rule 4):
 * nothing typed by a person is a price, except a manager's adjustment (≤ 0, with a reason, audited). Manual orders
 * carry risk 0, the flag "manual", no ad event (OD16: P5's `conversions.manualOrders` decides on its side) and never
 * `is_test` (D54: only the public path sets it).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { blocklist, leads, orders, pages } from "@/lib/db/schema";
import { offerAvailable } from "@/lib/page/catalog";
import { fromCents, orderTotals, type OrderTotals } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreCtx, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import { normalizeCity, type CityKey } from "./address";
import { UnitIn, type OrderPayloadV2 } from "./contract";
import { createOrderRow, OrderIdemTaken } from "./create";
import { findDuplicates } from "./duplicates";
import { markLeadConverted } from "./leads";
import { logError } from "./log";
import { versionDoc } from "./resolve";
import { actorFrom, transitionOrder } from "./transition";
import { cleanInput, resolveSelection, validateOrder, type ValidationFields } from "./validate";

export interface ManualOrderInput {
  /** a live page of the store (published version) */
  pageId: string;
  /** the payload v2 selection shape */
  selection: { offerId: string; units: UnitIn[]; extras: Record<string, string>; bump: boolean };
  customer: { name: string; phone: string; city: string; address?: string; landmark?: string; note?: string; email?: string };
  /** default "manual"; "whatsapp" when converted from a WhatsApp intent (LP-11) */
  source?: "manual" | "whatsapp";
  /** "The customer already confirmed" (default true for phone orders) */
  confirmed: boolean;
  /** manager+ only, ≤ 0, with adjustReason */
  adjustCents?: number;
  adjustReason?: string;
  /** set by convertLeadToOrder */
  fromLead?: { leadId: string };
  /** second submit after the duplicate warning */
  allowDuplicate?: boolean;
  /** the sheet's draft id (UUID), written to orders.idem: a double submit returns the first order (OD36) */
  idem: string;
}

/* ------------------------------------------------------------------ */
/* input (the actions parse with these; the functions re-check)        */
/* ------------------------------------------------------------------ */

const Txt = (max: number) => z.string().max(max);
export const ManualSelection = z.strictObject({
  offerId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, { error: "Choose an offer." }),
  units: z.array(UnitIn).max(20).default([]),
  extras: z
    .record(z.string().regex(/^[A-Za-z0-9_-]{2,40}$/), z.string().max(240))
    .default({})
    .refine((x) => Object.keys(x).length <= 4),
  bump: z.boolean().default(false),
});
export const ManualCustomer = z.strictObject({
  name: Txt(120),
  phone: Txt(40),
  city: Txt(120),
  address: Txt(300).optional(),
  landmark: Txt(160).optional(),
  note: Txt(300).optional(),
  email: Txt(160).optional(),
});
export const ManualOrderSchema = z.strictObject({
  pageId: z.string().regex(/^[0-9A-Z]{26}$/, { error: "Choose a page." }),
  selection: ManualSelection,
  customer: ManualCustomer,
  source: z.enum(["manual", "whatsapp"]).optional(),
  confirmed: z.boolean(),
  adjustCents: z.number().int().max(0).optional(),
  adjustReason: Txt(200).optional(),
  fromLead: z.strictObject({ leadId: z.string().regex(/^[0-9A-Z]{26}$/) }).optional(),
  allowDuplicate: z.boolean().optional(),
  idem: z.uuid().transform((v) => v.toLowerCase()),
});
/** convertLeadToOrder's input (the page and source come from the lead) */
export const ConvertLeadSchema = ManualOrderSchema.omit({ pageId: true, source: true, fromLead: true }).extend({
  selection: ManualSelection.extend({ offerId: z.string().max(40) }),
});

/* ------------------------------------------------------------------ */
/* results                                                             */
/* ------------------------------------------------------------------ */

/** One summary line of the sheet (OPE-§11.2 block 3), integer cents. */
export interface QuoteLine {
  kind: "offer" | "option" | "bump";
  label: string;
  qty: number;
  cents: number;
}

export type ManualWarning = "duplicate" | "blocked" | "city_unknown";

export interface ManualQuote {
  lines: QuoteLine[];
  subtotalCents: number;
  shippingCents: number;
  adjustCents: number;
  totalCents: number;
  currency: string;
  warnings: ManualWarning[];
  duplicates: { id: string; createdAt: string }[];
  /** P4 (additive): the version priced, so the sheet notices a republish ("Prices changed, check the summary") */
  versionId: string;
  /** P4 (additive): field errors exactly as the public form gets them (null = none); a fresh sheet shows only touched ones */
  fields: ValidationFields | null;
}

/**
 * A refusal with what the sheet needs to show it: the field errors (`invalid`), the matching orders (`duplicate`), the
 * order of a converted lead (`already_converted`), the visible sentence of a blocked number (`blocked`, staff only).
 * Structurally an `ActionResult` failure, so the frozen signatures hold.
 */
export type ManualRefusal = Extract<ActionResult<never>, { ok: false }> & {
  fields?: ValidationFields;
  duplicates?: { id: string; createdAt: string }[];
  orderId?: string;
  text?: string;
};

const refuse = (error: string, extra: Omit<ManualRefusal, "ok" | "error"> = {}): ManualRefusal => ({ ok: false, error, ...extra });

/** The visible text of a blocked number (OPE-§11.1 step 3); the public path keeps its generic answer. */
export const BLOCKED_TEXT = "This number is blocked in your store";
/** `s:<sid>:manual:<uid>` (OPE-§11.1 step 7) */
export const MANUAL_RATE = { limit: 60, windowSec: 3600 } as const;
/** a hold is at most this far ahead (OD49, the writer's own bound) */
const MAX_HOLD_MS = 60 * 86_400_000;
const IDEM_RE = /^[a-f0-9-]{36}$/;
const REASON_MIN = 3;

/* ------------------------------------------------------------------ */
/* the page and the pricing                                            */
/* ------------------------------------------------------------------ */

interface LivePage {
  id: string;
  publicKey: string;
  versionId: string;
  doc: PageDoc;
}

/** A published page of the store and its published version (never a draft); another store's id answers null. */
export async function livePage(scope: StoreScope, pageId: string): Promise<LivePage | null> {
  if (typeof pageId !== "string" || !/^[0-9A-Z]{26}$/.test(pageId)) return null;
  const [p] = await db
    .select({ id: pages.id, status: pages.status, publicKey: pages.publicKey, versionId: pages.publishedVersionId })
    .from(pages)
    .where(byId(pages, scope, pageId))
    .limit(1);
  if (!p || p.status !== "published" || !p.versionId) return null;
  const doc = await versionDoc(scope, p.versionId);
  return doc ? { id: p.id, publicKey: p.publicKey, versionId: p.versionId, doc } : null;
}

/** Selection-only field errors (offer, units, extras, bump): the keys the summary depends on. */
const SELECTION_KEY = /^(bundleId$|[usxb]\.)/;

/**
 * The selection priced by the cents engine of the public form (`resolveSelection` + `orderTotals`, OD15), with its
 * own field errors. No customer field is read, so the summary is live before the phone is typed.
 */
export function priceSelection(doc: PageDoc, sel: ManualOrderInput["selection"]): { totals: OrderTotals; fields: null } | { totals: null; fields: ValidationFields } {
  const offer = doc.offers.bundles.find((b) => b.id === sel.offerId);
  if (!offer) return { totals: null, fields: { bundleId: "invalid" } as ValidationFields };
  if (!offerAvailable(offer, doc.items)) return { totals: null, fields: { bundleId: "unavailable" } as ValidationFields };
  const resolved = resolveSelection(doc, offer, { offerId: sel.offerId, units: sel.units, extras: sel.extras, bump: sel.bump });
  if (resolved.errors.length) {
    const fields: Record<string, string> = {};
    for (const e of resolved.errors) fields[e.key] ??= e.code;
    return { totals: null, fields: fields as ValidationFields };
  }
  const totals = orderTotals(doc, resolved.selection);
  return totals ? { totals, fields: null } : { totals: null, fields: { bundleId: "invalid" } as ValidationFields };
}

/** The summary lines of priced totals: the offer, each surcharge reason, the bump. */
export function quoteLines(doc: PageDoc, totals: OrderTotals, offerId: string): QuoteLine[] {
  const offer = doc.offers.bundles.find((b) => b.id === offerId);
  const lines: QuoteLine[] = [{ kind: "offer", label: offer?.title || doc.product.name, qty: totals.offer.units, cents: totals.offer.price }];
  for (const r of totals.reasons) lines.push({ kind: "option", label: r.label, qty: r.count, cents: r.cents });
  if (totals.bump > 0 && doc.offers.orderBump) lines.push({ kind: "bump", label: doc.offers.orderBump.title, qty: 1, cents: totals.bump });
  return lines;
}

/** The in-memory payload v2 of a manual order (OPE-§11.1 step 2): what the public form would have sent. */
function payloadOf(page: LivePage, input: ManualOrderInput, locale: string, shownCents: number): OrderPayloadV2 {
  const c = input.customer;
  return {
    v: 2,
    pageKey: page.publicKey,
    idem: input.idem,
    eventId: `manual_${input.idem.replace(/-/g, "")}`.slice(0, 64),
    bundleId: input.selection.offerId,
    bump: !!input.selection.bump,
    name: c.name ?? "",
    phone: c.phone ?? "",
    city: c.city ?? "",
    address: c.address ?? "",
    note: c.note ?? "",
    email: c.email ?? "",
    t: 60_000,
    utm: {},
    locale,
    ver: page.versionId,
    st: shownCents,
    units: input.selection.units ?? [],
    extras: input.selection.extras ?? {},
  };
}

/* ------------------------------------------------------------------ */
/* the shared checks of the quote and the create                       */
/* ------------------------------------------------------------------ */

interface Checked {
  page: LivePage;
  totals: OrderTotals | null;
  /** the full validation (customer fields too) */
  valid: ReturnType<typeof validateOrder>;
  blocked: boolean;
  duplicates: { id: string; createdAt: string }[];
  cityUnknown: boolean;
  adjust: number;
}

type CheckRefusal = ManualRefusal;

/** The adjustment (OPE-§11.1 step 4): manager+ (`orders.force_status`), −subtotal ≤ adjust ≤ 0, a reason of ≥ 3 characters. */
function checkAdjust(ctx: StoreCtx, cents: number | undefined, reason: string | undefined, subtotal: number | null): CheckRefusal | number {
  if (cents === undefined || cents === 0) return 0;
  if (!ctx.can("orders.force_status")) return refuse("forbidden");
  if (!Number.isInteger(cents) || cents > 0 || (subtotal !== null && cents < -subtotal)) return refuse("bad_adjust");
  if (cleanInput(reason, 200).length < REASON_MIN) return refuse("reason_required");
  return cents;
}

async function check(ctx: StoreCtx, input: ManualOrderInput): Promise<Checked | CheckRefusal> {
  const { scope } = ctx;
  const page = await livePage(scope, input.pageId);
  if (!page) return refuse("not_found");
  const priced = priceSelection(page.doc, input.selection);
  const locale = ctx.store.defaultLocale || page.doc.locale;
  const valid = validateOrder(payloadOf(page, input, locale, priced.totals?.total ?? 0), page.doc);
  const adjust = checkAdjust(ctx, input.adjustCents, input.adjustReason, priced.totals?.subtotal ?? null);
  if (typeof adjust !== "number") return adjust;

  let blocked = false;
  let duplicates: Checked["duplicates"] = [];
  let cityUnknown = false;
  if (valid.ok) {
    const e164 = valid.value.phone.e164;
    const [ops, [hit]] = await Promise.all([
      getStoreSetting(scope, "ops"),
      db
        .select({ id: blocklist.id })
        .from(blocklist)
        .where(whereStore(blocklist, scope, eq(blocklist.kind, "phone"), eq(blocklist.value, e164)))
        .limit(1),
    ]);
    blocked = !!hit;
    // the §9.3 predicate over the store's real orders (a manual order is never a test order)
    const found = await findDuplicates(db, scope, { id: "", phone: e164, isTest: false }, ops.duplicateWindowDays);
    duplicates = found.map((d) => ({ id: d.id, createdAt: d.createdAt.toISOString() }));
    if (valid.value.city) {
      const m = normalizeCity(valid.value.city, ctx.store.market, ops.cityAliases as Record<string, CityKey>);
      cityUnknown = m.confidence !== "exact" && m.confidence !== "alias";
    }
  }
  return { page, totals: priced.totals, valid, blocked, duplicates, cityUnknown, adjust };
}

const isRefusal = (v: Checked | CheckRefusal): v is CheckRefusal => "ok" in v && v.ok === false;

/* ------------------------------------------------------------------ */
/* quote                                                               */
/* ------------------------------------------------------------------ */

/** orders.create, no write: the sheet's summary (debounced 250 ms by the UI), always the server's numbers. */
export async function quoteManualOrder(ctx: StoreCtx, input: ManualOrderInput): Promise<ActionResult<ManualQuote>> {
  if (!ctx.can("orders.create")) return refuse("forbidden");
  const c = await check(ctx, input);
  if (isRefusal(c)) return c;
  const t = c.totals;
  const warnings: ManualWarning[] = [];
  if (c.duplicates.length) warnings.push("duplicate");
  if (c.blocked) warnings.push("blocked");
  if (c.cityUnknown) warnings.push("city_unknown");
  const fields = c.valid.ok ? null : c.valid.fields;
  return {
    ok: true,
    data: {
      lines: t ? quoteLines(c.page.doc, t, input.selection.offerId) : [],
      subtotalCents: t?.subtotal ?? 0,
      shippingCents: t?.shipping ?? 0,
      adjustCents: c.adjust,
      totalCents: t ? t.total + c.adjust : 0,
      currency: ctx.store.currency,
      warnings,
      duplicates: c.duplicates,
      versionId: c.page.versionId,
      fields: fields && Object.keys(fields).length ? fields : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* create                                                              */
/* ------------------------------------------------------------------ */

/** orders.create; `replayed` when `idem` already names an order of this store. */
export async function createManualOrder(ctx: WriteCtx, input: ManualOrderInput): Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>> {
  return createManualOrderWith(ctx, input, {});
}

/** The order of this store with the idempotency key, if any (`orders_idem_uq` is global; the lookup stays scoped). */
async function byIdem(scope: WriteScope, idem: string): Promise<{ id: string; rev: number } | undefined> {
  const [row] = await db.select({ id: orders.id, rev: orders.rev }).from(orders).where(whereStore(orders, scope, eq(orders.idem, idem))).limit(1);
  return row;
}

/** `createManualOrder` with the sheet's "Deliver from…" (OD49: > now, ≤ now + 60 days; only with `confirmed`). */
export async function createManualOrderWith(
  ctx: WriteCtx,
  input: ManualOrderInput,
  opts: { shipAfter?: Date | null },
): Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>> {
  const { scope } = ctx;
  if (!ctx.can("orders.create")) return refuse("forbidden");
  if (typeof input.idem !== "string" || !IDEM_RE.test(input.idem)) return refuse("invalid");

  // a double submit answers the first order, before any check or charge (OD36)
  const prior = await byIdem(scope, input.idem);
  if (prior) return { ok: true, data: { orderId: prior.id, rev: prior.rev, replayed: true } };

  const shipAfter = opts.shipAfter ?? null;
  if (shipAfter) {
    const t = shipAfter.getTime();
    if (!input.confirmed || !(t > Date.now()) || t > Date.now() + MAX_HOLD_MS) return refuse("bad_hold");
  }

  const c = await check(ctx, input);
  if (isRefusal(c)) return c;
  if (!c.valid.ok) return refuse("invalid", { fields: c.valid.fields });
  if (c.blocked) return refuse("blocked", { text: BLOCKED_TEXT });
  if (c.duplicates.length && !input.allowDuplicate) return refuse("duplicate", { duplicates: c.duplicates });

  const gate = await rateLimit(storeBucket(scope, "manual", ctx.user.id), MANUAL_RATE.limit, MANUAL_RATE.windowSec);
  if (!gate.ok) return refuse("rate_limited");

  const o = c.valid.value;
  const doc = c.page.doc;
  const landmark = cleanInput(input.customer.landmark, 160) || null;
  // an agent's own order stays in their queue (OD12), so they can confirm it and it never goes round robin
  const own = !ctx.can("orders.read_all");
  let created;
  try {
    created = await createOrderRow(
      {
        pageId: c.page.id,
        versionId: c.page.versionId,
        exportId: null,
        source: input.source === "whatsapp" ? "whatsapp" : "manual",
        status: "new",
        name: o.name,
        phone: o.phone.e164,
        phoneRaw: o.phoneRaw,
        city: o.city,
        address: o.address,
        // the customer's note is kept even when the page's form hides its note field
        note: o.note ?? (cleanInput(input.customer.note, 300) || null),
        email: o.email,
        landmark,
        productName: doc.product.name.slice(0, 160),
        items: o.items,
        qty: o.items.qty,
        subtotal: fromCents(o.totals.subtotal),
        shipping: fromCents(o.totals.shipping),
        total: fromCents(o.totals.total + c.adjust),
        adjustCents: c.adjust,
        currency: ctx.store.currency,
        locale: ctx.store.defaultLocale,
        utm: null,
        // the lead an agent converted (OPE-§11.4): read back by the `created` event (meta `leadId`) and P3's hook
        ref: input.fromLead ? `lead:${input.fromLead.leadId}` : null,
        ipHash: null,
        ua: null,
        eventId: null,
        idem: input.idem,
        riskScore: 0,
        flags: ["manual"],
        sheetStatus: "pending",
        createdBy: ctx.user.id,
        ...(own ? { assigneeId: ctx.user.id } : {}),
      },
      { scope, test: false, upsell: false, actor: ctx.actor, conversion: null },
    );
  } catch (err) {
    if (err instanceof OrderIdemTaken) return refuse("invalid");
    throw err;
  }
  if (created.replayed) {
    const again = await byIdem(scope, input.idem);
    return { ok: true, data: { orderId: created.orderId, rev: again?.rev ?? 0, replayed: true } };
  }
  if (c.adjust) {
    await auditIn(scope, ctx.actor, "orders.adjusted", { target: created.orderId, meta: { cents: c.adjust, reason: cleanInput(input.adjustReason, 200) } }).catch((err) =>
      logError("orders:manual:audit", err),
    );
  }

  let rev: number | null = null;
  if (input.confirmed) {
    const t = await transitionOrder(actorFrom(ctx), scope, { orderId: created.orderId, want: { confirm: "confirmed" }, source: "ui", ...(shipAfter ? { shipAfter } : {}) });
    if (t.ok) rev = t.rev;
    else logError("orders:manual:confirm", new Error(`confirm refused: ${t.error}`));
  }
  if (rev === null) {
    const [row] = await db.select({ rev: orders.rev }).from(orders).where(byId(orders, scope, created.orderId)).limit(1);
    rev = row?.rev ?? 0;
  }
  return { ok: true, data: { orderId: created.orderId, rev } };
}

/* ------------------------------------------------------------------ */
/* lead conversion (OPE-§11.4)                                          */
/* ------------------------------------------------------------------ */

/**
 * P3's `markLeadConverted` (a frozen P0 stub until P3 merges): called first; while it is the stub this adapter writes
 * the same columns in the scope's store (`converted_order_id`, `converted_via = 'agent'`, status `converted`), once.
 * Removed when P3's body lands (the stub then never throws).
 */
async function markConverted(scope: WriteScope, leadId: string, orderId: string): Promise<void> {
  try {
    await markLeadConverted(scope, leadId, orderId, "agent");
    return;
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("not implemented"))) throw err;
  }
  await db
    .update(leads)
    .set({ convertedOrderId: orderId, convertedVia: "agent", status: "converted" })
    .where(and(byId(leads, scope, leadId), isNull(leads.convertedOrderId)));
}

/** Pre-fills from the lead, creates with `fromLead`, then `markLeadConverted`; a converted lead answers `already_converted`. */
export async function convertLeadToOrder(ctx: WriteCtx, leadId: string, input: Omit<ManualOrderInput, "fromLead" | "pageId" | "source">): Promise<ActionResult<{ orderId: string }>> {
  const { scope } = ctx;
  if (!ctx.can("orders.create") || !ctx.can("leads.write")) return refuse("forbidden");
  if (typeof leadId !== "string" || !/^[0-9A-Z]{26}$/.test(leadId)) return refuse("not_found");
  const [lead] = await db.select().from(leads).where(byId(leads, scope, leadId)).limit(1);
  if (!lead) return refuse("not_found");
  if (lead.convertedOrderId) return refuse("already_converted", { orderId: lead.convertedOrderId });
  const sel = lead.sel;
  if (sel?.v === 3) return refuse("invalid", { text: "This lead is a catalog order. Catalog orders by phone arrive in a later release." });

  // pre-fill: what the agent typed wins, the lead fills the blanks (its selection is re-priced anyway)
  const typed = input.selection;
  const fromSel = sel?.v === 2 ? sel : null;
  const offerId = typed.offerId || fromSel?.bundleId || lead.bundleId || "";
  const selection: ManualOrderInput["selection"] = typed.offerId
    ? typed
    : { offerId, units: fromSel?.units ?? [], extras: fromSel?.extras ?? {}, bump: fromSel?.bump ?? false };
  const customer = {
    ...input.customer,
    name: input.customer.name || lead.name || "",
    phone: input.customer.phone || lead.phone || "",
    city: input.customer.city || lead.city || "",
  };
  const r = await createManualOrder(ctx, {
    ...input,
    selection,
    customer,
    pageId: lead.pageId ?? "", // 0006: a store (v3) lead has no landing page (page_id NULL); R1 leads always carry one
    source: lead.kind === "whatsapp" ? "whatsapp" : "manual",
    fromLead: { leadId },
  });
  if (!r.ok) return r;
  await markConverted(scope, leadId, r.data.orderId);
  return { ok: true, data: { orderId: r.data.orderId } };
}

/* ------------------------------------------------------------------ */
/* the sheet's reads (OPE-§11.2, P4 step 10)                            */
/* ------------------------------------------------------------------ */

/** One live page as a compact row of the sheet's Product block. */
export interface ManualPageRow {
  id: string;
  name: string;
  slug: string;
}

/** The published landing pages of the store, newest first (≤ 60): the only pages a manual order can be priced on. */
export async function manualPages(scope: StoreScope): Promise<ManualPageRow[]> {
  const rows = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published"), eq(pages.kind, "landing")))
    .orderBy(desc(pages.updatedAt))
    .limit(60);
  return rows.filter((r) => !!r.versionId).map(({ id, name, slug }) => ({ id, name, slug }));
}

/**
 * The published document's selling part for the sheet's pickers: the items (option groups with their sold-out and
 * not-made states), the offers, the bump. The client prices nothing on its own: `quoteManualOrder` answers the
 * payable lines (OD15); the doc only drives which choices exist, with the page's own labels.
 */
export interface ManualPageModel {
  pageId: string;
  versionId: string;
  currency: string;
  doc: Pick<PageDoc, "items" | "offers" | "product" | "locale">;
}

export async function manualPageModel(scope: StoreScope, pageId: string): Promise<ManualPageModel | null> {
  const live = await livePage(scope, pageId);
  if (!live) return null;
  const { items, offers, product, locale, currency } = live.doc;
  // the upsell is a post-purchase offer of the public page: never part of a phone order
  const sellable: PageDoc["offers"] = { ...offers };
  delete sellable.upsell;
  return { pageId: live.id, versionId: live.versionId, currency, doc: { items, offers: sellable, product, locale } };
}
