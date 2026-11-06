import "server-only";
/**
 * The template repository (P5 INTEGRATIONS; operations.md OPE-§2.5, §7.4, §22.2, OPE-§L "Templates", OD24; IN-05,
 * AI-15): `message_templates` rows of the channels `whatsapp` and `telegram`, over the built-ins of ./builtins.ts.
 *
 *   const t = await resolveTemplate(scope, { channel: "whatsapp", kind: "confirm", locale: "fr", pageId });
 *   waLink(e164, t.body, await orderTemplateValues(scope, order, viewer))
 *
 * - `resolveTemplate`: the page's active row, else the store's active row for every page, else the built-in
 *   (`builtin:<kind>:<locale>`); drafts and archived rows are never returned (AI-15: agents only see `active`).
 * - `listTemplates`: the editor's rows (drafts only when asked, for the Suggested lane).
 * - `saveTemplate`: validated at save (`parseTemplate`, body ≤ 1,000, name ≤ 80); one active row per (channel, kind,
 *   locale, page), updated in place; ≤ 100 rows per store counted across every channel, P4's call scripts included,
 *   under the store's `msg-templates` lock so two saves cannot both take the 100th slot.
 * - `resetTemplate`: deletes the slot's active override, so the built-in (or the every-page row) applies again; drafts
 *   stay in the Suggested lane.
 * No row is ever seeded (OD24). Every query names the store through the seam (`whereStore` / `byId` / `storeValues`).
 * The permission (`callcenter.configure`, OD24) and the audit belong to the actions (step 8).
 */
import { count, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { affected } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { messageTemplates, pages } from "@/lib/db/schema";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { builtinTemplate, isWaKind, type TemplateLocale } from "./builtins";
import { checkTemplateInput, chooseTemplate, TEMPLATE_CHANNELS, TEMPLATES_PER_STORE, type TemplateChannel, type TemplateInput, type TemplateInputError } from "./choose";

export { TEMPLATE_BODY_MAX, TEMPLATE_CHANNELS, TEMPLATE_NAME_MAX, TEMPLATES_PER_STORE, type TemplateChannel } from "./choose";

export interface TemplateSlot {
  channel: TemplateChannel;
  kind: string;
  locale: TemplateLocale;
  /** the order's page; absent / null = every page */
  pageId?: string | null;
}

export interface ResolvedTemplate {
  /** the row id, or `builtin:<kind>:<locale>` */
  id: string;
  source: "page" | "store" | "builtin";
  channel: TemplateChannel;
  kind: string;
  locale: TemplateLocale;
  pageId: string | null;
  name: string | null;
  body: string;
}

export interface TemplateRowView {
  id: string;
  channel: TemplateChannel;
  kind: string;
  locale: TemplateLocale;
  pageId: string | null;
  name: string;
  body: string;
  status: "draft" | "active" | "archived";
  source: "user" | "ai";
  promptVersion: string | null;
  position: number;
  updatedBy: string | null;
  updatedAt: string;
}

const columns = {
  id: messageTemplates.id,
  channel: messageTemplates.channel,
  kind: messageTemplates.kind,
  locale: messageTemplates.locale,
  pageId: messageTemplates.pageId,
  name: messageTemplates.name,
  body: messageTemplates.body,
  status: messageTemplates.status,
  source: messageTemplates.source,
  promptVersion: messageTemplates.promptVersion,
  position: messageTemplates.position,
  updatedBy: messageTemplates.updatedBy,
  updatedAt: messageTemplates.updatedAt,
};

type Row = { [K in keyof typeof columns]: (typeof messageTemplates.$inferSelect)[K] };

const isChannel = (c: string): c is TemplateChannel => (TEMPLATE_CHANNELS as readonly string[]).includes(c);

function view(r: Row): TemplateRowView | null {
  if (!isChannel(r.channel)) return null;
  return {
    id: r.id,
    channel: r.channel,
    kind: r.kind,
    locale: r.locale as TemplateLocale,
    pageId: r.pageId,
    name: r.name,
    body: r.body,
    status: r.status,
    source: r.source,
    promptVersion: r.promptVersion,
    position: r.position,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** (channel, kind, locale) and the page condition: the page's rows and the every-page rows, or only the latter. */
function slotWhere(slot: TemplateSlot, pageScope: "page-or-store" | "exact"): SQL[] {
  const pageId = slot.pageId ?? null;
  const base = [eq(messageTemplates.channel, slot.channel), eq(messageTemplates.kind, slot.kind), eq(messageTemplates.locale, slot.locale)];
  if (pageScope === "exact" || !pageId) return [...base, pageId ? eq(messageTemplates.pageId, pageId) : isNull(messageTemplates.pageId)];
  return [...base, or(isNull(messageTemplates.pageId), eq(messageTemplates.pageId, pageId))!];
}

/**
 * The template an agent (or the thank-you page, the kit, Telegram) uses for one slot. Null only when the store has no
 * active row and the slot has no built-in (`custom`, a Telegram kind before step 7's texts).
 */
export async function resolveTemplate(scope: StoreScope, slot: TemplateSlot): Promise<ResolvedTemplate | null> {
  if (!isChannel(slot.channel)) return null;
  const pageId = slot.pageId ?? null;
  const rows = await db
    .select(columns)
    .from(messageTemplates)
    .where(whereStore(messageTemplates, scope, ...slotWhere(slot, "page-or-store"), eq(messageTemplates.status, "active")))
    .limit(TEMPLATES_PER_STORE);
  const picked = chooseTemplate(rows, pageId);
  if (picked) {
    const r = picked.row;
    return { id: r.id, source: picked.source, channel: slot.channel, kind: slot.kind, locale: slot.locale, pageId: r.pageId, name: r.name, body: r.body };
  }
  if (slot.channel !== "whatsapp" || !isWaKind(slot.kind)) return null;
  const b = builtinTemplate(slot.kind, slot.locale);
  return b ? { id: b.id, source: "builtin", channel: "whatsapp", kind: b.kind, locale: b.locale, pageId: null, name: null, body: b.body } : null;
}

/** The store's rows of these channels for the editors; drafts only with `includeDrafts` (the Suggested lane). */
export async function listTemplates(
  scope: StoreScope,
  q: { channel?: TemplateChannel; kind?: string; locale?: TemplateLocale; pageId?: string | null; includeDrafts?: boolean } = {},
): Promise<TemplateRowView[]> {
  const conds: (SQL | undefined)[] = [
    q.channel ? eq(messageTemplates.channel, q.channel) : inArray(messageTemplates.channel, [...TEMPLATE_CHANNELS]),
    q.kind ? eq(messageTemplates.kind, q.kind) : undefined,
    q.locale ? eq(messageTemplates.locale, q.locale) : undefined,
    q.pageId === undefined ? undefined : q.pageId === null ? isNull(messageTemplates.pageId) : eq(messageTemplates.pageId, q.pageId),
    q.includeDrafts ? undefined : inArray(messageTemplates.status, ["active", "archived"]),
  ];
  const rows = await db
    .select(columns)
    .from(messageTemplates)
    .where(whereStore(messageTemplates, scope, ...conds))
    .orderBy(messageTemplates.channel, messageTemplates.kind, messageTemplates.locale, messageTemplates.pageId, messageTemplates.position, messageTemplates.updatedAt)
    .limit(TEMPLATES_PER_STORE);
  return rows.map(view).filter((r): r is TemplateRowView => r !== null);
}

export type SaveTemplateResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: TemplateInputError | "limit" | "not_found" | "busy"; field?: "channel" | "kind" | "locale" | "pageId" | "name" | "body"; at?: number };

/**
 * Saves the store's override of one slot: validated, then the slot's active row is updated in place (an approved AI
 * row becomes the member's text: `source` user, no prompt version), else a row is inserted when the store has fewer
 * than 100. `pageId` must be a page of this store (`not_found` otherwise, like any foreign id).
 */
export async function saveTemplate(scope: WriteScope, raw: unknown, actor: { userId: string | null }): Promise<SaveTemplateResult> {
  const checked = checkTemplateInput(raw);
  if (!checked.ok) return { ok: false, error: checked.error, field: checked.field, ...(checked.at === undefined ? {} : { at: checked.at }) };
  const input = checked.value;
  if (input.pageId) {
    const [page] = await db.select({ id: pages.id }).from(pages).where(byId(pages, scope, input.pageId)).limit(1);
    if (!page) return { ok: false, error: "not_found", field: "pageId" };
  }
  const r = await withNamedLock(storeLock(scope.storeId, "msg-templates"), 1, async (): Promise<SaveTemplateResult> => {
    const values = { name: input.name, body: input.body, source: "user" as const, promptVersion: null, updatedBy: actor.userId };
    // a quick reply (`custom`) is one row per reply: its id updates it, no id adds one (OPE-§22.2 "quick replies")
    if (input.kind === QUICK_REPLY) {
      if (input.id) {
        const res = await db.update(messageTemplates).set(values).where(whereStore(messageTemplates, scope, eq(messageTemplates.id, input.id), eq(messageTemplates.channel, input.channel), eq(messageTemplates.kind, QUICK_REPLY)));
        return affected(res) > 0 ? { ok: true, id: input.id, created: false } : { ok: false, error: "not_found", field: "kind" };
      }
      return insertRow(scope, input, values);
    }
    const [current] = await db
      .select({ id: messageTemplates.id })
      .from(messageTemplates)
      .where(whereStore(messageTemplates, scope, ...slotWhere(input, "exact"), eq(messageTemplates.status, "active")))
      .orderBy(messageTemplates.position, messageTemplates.updatedAt)
      .limit(1);
    if (current) {
      await db.update(messageTemplates).set(values).where(byId(messageTemplates, scope, current.id));
      return { ok: true, id: current.id, created: false };
    }
    return insertRow(scope, input, values);
  });
  return r.ran ? r.value : { ok: false, error: "busy" };
}

/** The kind of the quick replies: many rows, each its own (the other kinds are one active row per slot). */
export const QUICK_REPLY = "custom";

/** A new active row, when the store has fewer than 100 (called under the `msg-templates` lock). */
async function insertRow(
  scope: WriteScope,
  input: TemplateInput,
  values: { name: string; body: string; source: "user"; promptVersion: null; updatedBy: string | null },
): Promise<SaveTemplateResult> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(messageTemplates).where(whereStore(messageTemplates, scope));
  if (n >= TEMPLATES_PER_STORE) return { ok: false, error: "limit" };
  const id = newId();
  await db.insert(messageTemplates).values(
    storeValues(scope, { id, channel: input.channel, kind: input.kind, locale: input.locale, pageId: input.pageId, status: "active" as const, position: 0, ...values }),
  );
  return { ok: true, id, created: true };
}

/** Deletes one quick reply of this store; false when the id is not one (another store's id included). */
export async function deleteQuickReply(scope: WriteScope, id: string): Promise<boolean> {
  const res = await db.delete(messageTemplates).where(whereStore(messageTemplates, scope, eq(messageTemplates.id, id), eq(messageTemplates.kind, QUICK_REPLY)));
  return affected(res) > 0;
}

/**
 * "Reset to built-in": deletes the slot's active override (drafts stay). Answers how many rows went; `notFound` when
 * `pageId` is not a page of this store (the action answers `not_found`, like any foreign id).
 */
export async function resetTemplate(scope: WriteScope, slot: TemplateSlot): Promise<{ deleted: number; notFound?: true }> {
  if (!isChannel(slot.channel)) return { deleted: 0 };
  if (slot.pageId) {
    const [page] = await db.select({ id: pages.id }).from(pages).where(byId(pages, scope, slot.pageId)).limit(1);
    if (!page) return { deleted: 0, notFound: true };
  }
  const res = await db.delete(messageTemplates).where(whereStore(messageTemplates, scope, ...slotWhere(slot, "exact"), eq(messageTemplates.status, "active")));
  return { deleted: affected(res) };
}
