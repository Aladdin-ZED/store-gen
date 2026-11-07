import "server-only";
/**
 * Catalog orders by agents: the v3 manual-order functions (storefront.md STO-§16.9, STO-§16.3; core §K.4 R2 contract
 * step, OPS-15 / D72; request STO-R30). Track S1 STOREFRONT owns this file in R2 and writes the bodies (pricing by
 * `priceLine`, insert by `createOrderRow`); the contract step (C2-C) froze the signatures below so S4 LOGISTICS builds
 * the store-mode branch of the manual-order sheet (`src/lib/shipping/manual-actions.ts`, `src/components/admin/orders/
 * manual/**`) and P4's `convertLeadToOrder` gets its v3 branch (`leads.sel.v === 3`, `fromLead`) against them.
 *
 * Contract rules (frozen with the signatures):
 * - pricing is the public path's: every line through `priceLine` with `ls` absent (the quote IS the shown amount);
 * - delivery is `storeDeliveryFee` for the customer's city (`cityKey`, else `normalizeCity`: `city_unknown`);
 * - a quote with no delivery rule answers `deliveryRule: "not_set"` with the warning `fee_unset`; a CREATE (or an edit
 *   that re-prices delivery) whose quote has no rule is REFUSED with `fee_unset`, never inserted with a 0 fee;
 * - the input has no `shipAfter`: the sheet sets the hold in a second, idempotent write (`setShipAfterAction`);
 * - replay: an existing `orders.idem` of this store answers `replayed: true` with the first order.
 * Stubs until S1 merges: every function throws `NotBuiltYet("S1", …)` (src/lib/contracts/not-built.ts). No R1 path
 * calls them: the sheet's store branch and the v3 lead conversion exist only with `releaseOn("R2")`.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { OrderItems } from "@/lib/db/schema";
import type { DeliveryRule, LineIn, LineVerdict, OrderFieldErrorsV3 } from "@/lib/orders/contract-v3";
import type { ResolvedSelection } from "@/lib/orders/validate";
import type { Cents } from "@/lib/page/money";
import type { PageDoc } from "@/lib/page/schema";
import type { ActionResult, StoreCtx, WriteCtx } from "@/lib/tenancy/types";

/** One catalog line the agent picked (no shown amounts: the agent sees the server quote). */
export type ManualLineV3 = Omit<LineIn, "ls" | "rev">;

/** STO-§16.3: one line re-priced against the live product (`priceLine`, S1). */
export type LinePriced =
  | { state: "ok" | "changed"; doc: PageDoc; selection: ResolvedSelection; sub: Cents; lineCents: Cents; pack: OrderItems; errors?: undefined }
  | { state: "unavailable" | "removed"; errors?: OrderFieldErrorsV3 };

export interface ManualOrderInputV3 {
  /** 1..20 catalog lines (pk, bundleId, units, extras, n) */
  lines: ManualLineV3[];
  customer: { name: string; phone: string; city: string; address?: string; landmark?: string; note?: string; email?: string };
  /** default "manual"; "whatsapp" from a WhatsApp intent (STO-§15.13 step 5) */
  source?: "manual" | "whatsapp";
  /** "The customer already confirmed" (default true for phone orders): `transitionOrder(confirm → confirmed, "ui")` after the insert */
  confirmed: boolean;
  /** manager+ only, ≤ 0, OPE-§11.1 step 4 rules */
  adjustCents?: number;
  adjustReason?: string;
  /** set by operations' `convertLeadToOrder` when `leads.sel.v === 3` (marks the lead `converted`, `converted_via = 'agent'`) */
  fromLead?: { leadId: string };
  allowDuplicate?: boolean;
  /** the sheet's draft id, written to `orders.idem` (OD36 replay) */
  idem: string;
}

/** The server quote the sheet shows (and the create re-computes; it never trusts a client total). */
export interface ManualQuoteV3 {
  lines: (LinePriced & { i: number })[];
  subtotalCents: number;
  /** 0 when `deliveryRule` is "not_set" (shown with the `fee_unset` warning, never invented) */
  deliveryCents: number;
  deliveryRule: DeliveryRule | "not_set";
  adjustCents: number;
  totalCents: number;
  currency: string;
  warnings: ("duplicate" | "blocked" | "city_unknown" | "fee_unset")[];
  duplicates: { id: string; createdAt: string }[];
}

/**
 * The refusal codes of the create and the edit (`ActionResult.error`): `fee_unset` (no delivery rule for the city:
 * never a 0 fee), `unavailable` / `removed` (a line), `blocked` (blocklist), `duplicate` (without `allowDuplicate`),
 * `forbidden` (an adjustment by a non-manager), `rate_limited` (`s:<sid>:manual:<uid>` 60 / h), `locked` (edit: the
 * ship / confirm lock of OPE-§11.3), `conflict` (edit: `expectRev` is stale), `invalid`, `not_found`.
 */
export type ManualOrderErrorV3 = "fee_unset" | "unavailable" | "removed" | "blocked" | "duplicate" | "forbidden" | "rate_limited" | "locked" | "conflict" | "invalid" | "not_found";

export interface OrderPatchV3 {
  contact?: Omit<ManualOrderInputV3["customer"], "phone"> & { phone?: string };
  /** replaces the order's lines; every line re-priced against the LIVE product (never a landing doc) */
  lines?: ManualLineV3[];
  adjust?: { cents: number; reason: string };
}

/** `editOrderV3`'s answer: a line now unavailable refuses with every line's verdict and changes nothing. */
export type EditOrderV3Result = ActionResult<{ rev: number; totalCents: number; lines: LineVerdict[] }> | { ok: false; error: "unavailable"; lines: LineVerdict[] };

/** The quote (permission `orders.create`, no write); the sheet debounces it 250 ms. S1 (stub: NotBuiltYet). */
export async function quoteManualOrderV3(ctx: StoreCtx, input: ManualOrderInputV3): Promise<ActionResult<ManualQuoteV3>> {
  void ctx;
  void input;
  return notBuiltYet("S1", "quoteManualOrderV3");
}

/**
 * Create a catalog order taken by an agent: re-quote, refuse `fee_unset` when the quote has no delivery rule, then
 * `createOrderRow` (`items: OrderItemsV3`, `page_id` / `version_id` NULL, `flags: ["manual"]`, `catalog_version`,
 * `created_by`), `runOrderHooks("created")` and, when `confirmed`, the confirm move. S1 (stub: NotBuiltYet).
 */
export async function createManualOrderV3(ctx: WriteCtx, input: ManualOrderInputV3): Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>> {
  void ctx;
  void input;
  return notBuiltYet("S1", "createManualOrderV3");
}

/**
 * Edit a v3 order (permission `orders.edit`, OPE-§11.3 locks): `lines` re-priced against the live products, `contact`
 * re-normalised, one `field_edited` event, `rev + 1`, `sheet_dirty |= 4` for lines; compare-and-set on `expectRev`.
 * S1 (stub: NotBuiltYet).
 */
export async function editOrderV3(ctx: WriteCtx, orderId: string, patch: OrderPatchV3, expectRev: number): Promise<EditOrderV3Result> {
  void ctx;
  void orderId;
  void patch;
  void expectRev;
  return notBuiltYet("S1", "editOrderV3");
}
