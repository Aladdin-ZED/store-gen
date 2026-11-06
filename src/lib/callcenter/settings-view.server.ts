import "server-only";
/**
 * The reads of `/app/<h>/team/callcenter` (P4 CALL CENTER; operations.md OPE-§5.5, §5.6, §6.2, §7.4, OD57, OD63,
 * OPS-28; core D73). One server read for the screen and one for the script preview; both go through the seam
 * (whereStore / byId), and nothing here writes.
 *
 *   callCenterView      the `ops` key (fresh, so a save re-renders with what was written), the effective window in the
 *                       store time zone, the best-hours strip (90 days of attempts, OD44), the published pages (the
 *                       script scope picker), the active and draft `call_script` rows and the policy snippets: one
 *                       sentence per policy fact the owner set (inspection, returns, exchange), never a fact they did not
 *   scriptPreviewValues the variables a script preview renders with: the most recent real order of the page (or of the
 *                       store for "Every page"), its address and landmark masked; when there is none, or the template
 *                       values are not available yet, a "Preview sample" from the page's lead item and its price
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { TemplateVar } from "@/lib/integrations/templates";
import { orderTemplateValues } from "@/lib/integrations/templates";
import { db } from "@/lib/db/client";
import { messageTemplates, orders, pages, pageVersions } from "@/lib/db/schema";
import { t } from "@/lib/i18n/admin";
import { formatMoney } from "@/lib/markets/money";
import { logError } from "@/lib/orders/log";
import { itemName, leadItem } from "@/lib/page/catalog";
import { getStoreSetting } from "@/lib/settings";
import type { OpsSetting } from "@/lib/settings/keys/ops";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { attemptStats } from "./aggregates";
import { bestHoursOf, hoursOf, type BestHourCell } from "./board.server";
import { opsNow } from "./presence";
import { ScriptDoc, isScriptLocale, type ScriptLocale } from "./script";
import { effectiveWindow, hoursText, type EffectiveWindow } from "./window";

const PAGES_MAX = 100;
const SCRIPT_ROWS_MAX = 120;

export interface ScriptRowView {
  id: string;
  pageId: string | null;
  locale: ScriptLocale;
  status: "active" | "draft";
  source: "user" | "ai";
  doc: ScriptDoc;
  updatedAt: string;
}

export interface CallCenterView {
  ops: Pick<
    OpsSetting,
    | "ladder"
    | "busyRetryMinutes"
    | "unreachable"
    | "keepOpenDays"
    | "leaseMinutes"
    | "rescue"
    | "callbackGraceMinutes"
    | "assignment"
    | "rebalanceMinutes"
    | "duplicateWindowDays"
    | "firstTouchTargetMin"
    | "agentHistoryDays"
    | "cityAliases"
    | "windowOverrides"
    | "openOverrideUntil"
  >;
  window: EffectiveWindow;
  bestHours: BestHourCell[];
  pages: { id: string; name: string }[];
  scripts: ScriptRowView[];
  /** per script language, the sentences the owner's policy facts allow (empty when no fact is set) */
  policySnippets: Record<ScriptLocale, { id: string; text: string }[]>;
}

const parseDoc = (body: string): ScriptDoc | null => {
  try {
    const r = ScriptDoc.safeParse(JSON.parse(body));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
};

/** The policy sentences a manager may insert into a script: only from facts the owner set (OPE-§7.4). */
function snippetsOf(p: Awaited<ReturnType<typeof getStoreSetting<"policies">>>, locale: ScriptLocale): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  if (p.inspection === "allowed") out.push({ id: "inspection", text: t("ops.cc.script.snippet.inspection", undefined, locale) });
  if (p.returns.accepted === true && p.returns.windowDays) out.push({ id: "returns", text: t("ops.cc.script.snippet.returns", { n: p.returns.windowDays }, locale) });
  if (p.exchange.accepted === true && p.exchange.windowDays) out.push({ id: "exchange", text: t("ops.cc.script.snippet.exchange", { n: p.exchange.windowDays }, locale) });
  return out;
}

/** The call-centre screen's read (see the header). */
export async function callCenterView(scope: StoreScope, tz: string): Promise<CallCenterView> {
  const [ops, policies, attempts, live, rows] = await Promise.all([
    getStoreSetting(scope, "ops", { fresh: true }),
    getStoreSetting(scope, "policies"),
    attemptStats(scope).catch((err: unknown) => {
      logError("ops:cc-best-hours", err);
      return [];
    }),
    db
      .select({ id: pages.id, name: pages.name })
      .from(pages)
      .where(whereStore(pages, scope, eq(pages.status, "published")))
      .orderBy(desc(pages.updatedAt))
      .limit(PAGES_MAX),
    db
      .select({
        id: messageTemplates.id,
        pageId: messageTemplates.pageId,
        locale: messageTemplates.locale,
        status: messageTemplates.status,
        source: messageTemplates.source,
        body: messageTemplates.body,
        updatedAt: messageTemplates.updatedAt,
      })
      .from(messageTemplates)
      .where(whereStore(messageTemplates, scope, eq(messageTemplates.channel, "call_script"), inArray(messageTemplates.status, ["active", "draft"])))
      .orderBy(desc(messageTemplates.updatedAt))
      .limit(SCRIPT_ROWS_MAX),
  ]);
  const window = effectiveWindow(ops, tz);
  const windowHours = new Set<number>();
  for (const list of Object.values(window.days)) for (const r of list) for (const h of hoursOf(r)) windowHours.add(h);
  const scripts: ScriptRowView[] = [];
  for (const r of rows) {
    const doc = parseDoc(r.body);
    if (!doc || !isScriptLocale(r.locale) || (r.status !== "active" && r.status !== "draft")) continue;
    scripts.push({
      id: r.id,
      pageId: r.pageId,
      locale: r.locale,
      status: r.status,
      source: r.source,
      doc,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    });
  }
  return {
    ops: {
      ladder: ops.ladder,
      busyRetryMinutes: ops.busyRetryMinutes,
      unreachable: ops.unreachable,
      keepOpenDays: ops.keepOpenDays,
      leaseMinutes: ops.leaseMinutes,
      rescue: ops.rescue,
      callbackGraceMinutes: ops.callbackGraceMinutes,
      assignment: ops.assignment,
      rebalanceMinutes: ops.rebalanceMinutes,
      duplicateWindowDays: ops.duplicateWindowDays,
      firstTouchTargetMin: ops.firstTouchTargetMin,
      agentHistoryDays: ops.agentHistoryDays,
      cityAliases: ops.cityAliases,
      windowOverrides: ops.windowOverrides,
      openOverrideUntil: ops.openOverrideUntil,
    },
    window,
    bestHours: bestHoursOf(attempts, windowHours),
    pages: live,
    scripts,
    policySnippets: { ar: snippetsOf(policies, "ar"), fr: snippetsOf(policies, "fr"), en: snippetsOf(policies, "en") },
  };
}

/* ------------------------------------------------------------------ */
/* the script preview                                                  */
/* ------------------------------------------------------------------ */

export type PreviewValues = { source: "order" | "sample" | "none"; values: Partial<Record<TemplateVar, string>> };

const stub = (err: unknown) => err instanceof Error && err.message.startsWith("not implemented");
const MASK = "••••";

/** The sample of a page (or of the store's most recent live page): its lead item and price, the store's name and hours. */
async function sampleValues(ctx: StoreCtx, pageId: string | null, locale: ScriptLocale): Promise<PreviewValues> {
  const [page] = await db
    .select({ versionId: pages.publishedVersionId })
    .from(pages)
    .where(pageId ? byId(pages, ctx.scope, pageId) : whereStore(pages, ctx.scope, eq(pages.status, "published"), isNotNull(pages.publishedVersionId)))
    .orderBy(desc(pages.updatedAt))
    .limit(1);
  const values: Partial<Record<TemplateVar, string>> = {
    customer_first_name: t("ops.cc.script.sampleName", undefined, locale),
    store_name: ctx.store.name,
    qty: "1",
  };
  const ops = await getStoreSetting(ctx.scope, "ops");
  const hours = hoursText(effectiveWindow(ops, ctx.store.timezone), locale, locale, opsNow());
  if (hours) values.confirm_hours = hours;
  if (!page?.versionId) return { source: "sample", values };
  const [v] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(byId(pageVersions, ctx.scope, page.versionId)).limit(1);
  if (!v?.doc) return { source: "sample", values };
  try {
    const lead = leadItem(v.doc);
    values.product = itemName(v.doc, lead);
    const price = Number(lead.price);
    if (Number.isFinite(price) && price > 0) values.total = formatMoney(price, ctx.store.currency || "MAD", locale);
  } catch (err) {
    logError("ops:cc-sample", err);
  }
  return { source: "sample", values };
}

/** The preview's variables for (page or every page, language); see the header. */
export async function scriptPreviewValues(ctx: StoreCtx, pageId: string | null, locale: ScriptLocale): Promise<PreviewValues> {
  if (pageId) {
    const [p] = await db.select({ id: pages.id }).from(pages).where(byId(pages, ctx.scope, pageId)).limit(1);
    if (!p) return { source: "none", values: {} };
  }
  const [order] = await db
    .select()
    .from(orders)
    .where(whereStore(orders, ctx.scope, and(eq(orders.isTest, false), pageId ? eq(orders.pageId, pageId) : undefined)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (order) {
    try {
      const values = await orderTemplateValues(ctx.scope, order, { firstName: (ctx.user.name ?? "").trim().split(/\s+/)[0] || null, locale });
      // the preview is a staff screen: the customer's address never shows in it
      if (values.address) values.address = MASK;
      if (values.landmark) values.landmark = MASK;
      return { source: "order", values };
    } catch (err) {
      if (!stub(err)) logError("ops:cc-preview", err);
    }
  }
  return sampleValues(ctx, pageId, locale);
}
