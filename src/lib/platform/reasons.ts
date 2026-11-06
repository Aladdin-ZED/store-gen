/**
 * Store status reason codes (platform.md PLA-§8.2): what a lifecycle dialog's `ReasonPicker` offers per edge and what
 * `stores.status_reason` (varchar 40) stores. Pure and isomorphic.
 *
 * Copy: `console.reason.<code>` is the staff label (P1's src/lib/i18n/admin/<locale>/console.ts) and
 * `shell.status_reason.<code>` the sentence the store reads (P2's shell catalog, ar / fr / en). An `other` reason
 * always needs a note (PLA-§8.1).
 */

export const RESTRICT_REASONS = ["fake_orders", "customer_complaints", "policy_review", "brand_complaint", "other"] as const;
export const SUSPEND_REASONS = ["scam_suspected", "phishing", "prohibited_goods", "counterfeit", "legal_request", "security_incident", "owner_banned", "other"] as const;
export const RESTORE_REASONS = ["issue_resolved", "appeal_accepted", "mistake", "other"] as const;
export const CLOSE_REASONS = ["owner_request", "abandoned", "terms_violation", "other"] as const;
export const DELETION_REASONS = ["owner_request", "retention", "terms_violation", "other"] as const;
export const PURGE_REASONS = ["legal_request", "owner_request_urgent", "abuse", "other"] as const;

/** Codes written by the queue, the console's store creation and the system (never offered in a ReasonPicker). */
export const SYSTEM_REASONS = ["approved", "rejected", "appeal", "console_created", "owner_closed", "expired"] as const;

export type StoreStatusReason =
  | (typeof RESTRICT_REASONS)[number]
  | (typeof SUSPEND_REASONS)[number]
  | (typeof RESTORE_REASONS)[number]
  | (typeof CLOSE_REASONS)[number]
  | (typeof DELETION_REASONS)[number]
  | (typeof PURGE_REASONS)[number]
  | (typeof SYSTEM_REASONS)[number];

/** Every code once, in the order above (the copy tests walk this list). */
export const STORE_STATUS_REASONS: readonly StoreStatusReason[] = (
  [...RESTRICT_REASONS, ...SUSPEND_REASONS, ...RESTORE_REASONS, ...CLOSE_REASONS, ...DELETION_REASONS, ...PURGE_REASONS, ...SYSTEM_REASONS] as StoreStatusReason[]
).filter((code, i, all) => all.indexOf(code) === i);

/** The lists a ReasonPicker offers, by console action family (PLA-§8.1). */
export const REASONS_BY_ACTION = {
  restrict: RESTRICT_REASONS,
  suspend: SUSPEND_REASONS,
  restore: RESTORE_REASONS,
  close: CLOSE_REASONS,
  deletion: DELETION_REASONS,
  purge: PURGE_REASONS,
} as const satisfies Record<string, readonly StoreStatusReason[]>;
export type ReasonAction = keyof typeof REASONS_BY_ACTION;

const ALL: ReadonlySet<string> = new Set(STORE_STATUS_REASONS);

export function isStoreStatusReason(value: unknown): value is StoreStatusReason {
  return typeof value === "string" && ALL.has(value);
}

/** Is `code` one of the reasons `action` offers? (A dialog posts a code; the server re-checks it against the edge.) */
export function isReasonFor(action: ReasonAction, code: unknown): code is StoreStatusReason {
  return typeof code === "string" && (REASONS_BY_ACTION[action] as readonly string[]).includes(code);
}

/** An `other` reason needs a note (PLA-§8.1). */
export function reasonNeedsNote(code: StoreStatusReason): boolean {
  return code === "other";
}

/** The staff label key. */
export function reasonLabelKey(code: StoreStatusReason): `console.reason.${StoreStatusReason}` {
  return `console.reason.${code}`;
}

/** The store-facing sentence key (P2's catalog). */
export function reasonSentenceKey(code: StoreStatusReason): `shell.status_reason.${StoreStatusReason}` {
  return `shell.status_reason.${code}`;
}
