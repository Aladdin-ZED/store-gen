import "server-only";
/**
 * The queue card (P4 CALL CENTER; operations.md OPE-§5.3, §7, §9.3, §10.2, §22, OD11, OD39, OD44, OD47, OD48, OD49,
 * OD53, OD61; §13.2 budgets). What Next, Take and a conflict answer hand the agent: one order, everything the call
 * needs, nothing it does not.
 *
 *   buildQueueOrder(scope, row, viewer, o)   the card of a row already read (the claim's read-back, the resume, a take)
 *   conflictCard(ctx, orderId)               a stale card's fresh copy (409 of /ops/outcome), with who changed it
 *
 * Reads after the claim (≤ 4 statements, run together): the customer's counters (`customers` by id), the duplicates
 * predicate (OPE-§9.3), the store's active `message_templates` of the card's language (WhatsApp and the call script
 * in one read), and the store calibration (`riskBandOutcomes`, cached 1 h). The best-hours table (`attemptStats`) is
 * read from its cache only: a cold cache starts its load and this card goes without the hint (the next one has it).
 * The template values are P5's (`orderTemplateValues`), the ETA P3's (`zoneLineFor`: its P0 stub answers null, so no
 * timing sentence and no ETA show). A delivery-lane card adds its rescue count.
 *
 * Never on a card: a full phone (`maskPhone` only, OD11), an IP hash, a user agent, an e-mail, another store's data.
 * Customer fields pass through P1's `maskIfImpersonation` (OD61). Money in integer cents (OD35). The serialised card
 * fits 5.5 KB gzipped (`fitCard`), so an answer with its envelope stays under the hot path's 6 KB (OD36); the script
 * caps (12 steps, 6 objections) make that bound loose in practice, `fitCard` only guarantees it.
 */
import { gzipSync } from "node:zlib";
import { asc, desc, eq, getTableColumns, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers, messageTemplates, orderEvents, orders, users } from "@/lib/db/schema";
import { zoneLineFor } from "@/lib/delivery/zones.server";
import { toCents } from "@/lib/finance/lite/cents";
import { isAdminLocale, t, type AdminLocale } from "@/lib/i18n/admin";
import type { CityKey } from "@/lib/orders/address";
import type { OrderStatus } from "@/lib/orders/contract";
import { duplicatesFor, type DuplicateMatch } from "@/lib/orders/duplicates";
import { countRescueCalls, viewerOf } from "@/lib/orders/events";
import { maskPhone } from "@/lib/orders/masking";
import { customerHistoryOf, explainRisk, type MessageRef, type RiskReason } from "@/lib/orders/risk-explain";
import { projectStatus, type MoneyState, type OrderStates } from "@/lib/orders/state";
import { orderText } from "@/lib/orders/text";
import { maskIfImpersonation } from "@/lib/platform/mask";
import { getStoreSetting } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { attemptStatsIfReady, bestHourOf, riskBandOutcomes, type AttemptCell, type RiskBandOutcome } from "./aggregates";
import { opsNow } from "./presence";
import { laneOf } from "./priority";
import type { CompiledScript, ScriptLocale } from "./script";
import { compileScript, scriptLocaleOf, type ScriptRow } from "./script.server";
import { viewerSeesOrder } from "./visibility";
import { builtinWaId, WA_KINDS_BY_LANE } from "./wa";
import { isoWeekday } from "./window";

/* ------------------------------------------------------------------ */
/* the card (OPE-§5.3)                                                 */
/* ------------------------------------------------------------------ */

export type CustomerHistoryCounts = { orders: number; delivered: number; refused: number; returned: number; cancelled: number; fake: number };

/** The order card of the queue (OPE-§5.3): no full phone, no IP hash, no UA, no e-mail, nothing of another store. */
export interface QueueOrder {
  id: string;
  rev: number;
  createdAt: string;
  ageMinutes: number;
  isTest: boolean;
  states: OrderStates;
  status: OrderStatus;
  attempts: number;
  dueAt: string | null;
  product: string;
  offerLabel: string;
  /** the warehouse text (src/lib/orders/text.ts), unchanged contract */
  unitsText: string;
  totalCents: number;
  shippingCents: number;
  currency: string;
  locale: string | null;
  /** the one place a customer's address, landmark and note travel: the agent confirms them on the call (OPE-§5.3) */
  customer: {
    firstName: string;
    phoneMasked: string;
    city: string | null;
    cityKey: string | null;
    address: string | null;
    landmark: string | null;
    note: string | null;
    history: CustomerHistoryCounts | null;
  };
  /** OPE-§10.2; calibration = the store's own outcome share for this band (OD39), null below n = 30 */
  risk: { score: number; level: "low" | "check" | "high"; reasons: RiskReason[]; positive: MessageRef | null; calibration: { badShareBp: number; n: number } | null };
  /** OPE-§9.3 */
  duplicates: { id: string; createdAt: string; status: OrderStatus }[];
  /** OPE-§7 (steps + objection chips) */
  script: CompiledScript;
  /** WhatsApp, OPE-§22: the store's rows of the card's language, else the built-ins */
  templates: { id: string; kind: string; name: string }[];
  /** zoneLineFor(scope, order.city_key) (P3): null text = no promise, the card shows nothing (OD47) */
  eta: { text: string | null; cityKey: CityKey | null };
  leaseUntil: string | null;
  mine: boolean;
  /** OD44: "Your customers pick up most between 18:00 and 19:00 (n = 212)" with ≥ 30 attempts in that cell; else null */
  ui: { bestHoursHint: MessageRef | null };
  /** OD48: which outcome grid the card shows */
  lane: "confirm" | "delivery";
  /** delivery lane only (lastCarrierStatus = the carrier's own label from shipment_events, R2; null in R1) */
  delivery: { attempts: number; lastCarrierStatus: string | null; carrierLabel: string | null; trackingRef: string | null; shipAfter: string | null; rescueCallsLeft: number } | null;
  /** OD49: a hold on a confirmed order */
  shipAfter: string | null;
  /** OD53: the card was opened from an inbound lookup, not a claim */
  inbound?: true;
}

/** The columns a card is built from: the whole row (P5's template values may read any column; none leaves raw). */
export const CARD = getTableColumns(orders);
export type CardRow = typeof orders.$inferSelect;

export async function cardRow(scope: StoreScope, orderId: string): Promise<CardRow | null> {
  const [row] = await db.select(CARD).from(orders).where(byId(orders, scope, orderId)).limit(1);
  return row ?? null;
}

/** what the card adds to the row */
export interface CardOpts {
  leaseUntil: Date | null;
  mine: boolean;
  /** `ops.rescue.maxCalls` */
  maxCalls: number;
  inbound?: boolean;
  /** the panel's language tab (OPE-§7.2); default: the order's language when the store has it, else the store's */
  locale?: ScriptLocale;
}

/* ------------------------------------------------------------------ */
/* size (OD36: ≤ 6 KB gz with the answer's envelope)                   */
/* ------------------------------------------------------------------ */

export const CARD_GZ_MAX = 5_632;
export const cardGzBytes = (card: unknown): number => gzipSync(JSON.stringify(card)).byteLength;

/**
 * The card under `CARD_GZ_MAX`: the objection chips go first, then the script's last steps (never its first). The
 * schema's caps keep every real script far below the bound; this only guarantees it.
 */
export function fitCard(card: QueueOrder): QueueOrder {
  if (cardGzBytes(card) <= CARD_GZ_MAX) return card;
  const script: CompiledScript = { ...card.script, steps: [...card.script.steps], objections: [...card.script.objections] };
  const out: QueueOrder = { ...card, script };
  while (cardGzBytes(out) > CARD_GZ_MAX && (script.objections.length > 0 || script.steps.length > 1)) {
    if (script.objections.length) script.objections.pop();
    else script.steps.pop();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the reads                                                           */
/* ------------------------------------------------------------------ */

/** the active templates a card reads (WhatsApp + call script), at most */
const TEMPLATE_ROWS = 40;
/** a store's own custom WhatsApp templates on a card, at most */
const CUSTOM_WA_MAX = 5;

export type TemplateRow = ScriptRow & { channel: "whatsapp" | "telegram" | "sms" | "email" | "call_script"; kind: string; name: string };

function templateRows(scope: StoreScope, pageId: string, locale: ScriptLocale): Promise<TemplateRow[]> {
  return db
    .select({
      id: messageTemplates.id,
      channel: messageTemplates.channel,
      kind: messageTemplates.kind,
      pageId: messageTemplates.pageId,
      name: messageTemplates.name,
      body: messageTemplates.body,
      source: messageTemplates.source,
    })
    .from(messageTemplates)
    .where(
      whereStore(
        messageTemplates,
        scope,
        inArray(messageTemplates.channel, ["whatsapp", "call_script"]),
        eq(messageTemplates.status, "active"),
        eq(messageTemplates.locale, locale),
        or(isNull(messageTemplates.pageId), eq(messageTemplates.pageId, pageId)),
      ),
    )
    // the bound never cuts what the card needs first: the script rows, then the agent kinds, then the store's customs
    .orderBy(
      sql`${messageTemplates.channel} = 'call_script' DESC`,
      sql`${messageTemplates.kind} = 'custom' ASC`,
      asc(messageTemplates.position),
      asc(messageTemplates.id),
    )
    .limit(TEMPLATE_ROWS);
}

/** The card's WhatsApp list: per lane kind the page's row, else the store-wide row, else the built-in; then customs. */
function templateList(rows: readonly TemplateRow[], pageId: string, lane: "confirm" | "delivery", ui: AdminLocale): QueueOrder["templates"] {
  const wa = rows.filter((r) => r.channel === "whatsapp");
  const out: QueueOrder["templates"] = [];
  for (const kind of WA_KINDS_BY_LANE[lane]) {
    const own = wa.find((r) => r.kind === kind && r.pageId === pageId) ?? wa.find((r) => r.kind === kind && r.pageId === null);
    out.push(own ? { id: own.id, kind, name: own.name } : { id: builtinWaId(kind), kind, name: t(`ops.wa.kind.${kind}`, undefined, ui) });
  }
  for (const r of wa.filter((x) => x.kind === "custom").slice(0, CUSTOM_WA_MAX)) out.push({ id: r.id, kind: "custom", name: r.name });
  return out;
}

async function historyOf(scope: StoreScope, customerId: string | null) {
  if (!customerId) return null;
  const [c] = await db
    .select({
      ordersCount: customers.ordersCount,
      deliveredCount: customers.deliveredCount,
      refusedCount: customers.refusedCount,
      returnedCount: customers.returnedCount,
      cancelledCount: customers.cancelledCount,
      fakeCount: customers.fakeCount,
    })
    .from(customers)
    .where(byId(customers, scope, customerId))
    .limit(1);
  return c ?? null;
}

/** P3's zone line in the card's language; no zone, a city outside the zones or a failure → no text (OD47). */
async function etaText(scope: StoreScope, cityKey: CityKey | null, locale: ScriptLocale): Promise<string | null> {
  try {
    const line = await zoneLineFor(scope, cityKey);
    return line && !line.notServed ? (line.etaText?.[locale] ?? null) : null;
  } catch {
    return null;
  }
}

/** The viewer's admin language (template names); the store's when the viewer never chose one. */
export function uiLocaleOf(viewer: Pick<StoreCtx, "user" | "store">): AdminLocale {
  if (viewer.user.locale && isAdminLocale(viewer.user.locale)) return viewer.user.locale;
  return isAdminLocale(viewer.store.defaultLocale) ? viewer.store.defaultLocale : "en";
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const firstNameOf = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */

/** What the reads give `assembleCard` (each part already of this store; the card adds nothing it was not handed). */
export interface CardParts {
  now: Date;
  /** the store's time zone (the best-hours weekday) */
  tz: string;
  /** the viewer's admin language (the built-in template names) */
  ui: AdminLocale;
  history: CustomerCounters | null;
  duplicates: readonly DuplicateMatch[];
  /** the store's active WhatsApp templates of the card's language */
  templates: readonly TemplateRow[];
  bands: Record<"check" | "high", RiskBandOutcome | null>;
  /** the `attemptStats` table when cached (else no hint) */
  attempts: readonly AttemptCell[] | null;
  eta: string | null;
  /** rescue calls so far (delivery lane) */
  rescues: number;
  script: CompiledScript;
}

type CustomerCounters = NonNullable<Awaited<ReturnType<typeof historyOf>>>;

/** The card of `row` for `viewer` (see the header). */
export async function buildQueueOrder(scope: StoreScope, row: CardRow, viewer: StoreCtx, o: CardOpts): Promise<QueueOrder> {
  const lane = laneOf({ confirm: row.confirmState, ship: row.shipState }) === "delivery" ? "delivery" : "confirm";
  const locale = o.locale ?? scriptLocaleOf(row.locale, viewer.store.defaultLocale);
  const [history, duplicates, rows, bands, eta, rescues] = await Promise.all([
    historyOf(scope, row.customerId),
    duplicatesFor(scope, { id: row.id, phone: row.phone, isTest: row.isTest }),
    templateRows(scope, row.pageId, locale),
    riskBandOutcomes(scope),
    etaText(scope, row.cityKey as CityKey | null, locale),
    lane === "delivery" ? countRescueCalls(db, scope, row.id) : Promise.resolve(0),
  ]);
  const script = await compileScript(scope, row, viewer, { locale, rows: rows.filter((r) => r.channel === "call_script") });
  return assembleCard(scope, row, o, {
    now: opsNow(),
    tz: viewer.store.timezone,
    ui: uiLocaleOf(viewer),
    history,
    duplicates,
    templates: rows.filter((r) => r.channel === "whatsapp"),
    bands,
    attempts: attemptStatsIfReady(scope),
    eta,
    rescues,
    script,
  });
}

/** The card from the row and its parts: pure (no read), so `test:ops` builds its fixtures through it. */
export function assembleCard(scope: StoreScope, row: CardRow, o: CardOpts, p: CardParts): QueueOrder {
  const states: OrderStates = { confirm: row.confirmState, ship: row.shipState, money: row.moneyState as MoneyState };
  const lane = laneOf(states) === "delivery" ? "delivery" : "confirm";
  const cityKey = row.cityKey as CityKey | null;
  const h = p.history;
  const risk = explainRisk(row.riskScore, row.flags ?? [], customerHistoryOf(h));
  const band = risk.level === "low" ? null : p.bands[risk.level];
  const best = p.attempts ? bestHourOf(p.attempts, isoWeekday(p.now, p.tz)) : null;
  const c = maskIfImpersonation(scope, { name: row.name, phone: null, address: row.address, city: row.city, landmark: row.landmark, note: row.note });
  return fitCard({
    id: row.id,
    rev: row.rev,
    createdAt: row.createdAt.toISOString(),
    ageMinutes: Math.max(0, Math.floor((p.now.getTime() - row.createdAt.getTime()) / 60_000)),
    isTest: row.isTest,
    states,
    status: projectStatus(states),
    attempts: row.attempts,
    dueAt: iso(row.dueAt),
    product: row.productName,
    offerLabel: row.items?.bundleLabel ?? "",
    unitsText: orderText(row.items, { mode: "warehouse", productName: row.productName }),
    totalCents: toCents(row.total),
    shippingCents: toCents(row.shipping),
    currency: row.currency,
    locale: row.locale,
    customer: {
      firstName: firstNameOf(c.name),
      phoneMasked: maskPhone(row.phone),
      city: c.city,
      cityKey: row.cityKey,
      address: c.address,
      landmark: c.landmark,
      note: c.note,
      history: h ? { orders: h.ordersCount, delivered: h.deliveredCount, refused: h.refusedCount, returned: h.returnedCount, cancelled: h.cancelledCount, fake: h.fakeCount } : null,
    },
    risk: { score: row.riskScore, level: risk.level, reasons: risk.reasons, positive: risk.positive, calibration: band ? { badShareBp: band.badShareBp, n: band.decided } : null },
    duplicates: p.duplicates.map((d) => ({ id: d.id, createdAt: d.createdAt.toISOString(), status: projectStatus({ confirm: d.confirmState, ship: d.shipState }) })),
    script: p.script,
    templates: templateList(p.templates, row.pageId, lane, p.ui),
    eta: { text: p.eta, cityKey },
    leaseUntil: iso(o.leaseUntil),
    mine: o.mine,
    ui: { bestHoursHint: best ? { key: "ops.queue.bestHours", vars: { from: best.hour, to: (best.hour + 1) % 24, n: best.attempts } } : null },
    lane,
    delivery:
      lane === "delivery"
        ? {
            attempts: row.deliveryAttempts,
            lastCarrierStatus: null,
            carrierLabel: row.carrierLabel,
            trackingRef: row.trackingRef,
            shipAfter: iso(row.shipAfter),
            rescueCallsLeft: Math.max(0, o.maxCalls - p.rescues),
          }
        : null,
    shipAfter: iso(row.shipAfter),
    ...(o.inbound ? { inbound: true as const } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* conflict (OPE-§13.2 step 5)                                         */
/* ------------------------------------------------------------------ */

/**
 * A stale card's answer: the order's fresh card when the viewer still sees it (OD12; null when a manager moved it to
 * someone else), and the first name of whoever wrote the order's last event when that is another member ("Updated by
 * Karim just now"); null for the viewer themselves or a non-person (the sheet, a carrier, the system).
 */
export async function conflictCard(ctx: StoreCtx, orderId: string, opts: { inbound?: boolean } = {}): Promise<{ card: QueueOrder | null; updatedBy: string | null }> {
  const { scope } = ctx;
  const row = await cardRow(scope, orderId);
  if (!row || !viewerSeesOrder(scope, viewerOf(ctx), row, !!opts.inbound)) return { card: null, updatedBy: null };
  const now = opsNow();
  const mine = row.assigneeId === ctx.user.id && !!row.claimToken && !!row.leaseUntil && row.leaseUntil.getTime() > now.getTime();
  const [ops, [last]] = await Promise.all([
    getStoreSetting(scope, "ops"),
    db
      .select({ actorKind: orderEvents.actorKind, actorId: orderEvents.actorId })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orderId)))
      .orderBy(desc(orderEvents.id))
      .limit(1),
  ]);
  let updatedBy: string | null = null;
  if (last?.actorKind === "user" && last.actorId && last.actorId !== ctx.user.id) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, last.actorId)).limit(1);
    updatedBy = firstNameOf(u?.name) || null;
  }
  const card = await buildQueueOrder(scope, row, ctx, { leaseUntil: mine ? row.leaseUntil : null, mine, maxCalls: ops.rescue.maxCalls, ...(opts.inbound ? { inbound: true } : {}) });
  return { card, updatedBy };
}
