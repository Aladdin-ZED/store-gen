/**
 * The logistics import kinds (operations.md OPE-§17.4, §18.3; S4 LOGISTICS owns `src/lib/shipping/**` in R2): what each
 * mapped row of a carrier `tracking` or `status` file does. S3 MONEY's import framework (src/lib/imports/registry.ts)
 * imports `logisticsImportKinds` and runs them through its upload → detect → map → preview → commit flow; S3 owns the
 * run, S4 owns the rows. The contract step (C2-C) froze the export names and their shape (`ImportKindDef`).
 *
 * Rules S4's bodies keep (frozen with the names): `tracking` sets the shipment tracking (`order_id`, `tracking`,
 * `carrier_status`); `status` moves the ship axis through `applyExternalStatus` with `src.kind = "import"` (=
 * `actor_kind 'api'`, hand-set under AI R45: a store-uploaded carrier file is never carrier evidence), a coded
 * `returnReason` and the carrier's "reporté au" date; an event without a date is dated from the run's `createdAt`
 * (deterministic); idempotent by tracking + carrier status + `at`; never backwards on the ship axis.
 * Stubs until S4 merges: `preview` / `commitSlice` throw `NotBuiltYet("S4", …)`, which S3 answers as
 * `kind_unavailable`. No R1 path imports this file.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { ImportKindDef } from "@/lib/imports/registry";

/** Carrier tracking numbers per order (OPE-§18.3 `tracking`). S4 (stub: NotBuiltYet). */
export const trackingImportKind: ImportKindDef = {
  kind: "tracking",
  permission: "shipments.write",
  feature: null,
  fields: { required: ["order_id", "tracking"], optional: ["carrier_status"] },
  async preview() {
    return notBuiltYet("S4", "trackingImportKind.preview");
  },
  async commitSlice() {
    return notBuiltYet("S4", "trackingImportKind.commitSlice");
  },
};

/** Carrier statuses (OPE-§18.3 `status`, mapped through the account's `statusMap`). S4 (stub: NotBuiltYet). */
export const statusImportKind: ImportKindDef = {
  kind: "status",
  permission: "shipments.write",
  feature: null,
  fields: { required: [["tracking", "order_id"], "carrier_status"], optional: ["at", "postponed_to"] },
  async preview() {
    return notBuiltYet("S4", "statusImportKind.preview");
  },
  async commitSlice() {
    return notBuiltYet("S4", "statusImportKind.commitSlice");
  },
};

/** S4's kinds, in the order the import screen lists them. */
export const logisticsImportKinds: readonly ImportKindDef[] = [trackingImportKind, statusImportKind];
