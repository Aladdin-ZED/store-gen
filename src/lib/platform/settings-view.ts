import "server-only";
/**
 * The reads of `/admin/settings/{general,signup,brands}` (platform.md PLA-§3.2, §3.3, §13.1-§13.3; PD68, PD70):
 *
 *   const g = await generalSettingsView(ctx);   // the `platform` sections, the handles kept for a store, P6's design value
 *   const s = await signupSettingsView(ctx);    // mode (stored / derived and why), Turnstile set / not set, the D69 meters
 *   const b = await listProtectedBrands(ctx);   // every term, seeded rows marked (disable only)
 *
 * No secret leaves here: the Turnstile secret is "set / not set", the site key is public by design. Each meter is its
 * own panel, so a failing counter never blanks the page.
 */
import { desc, inArray } from "drizzle-orm";
import { listPlatformAudit } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { protectedBrands, users } from "@/lib/db/schema";
import { getPlatformSetting } from "@/lib/settings";
import type { PlatformSetting } from "@/lib/settings/keys/platform";
import type { PlatformDesignSetting } from "@/lib/settings/keys/platform-design";
import { resolveStoreByHandle } from "@/lib/tenancy/public";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { domainStatus } from "./domain-move";
import { optional, panel, type Panel } from "./panel";
import { pendingMediaBudget, todaysSandboxes, type PendingMediaMeter, type SandboxMeter } from "./signup-admin";

const DAY = 86_400_000;

function requireSettings(ctx: PlatformCtx): void {
  if (!ctx.can("platform.settings")) throw new AuthRefusal("forbidden");
}

/** Display names of staff ids (checklist marks, added-by columns); unknown ids are left out. */
export async function staffNames(ids: readonly (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => typeof x === "string" && /^[0-9A-Z]{26}$/.test(x)))].slice(0, 200);
  if (!list.length) return {};
  // tenancy: platform staff names (accounts are platform rows, not store data): the authors of console marks and terms
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/* ------------------------------------------------------------------ */
/* General (PLA-§13.1)                                                 */
/* ------------------------------------------------------------------ */

export interface GeneralSettingsView {
  platform: Pick<PlatformSetting, "brand" | "newStore" | "reservedHandles" | "analytics" | "allowSellerBrandOrange" | "health" | "lifecycle">;
  /** reserved handles a store already uses: "Kept for @x; new stores can't take it" */
  kept: Record<string, string>;
  /** P6's `platform_design` value (null: unreadable) and the design overrides of the last 7 days (null: unknown) */
  design: PlatformDesignSetting | null;
  designOverrides7d: { count: number; capped: boolean } | null;
}

/** `platform.settings`: the General page's values. */
export async function generalSettingsView(ctx: PlatformCtx, now: Date = new Date()): Promise<GeneralSettingsView> {
  requireSettings(ctx);
  const [p, design, overrides] = await Promise.all([
    getPlatformSetting("platform"),
    optional("settings.design", () => getPlatformSetting("platform_design")),
    ctx.can("audit.platform") ? optional("settings.design_overrides", () => listPlatformAudit(ctx, { area: "page.publish.design_override", limit: 200 })) : Promise.resolve(null),
  ]);
  const kept: Record<string, string> = {};
  const found = await Promise.all(p.reservedHandles.slice(0, 100).map((h) => resolveStoreByHandle(h).catch(() => null)));
  p.reservedHandles.slice(0, 100).forEach((h, i) => {
    if (found[i]) kept[h] = found[i]!.handle;
  });
  const since = now.getTime() - 7 * DAY;
  return {
    platform: {
      brand: p.brand,
      newStore: p.newStore,
      reservedHandles: p.reservedHandles,
      analytics: p.analytics,
      allowSellerBrandOrange: p.allowSellerBrandOrange,
      health: p.health,
      lifecycle: p.lifecycle,
    },
    kept,
    design,
    designOverrides7d: overrides ? { count: overrides.filter((r) => r.createdAt.getTime() >= since).length, capped: overrides.length >= 200 && overrides[199]!.createdAt.getTime() >= since } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Sign-up (PLA-§3.2, §3.3, §13.2)                                     */
/* ------------------------------------------------------------------ */

/** Why the automatic mode is what it is (D9): the first unmet condition. */
export type DerivedReason = "domain" | "turnstile" | "v13" | "ready";

export interface SignupSettingsView {
  signup: PlatformSetting["signup"];
  /** the D9 default the addresses imply, and why */
  derived: { mode: "invite" | "approval"; reason: DerivedReason };
  turnstile: { siteKey: string | null; secret: "set" | "not_set"; configured: boolean };
  sandboxes: Panel<SandboxMeter>;
  pendingMedia: Panel<PendingMediaMeter>;
  /** `platform_ai.caps.pendingSharePct` (read-only here, set in AI settings); null when unreadable */
  aiSlicePct: number | null;
}

/** `platform.settings`: the Mode & thresholds and Turnstile tabs. */
export async function signupSettingsView(ctx: PlatformCtx, now: Date = new Date()): Promise<SignupSettingsView> {
  requireSettings(ctx);
  const [p, turnstile, status, sandboxes, pendingMedia, ai] = await Promise.all([
    getPlatformSetting("platform"),
    getPlatformSetting("platform_turnstile"),
    domainStatus(ctx),
    panel("signup.sandboxes", () => todaysSandboxes(now)),
    panel("signup.pending_media", () => pendingMediaBudget()),
    optional("signup.ai_slice", () => getPlatformSetting("platform_ai")),
  ]);
  const configured = Boolean(turnstile.siteKey && turnstile.secretKey);
  const reason: DerivedReason = !status.sMode ? "domain" : !configured ? "turnstile" : !status.signup.v13Passed ? "v13" : "ready";
  const caps = (ai as { caps?: { pendingSharePct?: unknown } } | null)?.caps;
  return {
    signup: p.signup,
    derived: { mode: status.signup.defaultMode, reason },
    turnstile: { siteKey: turnstile.siteKey || null, secret: turnstile.secretKey ? "set" : "not_set", configured },
    sandboxes,
    pendingMedia,
    aiSlicePct: typeof caps?.pendingSharePct === "number" ? caps.pendingSharePct : null,
  };
}

/* ------------------------------------------------------------------ */
/* Protected brands (PLA-§13.3)                                        */
/* ------------------------------------------------------------------ */

export interface ProtectedBrandRow {
  id: string;
  term: string;
  kind: "brand" | "bank" | "carrier" | "gov" | "platform" | "offensive";
  match: "exact" | "substring" | "skeleton";
  active: boolean;
  note: string | null;
  /** null: a seeded row (disable only, never deleted) */
  addedBy: { id: string; name: string | null } | null;
  createdAt: string;
}

/** `platform.settings`: every term, newest first (≤ 1,000; the seed holds about 60). */
export async function listProtectedBrands(ctx: PlatformCtx): Promise<ProtectedBrandRow[]> {
  requireSettings(ctx);
  // tenancy: platform the protected-terms registry (PLA-§2.1 protected_brands: a platform table, no store column)
  const rows = await db.select().from(protectedBrands).orderBy(desc(protectedBrands.createdAt)).limit(1_000);
  const names = await staffNames(rows.map((r) => r.addedBy));
  return rows.map((r) => ({
    id: r.id,
    term: r.term,
    kind: r.kind,
    match: r.match,
    active: r.active,
    note: r.note,
    addedBy: r.addedBy ? { id: r.addedBy, name: names[r.addedBy] ?? null } : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
