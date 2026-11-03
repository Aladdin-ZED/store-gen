import "server-only";
/**
 * The operations CSV writers of the store export ZIP (P4 CALL CENTER; operations.md OPE-§27.4, core §F.9; PL-09).
 * P8 owns the ZIP job and wires these writers at the R1 integration (P0b P4-10); R2 adds its own files (S3, S4).
 *
 *   orders.csv              every column of the orders CSV (src/lib/orders/admin.ts ORDERS_CSV_HEADER), phones full
 *   customers.csv           the store's customer profiles and counters
 *   order_events.csv        the timeline, `meta` as JSON
 *   agent_stats_daily.csv   the agents' daily counters
 *   message_templates.csv   WhatsApp / Telegram templates and call scripts
 *
 * Never written: the Telegram token, carrier credentials, webhook secrets (none of them lives in these tables) and
 * `orders.capi_ctx` (not a column of orders.csv) [Q.20]. Every read is the scope's store, in keyset pages of 1,000 rows,
 * so a large store streams without holding its history in memory. Cells are formula-injection safe; UTF-8 with a BOM.
 */
import { and, asc, eq, gt, or, type SQL } from "drizzle-orm";
import { csvCell } from "@/lib/callcenter/carrier-csv";
import { db } from "@/lib/db/client";
import { agentStatsDaily, customers, messageTemplates, orderEvents, orders, pages } from "@/lib/db/schema";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { memberNames, orderCsvCells, ORDERS_CSV_HEADER } from "./admin";

const PAGE = 1_000;
const line = (cells: readonly unknown[]) => cells.map((c) => csvCell(c)).join(",") + "\r\n";
const at = (d: Date | null | undefined) => (d ? d.toISOString() : "");

/** One file of the ZIP: its name and its text, chunk by chunk (the header first, with the BOM). */
export interface ZipCsvWriter {
  file: "orders.csv" | "customers.csv" | "order_events.csv" | "agent_stats_daily.csv" | "message_templates.csv";
  write: (scope: StoreScope) => AsyncGenerator<string, void, unknown>;
}

async function* ordersCsvZip(scope: StoreScope): AsyncGenerator<string, void, unknown> {
  yield `﻿${line(ORDERS_CSV_HEADER)}`;
  const names = await memberNames(scope);
  let cur: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const c: { createdAt: Date; id: string } | null = cur;
    const after: SQL | undefined = c ? or(gt(orders.createdAt, c.createdAt), and(eq(orders.createdAt, c.createdAt), gt(orders.id, c.id))) : undefined;
    const rows: { order: typeof orders.$inferSelect; pageName: string | null }[] = await db
      .select({ order: orders, pageName: pages.name })
      .from(orders)
      .leftJoin(pages, and(eq(pages.id, orders.pageId), inStore(pages, scope)))
      .where(whereStore(orders, scope, after))
      .orderBy(asc(orders.createdAt), asc(orders.id))
      .limit(PAGE);
    if (!rows.length) return;
    let chunk = "";
    // the full phone: the export is the owner's own data (core §F.9); capi_ctx is not a column here
    for (const r of rows) chunk += line(orderCsvCells(r.order, r.pageName, names));
    yield chunk;
    const last = rows[rows.length - 1]!.order;
    cur = { createdAt: last.createdAt, id: last.id };
  }
}

const CUSTOMER_HEADER = [
  "Customer", "Phone", "Name", "City", "City key", "Locale", "Orders", "Confirmed", "Delivered", "Refused", "Returned",
  "Cancelled", "Fake", "Test orders", "First order (UTC)", "Last order (UTC)", "Last order", "Note", "Created (UTC)",
];

async function* customersCsv(scope: StoreScope): AsyncGenerator<string, void, unknown> {
  yield `﻿${line(CUSTOMER_HEADER)}`;
  let after: string | null = null;
  for (;;) {
    const rows = await db
      .select()
      .from(customers)
      .where(whereStore(customers, scope, after ? gt(customers.id, after) : undefined))
      .orderBy(asc(customers.id))
      .limit(PAGE);
    if (!rows.length) return;
    yield rows
      .map((c) =>
        line([
          c.id, c.phone, c.name, c.city, c.cityKey, c.locale, c.ordersCount, c.confirmedCount, c.deliveredCount, c.refusedCount,
          c.returnedCount, c.cancelledCount, c.fakeCount, c.testCount, at(c.firstOrderAt), at(c.lastOrderAt), c.lastOrderId, c.note, at(c.createdAt),
        ]),
      )
      .join("");
    after = rows[rows.length - 1]!.id;
  }
}

const EVENT_HEADER = ["Event", "Order", "At (UTC)", "Actor kind", "Actor", "Type", "From", "To", "Reason", "Note", "Meta", "Rev"];

async function* orderEventsCsv(scope: StoreScope): AsyncGenerator<string, void, unknown> {
  yield `﻿${line(EVENT_HEADER)}`;
  let after = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, gt(orderEvents.id, after)))
      .orderBy(asc(orderEvents.id))
      .limit(PAGE);
    if (!rows.length) return;
    yield rows
      .map((e) => line([e.id, e.orderId, at(e.at), e.actorKind, e.actorId, e.type, e.fromState, e.toState, e.reasonCode, e.note, e.meta ? JSON.stringify(e.meta) : "", e.rev]))
      .join("");
    after = rows[rows.length - 1]!.id;
  }
}

const STATS_HEADER = [
  "Member", "Day", "Worked", "Decided", "Confirmed", "Cancelled", "Fake", "Duplicates", "Unreachable", "Callbacks", "Attempts",
  "Reveals", "First touch ms (sum)", "First touch (n)", "Handling ms (sum)", "Shipped", "Delivered", "Refused", "Returned", "Lost",
  "Abandoned", "Upsells", "Upsell cents", "Online ms",
];

async function* agentStatsCsv(scope: StoreScope): AsyncGenerator<string, void, unknown> {
  yield `﻿${line(STATS_HEADER)}`;
  let cur: { day: string; userId: string } | null = null;
  for (;;) {
    const c: { day: string; userId: string } | null = cur;
    const after: SQL | undefined = c ? or(gt(agentStatsDaily.day, c.day), and(eq(agentStatsDaily.day, c.day), gt(agentStatsDaily.userId, c.userId))) : undefined;
    const rows: (typeof agentStatsDaily.$inferSelect)[] = await db
      .select()
      .from(agentStatsDaily)
      .where(whereStore(agentStatsDaily, scope, after))
      .orderBy(asc(agentStatsDaily.day), asc(agentStatsDaily.userId))
      .limit(PAGE);
    if (!rows.length) return;
    yield rows
      .map((s) =>
        line([
          s.userId, s.day, s.worked, s.decided, s.confirmed, s.cancelled, s.fake, s.duplicates, s.unreachable, s.callbacks, s.attempts,
          s.reveals, s.firstTouchMsSum, s.firstTouchN, s.handlingMsSum, s.shipped, s.delivered, s.refused, s.returned, s.lost,
          s.abandoned, s.upsells, s.upsellCents, s.onlineMs,
        ]),
      )
      .join("");
    const last = rows[rows.length - 1]!;
    cur = { day: last.day, userId: last.userId };
  }
}

const TEMPLATE_HEADER = ["Template", "Channel", "Kind", "Locale", "Page", "Name", "Body", "Status", "Source", "Position", "Updated (UTC)"];

async function* templatesCsv(scope: StoreScope): AsyncGenerator<string, void, unknown> {
  yield `﻿${line(TEMPLATE_HEADER)}`;
  let after: string | null = null;
  for (;;) {
    const rows = await db
      .select()
      .from(messageTemplates)
      .where(whereStore(messageTemplates, scope, after ? gt(messageTemplates.id, after) : undefined))
      .orderBy(asc(messageTemplates.id))
      .limit(PAGE);
    if (!rows.length) return;
    yield rows.map((t) => line([t.id, t.channel, t.kind, t.locale, t.pageId, t.name, t.body, t.status, t.source, t.position, at(t.updatedAt)])).join("");
    after = rows[rows.length - 1]!.id;
  }
}

/** The operations files of the store export ZIP, in the order the ZIP lists them. */
export const EXPORT_ZIP_WRITERS: readonly ZipCsvWriter[] = [
  { file: "orders.csv", write: ordersCsvZip },
  { file: "customers.csv", write: customersCsv },
  { file: "order_events.csv", write: orderEventsCsv },
  { file: "agent_stats_daily.csv", write: agentStatsCsv },
  { file: "message_templates.csv", write: templatesCsv },
];

/** One whole file as text (tests, and a small store's ZIP). */
export async function writeZipCsv(scope: StoreScope, file: ZipCsvWriter["file"]): Promise<string> {
  const w = EXPORT_ZIP_WRITERS.find((x) => x.file === file);
  if (!w) throw new RangeError(`export-zip: unknown file ${file}`);
  let out = "";
  for await (const chunk of w.write(scope)) out += chunk;
  return out;
}
