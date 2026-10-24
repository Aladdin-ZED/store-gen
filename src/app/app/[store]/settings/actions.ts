"use server";
/**
 * Settings mutations of the store on screen (docs/STORE-SAAS.md §I.1 `/app/<h>/settings/*`, §D.10). Every action is
 * `storeAction(permission, …)`: the store is the signed request path's, never the browser's. The forms keep their
 * shapes; each action writes the store's own keys (`store`, `defaults`, `store_ai`, `turnstile`) and row fields
 * (`stores.name`, market, currency, default locale, SET-08), never a platform-wide value (ADM-33, ADM-34). Values are
 * validated by the same schemas as the forms (ZodError → field message); secrets are only ever replaced: a masked
 * value coming back keeps the stored secret.
 *
 * The account's own password, two-step verification and devices live at /app/account (T2), the members at
 * /app/<h>/team (T2).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { getAsset } from "@/lib/media";
import { AUDIT_AREAS, auditPage, type AuditRow } from "@/lib/admin-data/security";
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { updateStoreProfile } from "@/lib/admin-data/store-profile";
import { invalidatePublished } from "@/lib/render/cache.server";
import { getStoreSettings, isMaskedSecret, updateStoreSetting } from "@/lib/settings";
import { redactStoreSetting } from "@/lib/settings/store-registry";
import { AiSettings, DefaultsSettings, StoreSettings, TurnstileSettings, type SettingInput } from "@/lib/settings/schemas";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

const refreshSettings = (handle: string) => revalidateStore(handle, { path: "/settings", type: "layout" }, "");

/* ------------------------------------------------------------------ */
/* store & legal (name, logo, contacts, legal facts, socials)          */
/* ------------------------------------------------------------------ */

/**
 * Settings → Store & legal. The name is the store row's (brand-checked); the logo is the brand key's
 * (`brand.logo.primary`, an asset of this store's library, `brand.write`); the rest is the `store` key. The logo is
 * checked before anything is written, so a refused logo leaves the whole form unsaved.
 */
export async function saveStoreAction(input: SettingInput<"store">): Promise<ActionResult<null>> {
  return storeAction("settings.write", async (ctx) => {
    const v = StoreSettings.parse(input);
    const actor = settingsActor(ctx.actor);
    const writeLogo = await logoWrite(ctx, v.logo?.id ?? null);
    await updateStoreProfile(ctx.scope, ctx.store, { name: v.storeName }, ctx.actor);
    await writeLogo?.();
    await updateStoreSetting(
      ctx.scope,
      "store",
      {
        legalName: v.legalName,
        phone: v.phone,
        whatsapp: v.whatsapp,
        email: v.email,
        address: v.address,
        city: v.city,
        country: v.country,
        ice: v.ice,
        rc: v.rc,
        socials: v.socials,
      },
      actor,
    );
    // legal pages and footers read the store identity at request time
    invalidatePublished();
    refreshSettings(ctx.store.handle);
    return null;
  });
}

/**
 * The checked logo change (null when the logo stays): only with `brand.write`, and only to a file of this store's
 * library. Throws ActionError when refused; the returned write runs after the other checks passed.
 */
async function logoWrite(ctx: WriteCtx, id: string | null): Promise<(() => Promise<unknown>) | null> {
  const { brand } = await getStoreSettings(ctx.scope, ["brand"]);
  if ((brand.logo.primary ?? null) === id) return null;
  if (!ctx.can("brand.write")) fail("Your role can't change the logo.");
  // another store's asset id reads as missing (ids are per store, MED-01)
  if (id && !(await getAsset(ctx.scope, id))) fail("This logo is no longer in the media library. Pick it again.");
  return () => updateStoreSetting(ctx.scope, "brand", { logo: { ...brand.logo, primary: id } }, settingsActor(ctx.actor));
}

/* ------------------------------------------------------------------ */
/* market defaults                                                     */
/* ------------------------------------------------------------------ */

/**
 * Settings → Market defaults. Market, currency and the first page locale are the store row's (SET-08); the phone
 * country, delivery fee and text are the `defaults` key, whose locale order keeps the store's other locales.
 */
export async function saveDefaultsAction(input: SettingInput<"defaults">): Promise<ActionResult<null>> {
  return storeAction("settings.write", async (ctx) => {
    const v = DefaultsSettings.parse(input);
    await updateStoreProfile(ctx.scope, ctx.store, { market: v.market, currency: v.currency, defaultLocale: v.locale }, ctx.actor);
    const { defaults } = await getStoreSettings(ctx.scope, ["defaults"]);
    await updateStoreSetting(
      ctx.scope,
      "defaults",
      {
        locales: [v.locale, ...defaults.locales.filter((l) => l !== v.locale)],
        phoneCountry: v.phoneCountry,
        shippingFee: v.shippingFee,
        deliveryText: v.deliveryText,
      },
      settingsActor(ctx.actor),
    );
    refreshSettings(ctx.store.handle);
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* local AI                                                            */
/* ------------------------------------------------------------------ */

/** Settings → Local AI: the form's `{ enabled, tier, bgRemoval }` are `store_ai`'s local fields (§D.8 step 3). */
export async function saveAiAction(input: SettingInput<"ai">): Promise<ActionResult<null>> {
  return storeAction("settings.write", async (ctx) => {
    const v = AiSettings.parse(input);
    await updateStoreSetting(ctx.scope, "store_ai", { localEnabled: v.enabled, localTierCeiling: v.tier, bgRemoval: v.bgRemoval }, settingsActor(ctx.actor));
    refreshSettings(ctx.store.handle);
    revalidateStore(ctx.store.handle, "/media");
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* anti-spam                                                           */
/* ------------------------------------------------------------------ */

/** Settings → Anti-spam: the store's own Turnstile widget (without one, the platform's applies). Both keys or none. */
export async function saveTurnstileAction(input: Partial<SettingInput<"turnstile">>): Promise<ActionResult<{ siteKey?: string; secretKey?: string }>> {
  return storeAction("settings.write", async (ctx) => {
    const v = TurnstileSettings.partial().parse(input);
    // both keys or none: check the merged result before writing anything
    const { turnstile: current } = await getStoreSettings(ctx.scope, ["turnstile"]);
    const pick = (next: string | undefined, stored: string | undefined) => (next === undefined || isMaskedSecret(next) ? stored : next.trim() || undefined);
    if (!!pick(v.siteKey, current.siteKey) !== !!pick(v.secretKey, current.secretKey)) {
      fail("Add both keys — the site key and the secret key work together.");
    }
    const saved = await updateStoreSetting(ctx.scope, "turnstile", v, settingsActor(ctx.actor));
    invalidatePublished();
    refreshSettings(ctx.store.handle);
    return redactStoreSetting("turnstile", saved);
  });
}

/* ------------------------------------------------------------------ */
/* audit log                                                           */
/* ------------------------------------------------------------------ */

const AuditQuery = z.object({ beforeId: z.number().int().positive().optional(), area: z.enum(AUDIT_AREAS).optional() });

export async function loadAuditAction(opts: { beforeId?: number; area?: string }): Promise<ActionResult<{ items: AuditRow[]; nextBefore: number | null }>> {
  return storeAction("audit.read", async ({ scope }) => {
    const parsed = AuditQuery.parse({ beforeId: opts.beforeId, area: opts.area || undefined });
    return auditPage(scope, { ...parsed, limit: 50 });
  });
}
