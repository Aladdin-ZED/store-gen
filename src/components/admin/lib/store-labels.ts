/**
 * Display labels of a store's role, state and mode in the dashboard (English in R1, §I.5). Isomorphic.
 */
import type { StoreRole } from "@/lib/auth/permissions";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";
import type { Tone } from "./status";

export const STORE_ROLE_LABELS: Record<StoreRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  editor: "Editor",
  agent: "Call agent",
  logistics: "Logistics",
  accountant: "Accountant",
  viewer: "Viewer",
};

export const STORE_MODE_LABELS: Record<StoreMode, string> = {
  landing: "Landing pages",
  store: "Store",
  both: "Store + landing",
};

/** The state pill of the switcher and the banners; `active` shows none. */
export const STORE_STATUS: Record<StoreStatus, { label: string; tone: Tone } | null> = {
  pending: { label: "In review", tone: "warn" },
  active: null,
  restricted: { label: "Restricted", tone: "rose" },
  suspended: { label: "Suspended", tone: "red" },
  closed: { label: "Closed", tone: "neutral" },
  scheduled_deletion: { label: "Deletion scheduled", tone: "red" },
  purged: { label: "Deleted", tone: "neutral" },
  rejected: { label: "Not approved", tone: "red" },
};

/** One or two letters for a store's tile ("Atlas Home" → "AH"). */
export function storeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0]!, words[words.length - 1]!] : words).map((w) => Array.from(w)[0] ?? "");
  return letters.join("").toUpperCase() || "S";
}
