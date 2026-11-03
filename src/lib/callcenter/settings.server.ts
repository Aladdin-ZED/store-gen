import "server-only";
/**
 * Call-centre settings writes (P4 CALL CENTER; operations.md OPE-§5.5, §6.2, §7.4, §M.3 team rows, OD54, OD57, OD63,
 * OPS-28; core D73): every function writes the `ops` key and nothing else (no `store`, no `policies`: the hours keys
 * there no longer exist), marks Store Health dirty and audits `callcenter.settings.updated` with the field names
 * (the settings layer adds its own `store.settings.updated`). The server actions of `/team/callcenter` and P3's
 * "After the order" card (through `CallingWindowEditor`) are thin wrappers over these.
 *
 *   saveCallingWindow     `ops.callingWindow` (ISO weekdays 1-7, ≤ 3 ranges a day, ≤ 60 closed dates) + `savedAt =
 *                         now`: the owner's confirmation that turns shopper promises on (OD63, "Use these hours")
 *   saveOpsSettings       the ladder, retries, lease, rescue, assignment, targets, aliases and, when given, the window
 *   openCallsNow          `openOverrideUntil = now + 2 h` (the board's "Open calls now"); audit `callcenter.calls_opened`
 *   saveWindowOverrides   `ops.windowOverrides`: ≤ 4 dated schedules, non-overlapping, ISO weekday keys (OD57)
 *   updateAgentProfile    a member's daily cap (empty = none) and round-robin weight 1-5 (`agent_profiles`)
 *
 * Templates (`call_script` rows of `message_templates`, OPE-§7.4): saveScript, resetScript, approveScriptDraft; agents
 * only ever see `active` rows, a draft becomes active only through a manager's Approve (the previous active row of the
 * same page and language is archived), and at most 100 template rows exist per store (OPE-§L).
 */
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { agentProfiles, messageTemplates, pages, storeMembers } from "@/lib/db/schema";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { updateStoreSetting } from "@/lib/settings";
import { OpsSetting, WeekRanges } from "@/lib/settings/keys/ops";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";
import { affectedRows, opsNow } from "./presence";
import { isScriptLocale, ScriptDoc, type ScriptLocale } from "./script";

const ID26_RE = /^[0-9A-Z]{26}$/;
export const OPEN_CALLS_MS = 2 * 3_600_000;
export const TEMPLATES_MAX = 100;

/* ------------------------------------------------------------------ */
/* the ops key                                                         */
/* ------------------------------------------------------------------ */

/** The window as the editor sends it (savedAt is the server's). */
export const CallingWindowInput = z.strictObject({
  days: WeekRanges,
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).default([]),
});
export type CallingWindowInput = z.input<typeof CallingWindowInput>;

/** A range must start before it ends unless it crosses midnight on purpose (from > to); an empty range is refused. */
function rangesOk(days: z.output<typeof WeekRanges>): boolean {
  return Object.values(days).every((list) => list.every((r) => r.from !== r.to));
}

async function writeOps(ctx: WriteCtx, patch: Partial<z.input<typeof OpsSetting>>, fields: string[], action = "callcenter.settings.updated"): Promise<void> {
  await updateStoreSetting(ctx.scope, "ops", patch, settingsActor(ctx.actor));
  await markHealthDirty(ctx.store.id);
  await auditFrom(ctx, action, { target: "ops", meta: { fields } });
}

/** callcenter.configure: the calling window and `savedAt = now` (OD63), the ops key only. */
export async function saveCallingWindow(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ savedAt: string }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const parsed = CallingWindowInput.safeParse(input);
  if (!parsed.success || !rangesOk(parsed.data.days)) return { ok: false, error: "invalid" };
  const savedAt = opsNow().toISOString();
  await writeOps(ctx, { callingWindow: { days: parsed.data.days, closedDates: [...new Set(parsed.data.closedDates)].sort(), savedAt } }, ["callingWindow"]);
  return { ok: true, data: { savedAt } };
}

/** The fields `/team/callcenter` edits in one save (the window, overrides, labels and the Carrier file have their own). */
export const OpsSettingsInput = z.strictObject({
  callingWindow: CallingWindowInput.optional(),
  ladder: OpsSetting.shape.ladder.optional(),
  busyRetryMinutes: OpsSetting.shape.busyRetryMinutes.optional(),
  unreachable: OpsSetting.shape.unreachable.optional(),
  keepOpenDays: OpsSetting.shape.keepOpenDays.optional(),
  leaseMinutes: OpsSetting.shape.leaseMinutes.optional(),
  rescue: z.strictObject({ maxCalls: z.number().int().min(0).max(5), retryMinutes: z.number().int().min(15).max(240) }).optional(),
  callbackGraceMinutes: OpsSetting.shape.callbackGraceMinutes.optional(),
  assignment: OpsSetting.shape.assignment.optional(),
  rebalanceMinutes: OpsSetting.shape.rebalanceMinutes.optional(),
  duplicateWindowDays: OpsSetting.shape.duplicateWindowDays.optional(),
  firstTouchTargetMin: OpsSetting.shape.firstTouchTargetMin.optional(),
  agentHistoryDays: OpsSetting.shape.agentHistoryDays.optional(),
  cityAliases: OpsSetting.shape.cityAliases.optional(),
});

/** callcenter.configure: the call-centre settings (the ops key only, CRIT2); a window in the save sets `savedAt`. */
export async function saveOpsSettings(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ fields: string[] }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const parsed = OpsSettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { callingWindow, ...rest } = parsed.data;
  if (callingWindow && !rangesOk(callingWindow.days)) return { ok: false, error: "invalid" };
  const patch: Partial<z.input<typeof OpsSetting>> = { ...rest };
  if (callingWindow) patch.callingWindow = { days: callingWindow.days, closedDates: [...new Set(callingWindow.closedDates)].sort(), savedAt: opsNow().toISOString() };
  const fields = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
  if (!fields.length) return { ok: true, data: { fields: [] } };
  await writeOps(ctx, patch, fields);
  return { ok: true, data: { fields } };
}

/** callcenter.configure: "Open calls now" for 2 hours (the queue calls outside the window until then). */
export async function openCallsNow(ctx: WriteCtx): Promise<ActionResult<{ until: string }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const until = new Date(opsNow().getTime() + OPEN_CALLS_MS).toISOString();
  await writeOps(ctx, { openOverrideUntil: until }, ["openOverrideUntil"], "callcenter.calls_opened");
  return { ok: true, data: { until } };
}

/** callcenter.configure: the dated schedules (≤ 4, non-overlapping, ISO weekday keys); nothing else is written. */
export async function saveWindowOverrides(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ count: number }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const parsed = OpsSetting.shape.windowOverrides.safeParse(input);
  if (!parsed.success || !parsed.data.every((o) => rangesOk(o.days))) return { ok: false, error: "invalid" };
  await writeOps(ctx, { windowOverrides: parsed.data }, ["windowOverrides"]);
  return { ok: true, data: { count: parsed.data.length } };
}

/* ------------------------------------------------------------------ */
/* agent profiles (OPE-§14.2)                                          */
/* ------------------------------------------------------------------ */

export const AgentProfileInput = z.strictObject({
  dailyCap: z.number().int().min(1).max(1_000).nullable(),
  weight: z.number().int().min(1).max(5),
});

/** callcenter.configure: a call taker's daily cap and weight; another store's member answers not_found. */
export async function updateAgentProfile(ctx: WriteCtx, userId: string, input: unknown): Promise<ActionResult<{ userId: string; dailyCap: number | null; weight: number }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const parsed = AgentProfileInput.safeParse(input);
  if (!parsed.success || !ID26_RE.test(userId)) return { ok: false, error: "invalid" };
  const [m] = await db
    .select({ role: storeMembers.role })
    .from(storeMembers)
    .where(whereStore(storeMembers, ctx.scope, eq(storeMembers.userId, userId), eq(storeMembers.status, "active")))
    .limit(1);
  if (!m || !can(m.role, "agents.self")) return { ok: false, error: "not_found" };
  const { dailyCap, weight } = parsed.data;
  await db
    .insert(agentProfiles)
    .values(storeValues(ctx.scope, { userId, dailyCap, weight }))
    .onDuplicateKeyUpdate({ set: { dailyCap, weight } });
  await auditFrom(ctx, "callcenter.agent.updated", { target: userId, meta: { dailyCap, weight } });
  return { ok: true, data: { userId, dailyCap, weight } };
}

/* ------------------------------------------------------------------ */
/* call scripts (OPE-§7.4)                                             */
/* ------------------------------------------------------------------ */

export const ScriptInput = z.strictObject({
  pageId: z.string().regex(ID26_RE).nullable(),
  locale: z.enum(["ar", "fr", "en"]),
  doc: ScriptDoc,
});

/** The page belongs to the store (null = "Every page"). */
async function pageOk(ctx: WriteCtx, pageId: string | null): Promise<boolean> {
  if (pageId === null) return true;
  const [p] = await db.select({ id: pages.id }).from(pages).where(byId(pages, ctx.scope, pageId)).limit(1);
  return !!p;
}

const scriptOf = (pageId: string | null, locale: ScriptLocale) =>
  and(eq(messageTemplates.channel, "call_script"), eq(messageTemplates.locale, locale), pageId === null ? isNull(messageTemplates.pageId) : eq(messageTemplates.pageId, pageId));

/** callcenter.configure: the manager's script for (page or every page, language) becomes the active one. */
export async function saveScript(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const parsed = ScriptInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { pageId, locale, doc } = parsed.data;
  if (!(await pageOk(ctx, pageId))) return { ok: false, error: "not_found" };
  const body = JSON.stringify(doc);
  const id = await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: messageTemplates.id })
      .from(messageTemplates)
      .where(whereStore(messageTemplates, ctx.scope, scriptOf(pageId, locale), eq(messageTemplates.status, "active")))
      .for("update");
    const [keep, ...extra] = active;
    if (keep) {
      await tx.update(messageTemplates).set({ body, source: "user", promptVersion: null, updatedBy: ctx.user.id }).where(byId(messageTemplates, ctx.scope, keep.id));
      for (const x of extra) await tx.update(messageTemplates).set({ status: "archived", updatedBy: ctx.user.id }).where(byId(messageTemplates, ctx.scope, x.id));
      return keep.id;
    }
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(messageTemplates).where(whereStore(messageTemplates, ctx.scope, ne(messageTemplates.status, "archived")));
    if (Number(n) >= TEMPLATES_MAX) return null;
    const fresh = newId();
    await tx.insert(messageTemplates).values(
      storeValues(ctx.scope, { id: fresh, channel: "call_script" as const, kind: "script", locale, pageId, name: `Script ${locale}`, body, status: "active" as const, source: "user" as const, updatedBy: ctx.user.id }),
    );
    return fresh;
  });
  if (!id) return { ok: false, error: "limit" };
  await auditFrom(ctx, "callcenter.script.saved", { target: id, meta: { pageId, locale, steps: doc.steps.length } });
  return { ok: true, data: { id } };
}

/** callcenter.configure: "Reset to built-in": the active rows of (page, language) are archived; the built-in answers. */
export async function resetScript(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ archived: number }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const parsed = z.strictObject({ pageId: z.string().regex(ID26_RE).nullable(), locale: z.enum(["ar", "fr", "en"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { pageId, locale } = parsed.data;
  const res = await db
    .update(messageTemplates)
    .set({ status: "archived", updatedBy: ctx.user.id })
    .where(whereStore(messageTemplates, ctx.scope, scriptOf(pageId, locale), eq(messageTemplates.status, "active")));
  const archived = affectedRows(res);
  await auditFrom(ctx, "callcenter.script.reset", { target: pageId ?? "all", meta: { pageId, locale, archived } });
  return { ok: true, data: { archived } };
}

/** callcenter.configure: Approve a draft (AI-15): draft → active, the previous active row of its (page, language) → archived. */
export async function approveScriptDraft(ctx: WriteCtx, id: string): Promise<ActionResult<{ id: string }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  if (typeof id !== "string" || !ID26_RE.test(id)) return { ok: false, error: "not_found" };
  const done = await db.transaction(async (tx) => {
    const [draft] = await tx
      .select({ id: messageTemplates.id, pageId: messageTemplates.pageId, locale: messageTemplates.locale, body: messageTemplates.body, status: messageTemplates.status, channel: messageTemplates.channel })
      .from(messageTemplates)
      .where(byId(messageTemplates, ctx.scope, id))
      .for("update");
    if (!draft || draft.channel !== "call_script" || draft.status !== "draft" || !isScriptLocale(draft.locale)) return null;
    // a draft whose body no longer parses is never activated half-valid
    let doc: unknown;
    try {
      doc = JSON.parse(draft.body);
    } catch {
      return "invalid" as const;
    }
    if (!ScriptDoc.safeParse(doc).success) return "invalid" as const;
    await tx
      .update(messageTemplates)
      .set({ status: "archived", updatedBy: ctx.user.id })
      .where(whereStore(messageTemplates, ctx.scope, scriptOf(draft.pageId, draft.locale), eq(messageTemplates.status, "active"), ne(messageTemplates.id, id)));
    await tx.update(messageTemplates).set({ status: "active", updatedBy: ctx.user.id }).where(byId(messageTemplates, ctx.scope, id));
    return { pageId: draft.pageId, locale: draft.locale };
  });
  if (done === null) return { ok: false, error: "not_found" };
  if (done === "invalid") return { ok: false, error: "invalid" };
  await auditFrom(ctx, "callcenter.script.approved", { target: id, meta: done });
  return { ok: true, data: { id } };
}
