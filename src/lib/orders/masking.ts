import "server-only";
/**
 * Phone masking (P4 CALL CENTER; operations.md OPE-§8.1, OD11; docs/STORE-SAAS.md §K.2 P0). Server-only: the
 * browser receives masked strings only. Masked = the number's usual format with the first two national digits and
 * the last four visible: "06 •• •• 56 78" in Morocco (the national format, the one agents read), "+33 6 •• •• 56 78"
 * elsewhere (international, since the trunk "0" of "06" is not dialled from abroad). Parsing and formatting through
 * libphonenumber-js "max" metadata, the library of src/lib/markets/phone.ts.
 *
 * Under impersonation the read repositories also call P1's `maskIfImpersonation` (src/lib/platform/mask.ts); no other
 * masking helper is declared in this part (OPE-§8.1, OD61, CRIT14).
 */
import { findPhoneNumbersInText, parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { CountryCode } from "libphonenumber-js/max";

const DOT = "•";
/** the countries whose agents read the national format (the store's own market) */
const NATIONAL_FORMAT: ReadonlySet<string> = new Set(["MA"]);

/** ٠-٩ (U+0660…) and ۰-۹ (U+06F0…) → 0-9, one character for one, so positions in the text stay aligned. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Replaces every digit of `formatted` with "•" except the first `keepFirst` and the last `keepLast` digits; the
 * spacing and signs stay. At least four digits are always hidden (fewer only for numbers of under six digits).
 */
function maskDigits(formatted: string, keepFirst: number, keepLast: number): string {
  const total = formatted.replace(/[^0-9]/g, "").length;
  const hiddenMin = Math.min(4, Math.max(1, total - 2));
  const first = Math.max(0, Math.min(keepFirst, total - hiddenMin - keepLast));
  const last = Math.max(0, Math.min(keepLast, total - hiddenMin - first));
  let i = 0;
  return formatted.replace(/[0-9]/g, (d) => {
    const pos = i++;
    return pos < first || pos >= total - last ? d : DOT;
  });
}

/** "+212612345678" → "06 •• •• 56 78"; other countries: "+33 6 •• •• 56 78". An unparsable value keeps its last 4. */
export function maskPhone(e164: string): string {
  const raw = asciiDigits(String(e164 ?? "").trim());
  // E.164 only: a bare national number has no country to read it in, so it is masked as plain digits
  const p = raw.startsWith("+") ? parsePhoneNumberFromString(raw) : undefined;
  if (!p || !p.isPossible()) {
    const digits = raw.replace(/[^0-9]/g, "");
    return digits.length === 0 ? DOT.repeat(4) : maskDigits(digits, 0, 4);
  }
  const national = p.formatNational();
  // the first two national digits: "06" in Morocco and France, so one national-significant digit after "+33"
  const trunk = Math.max(0, national.replace(/[^0-9]/g, "").length - p.nationalNumber.length);
  if (NATIONAL_FORMAT.has(p.country ?? "")) return maskDigits(national, 2, 4);
  return maskDigits(p.formatInternational(), p.countryCallingCode.length + Math.max(0, 2 - trunk), 4);
}

/** The last four digits of a number ("+212612345678" → "5678"), for "…5678" chips and exact-match hints. */
export function phoneLast4(e164: string): string {
  return asciiDigits(String(e164 ?? "")).replace(/[^0-9]/g, "").slice(-4);
}

/** "+<digits>" or "00<digits>" runs of 9-15 digits: a phone whatever the metadata says (a "+" is a strong signal) */
const INTL_RUN = /(?:\+|\b00)\d(?:[\s.\-() ]*\d){8,14}/g;
/** Moroccan numbers typed with the country code but no "+": "212 6 12 34 56 78", "2126…" */
const MA_BARE_CC = /(?<!\d)212[\s.\-]?0?[5-7](?:[\s.\-]?\d){8}(?!\d)/g;

/**
 * Masks every phone number inside a free text (notes, edit details, imported cells): E.164 and international forms,
 * and the national numbers of `country` (ISO alpha-2) in any spacing, Eastern-Arabic digits included. Valid numbers
 * are found with libphonenumber's matcher (dates, amounts and order ids are not numbers it accepts); any remaining
 * "+" / "00" run of 9-15 digits is masked too.
 */
export function maskPhonesIn(text: string, country: string): string {
  if (!text) return text;
  const folded = asciiDigits(text);
  const cc = country.trim().toUpperCase() as CountryCode;
  const hits: { start: number; end: number; masked: string }[] = [];
  const free = (s: number, e: number) => hits.every((h) => e <= h.start || s >= h.end);
  try {
    for (const m of findPhoneNumbersInText(folded, cc)) hits.push({ start: m.startsAt, end: m.endsAt, masked: maskPhone(m.number.number) });
  } catch {
    // an unknown country: the fallbacks below still run
  }
  const fallback = (re: RegExp, toE164: (s: string) => string) => {
    for (const m of folded.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (!free(start, end)) continue;
      const p = parsePhoneNumberFromString(toE164(m[0]));
      hits.push({ start, end, masked: p && p.isPossible() ? maskPhone(p.number) : maskDigits(m[0], 0, 4) });
    }
  };
  fallback(INTL_RUN, (s) => `+${s.replace(/[^0-9]/g, "").replace(/^00/, "")}`);
  if (cc === "MA") fallback(MA_BARE_CC, (s) => `+${s.replace(/[^0-9]/g, "").replace(/^2120/, "212")}`);
  if (hits.length === 0) return text;
  hits.sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const h of hits) {
    out += text.slice(at, h.start) + h.masked;
    at = h.end;
  }
  return out + text.slice(at);
}
