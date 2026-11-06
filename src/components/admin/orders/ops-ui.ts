/**
 * The orders screen's pure helpers (P4 CALL CENTER; operations.md OPE-§12.3, §12.6): the axis chips' tones, the
 * "Move to…" menu computed from the one state machine (legacyToWanted filtered by legalMoves, so the menu never offers
 * a move the writer would refuse), and the flattening of the seam's answers (storeAction wraps the domain's own result).
 */
import type { StorePermission } from "@/lib/auth/permissions";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/contract";
import { legacyToWanted, legalMoves, type Axis, type ConfirmState, type MoneyState, type MoveClass, type MovePerms, type OrderStates, type ShipState } from "@/lib/orders/state";
import type { Tone } from "../lib/status";

export const CONFIRM_TONE: Record<ConfirmState, Tone> = {
  new: "blue",
  attempting: "warn",
  callback: "violet",
  confirmed: "emerald",
  cancelled: "neutral",
  fake: "red",
  duplicate: "neutral",
  unreachable: "neutral",
};

export const SHIP_TONE: Record<ShipState, Tone> = {
  none: "neutral",
  to_pack: "blue",
  packed: "teal",
  shipped: "teal",
  in_transit: "blue",
  out_for_delivery: "blue",
  attempt_failed: "warn",
  postponed: "violet",
  delivered: "green",
  refused: "rose",
  returned: "rose",
  lost: "red",
};

export const MONEY_TONE: Record<MoneyState, Tone> = {
  unpaid: "neutral",
  collected: "emerald",
  remitted: "green",
  disputed: "warn",
  written_off: "red",
  refunded: "neutral",
};

/** The viewer's move rights, as the writer reads them (movePermsOf for a member). */
export function viewerMovePerms(can: (p: StorePermission) => boolean): MovePerms {
  const classes = new Set<MoveClass>();
  if (can("orders.write")) classes.add("W");
  if (can("orders.assign")) classes.add("A");
  if (can("shipments.write")) classes.add("L");
  if (can("finance.write")) classes.add("M");
  return { classes, force: can("orders.force_status"), external: false };
}

export type ReasonKind = "cancel" | "return";

export interface MoveEntry {
  label: OrderStatus;
  /** legal: in the menu · force: under "Force…" (orders.force_status) */
  mode: "legal" | "force";
  /** the move needs a coded reason (cancel or return list) */
  reason: ReasonKind | null;
}

/**
 * The "Move to…" entries of one order (OPE-§12.6): each legacy label mapped by legacyToWanted; a label is legal when
 * every axis move it wants is in legalMoves; impossible ones are hidden; with orders.force_status the others come
 * back under "Force…". `duplicate` lives on the duplicates block (it needs the other order), `new` is never a target.
 */
export function moveEntries(cur: OrderStates, perms: MovePerms): MoveEntry[] {
  const legal = legalMoves(cur, perms);
  const out: MoveEntry[] = [];
  for (const { id } of ORDER_STATUSES) {
    if (id === "new" || id === "duplicate") continue;
    const want = legacyToWanted(id, cur);
    if (want === "noop") continue;
    if (want === "reject") {
      if (perms.force) out.push({ label: id, mode: "force", reason: null });
      continue;
    }
    const axes = Object.entries(want) as [Axis, string][];
    const moves = axes.map(([axis, to]) => legal.find((m) => m.axis === axis && m.to === to));
    if (moves.every(Boolean)) {
      const needs = moves.some((m) => m!.reason);
      out.push({ label: id, mode: "legal", reason: needs ? (axes.some(([a]) => a === "ship") ? "return" : "cancel") : null });
    } else if (perms.force) {
      out.push({ label: id, mode: "force", reason: null });
    }
  }
  return out;
}

/** A selection's common entries (bulk "Move to…"): the labels legal for at least one selected order. */
export function bulkEntries(states: readonly OrderStates[], perms: MovePerms): MoveEntry[] {
  const seen = new Map<OrderStatus, MoveEntry>();
  for (const s of states) for (const e of moveEntries(s, { ...perms, force: false })) if (!seen.has(e.label)) seen.set(e.label, e);
  return ORDER_STATUSES.map((s) => seen.get(s.id)).filter((e): e is MoveEntry => !!e);
}

export type Answer<T> = { ok: true; data: T } | { ok: false; error: string; message?: string };

/**
 * The seam's answer, flattened: `{ ok, data: <domain result> }` where the domain result may itself be an
 * ActionResult (`{ ok, data }` or `{ ok: false, error }`) or a TransitionResult (`{ ok, … }`).
 */
export async function settle<T>(p: Promise<unknown>): Promise<Answer<T>> {
  let res: unknown;
  try {
    res = await p;
  } catch {
    return { ok: false, error: "network" };
  }
  const outer = res as { ok?: boolean; data?: unknown; error?: string; message?: string };
  if (!outer || outer.ok !== true) return { ok: false, error: outer?.error ?? "generic", ...(outer?.message ? { message: outer.message } : {}) };
  const inner = outer.data as { ok?: boolean; data?: unknown; error?: string; message?: string } | null;
  if (inner && typeof inner === "object" && "ok" in inner) {
    if (inner.ok === false) return { ok: false, error: inner.error ?? "generic", ...(inner.message ? { message: inner.message } : {}) };
    return { ok: true, data: ("data" in inner ? inner.data : inner) as T };
  }
  return { ok: true, data: inner as T };
}

/** A browser UUID for the bulk calls' idem (OD36), with a fallback for old engines. */
export function newIdem(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}
