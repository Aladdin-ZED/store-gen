/**
 * Masking (docs/STORE-SAAS.md §B.8, §F.11, D70; platform.md PLA-§7.2, PD2, PD35, PD69). Pure and isomorphic, with no
 * import beyond types. Two jobs:
 *
 * - Customer data. Masking is a property of the scope, not of components: every order, lead and customer read
 *   repository returns its rows through `maskIfImpersonation(scope, row)`, so under a read-only staff impersonation
 *   (`scope.kind === "impersonation"`) the tenant UI, the ⌘K provider and the queue render masked names, phones,
 *   addresses, landmarks and notes with no per-component work; the console's own projections (`profile/**`) call the
 *   `mask*` functions for every role. The console's per-order `pii.reveal` ↑ is the only unmasking path.
 * - Seller contact (PD35): `sellerContact(role, …)` shows a seller's e-mail and phone in full to admin and super_admin
 *   and masked to support and analyst.
 *
 *   maskPhone("+212612345634")        // "+2126 ••••••34" (C0a's format until CCR r1-p1-2, then "+212 6•• ••• •34")
 *   maskEmail("salma.b@gmail.com")    // "s•••@gmail.com"
 *   maskName("Salma Benali")          // "Salma B."
 *   maskIp("196.200.12.7")            // "196.200.•.•"
 *
 * Masked values are only ever read by staff (the console and impersonation), whose screens are English in R1 (PD9),
 * so the fixed words ("address hidden", "Hidden") are English. C0a wrote the first masking here (the R1.0 exit suite
 * runs impersonation with masked canaries); P1 owns the file and refines it behind the frozen signatures
 * (src/lib/contracts/r1-p0.ts: `Masked`, `maskPhone`, `CustomerFieldsIn`, `maskCustomerFields`, `maskIfImpersonation`).
 */
import type { PlatformRole } from "@/lib/auth/permissions";
import type { StoreScope } from "@/lib/tenancy/types";

declare const MASKED: unique symbol;
/** Components accept Masked where PII could appear. */
export type Masked = string & { readonly [MASKED]: true };

const masked = (value: string) => value as Masked;
const DOT = "•";

/**
 * The country calling code at the start of an E.164 digit string (ITU-T E.164: the codes are prefix-free): 1 and 7
 * are one digit, the two-digit set below, everything else three ("212" Morocco, "213", "971", …).
 */
const TWO_DIGIT_CODES: ReadonlySet<string> = new Set([
  "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55",
  "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
]);
function callingCodeLength(digits: string): number {
  if (digits[0] === "1" || digits[0] === "7") return 1;
  return TWO_DIGIT_CODES.has(digits.slice(0, 2)) ? 2 : 3;
}

/** "6••••••34" in groups of three ("6•• ••• •34"); a lone last character joins the group before it. */
function groupThrees(value: string): string {
  const chars = Array.from(value);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += 3) groups.push(chars.slice(i, i + 3).join(""));
  if (groups.length > 1 && groups[groups.length - 1]!.length === 1) groups[groups.length - 2] += groups.pop()!;
  return groups.join(" ");
}

/**
 * "+212612345634" → "+212 6•• ••• •34" (PLA-§7.2): the country calling code, the first national digit and the last
 * two digits; the rest masked, in groups of three. A national number (no "+") keeps its first digit and last two the
 * same way; fewer than 7 digits in all → "••••••".
 */
export function maskPhoneGrouped(e164: string): Masked {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 7) return masked(DOT.repeat(6));
  const international = e164.trim().startsWith("+");
  const cc = international ? digits.slice(0, callingCodeLength(digits)) : "";
  const national = digits.slice(cc.length);
  const body = groupThrees(`${national[0]}${DOT.repeat(Math.max(0, national.length - 3))}${national.slice(-2)}`);
  return masked(cc ? `+${cc} ${body}` : body);
}

/**
 * C0a's format: "+212612345634" → "+2126 ••••••34" (the first four digits and the last two). The R1.0 orders selftest
 * (src/lib/orders/selftest.ts, read-only for P1) pins it on three lines, so it stays live until CCR r1-p1-2 updates
 * those lines in the same commit that sets `PHONE_FORMAT` to "grouped".
 */
function maskPhoneC0a(e164: string): Masked {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 7) return masked(DOT.repeat(6));
  return masked(`+${digits.slice(0, 4)} ${DOT.repeat(digits.length - 6)}${digits.slice(-2)}`);
}

/** The one switch of CCR r1-p1-2: "grouped" is PLA-§7.2's format. */
export const PHONE_FORMAT: "c0a" | "grouped" = "c0a";

/** Every masked phone of the platform (customers, sellers, impersonation): the format `PHONE_FORMAT` names. */
export function maskPhone(e164: string): Masked {
  return PHONE_FORMAT === "grouped" ? maskPhoneGrouped(e164) : maskPhoneC0a(e164);
}

/** "salma.b@gmail.com" → "s•••@gmail.com" (PLA-§7.2): the first character of the local part and the whole domain. */
export function maskEmail(email: string): Masked {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return masked(DOT.repeat(3));
  return masked(`${Array.from(value)[0]}${DOT.repeat(3)}@${value.slice(at + 1).toLowerCase()}`);
}

/** "Salma Benali" → "Salma B."; one word → its first letter + "•••"; nothing → "•••". */
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

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** The eight 16-bit groups of an IPv6 address ("::" expanded, a zone id dropped), or null when it is not one. */
function ipv6Groups(ip: string): string[] | null {
  const value = ip.split("%")[0]!.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(value) || value.split("::").length > 2) return null;
  const parts = (s: string) => (s === "" ? [] : s.split(":"));
  const [head, tail] = value.includes("::") ? [parts(value.split("::")[0]!), parts(value.split("::")[1]!)] : [parts(value), null];
  // an embedded IPv4 tail ("::ffff:196.200.1.2") stands for two groups
  const width = (list: string[]) => list.reduce((n, g) => n + (g.includes(".") ? 2 : 1), 0);
  const fill = tail === null ? 0 : 8 - width(head) - width(tail);
  if (tail === null ? width(head) !== 8 : fill < 1) return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...(tail ?? [])];
  return all.every((g) => /^[0-9a-f]{1,4}$/.test(g) || IPV4_RE.test(g)) ? all : null;
}

/**
 * IPv4 "196.200.12.7" → "196.200.•.•"; IPv6 → the first three groups + "::•" ("2001:db8:85a3::•"); an IPv4-mapped
 * IPv6 address masks as its IPv4; null or anything else → "•••".
 */
export function maskIp(ip: string | null): Masked {
  const value = ip?.trim() ?? "";
  const v4 = IPV4_RE.exec(value);
  if (v4 && v4.slice(1).every((o) => Number(o) <= 255)) return masked(`${v4[1]}.${v4[2]}.${DOT}.${DOT}`);
  const groups = value.includes(":") ? ipv6Groups(value) : null;
  if (!groups) return masked(DOT.repeat(3));
  const last = groups[groups.length - 1]!;
  if (IPV4_RE.test(last) && groups.slice(0, 5).every((g) => /^0+$/.test(g)) && groups[5] === "ffff") return maskIp(last);
  return masked(`${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::${DOT}`);
}

/**
 * A seller's own contact data (PD35): in full for admin and super_admin, who reach sellers on WhatsApp; masked for
 * support and analyst. Customer data is never shown through this (masked for every role, PD2).
 */
export function sellerContact(role: PlatformRole, v: { email: string; phone: string | null }): { email: string | Masked; phone: string | Masked | null } {
  if (role === "super_admin" || role === "admin") return { email: v.email, phone: v.phone };
  return { email: maskEmail(v.email), phone: v.phone === null ? null : maskPhone(v.phone) };
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

/** maskName / maskPhone / maskAddress; landmark and note → "Hidden"; the city stays; null stays null. */
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
