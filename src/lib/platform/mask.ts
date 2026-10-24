/**
 * Customer data masking (docs/STORE-SAAS.md §B.8, D70; platform.md PLA-§7.2, PD69). Pure and isomorphic. Masking is a
 * property of the scope, not of components: every order, lead and customer read repository returns its rows through
 * `maskIfImpersonation(scope, row)`, so under a read-only staff impersonation (`scope.kind === "impersonation"`) the
 * tenant UI, the ⌘K provider and the queue render masked names, phones, addresses, landmarks and notes with no
 * per-component work. The console's per-order `pii.reveal` ↑ is the only unmasking path.
 *
 * P1 owns the file (frozen at P0). C0a writes the masking itself rather than an identity stub, because the R1.0 exit
 * attack suite runs impersonation with masked canaries before P1 merges (§K.1 exit criterion 2): an identity mask
 * would let them through. P1 refines the formats (locale texts, maskEmail, maskIp, sellerContact).
 */
import type { StoreScope } from "@/lib/tenancy/types";

declare const MASKED: unique symbol;
/** Components accept Masked where PII could appear. */
export type Masked = string & { readonly [MASKED]: true };

const masked = (value: string) => value as Masked;
const DOT = "•";

/** "+212612345634" → "+2126 ••••••34": the first four digits (country code and the first national digit) and the last two. */
export function maskPhone(e164: string): Masked {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 7) return masked(DOT.repeat(6));
  return masked(`+${digits.slice(0, 4)} ${DOT.repeat(digits.length - 6)}${digits.slice(-2)}`);
}

/** "Salma Benali" → "Salma B."; one word → its first letter + "•••". */
export function maskName(name: string): Masked {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return masked(DOT.repeat(3));
  if (words.length === 1) return masked(`${Array.from(words[0]!)[0]}${DOT.repeat(3)}`);
  return masked(`${words[0]} ${Array.from(words[words.length - 1]!)[0]}.`);
}

/** "Casablanca · address hidden"; no city → "Address hidden". */
export function maskAddress(city: string | null): Masked {
  const c = city?.trim();
  return masked(c ? `${c} · address hidden` : "Address hidden");
}

const HIDDEN = masked("Hidden");

export interface CustomerFieldsIn {
  name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  landmark: string | null;
  note: string | null;
}
export type CustomerFieldsMasked = {
  name: Masked | null;
  phone: Masked | null;
  address: Masked | null;
  city: string | null; // the city stays: it is not identifying alone
  landmark: Masked | null;
  note: Masked | null;
};

export function maskCustomerFields(f: CustomerFieldsIn): CustomerFieldsMasked {
  return {
    name: f.name === null ? null : maskName(f.name),
    phone: f.phone === null ? null : maskPhone(f.phone),
    address: f.address === null ? null : maskAddress(f.city),
    city: f.city,
    landmark: f.landmark === null ? null : HIDDEN,
    note: f.note === null ? null : HIDDEN,
  };
}

/** Masked under an impersonation scope; the identity for member, public, system and platform scopes. */
export function maskIfImpersonation<T extends CustomerFieldsIn>(scope: StoreScope, row: T): T | (Omit<T, keyof CustomerFieldsIn> & CustomerFieldsMasked) {
  return scope.kind === "impersonation" ? { ...row, ...maskCustomerFields(row) } : row;
}
