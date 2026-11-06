import "server-only";
/**
 * The store profile's Orders tab and the one reveal (platform.md PLA-§7.4, PL-07; PD2, core §F.11, D74, OPS-9):
 *
 *   const page = await listStoreOrders(ctx, storeId, { state: "confirmed", risky: true }, cursor);
 *   const order = await getStoreOrder(ctx, storeId, orderId);      // the read-only drawer, still masked
 *   const pii = await revealOrderPii(ctx, storeId, orderId, "ticket");   // pii.reveal ↑, 20 a day per staff member
 *
 * Every read is P4's console read (`listOrdersForConsole`, `getOrderForConsole`, `orderRiskMix`, `orderKpis`; frozen at
 * P0, "unavailable" until P4 merges) through `platformScope(ctx, storeId)`. Customer fields leave this file only as
 * `Masked` values (PD2): the name through `maskName`, the phone as P4 masked it; notes never. A page-less order (a cart
 * or manual order, payload v3) reads "Store checkout". The carrier label and tracking reference are not customer
 * data and show as they are (OPS-9), with the carrier-file date (D74).
 *
 * The reveal: P4's `recordPlatformReveal` is the single writer of the `platform.pii.revealed` audit row and the
 * order's `phone_revealed` event (CCR P1-9, P0b review F-3), so this function writes no audit of its own; its answer
 * is returned for display only, never cached and never logged. The bucket `p:pii:reveal:<userId>` allows 20 a day.
 */
import { z } from "zod";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { getOrderForConsole, listOrdersForConsole, orderKpis, orderRiskMix, recordPlatformReveal, type ConsoleOrderDetail, type ConsoleOrderRow, type OrderKpis } from "@/lib/orders/profile";
import { CONFIRM_STATES, SHIP_STATES, type ConfirmState, type ShipState } from "@/lib/orders/state";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { maskName, type Masked } from "../mask";
import { optional } from "../panel";
import { platformScope } from "../seam";

export const ORDERS_PAGE_SIZE = 50;
/** PLA-§7.4 / §M.5: reveals per staff member and day */
export const REVEALS_PER_DAY = 20;
export const REVEAL_REASONS = ["ticket", "fraud_review", "legal_request", "delivery_dispute", "other"] as const;
export type RevealReason = (typeof REVEAL_REASONS)[number];
/** the order-id rule of the console (`ORDER_ID`, PLA-§4.4) */
export const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const StoreOrdersFilter = z.object({
  state: z.enum([...CONFIRM_STATES, ...SHIP_STATES] as [ConfirmState | ShipState, ...(ConfirmState | ShipState)[]]).optional(),
  /** risk ≥ 70 only (applied to the page P4 returns) */
  risky: z.boolean().optional(),
  from: z.string().regex(DAY_RE).optional(),
  to: z.string().regex(DAY_RE).optional(),
  /** one page id (applied to the page P4 returns) */
  pageId: z.string().regex(/^[0-9A-Z]{26}$/).optional(),
});
export type StoreOrdersFilter = z.infer<typeof StoreOrdersFilter>;

/** A console order row with every customer field masked (PD2). */
export type MaskedOrderRow = Omit<ConsoleOrderRow, "customer" | "phoneMasked"> & {
  customer: Masked;
  phone: Masked;
  /** "Store checkout" when the order has no landing page (payload v3, OPS-15) */
  storeCheckout: boolean;
};

export type MaskedOrderDetail = Omit<ConsoleOrderDetail, "customer" | "phoneMasked"> & { customer: Masked; phone: Masked; storeCheckout: boolean };

/** P4's masked phone, typed as such (P4's contract: `phoneMasked` never carries the full number, core §F.11). */
const asMasked = (s: string) => s as Masked;

function maskRow<T extends ConsoleOrderRow>(r: T): Omit<T, "customer" | "phoneMasked"> & { customer: Masked; phone: Masked; storeCheckout: boolean } {
  const { customer, phoneMasked, ...rest } = r;
  return { ...rest, customer: maskName(customer), phone: asMasked(phoneMasked), storeCheckout: r.pageId === null };
}

function requireRead(ctx: PlatformCtx): void {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
}

export interface StoreOrdersPage {
  items: MaskedOrderRow[];
  next: string | null;
}

/** PLA-§7.4 (`console.read`): one page of the store's orders, masked; a cursor is P4's opaque `after`. */
export async function listStoreOrders(ctx: PlatformCtx, storeId: string, filter: StoreOrdersFilter = {}, cursor: string | null = null): Promise<StoreOrdersPage> {
  requireRead(ctx);
  const f = StoreOrdersFilter.parse(filter);
  const scope = platformScope(ctx, storeId);
  const page = await listOrdersForConsole(scope, { ...(f.state ? { state: f.state } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(cursor ? { after: cursor } : {}), limit: ORDERS_PAGE_SIZE });
  const items = page.items.filter((r) => !r.isTest && (!f.risky || r.risk >= 70) && (!f.pageId || r.pageId === f.pageId)).map(maskRow);
  return { items, next: page.next };
}

/** The drawer (`console.read`): lines, timeline codes, integration states, carrier fields; null for another store's order. */
export async function getStoreOrder(ctx: PlatformCtx, storeId: string, orderId: string): Promise<MaskedOrderDetail | null> {
  requireRead(ctx);
  if (!ORDER_ID_RE.test(orderId)) return null;
  const detail = await getOrderForConsole(platformScope(ctx, storeId), orderId);
  return detail ? maskRow(detail) : null;
}

export interface OrdersSummary {
  /** placed / confirmed / delivered, rates with n (P4's 7 d and 28 d windows) */
  kpis7d: OrderKpis | null;
  kpis28d: OrderKpis | null;
  /** 0-29 / 30-69 / ≥ 70 over 28 days, with n */
  riskMix: { low: number; check: number; high: number; honeypot: number; n: number } | null;
}

/** The counts above the table and the risk bar (each part null while P4's stub is in place). */
export async function storeOrdersSummary(ctx: PlatformCtx, storeId: string): Promise<OrdersSummary> {
  requireRead(ctx);
  const scope = platformScope(ctx, storeId);
  const [kpis7d, kpis28d, riskMix] = await Promise.all([
    optional("orders.kpis7d", () => orderKpis(scope, "7d"), { storeId }),
    optional("orders.kpis28d", () => orderKpis(scope, "28d"), { storeId }),
    optional("orders.risk_mix", () => orderRiskMix(scope, 28), { storeId }),
  ]);
  return { kpis7d, kpis28d, riskMix };
}

export const RevealInput = z.object({
  storeId: z.string().regex(/^[0-9A-Z]{26}$/),
  orderId: z.string().regex(ORDER_ID_RE),
  reason: z.enum(REVEAL_REASONS),
  note: z.string().trim().max(300).optional(),
});

export interface RevealedPii {
  e164: string;
  name: string;
  address: string | null;
  city: string | null;
  note: string | null;
  /** the dialog masks the fields again after this many seconds */
  showForSec: 60;
}

/**
 * `pii.reveal` ↑ (the caller's `platformAction` checks the step-up): one order's customer fields for 60 s on screen.
 * The reason `other` needs a note. P4 writes the audit row and the order event; nothing here is cached or logged.
 */
export async function revealOrderPii(ctx: PlatformCtx, input: unknown): Promise<RevealedPii> {
  if (!ctx.can("pii.reveal")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  const parsed = RevealInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "reason")]: "console.reveal.invalid" });
  const { storeId, orderId, reason, note } = parsed.data;
  if (reason === "other" && !note) throw new FieldsError({ note: "console.reveal.note_required" });
  if (!(await rateLimit(platformBucket("pii:reveal", ctx.user.id), REVEALS_PER_DAY, 86_400)).ok) throw new AuthRefusal("rate_limited");
  const revealed = await recordPlatformReveal(ctx, platformScope(ctx, storeId), orderId, reason);
  if (!revealed) throw new AuthRefusal("not_found");
  return { ...revealed, showForSec: 60 };
}
