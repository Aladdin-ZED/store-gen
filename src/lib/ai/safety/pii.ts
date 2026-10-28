/**
 * The PII gate (P7 AI; ai.md AI-§E.2, AI-D13, AI-D31). Isomorphic and pure. Defense in depth behind the structural rule
 * (no task input has a field for a customer's text): every string at a path the task lists in `TaskDef.untrusted` is
 * scanned before a server call, and what looks like contact or payment data is replaced by a placeholder, so a
 * merchant who types the shop's phone into a fact keeps it on the page while the prompt sees `[phone]`.
 *
 * Detected: phone numbers (E.164 and `00` prefixes, Moroccan 05 / 06 / 07 and +212 forms, spaced, dotted or dashed,
 * Western, Arabic-Indic and Persian digits), e-mails, links (scheme, www. or a bare domain), IBANs and 13-19 digit card
 * runs that pass the Luhn check. A field more than 30 % redacted is "mostly PII": the server call is refused
 * (`pii_blocked`) and the ladder moves to local or the library.
 */
import type { AiFlag } from "../provider/types";
import { TASKS, type AiTaskId } from "../tasks";

export type PiiHit = "phone" | "email" | "url" | "iban" | "card";

export interface PiiScan {
  redacted: string;
  hits: PiiHit[];
  /** the share of the original characters that were replaced, 0..1 */
  share: number;
}

/** > 30 % of an untrusted field redacted → `pii_blocked` (AI-§E.2) */
export const PII_BLOCK_SHARE = 0.3;

const TOKEN: Record<PiiHit, string> = { phone: "[phone]", email: "[email]", url: "[link]", iban: "[iban]", card: "[card]" };

/** Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits as ASCII, one code unit each, so offsets are kept. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String.fromCharCode(48 + (c >= 0x06f0 ? c - 0x06f0 : c - 0x0660));
  });
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ISO 13616 mod-97 check over the letters-as-digits form */
function ibanOk(raw: string): boolean {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch.charCodeAt(0);
    const v = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

interface Detector {
  hit: PiiHit;
  re: RegExp;
  accept?: (match: string) => boolean;
}

/** spaces, dots and dashes between digit groups (no slash: "05/06/2024 12:30" is a date, not a number) */
const SEP = "[\\s.\\-]*";
/** In order: e-mails before links (a domain inside an address), cards and IBANs before phones (long digit runs). */
const DETECTORS: readonly Detector[] = [
  { hit: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  {
    hit: "url",
    re: /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|ma|fr|net|org|shop|store|io|co|me|info|biz|app|link|ly|site|online)\b(?:\/[^\s<>"']*)?/gi,
  },
  { hit: "iban", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, accept: ibanOk },
  { hit: "card", re: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g, accept: (m) => luhn(m.replace(/\D/g, "")) },
  {
    hit: "phone",
    // +212 / 00212 / 212 followed by a Moroccan mobile or fixed number, with an optional (0)
    re: new RegExp(`(?<![\\d+])(?:(?:\\+|00)${SEP})?212${SEP}(?:\\(0\\)${SEP})?(?:0${SEP})?[5-7](?:${SEP}\\d){8}(?!\\d)`, "g"),
  },
  // the national form 05 / 06 / 07 + 8 digits
  { hit: "phone", re: new RegExp(`(?<![\\d+])0${SEP}[5-7](?:${SEP}\\d){8}(?!\\d)`, "g") },
  // any other E.164 or 00-prefixed number of 8-15 digits
  { hit: "phone", re: new RegExp(`(?<![\\d\\w])(?:\\+|00)${SEP}\\d(?:${SEP}\\(?\\d\\)?){7,14}(?!\\d)`, "g") },
];

/** Redacts contact and payment data in one string; never throws. */
export function scanPii(text: string): PiiScan {
  if (typeof text !== "string" || text.length === 0) return { redacted: typeof text === "string" ? text : "", hits: [], share: 0 };
  const total = text.length;
  let current = text;
  let replaced = 0;
  const hits = new Set<PiiHit>();
  for (const d of DETECTORS) {
    const norm = asciiDigits(current);
    const ranges: [number, number][] = [];
    d.re.lastIndex = 0;
    for (let m = d.re.exec(norm); m; m = d.re.exec(norm)) {
      if (m[0].length === 0) {
        d.re.lastIndex++;
        continue;
      }
      if (d.accept && !d.accept(m[0])) continue;
      ranges.push([m.index, m.index + m[0].length]);
    }
    if (ranges.length === 0) continue;
    hits.add(d.hit);
    for (let k = ranges.length - 1; k >= 0; k--) {
      const [a, b] = ranges[k];
      replaced += b - a;
      current = current.slice(0, a) + TOKEN[d.hit] + current.slice(b);
    }
  }
  return { redacted: current, hits: [...hits], share: Math.min(1, replaced / total) };
}

/** Each string at a dot path; `a.b[]` walks each item of the array `a.b`, `a[].b` each item's `b`. */
export function stringsAt(input: unknown, path: string): { get(): string; set(v: string): void }[] {
  const parts = path.split(".");
  const out: { get(): string; set(v: string): void }[] = [];
  const walk = (node: unknown, k: number): void => {
    if (node === null || typeof node !== "object") return;
    const raw = parts[k];
    const each = raw.endsWith("[]");
    const name = each ? raw.slice(0, -2) : raw;
    const holder = node as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(holder, name)) return;
    const value = holder[name];
    const last = k === parts.length - 1;
    if (each) {
      if (!Array.isArray(value)) return;
      value.forEach((item, idx) => {
        if (last) {
          if (typeof item === "string") out.push({ get: () => value[idx] as string, set: (v) => (value[idx] = v) });
        } else walk(item, k + 1);
      });
    } else if (last) {
      if (typeof value === "string") out.push({ get: () => holder[name] as string, set: (v) => (holder[name] = v) });
    } else walk(value, k + 1);
  };
  walk(input, 0);
  return out;
}

/** A deep copy of plain JSON data (task inputs are plain data; anything else is kept by reference). */
function cloneData<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => cloneData(x)) as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = cloneData(x);
    return o as T;
  }
  return v;
}

/**
 * The gate one server call passes (AI-§A.4 step 2): every untrusted string of the task is scanned; any hit is replaced
 * and the run flagged `pii_redacted`; a field more than 30 % redacted blocks the call. The input is never mutated.
 */
export function gateInput(task: AiTaskId, input: unknown): { input: unknown; flags: AiFlag[] } | { blocked: true } {
  const copy = cloneData(input);
  let redacted = false;
  for (const path of TASKS[task].untrusted) {
    for (const slot of stringsAt(copy, path)) {
      const scan = scanPii(slot.get());
      if (scan.hits.length === 0) continue;
      if (scan.share > PII_BLOCK_SHARE) return { blocked: true };
      slot.set(scan.redacted);
      redacted = true;
    }
  }
  return { input: copy, flags: redacted ? ["pii_redacted"] : [] };
}
