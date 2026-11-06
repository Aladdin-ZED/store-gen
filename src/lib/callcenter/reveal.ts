import "server-only";
/**
 * The phone reveal (P4 CALL CENTER; operations.md OPE-§8.2, §8.3, §22.1, §22.3, OD11, OD36, OD60, OP-07; core §F.10):
 * the only way a tenant member gets a customer's full number. Call opens `tel:`, WhatsApp opens `wa.me`, Show number
 * shows it; each one is a `phone_revealed` row of the order's timeline.
 *
 *   who      `orders.reveal_phone` (sensitive: refused to impersonation by the seam and here). A member who sees every
 *            order (owner, admin, manager, logistics: `orders.read_all`) reveals any order of the store without a
 *            reason prompt (OD11). An agent reveals an order they hold now (an unexpired claim), a callback they own,
 *            or one whose last `claimed` event is theirs within 30 minutes (OD60: the follow-up WhatsApp after a long
 *            call). Anything else answers `not_found`, exactly like another store's id (core §E.3 rule 3).
 *   budget   `s:<sid>:reveal:<uid>` 300 / h (OPE-§L; it is also the agent's reveal counter the R2 alarm reads); one
 *            order read, one or two event inserts, the lease renewal of a held claim, the template render (pure)
 *   events   `phone_revealed` (meta `why`); `why: "whatsapp"` with a template also `whatsapp_sent` (meta template, locale)
 *   answer   `{ e164, national, tel, wa }`: `wa` = `https://wa.me/<digits>[?text=…]`, the template rendered with P5's
 *            `renderTemplate` / `orderTemplateValues` under OPE-§22.3's limits (./wa.ts). Before the P5 merge the
 *            renderer is a stub that throws: the link then opens the chat without a text, never with a raw template.
 *   replay   the Idempotency-Key (OD36) keeps only which order, why and which template were revealed, never the number:
 *            a replay re-reads the phone and answers the same `tel` / `wa` with no second event and no bucket charge.
 *
 * The number is never cached, logged, stored in web storage or put in an app URL; it lives in the open card's
 * component state only (OPE-§8.2).
 */
import { and, desc, eq } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { db } from "@/lib/db/client";
import { messageTemplates, orderEvents, orders } from "@/lib/db/schema";
import { orderTemplateValues, renderTemplate } from "@/lib/integrations/templates";
import { appendEvents, viewerOf, type NewOrderEvent } from "@/lib/orders/events";
import { logError } from "@/lib/orders/log";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";
import { CARD, firstNameOf, type CardRow } from "./card";
import { withIdem } from "./idem";
import { opsNow, renewHeldLease } from "./presence";
import type { ScriptLocale } from "./script";
import { scriptLocaleOf } from "./script.server";
import { ownQueueViewer, seesAllOrders } from "./visibility";
import { BUILTIN_WA, parseWaTemplateId, waUrl, waLink } from "./wa";

export type RevealWhy = "call" | "whatsapp" | "view";
export const REVEAL_WHYS: readonly RevealWhy[] = ["call", "whatsapp", "view"];
export interface Revealed {
  e164: string;
  /** the national format, as the agent dials it ("06 12 34 56 78") */
  national: string;
  /** `tel:+212…` */
  tel: string;
  /** `https://wa.me/<digits>[?text=…]` */
  wa: string;
}

/** OPE-§L: `s:<sid>:reveal:<uid>` 300 / h hard cap */
export const REVEAL_LIMIT = 300;
const REVEAL_WINDOW_SEC = 3_600;
/** OD60: an agent reveals an order they held this recently */
export const REVEAL_RECENT_MS = 30 * 60_000;
const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

/** What the idempotency cache keeps (no number, OPE-§8.2). */
type RevealRef = { ok: true; orderId: string; why: RevealWhy; templateId: string | null } | { ok: false; error: "not_found" | "forbidden" | "invalid" | "rate_limited" };

/** The order's number for `why` (see the header). */
export async function revealPhone(ctx: WriteCtx, orderId: string, why: RevealWhy, opts: { templateId?: string; idem?: string } = {}): Promise<ActionResult<Revealed>> {
  // the seam never hands a WriteCtx to an impersonation (D71); the kind is still read at run time, as a plain string
  const kind: string = ctx.scope.kind;
  if (!ctx.can("orders.reveal_phone") || kind === "impersonation") return { ok: false, error: "forbidden" };
  if (!REVEAL_WHYS.includes(why)) return { ok: false, error: "invalid" };
  if (typeof orderId !== "string" || !ORDER_ID_RE.test(orderId)) return { ok: false, error: "not_found" };
  const templateId = why === "whatsapp" && opts.templateId ? opts.templateId : null;
  if (templateId !== null && !parseWaTemplateId(templateId)) return { ok: false, error: "invalid" };

  // what this request read itself (absent on a replay)
  const hit: { row?: CardRow; src?: string | null } = {};
  const ref = await withIdem<RevealRef>(
    ctx.scope,
    ctx.user.id,
    opts.idem,
    async () => {
      const r = await run(ctx, orderId, why, templateId);
      if (!r.ok) return r;
      hit.row = r.row;
      hit.src = r.src;
      return { ok: true, orderId, why, templateId };
    },
    // a key keeps one request: the same key sent again with another order, reason or template (or a key of another
    // hot-path request) is refused, never answered with what it first stored
    (stored) => (sameReveal(stored, orderId, why, templateId) ? stored : { ok: false, error: "invalid" }),
  );
  if (!ref.ok) return { ok: false, error: ref.error };
  // a replay: the number again from the row (the cache never held it), no event, no charge
  const row = hit.row ?? (await db.select(CARD).from(orders).where(byId(orders, ctx.scope, ref.orderId)).limit(1))[0];
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, data: await answer(ctx, row, ref.why, ref.templateId, hit.src) };
}

const REVEAL_ERRORS: readonly string[] = ["not_found", "forbidden", "invalid", "rate_limited"];

/** A stored answer of this very request: the same order, reason and template, or one of the reveal's own refusals. */
function sameReveal(stored: unknown, orderId: string, why: RevealWhy, templateId: string | null): stored is RevealRef {
  if (!stored || typeof stored !== "object") return false;
  const s = stored as Partial<Record<string, unknown>>;
  if (s.ok === true) return s.orderId === orderId && s.why === why && (s.templateId ?? null) === templateId;
  return s.ok === false && typeof s.error === "string" && REVEAL_ERRORS.includes(s.error) && Object.keys(s).length === 2;
}

type RunResult = { ok: true; row: CardRow; src: string | null } | Extract<RevealRef, { ok: false }>;

async function run(ctx: WriteCtx, orderId: string, why: RevealWhy, templateId: string | null): Promise<RunResult> {
  const { scope } = ctx;
  const uid = ctx.user.id;
  if (!(await rateLimit(storeBucket(scope, "reveal", uid), REVEAL_LIMIT, REVEAL_WINDOW_SEC)).ok) return { ok: false, error: "rate_limited" };
  const [row] = await db.select(CARD).from(orders).where(byId(orders, scope, orderId)).limit(1);
  if (!row) return { ok: false, error: "not_found" };
  const now = opsNow();
  const viewer = viewerOf(ctx);
  const holds = row.assigneeId === uid && !!row.claimToken && !!row.leaseUntil && row.leaseUntil.getTime() > now.getTime();
  if (!seesAllOrders(viewer)) {
    if (!ownQueueViewer(viewer)) return { ok: false, error: "not_found" };
    const callbackOwner = row.confirmState === "callback" && row.assigneeId === uid;
    if (!holds && !callbackOwner && !(await heldRecently(ctx, orderId, now))) return { ok: false, error: "not_found" };
  }
  // the template must be one of this store's (another store's row id reads as a missing one)
  const locale = scriptLocaleOf(row.locale, ctx.store.defaultLocale);
  const src = templateId === null ? null : await templateOf(ctx, templateId, locale);
  if (templateId !== null && src === null) return { ok: false, error: "not_found" };

  const events: NewOrderEvent[] = [{ orderId, actorKind: "user", actorId: uid, type: "phone_revealed", meta: { why }, at: now }];
  if (why === "whatsapp" && templateId !== null) events.push({ orderId, actorKind: "user", actorId: uid, type: "whatsapp_sent", meta: { template: templateId, locale }, at: now });
  await appendEvents(db, scope, events);
  if (holds) {
    const { leaseMinutes } = await getStoreSetting(scope, "ops");
    await renewHeldLease(scope, uid, now, leaseMinutes, orderId);
  }
  return { ok: true, row, src };
}

/** OD60: the order's last `claimed` event is `ctx`'s, within 30 minutes (one range read on `oe_order_idx`). */
async function heldRecently(ctx: WriteCtx, orderId: string, now: Date): Promise<boolean> {
  const [last] = await db
    .select({ actorId: orderEvents.actorId, at: orderEvents.at })
    .from(orderEvents)
    .where(whereStore(orderEvents, ctx.scope, eq(orderEvents.orderId, orderId), eq(orderEvents.type, "claimed")))
    .orderBy(desc(orderEvents.at), desc(orderEvents.id))
    .limit(1);
  return !!last && last.actorId === ctx.user.id && now.getTime() - last.at.getTime() <= REVEAL_RECENT_MS;
}

/** The template's source in the order's language: a built-in, or the store's active WhatsApp row. */
async function templateOf(ctx: WriteCtx, templateId: string, locale: ScriptLocale): Promise<string | null> {
  const id = parseWaTemplateId(templateId);
  if (!id) return null;
  if ("builtin" in id) return BUILTIN_WA[id.builtin][locale];
  const [r] = await db
    .select({ body: messageTemplates.body })
    .from(messageTemplates)
    .where(and(byId(messageTemplates, ctx.scope, id.rowId), eq(messageTemplates.channel, "whatsapp"), eq(messageTemplates.status, "active")))
    .limit(1);
  return r?.body ?? null;
}

const national = (e164: string): string => parsePhoneNumberFromString(e164)?.formatNational() ?? e164;

/** The four forms of the number; the WhatsApp text rendered when a template was asked for. */
async function answer(ctx: WriteCtx, row: CardRow, why: RevealWhy, templateId: string | null, read?: string | null): Promise<Revealed> {
  const base = { e164: row.phone, national: national(row.phone), tel: `tel:${row.phone}`, wa: waUrl(row.phone) };
  if (why !== "whatsapp" || templateId === null) return base;
  const locale = scriptLocaleOf(row.locale, ctx.store.defaultLocale);
  const src = read !== undefined ? read : await templateOf(ctx, templateId, locale);
  if (!src) return base;
  try {
    const values = await orderTemplateValues(ctx.scope, row, { firstName: firstNameOf(ctx.user.name) || null, locale });
    return { ...base, wa: waLink(row.phone, src, values, renderTemplate, row.id) };
  } catch (err) {
    // P5's stub (before the P5 merge) or a failure: the chat opens without a text, never with a raw template
    if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError("ops:reveal", err);
    return base;
  }
}
