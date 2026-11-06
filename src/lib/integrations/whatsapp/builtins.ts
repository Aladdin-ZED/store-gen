/**
 * The built-in WhatsApp templates (P5 INTEGRATIONS; operations.md OPE-§22.2, §2.5, OD24, OD34; IN-05, LP-04, SF-01).
 * Code constants, never seeded rows: a store row of the same channel, kind, locale and page overrides one, and no row
 * is written until someone edits (OD24). Addressed as `builtin:<kind>:<locale>`.
 *
 * The bodies are the catalog keys `int.wa.<kind>` of src/lib/i18n/admin/<locale>/integrations.ts, with exactly the
 * OPE-§22.2 texts (natural Darija in ar). They are read raw, never through `t()`: its ICU-lite would fill `{var}`
 * itself. Each locale is read from its own catalog file rather than through `messageOf`, whose English fallback would
 * turn a missing Arabic text into an English message to a Moroccan customer: a missing text is a missing built-in
 * (null), and the self test proves all three locales exist.
 *
 * Every text says only what is on the order or in the store's settings; a timing sentence sits in an optional block
 * around `{eta_text}`, so a store without zones promises nothing (owner rule: never invent).
 */
import { messages as ar } from "@/lib/i18n/admin/ar/integrations";
import { messages as en } from "@/lib/i18n/admin/en/integrations";
import { messages as fr } from "@/lib/i18n/admin/fr/integrations";

/** OPE-§22.2 kinds, in the editor's order. `shipped` is R2 (logistics): present, hidden in R1 screens. */
export const WA_KINDS = ["confirm", "missed_call", "address", "delivery_day", "shipped", "lead_recovery", "thank_you_confirm", "custom"] as const;
export type WaKind = (typeof WA_KINDS)[number];

/** The locales a template exists in (message_templates.locale). */
export const TEMPLATE_LOCALES = ["ar", "fr", "en"] as const;
export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

export interface WaKindInfo {
  /** who sends it (OPE-§22.2 "Used by") */
  usedBy: "agents" | "logistics" | "leads" | "thank_you" | "anyone";
  release: "R1" | "R2";
  /** `custom` has no built-in text: a manager writes it */
  builtin: boolean;
}

export const WA_KIND_INFO: Readonly<Record<WaKind, WaKindInfo>> = {
  confirm: { usedBy: "agents", release: "R1", builtin: true },
  missed_call: { usedBy: "agents", release: "R1", builtin: true },
  address: { usedBy: "agents", release: "R1", builtin: true },
  delivery_day: { usedBy: "agents", release: "R1", builtin: true },
  shipped: { usedBy: "logistics", release: "R2", builtin: true },
  lead_recovery: { usedBy: "leads", release: "R1", builtin: true },
  thank_you_confirm: { usedBy: "thank_you", release: "R1", builtin: true },
  custom: { usedBy: "anyone", release: "R1", builtin: false },
};

/** The kinds an R1 screen lists (`shipped` waits for R2's shipments). */
export const WA_KINDS_R1: readonly WaKind[] = WA_KINDS.filter((k) => WA_KIND_INFO[k].release === "R1");

export const isWaKind = (kind: string): kind is WaKind => (WA_KINDS as readonly string[]).includes(kind);
export const isTemplateLocale = (locale: string): locale is TemplateLocale => (TEMPLATE_LOCALES as readonly string[]).includes(locale);

/** A page locale without templates of its own ("es", "de", …) reads the English texts, like the admin catalogs. */
export function templateLocaleOf(locale: string): TemplateLocale {
  return isTemplateLocale(locale) ? locale : "en";
}

export type BuiltinId = `builtin:${WaKind}:${TemplateLocale}`;

export interface BuiltinTemplate {
  id: BuiltinId;
  channel: "whatsapp";
  kind: WaKind;
  locale: TemplateLocale;
  body: string;
}

const CATALOG: Readonly<Record<TemplateLocale, Partial<Record<string, string>>>> = { ar, fr, en };

export function builtinId(kind: WaKind, locale: TemplateLocale): BuiltinId {
  return `builtin:${kind}:${locale}`;
}

/** `builtin:<kind>:<locale>` → its parts; null for anything else (a row id, a forged kind). */
export function parseBuiltinId(id: string): { kind: WaKind; locale: TemplateLocale } | null {
  const [, kind, locale] = /^builtin:([a-z_]{1,40}):([a-z]{2})$/.exec(id) ?? [];
  if (!kind || !locale || !isWaKind(kind) || !isTemplateLocale(locale)) return null;
  return { kind, locale };
}

/** The raw built-in body of `kind` in `locale` (the locale's own catalog, no fallback); null for `custom`. */
export function builtinTemplate(kind: WaKind, locale: TemplateLocale): BuiltinTemplate | null {
  if (!WA_KIND_INFO[kind].builtin) return null;
  const body = CATALOG[locale][`int.wa.${kind}`];
  if (!body) return null;
  return { id: builtinId(kind, locale), channel: "whatsapp", kind, locale, body };
}
