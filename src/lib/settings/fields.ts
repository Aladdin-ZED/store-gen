/**
 * Settings building blocks (docs/STORE-SAAS.md §D.10): the field schemas the key files share
 * (src/lib/settings/keys/*.ts), the `SettingDef` entry shape of every registry (platform-registry.ts,
 * store-registry.ts and the legacy SETTINGS of schemas.ts) and the redaction helpers. Isomorphic (no I/O).
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* field schemas                                                       */
/* ------------------------------------------------------------------ */

/** Free text: control characters become spaces, trimmed, then at most `max` characters. */
export const text = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .pipe(z.string().max(max));

export const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** International phone, digits with optional leading + (spaces/dashes/dots allowed on input). */
export const phone = z
  .string()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, { error: "Enter a valid phone number." }));

/** E.164, already normalised (+, no leading 0, 7-15 digits). */
export const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, { error: "Enter the number in international form, e.g. +212612345678." });

export const httpsUrl = z.url({ protocol: /^https$/, error: "Use a full https:// link." }).max(300);

/** Optional field where an empty form value ("") means "not set". */
export const optional = <T extends z.ZodType>(schema: T) => z.union([z.literal("").transform(() => undefined), schema]).optional();

/** Opaque API token / secret (Meta CAPI, TikTok Events API, Turnstile…). */
export const secretToken = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_\-.:|=+/]{8,512}$/, { error: "This doesn't look like a valid token." });

/** An instant as JSON (toISOString(); an explicit offset is accepted too). */
export const isoDateTime = z.iso.datetime({ offset: true });
/** A calendar date, "YYYY-MM-DD" (store-local unless stated). */
export const isoDate = z.iso.date();
/** "HH:MM", 00:00-23:59. */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM, e.g. 09:30." });
/** A ULID (src/lib/db/ids.ts newId). */
export const id26 = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
/** An asset id (hex, the AssetRef id format; per-store ids keep it, D21). */
export const assetId = z.string().regex(/^[a-f0-9]{16,64}$/);
/** ISO 4217 currency code. */
export const currencyCode = z.string().regex(/^[A-Z]{3}$/);

/* ------------------------------------------------------------------ */
/* registry entries                                                    */
/* ------------------------------------------------------------------ */

export interface SettingDef<S extends z.ZodType> {
  schema: S;
  /** whole value stored as an envelope (encrypted = true) and never sent to the browser */
  secret: boolean;
  /** value used when the row is missing or unreadable (computed lazily: may read env) */
  defaults: () => z.input<S>;
  /** fields shown masked in admin UIs (see redactFields) */
  sensitive?: readonly string[];
}

export const def = <S extends z.ZodType>(d: SettingDef<S>) => d;

/* ------------------------------------------------------------------ */
/* redaction                                                           */
/* ------------------------------------------------------------------ */

/** Masked secret preview, e.g. "••••3f9a" (never the full value). */
export function maskSecret(value: string): string {
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
}

/**
 * Copy of a value that is safe to send to the browser: the `sensitive` fields are replaced by a mask (a map of
 * secrets, e.g. a token per pixel id, keeps its keys and masks every value). Forms treat an untouched masked field
 * as "keep the stored secret" (isMaskedSecret).
 */
export function redactFields<T>(value: T, sensitive: readonly string[] | undefined): T {
  if (!sensitive?.length || !value || typeof value !== "object") return value;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const field of sensitive) {
    const v = copy[field];
    if (typeof v === "string" && v) copy[field] = maskSecret(v);
    else if (v && typeof v === "object" && !Array.isArray(v))
      copy[field] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, s]) => [k, typeof s === "string" && s ? maskSecret(s) : s]));
  }
  return copy as T;
}

/** True when a submitted field is the mask produced by redactFields (i.e. unchanged). */
export function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && /^••••[^•]{0,4}$/.test(value);
}
