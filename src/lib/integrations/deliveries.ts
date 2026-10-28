import "server-only";
/**
 * The store's deliveries log (P5 INTEGRATIONS; operations.md OPE-§28.1, OD40, OPE-§L "Deliveries log"; docs/STORE-SAAS.md
 * §K.2 P0 rev 2.1): the store's outbox rows, newest first, 100 per page and at most 10 pages back
 * (`SELECT … FROM outbox WHERE store_id = ? …`, `ob_store_idx`). Kinds `capi` and `telegram` in R1 (R2 `webhook`,
 * `carrier`; R3 `whatsapp`); `mail` is never shown to tenants. Replay is the core's `replay(ctx, id)`
 * (src/lib/jobs/outbox.ts).
 *
 * A row is a summary: when, kind, topic, a masked target (the platform and the pixel's last 4 digits), state,
 * attempts, next try, the last HTTP status and the last error as a plain-words key (`int.cause.<code>`, never the
 * stored text), and the order id (parsed from the dedupe key), the event (the topic) and the amount, read from the
 * store's own order row. The payload column is never selected, so a sealed payload is never opened and no phone,
 * name or token can reach a row.
 */
import { desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, outbox } from "@/lib/db/schema";
import type { OutboxKind, OutboxState } from "@/lib/jobs/outbox";
import { whereStore } from "@/lib/tenancy/sql";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";
import { causeFromStatus, causeKey, isCauseCode } from "./causes";

export interface DeliveriesQuery {
  kind?: Exclude<OutboxKind, "mail">;
  state?: OutboxState;
  /** keyset cursor: the `next` of the previous page */
  after?: string;
  /** ≤ 100 */
  limit?: number;
}

export interface DeliveryRow {
  id: string;
  /** created */
  at: string;
  kind: Exclude<OutboxKind, "mail">;
  topic: string;
  /** pixel last 4, chat label, endpoint host, carrier label */
  target: string | null;
  state: OutboxState;
  attempts: number;
  nextAt: string | null;
  lastStatus: number | null;
  /** the last error in plain words (`int.cause.<code>`) */
  lastErrorKey: MessageKey | null;
  /** order id, event name, amount in cents: never a customer field */
  summary: { orderId: string | null; event: string | null; amountCents: number | null };
}

/** The outbox kinds a tenant sees (OPE-§28.1); `mail` is platform plumbing and `push` a viewer's own device. */
export const TENANT_OUTBOX_KINDS = ["capi", "telegram", "webhook", "carrier", "whatsapp"] as const satisfies readonly Exclude<OutboxKind, "mail">[];
type TenantKind = (typeof TENANT_OUTBOX_KINDS)[number];

export const DELIVERIES_PAGE_MAX = 100;
/** ≤ 10 pages back (OPE-§L) */
export const DELIVERIES_PAGES_MAX = 10;

const KINDS: ReadonlySet<string> = new Set(TENANT_OUTBOX_KINDS);
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** order ids: "CMD-7K3Q9X" (src/lib/db/ids.ts `newOrderId`), other prefixes for other sources */
const ORDER_ID_RE = /^[A-Z]{2,6}-[0-9A-HJKMNP-TV-Z]{6}$/;
const EVENT_RE = /^[A-Za-z][A-Za-z0-9_]{1,47}$/;

/** `<page>.<id>`: the page the cursor opens (2-10) and the last id of the page before. Pure. */
export function parseDeliveriesCursor(after: string | null | undefined): { page: number; id: string } | null {
  const m = typeof after === "string" ? /^(\d{1,2})\.([0-9A-Z]{26})$/.exec(after) : null;
  if (!m) return null;
  const page = Number(m[1]);
  return page >= 2 && page <= DELIVERIES_PAGES_MAX && ID_RE.test(m[2]!) ? { page, id: m[2]! } : null;
}

/** The order id a dedupe key names ("capi:meta:<pixel>:<orderId>:Purchase", "tg:new_order:<orderId>"), or null. Pure. */
export function orderIdFromDedupeKey(key: string): string | null {
  return key.split(":").find((part) => ORDER_ID_RE.test(part)) ?? null;
}

/** The masked target: "meta:1234" (the platform and the pixel's last 4 digits); null for a kind without one yet. Pure. */
export function targetLabel(kind: string, targetId: string | null): string | null {
  if (!targetId) return null;
  if (kind === "capi") {
    const m = /^([a-z]{2,12}):([0-9A-Za-z_-]{4,64})$/.exec(targetId);
    return m ? `${m[1]}:${m[2]!.slice(-4)}` : null;
  }
  // telegram: the chat label arrives with the Telegram setup (step 7); webhook / carrier labels with R2
  return null;
}

/** The plain-words key of a row's last error: the handler's stored cause code, else one read from the status. Pure. */
export function deliveryErrorKey(kind: string, state: string, lastError: string | null, lastStatus: number | null): MessageKey | null {
  if (state === "done") return null;
  if (isCauseCode(lastError)) return causeKey(lastError);
  if (lastError === null && lastStatus === null) return null;
  return causeKey(causeFromStatus(lastStatus, kind === "capi" || kind === "telegram" ? kind : null));
}

export async function listDeliveries(scope: StoreScope, q: DeliveriesQuery): Promise<{ rows: DeliveryRow[]; next: string | null }> {
  const cursor = parseDeliveriesCursor(q.after);
  const page = cursor?.page ?? 1;
  const limit = Math.max(1, Math.min(DELIVERIES_PAGE_MAX, Math.trunc(q.limit ?? DELIVERIES_PAGE_MAX)));
  const kinds: TenantKind[] = q.kind ? (KINDS.has(q.kind) ? [q.kind as TenantKind] : []) : [...TENANT_OUTBOX_KINDS];
  if (!kinds.length) return { rows: [], next: null };

  const found = await db
    .select({
      id: outbox.id,
      kind: outbox.kind,
      topic: outbox.topic,
      targetId: outbox.targetId,
      dedupeKey: outbox.dedupeKey,
      state: outbox.state,
      attempts: outbox.attempts,
      nextAt: outbox.nextAt,
      lastStatus: outbox.lastStatus,
      lastError: outbox.lastError,
      createdAt: outbox.createdAt,
    })
    .from(outbox)
    .where(whereStore(outbox, scope, inArray(outbox.kind, kinds), q.state ? eq(outbox.state, q.state) : undefined, cursor ? lt(outbox.id, cursor.id) : undefined))
    .orderBy(desc(outbox.id))
    .limit(limit + 1);
  const more = found.length > limit;
  const rows = found.slice(0, limit);

  // amounts from the store's own orders only: an id of another store in a key reads as no amount
  const ids = [...new Set(rows.map((r) => orderIdFromDedupeKey(r.dedupeKey)).filter((id): id is string => id !== null))];
  const totals = new Map<string, number>();
  if (ids.length) {
    const own = await db
      .select({ id: orders.id, total: orders.total })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.id, ids)));
    for (const o of own) totals.set(o.id, Math.round(Number(o.total) * 100));
  }

  return {
    rows: rows.map((r) => {
      const orderId = orderIdFromDedupeKey(r.dedupeKey);
      return {
        id: r.id,
        at: r.createdAt.toISOString(),
        kind: r.kind as TenantKind,
        topic: r.topic,
        target: targetLabel(r.kind, r.targetId),
        state: r.state,
        attempts: r.attempts,
        nextAt: r.state === "pending" || r.state === "running" ? r.nextAt.toISOString() : null,
        lastStatus: r.lastStatus,
        lastErrorKey: deliveryErrorKey(r.kind, r.state, r.lastError, r.lastStatus),
        summary: {
          orderId: orderId && totals.has(orderId) ? orderId : null,
          event: EVENT_RE.test(r.topic) ? r.topic : null,
          amountCents: orderId ? (totals.get(orderId) ?? null) : null,
        },
      };
    }),
    next: more && page < DELIVERIES_PAGES_MAX ? `${page + 1}.${rows[rows.length - 1]!.id}` : null,
  };
}
