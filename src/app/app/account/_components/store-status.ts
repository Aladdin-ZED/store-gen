/**
 * The pill tone of a store state (the picker, the account's store list, the team page). Isomorphic, pure.
 * The labels are the catalog's `app.status.<status>`.
 */
import type { PillTone } from "@/app/(public)/_components/kit";
import type { StoreStatus } from "@/lib/tenancy/types";

export function storeStatusTone(status: StoreStatus): PillTone {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "info";
    case "restricted":
      return "warn";
    case "suspended":
    case "closed":
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}
