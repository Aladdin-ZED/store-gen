/**
 * Labels and tones for every status the admin shows (orders, sheet sync, pages, versions).
 * Tones map to chip styles in <StatusChip>. Isomorphic.
 */
// type-only: the contract module also builds the public API's zod schemas at load time, which
// would put all of zod into every admin screen that shows a status chip
import type { OrderStatus } from "@/lib/orders/contract";

export type Tone = "neutral" | "brand" | "blue" | "green" | "emerald" | "warn" | "violet" | "teal" | "rose" | "red";

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; fr: string; tone: Tone; hint: string }> = {
  new: { label: "New", fr: "Nouvelle", tone: "blue", hint: "Waiting for the confirmation call" },
  confirmed: { label: "Confirmed", fr: "Confirmée", tone: "emerald", hint: "Customer confirmed by phone" },
  no_answer: { label: "No answer", fr: "Injoignable", tone: "warn", hint: "Call again later" },
  callback: { label: "Call back", fr: "Reportée", tone: "violet", hint: "Customer asked to be called later" },
  shipped: { label: "Shipped", fr: "Expédiée", tone: "teal", hint: "Handed to the courier" },
  delivered: { label: "Delivered", fr: "Livrée", tone: "green", hint: "Paid on delivery" },
  returned: { label: "Returned", fr: "Retournée", tone: "rose", hint: "Refused or returned" },
  cancelled: { label: "Cancelled", fr: "Annulée", tone: "neutral", hint: "Cancelled before shipping" },
  fake: { label: "Fake", fr: "Fausse commande", tone: "red", hint: "Not a real order" },
  // R1 projections of the state axes (operations.md OPE-§3.3), appended to the contract at P0; set by P4's state machine
  refused: { label: "Refused", fr: "Refusée", tone: "rose", hint: "Refused at the door" },
  duplicate: { label: "Duplicate", fr: "Doublon", tone: "neutral", hint: "Same order as another one" },
  unreachable: { label: "Unreachable", fr: "Injoignable clôturée", tone: "neutral", hint: "Closed after the call attempts" },
  in_transit: { label: "In transit", fr: "En livraison", tone: "blue", hint: "On its way to the customer" },
  lost: { label: "Lost", fr: "Perdue", tone: "red", hint: "Lost on the way" },
};

/**
 * Workflow order of the statuses a person sets by hand (the status menu and its filter): the nine of the
 * single-tenant workflow, as before P0. The R1 projections above are labelled wherever an order shows one; P4's
 * "Move to…" menu (OPE-§12.6) replaces this list.
 */
export const ORDER_STATUS_ORDER: OrderStatus[] = ["new", "confirmed", "no_answer", "callback", "shipped", "delivered", "returned", "cancelled", "fake"];

export function orderStatusMeta(status: string) {
  return ORDER_STATUS_META[status as OrderStatus] ?? { label: status, fr: status, tone: "neutral" as Tone, hint: "" };
}

export const SHEET_STATUS_META: Record<"pending" | "synced" | "failed" | "disabled", { label: string; tone: Tone }> = {
  pending: { label: "Queued", tone: "warn" },
  synced: { label: "In sheet", tone: "emerald" },
  failed: { label: "Sync failed", tone: "red" },
  disabled: { label: "Not synced", tone: "neutral" },
};

export const PAGE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  published: { label: "Live", tone: "green" },
  draft: { label: "Draft", tone: "neutral" },
  archived: { label: "Archived", tone: "warn" },
  deleted: { label: "Deleted", tone: "rose" },
};

export const VERSION_KIND_META: Record<string, { label: string; tone: Tone }> = {
  generation: { label: "Generated", tone: "violet" },
  save: { label: "Saved", tone: "neutral" },
  publish: { label: "Published", tone: "green" },
  restore: { label: "Restored", tone: "blue" },
  import: { label: "Copied", tone: "teal" },
  autosave: { label: "Autosave", tone: "neutral" },
};

/** Risk score → label (0–100, explainable flags live on the order). */
export function riskLevel(score: number): { label: string; tone: Tone } | null {
  if (score >= 60) return { label: "High risk", tone: "red" };
  if (score >= 30) return { label: "Check", tone: "warn" };
  return null;
}

/** Human labels for the risk flags set by the order API (src/lib/orders/risk.ts). */
export const RISK_FLAG_LABELS: Record<string, string> = {
  honeypot: "Bot trap filled",
  too_fast: "Form sent in under 3 s",
  fast: "Form sent very quickly",
  no_ua: "No browser signature",
  bot_ua: "Automated client",
  captcha_missing: "No captcha token",
  captcha_unverified: "Captcha not verified",
  no_origin: "Sent from outside the page",
  ip_repeat: "Several orders from one network",
  history_bad: "Past fake / returned orders",
  returning_customer: "Returning customer",
  test: "Test order",
};

export function riskFlagLabel(flag: string): string {
  return RISK_FLAG_LABELS[flag] ?? flag.replace(/_/g, " ");
}
