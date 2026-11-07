/**
 * Customer fields of the store's order, lead and blocklist rows as a scope may see them (docs/STORE-SAAS.md §B.8, D70;
 * PLA-§7.2). Pure and framework-free (the orders self-test runs it without a database): every read repository of
 * src/lib/orders/admin.ts, the dashboard and the ⌘K search returns its rows through `maskCustomer`.
 */
import { maskCustomerFields, maskPhone, type CustomerFieldsIn, type CustomerFieldsMasked } from "@/lib/platform/mask";
import type { StoreScope } from "@/lib/tenancy/types";

/**
 * The scopes whose viewer sees customer fields masked although the scope is a member's (R2 contract step C2-E, core
 * §A.3.2, TN-12): an `accountant` member reads orders "(masked)" and customers "(no phones)". The seam marks the scope it
 * mints for such a membership (`markCustomerMasked`); scopes are frozen objects, so the mark is a WeakSet entry and no
 * scope type changes. The role is granted from R2 only (ROLE_RELEASE), so no R1 scope is ever marked.
 */
const MASKED_VIEWERS = new WeakSet<object>();

/** The seam: this member scope's viewer gets customer fields masked (an accountant, R2). */
export function markCustomerMasked(scope: StoreScope): void {
  MASKED_VIEWERS.add(scope);
}

/** Does this scope see customer fields masked: a staff "view as store" (D70) or a masked viewer (an accountant)? */
export function customerMasked(scope: StoreScope): boolean {
  return scope.kind === "impersonation" || MASKED_VIEWERS.has(scope);
}

/**
 * `maskIfImpersonation` for the viewer (core §A.3.2, TN-12; C2-E): masked under impersonation and for an accountant,
 * unchanged otherwise. The order and customer reads of P4's files call it in place of `maskIfImpersonation`.
 */
export function maskForViewer<T extends CustomerFieldsIn>(scope: StoreScope, row: T): T | (Omit<T, keyof CustomerFieldsIn> & CustomerFieldsMasked) {
  return customerMasked(scope) ? { ...row, ...maskCustomerFields(row) } : row;
}

export type CustomerFields = {
  name?: string | null;
  phone?: string | null;
  /** the number as the customer typed it (orders.phone_raw): as identifying as `phone` */
  phoneRaw?: string | null;
  city?: string | null;
  address?: string | null;
  note?: string | null;
  email?: string | null;
};

/** What an e-mail address shows under impersonation (P1 refines the formats, PLA-§7.2). */
export const HIDDEN_EMAIL = "Hidden";

/**
 * A row's customer fields through `maskForViewer` (D70; R2 C2-E: an accountant too): under a staff "view as store" scope the name, phone
 * (the typed form too), address, note and e-mail are masked (the city stays: it is not identifying alone); every
 * other scope gets the row unchanged. Only the fields the row has are touched, so a partial select keeps its shape.
 */
export function maskCustomer<T extends CustomerFields>(scope: StoreScope, row: T): T {
  if (!customerMasked(scope)) return row;
  const m = maskForViewer(scope, {
    name: row.name ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    landmark: null,
    note: row.note ?? null,
  });
  const out: CustomerFields = { ...row };
  if (row.name != null) out.name = m.name;
  if (row.phone != null) out.phone = m.phone;
  // the typed number shows exactly what the E.164 one shows (it leaked unmasked until test:tenancy caught it)
  if (row.phoneRaw != null) out.phoneRaw = m.phone ?? maskPhone(row.phoneRaw);
  if (row.address != null) out.address = m.address;
  if (row.note != null) out.note = m.note;
  if (row.email != null) out.email = HIDDEN_EMAIL;
  return out as T;
}
