import "server-only";
/**
 * Platform settings writes of the console (platform.md PLA-§13.1-§13.3, §M.1 `settings/actions.ts`; core §D.10):
 *
 *   await savePlatformSettings(ctx, { section: "signup", patch: { mode: "approval" } });       // platform.settings
 *   await saveTurnstile(ctx, { siteKey, secretKey });                                         // platform.settings ↑
 *   await saveProtectedBrand(ctx, { term: "cih bank", kind: "bank", match: "substring", active: true });
 *   await checkBrandName(ctx, { value: "CIH Bank · Vérification" });                         // the "Check a name" box
 *
 * One section per save, validated against the whole `platform` schema after the merge (a refused field answers on
 * its path), through `setPlatformSetting` (the one writer; it audits `platform.settings.updated`). The typed
 * confirmations are checked here, on the server: `open` for the sign-up mode Open, `allow orange` for the seller
 * brand colour band. A sign-up mode of Approval or Open needs the platform Turnstile widget (`turnstile_required`,
 * PD68: both modes gate the form on it). The Turnstile secret is never echoed: the answer says "set" or "not set".
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { platformTurnstileKeys } from "@/lib/auth/platform-config";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { protectedBrands } from "@/lib/db/schema";
import { loadHandleLists } from "@/lib/db/store-handles";
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import { PlatformSettingSchema, type PlatformSetting } from "@/lib/settings/keys/platform";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { brandMatches, invalidateProtectedTerms, type BrandMatch } from "./brand-check";
import { recordPlatformError } from "./log";

/** The sections of `/admin/settings/*` (PLA-§13.1, §13.2): each one owns one top-level key of `platform`. */
export const SETTINGS_SECTIONS = {
  brand: "brand",
  new_store: "newStore",
  reserved_handles: "reservedHandles",
  analytics: "analytics",
  legal: "legal",
  seller_colours: "allowSellerBrandOrange",
  signup: "signup",
  health: "health",
  lifecycle: "lifecycle",
} as const satisfies Record<string, keyof PlatformSetting>;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/** The typed words of PLA-§13.1 / §13.2 (case-folded, trimmed). */
export const OPEN_WORD = "open";
export const ORANGE_WORD = "allow orange";

const SettingsInput = z.object({
  section: z.enum(Object.keys(SETTINGS_SECTIONS) as [SettingsSection, ...SettingsSection[]]),
  patch: z.record(z.string(), z.unknown()),
  typed: z.string().max(40).optional(),
});

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const typedIs = (typed: string | undefined, word: string) => typeof typed === "string" && typed.trim().toLowerCase() === word;

/** The leaf paths that differ between two values (`signup.thresholds.holdMin`), at most 50. */
function changedPaths(a: unknown, b: unknown, prefix = "", out: string[] = []): string[] {
  if (out.length >= 50) return out;
  if (isPlainObject(a) && isPlainObject(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefix || "(root)");
  return out;
}

/**
 * `platform.settings` (PLA-§13): one section's patch merged into the stored `platform` value (a nested object of the
 * section merges one level deep, e.g. `signup.thresholds`), the whole value validated, then saved. Answers the changed
 * leaf paths (empty: nothing to save, nothing written).
 */
export async function savePlatformSettings(ctx: PlatformCtx, input: unknown): Promise<{ changed: string[] }> {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ section: "console.settings.invalid" });
  const { section, patch, typed } = parsed.data;
  const key: string = SETTINGS_SECTIONS[section];
  const current = await getPlatformSetting("platform", { fresh: true });
  const next: Record<string, unknown> = structuredClone(current) as Record<string, unknown>;
  const host = next[key];
  if (isPlainObject(host)) {
    // an object section: its fields merged, a nested object one level deeper (`signup.thresholds`); `weights` is replaced
    const merged: Record<string, unknown> = { ...host };
    for (const [k, v] of Object.entries(patch)) merged[k] = k !== "weights" && isPlainObject(v) && isPlainObject(merged[k]) ? { ...(merged[k] as object), ...v } : v;
    next[key] = merged;
  } else {
    // a scalar or list section (`allowSellerBrandOrange`, `reservedHandles`): the patch names the key
    if (!Object.hasOwn(patch, key)) throw new FieldsError({ [key]: "console.settings.invalid" });
    next[key] = patch[key];
  }
  const value = PlatformSettingSchema.safeParse(next);
  if (!value.success) {
    const path = value.error.issues[0]?.path.map(String).join(".") || section;
    throw new FieldsError({ [path]: "console.settings.invalid" });
  }
  const changed = changedPaths(current, value.data);
  if (!changed.length) return { changed };

  // the typed confirmations and the Turnstile gate (server-side, whatever the dialog did)
  if (section === "signup" && value.data.signup.mode !== current.signup.mode) {
    const mode = value.data.signup.mode;
    if (mode === "open" && !typedIs(typed, OPEN_WORD)) throw new FieldsError({ typed: "console.settings.typed_mismatch" });
    if ((mode === "approval" || mode === "open") && !(await platformTurnstileKeys())) throw new AuthRefusal("turnstile_required", "console.settings.turnstile_required");
  }
  if (section === "seller_colours" && value.data.allowSellerBrandOrange && !current.allowSellerBrandOrange && !typedIs(typed, ORANGE_WORD)) {
    throw new FieldsError({ typed: "console.settings.typed_mismatch" });
  }

  await setPlatformSetting("platform", value.data, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
  if (section === "reserved_handles") await loadHandleLists({ fresh: true }).catch((err: unknown) => recordPlatformError("settings reload handle lists", err));
  return { changed };
}

const TurnstileInput = z.object({
  siteKey: z.string().trim().regex(/^[A-Za-z0-9_-]{10,100}$/),
  /** omitted or empty: the stored secret stays */
  secretKey: z.string().trim().max(200).optional(),
});

/** `platform.settings` ↑ (PLA-§13.2 Turnstile tab): the widget keys; the secret is sealed and never answered. */
export async function saveTurnstile(ctx: PlatformCtx, input: unknown): Promise<{ siteKey: string; secret: "set" | "not_set" }> {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  const parsed = TurnstileInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "siteKey")]: "console.turnstile.invalid" });
  const current = await getPlatformSetting("platform_turnstile", { fresh: true });
  const secretKey = parsed.data.secretKey || current.secretKey;
  const secretChanged = !!parsed.data.secretKey && parsed.data.secretKey !== current.secretKey;
  try {
    await setPlatformSetting("platform_turnstile", { siteKey: parsed.data.siteKey, ...(secretKey ? { secretKey } : {}) }, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
  } catch (err) {
    if (err instanceof z.ZodError) throw new FieldsError({ secretKey: "console.turnstile.invalid" });
    throw err;
  }
  await auditFrom(ctx, "platform.settings.updated", { target: "platform_turnstile", meta: { key: "platform_turnstile", section: "turnstile", secretChanged } });
  return { siteKey: parsed.data.siteKey, secret: secretKey ? "set" : "not_set" };
}

/* ------------------------------------------------------------------ */
/* Protected brands (PLA-§13.3)                                        */
/* ------------------------------------------------------------------ */

const BRAND_KINDS = ["brand", "bank", "carrier", "gov", "platform", "offensive"] as const;
const BrandInput = z.object({
  id: z.string().regex(/^[0-9A-Z]{26}$/).optional(),
  term: z.string().trim().min(2).max(60),
  kind: z.enum(BRAND_KINDS),
  match: z.enum(["exact", "substring"]).default("substring"),
  active: z.boolean().default(true),
  note: z.string().trim().max(200).optional(),
});

async function afterBrandWrite(): Promise<void> {
  invalidateProtectedTerms();
  await loadHandleLists({ fresh: true }).catch((err: unknown) => recordPlatformError("brands reload handle lists", err));
}

/**
 * `platform.settings`: adds a term (stored lower-cased) or edits one by id (a seeded row may be disabled and edited,
 * never deleted). A term that exists already answers on the field. Audit `platform.brand_term.saved` (the kind and
 * the match; an offensive term is never written into the meta).
 */
export async function saveProtectedBrand(ctx: PlatformCtx, input: unknown): Promise<{ id: string; created: boolean }> {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
  const parsed = BrandInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "term")]: "console.brands.invalid" });
  const v = parsed.data;
  const term = v.term.toLowerCase();
  const [same] = await db.select({ id: protectedBrands.id }).from(protectedBrands).where(eq(protectedBrands.term, term)).limit(1);
  if (same && same.id !== v.id) throw new FieldsError({ term: "console.brands.exists" });
  let id: string;
  let created = false;
  if (v.id) {
    const [res] = await db.update(protectedBrands).set({ term, kind: v.kind, match: v.match, active: v.active, note: v.note || null }).where(eq(protectedBrands.id, v.id));
    if (res.affectedRows !== 1) {
      const [exists] = await db.select({ id: protectedBrands.id }).from(protectedBrands).where(eq(protectedBrands.id, v.id)).limit(1);
      if (!exists) throw new AuthRefusal("not_found");
    }
    id = v.id;
  } else {
    id = newId();
    await db.insert(protectedBrands).values({ id, term, kind: v.kind, match: v.match, active: v.active, note: v.note || null, addedBy: ctx.user.id });
    created = true;
  }
  await afterBrandWrite();
  await auditFrom(ctx, "platform.brand_term.saved", { target: id, meta: { kind: v.kind, match: v.match, active: v.active, created, ...(v.kind === "offensive" ? {} : { term }) } });
  return { id, created };
}

/** `platform.settings`: deletes a staff-added term; a seeded row (no `added_by`) can only be disabled (`seeded`). */
export async function deleteProtectedBrand(ctx: PlatformCtx, input: unknown): Promise<{ deleted: boolean }> {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
  const parsed = z.object({ id: z.string().regex(/^[0-9A-Z]{26}$/) }).safeParse(input);
  if (!parsed.success) throw new AuthRefusal("not_found");
  const [row] = await db.select({ id: protectedBrands.id, addedBy: protectedBrands.addedBy, kind: protectedBrands.kind }).from(protectedBrands).where(eq(protectedBrands.id, parsed.data.id)).limit(1);
  if (!row) throw new AuthRefusal("not_found");
  if (!row.addedBy) throw new AuthRefusal("invalid", "console.brands.seeded");
  const [res] = await db.delete(protectedBrands).where(eq(protectedBrands.id, row.id));
  if (res.affectedRows !== 1) return { deleted: false };
  await afterBrandWrite();
  await auditFrom(ctx, "platform.brand_term.deleted", { target: row.id, meta: { kind: row.kind } });
  return { deleted: true };
}

/** `platform.settings` (read): the "Check a name" box, the matcher of the write path (`brandMatches`), per field kind. */
export async function checkBrandName(ctx: PlatformCtx, input: unknown): Promise<{ storeName: BrandMatch; handle: BrandMatch }> {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
  const parsed = z.object({ value: z.string().trim().min(1).max(200) }).safeParse(input);
  if (!parsed.success) throw new FieldsError({ value: "console.brands.invalid" });
  const [storeName, handle] = await Promise.all([brandMatches("store_name", parsed.data.value), brandMatches("handle", parsed.data.value)]);
  return { storeName, handle };
}

/* ------------------------------------------------------------------ */
/* Design gates (PLA-§13.1; P6's field group, DES-R8, DES-R15)         */
/* ------------------------------------------------------------------ */

/**
 * `platform.settings`: P6's `platform_design` group saved whole (its own schema validates it; a refused value answers
 * `console.settings.invalid`). Audit `platform.design.changed` with the changed paths (values are thresholds, not
 * secrets). The mirror into the ops flag `design_publish_gates` is P6's (PLA-§12.2), at its merge.
 */
export async function savePlatformDesign(ctx: PlatformCtx, input: unknown): Promise<{ changed: string[] }> {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
  const current = await getPlatformSetting("platform_design", { fresh: true });
  const changed = changedPaths(current, input);
  if (!changed.length) return { changed };
  try {
    await setPlatformSetting("platform_design", input as typeof current, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
  } catch (err) {
    if (err instanceof z.ZodError) throw new FieldsError({ design: "console.settings.invalid" });
    throw err;
  }
  await auditFrom(ctx, "platform.design.changed", { target: "platform_design", meta: { key: "platform_design", changed } });
  return { changed };
}
