import "server-only";
/**
 * Manual orders and lead conversion (P4 CALL CENTER; operations.md OPE-§11.1, §11.4; docs/STORE-SAAS.md §K.2 P0, D72).
 * Frozen at P0. `createManualOrder` validates against the page's published version with the public form's rules and
 * inserts through `createOrderRow(draft, ctx)` of src/lib/orders/create.ts (the only insert of an order row, never
 * edited here). `convertLeadToOrder` dispatches on `leads.sel.v` (v2 → createManualOrder; v3 → S1's
 * createManualOrderV3 in R2) and then calls P3's `markLeadConverted`.
 *
 * Both take a `WriteCtx` (D71 rev 4: an action whose permissions are all write permissions hands its body one), so
 * the insert needs no cast; OPE-§11.1 writes `StoreCtx`, which predates D71.
 */
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";
import type { UnitIn } from "./contract";

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

/** orders.create; `replayed` when `idem` already names an order of this store. */
export async function createManualOrder(ctx: WriteCtx, input: ManualOrderInput): Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>> {
  void ctx;
  void input;
  throw new Error("not implemented: P4 createManualOrder");
}

/** Pre-fills from the lead, creates with `fromLead`, then `markLeadConverted`; a converted lead answers `already_converted`. */
export async function convertLeadToOrder(ctx: WriteCtx, leadId: string, input: Omit<ManualOrderInput, "fromLead" | "pageId" | "source">): Promise<ActionResult<{ orderId: string }>> {
  void ctx;
  void leadId;
  void input;
  throw new Error("not implemented: P4 convertLeadToOrder");
}
