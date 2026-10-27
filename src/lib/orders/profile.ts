import "server-only";
/**
 * Order reads for the console, the dashboard and Store Health (P4 CALL CENTER; operations.md OPE-§27.1; docs/STORE-SAAS.md
 * §K.2 P0, OPE Q.8, LAN Q17, PLA Q.11, PLA Q4.10). Every function is a deterministic read over the store's own rows,
 * test and honeypot orders excluded from the counts, a rate never without its n (OD38), no customer field beyond a
 * first name with an initial and a masked phone (core §F.11). Console readers take the console's read-only
 * `platformScope`. Typed stubs frozen at P0; where PLA Q.11 and OPE-§27.1 disagree, operations' signatures stand
 * (core §Q.9, PLA Q4.10 "the signatures are operations'").
 */
import type { StoreRole } from "@/lib/auth/permissions";
import type { SearchHit } from "@/lib/admin-data/search/types";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import type { OrderStatus } from "./contract";
import type { OrderEventType } from "./events";
import type { ConfirmState, OrderStates, ShipState } from "./state";
import type { OrderActor } from "./transition";

/** a rate never travels without its n (OD38); below `min` the value is withheld */
export type Kpi = { value: number; n: number; min: number } | { n: number; min: number; insufficient: true };

export interface OrderKpis {
  window: "today" | "7d" | "28d";
  placed: number;
  confirmed: number;
  delivered: number;
  decided: number;
  confirmationRate: Kpi;
  deliveryRate: Kpi;
  firstTouchP50Min: Kpi;
  unreachableRate: Kpi;
  /** risk ≥ 50 ÷ placed */
  riskyShare: Kpi;
  lastOrderAt: string | null;
  computedAt: string;
}

/** Board tiles and the Today brief (rev 3 fields: OD48, OPS-29, OD49, OD53). */
export interface QueueCounts {
  toCallNow: number;
  callbacksDue: number;
  waitingRetry: number;
  firstTouchBreaches: number;
  abandonedToday: number;
  liveAgents: number;
  oldestCallbackOverdueMin: number | null;
  deliveryRescue: number;
  oldestRescueMin: number | null;
  toShip: number;
  oldestToShipDays: number | null;
  holds: number;
  nextHoldDay: string | null;
  inboundLookupsHour: number;
}

/** One order in the console list: never the address, the note or the e-mail (OPE-§27.1, core §F.11). */
export interface ConsoleOrderRow {
  id: string;
  createdAt: string;
  states: OrderStates;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  city: string | null;
  /** first name + initial ("Salma B.") */
  customer: string;
  phoneMasked: string;
  risk: number;
  isTest: boolean;
  /** PLA Q4.10: null for an order without a landing page (manual, R2 storefront) */
  pageId: string | null;
  /** D74 (OD55): the R1 carrier loop */
  carrierLabel: string | null;
  trackingRef: string | null;
  /** when the order last left in a Carrier CSV (`manifest_exported`) */
  carrierExportedAt: string | null;
}

/** A timeline line as the console sees it: codes only, no free text (notes and edit details stay in the store). */
export interface ConsoleTimelineItem {
  id: number;
  at: string;
  type: OrderEventType;
  actorKind: OrderActor["kind"] | "platform";
  fromState: string | null;
  toState: string | null;
  reasonCode: string | null;
}

export interface ConsoleOrderDetail extends ConsoleOrderRow {
  /** the warehouse text (src/lib/orders/text.ts) */
  itemsText: string;
  timeline: ConsoleTimelineItem[];
  /** integration states: the sheet row and the order's outbox items by kind */
  integrations: { sheet: "pending" | "synced" | "failed" | "disabled"; outbox: { kind: string; topic: string; state: string }[] };
}

/** Health inputs, the console Overview, dashboard tiles; scopedCache("ops-kpis") 60 s. */
export async function orderKpis(scope: StoreScope, window: OrderKpis["window"]): Promise<OrderKpis> {
  void scope;
  void window;
  throw new Error("not implemented: P4 orderKpis");
}

export async function queueCounts(scope: StoreScope): Promise<QueueCounts> {
  void scope;
  throw new Error("not implemented: P4 queueCounts");
}

export async function listOrdersForConsole(
  scope: StoreScope,
  q: { state?: ConfirmState | ShipState; from?: string; to?: string; after?: string; limit?: number /* ≤ 50 */ },
): Promise<{ items: ConsoleOrderRow[]; next: string | null }> {
  void scope;
  void q;
  throw new Error("not implemented: P4 listOrdersForConsole");
}

/** Still masked; null for an order of another store. */
export async function getOrderForConsole(scope: StoreScope, orderId: string): Promise<ConsoleOrderDetail | null> {
  void scope;
  void orderId;
  throw new Error("not implemented: P4 getOrderForConsole");
}

/**
 * `pii.reveal` ↑ (core §A.3.3): writes `phone_revealed` with actor_kind "platform" and audit `platform.pii.revealed`;
 * the only way platform code sees a phone.
 */
export async function recordPlatformReveal(ctx: PlatformCtx, scope: StoreScope, orderId: string, reason: string): Promise<{ e164: string } | null> {
  void ctx;
  void scope;
  void orderId;
  void reason;
  throw new Error("not implemented: P4 recordPlatformReveal");
}

/** Signup-risk and store-risk signals (platform.md): risk bands only. */
export async function orderRiskMix(scope: StoreScope, days: 28): Promise<{ low: number; check: number; high: number; honeypot: number; n: number }> {
  void scope;
  void days;
  throw new Error("not implemented: P4 orderRiskMix");
}

/**
 * The ⌘K provider's body (OPE-§27.7): an id prefix, ≥ 4 phone digits or an exact tracking_ref; agents see their
 * queue only, plus the exact-phone inbound lookup when q has ≥ 8 digits (OD53); results masked.
 */
export async function searchOrders(scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }, limit: 8): Promise<SearchHit[]> {
  void scope;
  void q;
  void viewer;
  void limit;
  throw new Error("not implemented: P4 searchOrders");
}
