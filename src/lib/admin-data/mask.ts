/**
 * Customer fields of the store's order, lead and blocklist rows as a scope may see them (docs/STORE-SAAS.md §B.8, D70;
 * PLA-§7.2). Pure and framework-free (the orders self-test runs it without a database): every read repository of
 * src/lib/orders/admin.ts, the dashboard and the ⌘K search returns its rows through `maskCustomer`.
 */
import { maskIfImpersonation, maskPhone } from "@/lib/platform/mask";
import type { StoreScope } from "@/lib/tenancy/types";

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
 * A row's customer fields through `maskIfImpersonation` (D70): under a staff "view as store" scope the name, phone
 * (the typed form too), address, note and e-mail are masked (the city stays: it is not identifying alone); every
 * other scope gets the row unchanged. Only the fields the row has are touched, so a partial select keeps its shape.
 */
export function maskCustomer<T extends CustomerFields>(scope: StoreScope, row: T): T {
  if (scope.kind !== "impersonation") return row;
  const m = maskIfImpersonation(scope, {
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
