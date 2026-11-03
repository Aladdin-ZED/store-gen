/**
 * The orders list's built-in views and its query model (P4 CALL CENTER; operations.md OPE-§12.1, §12.2, §12.3; OD12,
 * OD48, OD49, OD50, OD54, OD55). Pure and isomorphic: the list query (src/lib/orders/admin.ts) turns a view into SQL,
 * the URL parser (src/lib/admin-data/orders.ts) reads `OrderQuery` from the address bar, the saved-view repository
 * validates a stored query with the same schema, and the screen draws the tabs from `BUILTIN_VIEWS`.
 *
 * A view is a partial query plus, for the predicates a query cannot say, one `special` rule:
 *   callable        either lane due now (OPE-§5.1; the calling window is ignored for viewing)
 *   callbacks_due   confirm `callback` ∧ due ≤ now + 15 min
 *   open            confirm new / attempting / callback, or confirmed and not handed to a carrier
 *   duplicates      open ∧ an open sibling of the same phone (OPE-§9.3) the team has not kept apart
 *   mine            the agent predicate (OD12): assignee or confirmer = me, created within `agentHistoryDays`
 * The hold (OD49) is the query's own `hold` key: "To pack" excludes held orders, "On hold" lists only them.
 */
import { z } from "zod";
import { CONFIRM_STATES, MONEY_STATES, RETURN_REASONS, SHIP_STATES, type ConfirmState, type ShipState } from "@/lib/orders/state";

/* ------------------------------------------------------------------ */
/* the query model (OPE-§12.2)                                         */
/* ------------------------------------------------------------------ */

const Id26 = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CityKey = z.string().regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*|\*)$/).max(40);
/** the legacy status labels (src/lib/orders/contract.ts ORDER_STATUSES ids) */
const OrderStatusId = z.string().regex(/^[a-z_]{2,20}$/);
export const ORDER_SOURCES = ["live", "export", "php", "manual", "api", "storefront", "whatsapp"] as const;
export const ORDER_SORTS = ["created_desc", "due_asc", "priority_desc", "total_desc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

/** The list's query (OPE-§12.2): what the URL says, what a saved view stores. Dates are store-local days. */
export const OrderQuery = z.object({
  q: z.string().max(80).optional(),
  confirm: z.array(z.enum(CONFIRM_STATES)).max(CONFIRM_STATES.length).optional(),
  ship: z.array(z.enum(SHIP_STATES)).max(SHIP_STATES.length).optional(),
  money: z.array(z.enum(MONEY_STATES)).max(MONEY_STATES.length).optional(),
  status: z.array(OrderStatusId).max(20).optional(),
  assignee: z.union([Id26, z.literal("none"), z.literal("me")]).optional(),
  confirmedBy: Id26.optional(),
  pageId: Id26.optional(),
  cityKey: CityKey.optional(),
  source: z.array(z.enum(ORDER_SOURCES)).max(ORDER_SOURCES.length).optional(),
  minRisk: z.number().int().min(0).max(100).optional(),
  from: ISODate.optional(),
  to: ISODate.optional(),
  dueBefore: z.iso.datetime({ offset: true }).optional(),
  sheet: z.enum(["pending", "failed", "synced"]).optional(),
  test: z.boolean().optional(),
  view: z.string().max(32).optional(),
  hold: z.enum(["active", "none"]).optional(),
  returnReason: z.array(z.enum(RETURN_REASONS)).max(RETURN_REASONS.length).optional(),
  tracking: z.string().max(64).optional(),
  carrierLabel: z.string().max(60).optional(),
  agentLabel: z.string().max(60).optional(),
  sort: z.enum(ORDER_SORTS).default("created_desc"),
});
export type OrderQuery = z.output<typeof OrderQuery>;
export type OrderQueryInput = z.input<typeof OrderQuery>;

/* ------------------------------------------------------------------ */
/* built-in views (OPE-§12.1)                                          */
/* ------------------------------------------------------------------ */

export type ViewSpecial = "callable" | "callbacks_due" | "open" | "duplicates" | "mine";
/** extra columns a view shows beside the role's columns (OPE-§12.3 rev 3) */
export type ViewColumn = "ship_from" | "attempts_due" | "delivery_attempts" | "tracking" | "rescue" | "return_reason";
export type ViewAudience = "manager" | "agent" | "owner";

export interface BuiltinView {
  id: BuiltinViewId;
  /** the tab label's message key (`ops.view.<id>`) */
  labelKey: `ops.view.${BuiltinViewId}`;
  query: Partial<Pick<OrderQuery, "confirm" | "ship" | "minRisk" | "sheet" | "test" | "hold" | "sort">>;
  special?: ViewSpecial;
  columns: readonly ViewColumn[];
  /** the roles that open the list on it ("default for") */
  defaultFor: readonly ViewAudience[];
  /** shown only when it has rows (Delivery problems, Sheet sync failed) */
  whenNonEmpty?: true;
}

export const BUILTIN_VIEW_IDS = [
  "to_call",
  "callbacks",
  "new",
  "no_answer",
  "to_pack",
  "on_hold",
  "on_the_way",
  "delivery_problems",
  "delivered",
  "refused_returned",
  "cancelled_fake",
  "high_risk",
  "duplicates",
  "sheet_failed",
  "test",
  "mine",
] as const;
export type BuiltinViewId = (typeof BUILTIN_VIEW_IDS)[number];

const v = (id: BuiltinViewId, rest: Omit<BuiltinView, "id" | "labelKey">): BuiltinView => ({ id, labelKey: `ops.view.${id}`, ...rest });
const PRE_SHIP_PACK: ShipState[] = ["to_pack", "packed"];
const CLOSED_CONFIRM: ConfirmState[] = ["cancelled", "fake", "duplicate", "unreachable"];

export const BUILTIN_VIEWS: readonly BuiltinView[] = [
  v("to_call", { query: { sort: "priority_desc" }, special: "callable", columns: ["attempts_due"], defaultFor: ["manager"] }),
  v("callbacks", { query: { sort: "due_asc" }, special: "callbacks_due", columns: ["attempts_due"], defaultFor: ["manager", "agent"] }),
  v("new", { query: { confirm: ["new"] }, columns: [], defaultFor: [] }),
  v("no_answer", { query: { confirm: ["attempting"] }, columns: ["attempts_due"], defaultFor: [] }),
  // OD49: a held order is not packed by mistake
  v("to_pack", { query: { confirm: ["confirmed"], ship: PRE_SHIP_PACK, hold: "none" }, columns: ["tracking"], defaultFor: ["owner"] }),
  v("on_hold", { query: { confirm: ["confirmed"], ship: PRE_SHIP_PACK, hold: "active" }, columns: ["ship_from"], defaultFor: [] }),
  v("on_the_way", { query: { ship: ["shipped", "in_transit", "out_for_delivery", "postponed"] }, columns: ["tracking"], defaultFor: [] }),
  v("delivery_problems", {
    query: { ship: ["attempt_failed", "postponed"] },
    columns: ["delivery_attempts", "tracking", "rescue"],
    defaultFor: ["manager", "owner"],
    whenNonEmpty: true,
  }),
  v("delivered", { query: { ship: ["delivered"] }, columns: [], defaultFor: [] }),
  v("refused_returned", { query: { ship: ["refused", "returned", "lost"] }, columns: ["return_reason"], defaultFor: [] }),
  v("cancelled_fake", { query: { confirm: CLOSED_CONFIRM }, columns: [], defaultFor: [] }),
  v("high_risk", { query: { minRisk: 50 }, special: "open", columns: [], defaultFor: [] }),
  v("duplicates", { query: {}, special: "duplicates", columns: [], defaultFor: [] }),
  v("sheet_failed", { query: { sheet: "failed" }, columns: [], defaultFor: ["owner"], whenNonEmpty: true }),
  v("test", { query: { test: true }, columns: [], defaultFor: [] }),
  v("mine", { query: {}, special: "mine", columns: ["attempts_due"], defaultFor: ["agent"] }),
];

const BY_ID = new Map(BUILTIN_VIEWS.map((x) => [x.id, x]));
export const builtinView = (id: string | null | undefined): BuiltinView | null => (id ? (BY_ID.get(id as BuiltinViewId) ?? null) : null);

/** the "callbacks due" look-ahead (OPE-§12.1) */
export const CALLBACK_LOOKAHEAD_MS = 15 * 60_000;

/** The view's query and the person's query together: both apply (AND); the person's sort wins when given. */
export function withView(view: BuiltinView | null, q: OrderQueryInput): OrderQueryInput {
  if (!view) return q;
  const base = view.query;
  const meet = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] | undefined => (a && b ? a.filter((x) => b.includes(x)) : (a ?? b)?.slice());
  return {
    ...q,
    confirm: meet(base.confirm, q.confirm),
    ship: meet(base.ship, q.ship),
    minRisk: Math.max(base.minRisk ?? 0, q.minRisk ?? 0) || undefined,
    sheet: q.sheet ?? base.sheet,
    test: q.test ?? base.test,
    hold: q.hold ?? base.hold,
    sort: q.sort ?? base.sort,
  };
}

/** The views a role opens on (OPE-§12.1 "Default for"): agents → My orders, managers → To call now, owners → To pack. */
export function defaultViewFor(role: string): BuiltinViewId {
  if (role === "agent") return "mine";
  if (role === "manager") return "to_call";
  return "to_pack";
}

/* ------------------------------------------------------------------ */
/* saved views (OPE-§12.2, §L)                                          */
/* ------------------------------------------------------------------ */

export const SAVED_VIEWS_MAX = 30;
export const SAVED_VIEW_NAME_MAX = 60;
export const SavedViewInput = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .pipe(z.string().min(1).max(SAVED_VIEW_NAME_MAX)),
  query: OrderQuery,
  shared: z.boolean().default(false),
});
export type SavedViewInput = z.input<typeof SavedViewInput>;
