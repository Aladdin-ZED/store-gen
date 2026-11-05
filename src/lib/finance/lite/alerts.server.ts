import "server-only";
/**
 * The `fin.alerts` pass of one store (P4 CALL CENTER; operations.md OPE-§16.2 "Alerts", §21.2, §21.4, OD50): reads
 * the facts (./alerts.ts `AlertFacts`), runs the hysteresis over the open `profit_alerts` rows and writes the result:
 * a firing inserts one row, sends one `fin.profit_alert` notification (owners and admins; vars ids, counts and codes)
 * and, when `notifications.telegram.profitAlerts` is on, enqueues one outbox `telegram` item with topic `profit_alert`
 * (P8's `enqueue`; P5's handler renders the text in the store's locale). A kept row refreshes its evidence; a
 * cleared one gets `cleared_at`. Real orders only; refusals by final-move day, the CPA by placed day (OD26).
 */
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { notHoneypot, spanOf, storeTz, trailingDays, dayBounds } from "@/lib/callcenter/insights-sql";
import { opsNow } from "@/lib/callcenter/presence";
import { addDaysYmd, storeYmd } from "@/lib/callcenter/window";
import { db } from "@/lib/db/client";
import { orders, profitAlerts } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/outbox";
import { logError } from "@/lib/orders/log";
import { notify } from "@/lib/platform/notify";
import { getStoreSetting } from "@/lib/settings";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { alertConditions, alertVars, stepAlerts, type AlertFacts, type FinalTally, type OpenAlert } from "./alerts";
import { breakEvenFor, cohortCounts } from "./breakeven.server";
import { spendByDay } from "./spend.server";

const realOrder = and(eq(orders.isTest, false), notHoneypot)!;
const FINAL = ["delivered", "refused", "returned", "lost"] as const;
const num = (v: unknown) => Number(v ?? 0) || 0;
const emptyTally = (): FinalTally => ({ delivered: 0, refused: 0, returned: 0, lost: 0 });

function addTo(t: FinalTally, state: string, n: number): void {
  if (state === "delivered" || state === "refused" || state === "returned" || state === "lost") t[state] += n;
}

async function finalsBetween(scope: StoreScope, from: Date, to: Date): Promise<FinalTally> {
  const rows = await db
    .select({ s: orders.shipState, n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(whereStore(orders, scope, inArray(orders.shipState, [...FINAL]), gte(orders.finalAt, from), lt(orders.finalAt, to), realOrder))
    .groupBy(orders.shipState);
  const t = emptyTally();
  for (const r of rows) addTo(t, r.s, num(r.n));
  return t;
}

/** The facts of the alerts at `now` (see ./alerts.ts). */
export async function alertFacts(scope: StoreScope): Promise<AlertFacts> {
  const now = opsNow();
  const tz = await storeTz(scope);
  const s7 = spanOf(trailingDays(tz, now, 7));
  const s28 = spanOf(trailingDays(tz, now, 28));
  const yesterday = addDaysYmd(storeYmd(now, tz), -1);
  const two = dayBounds(tz, addDaysYmd(yesterday, -1), yesterday);
  const [card, store7, store28, cityRows, reasonRows, spend, ...placed] = await Promise.all([
    breakEvenFor(scope),
    finalsBetween(scope, s7.from, s7.to),
    finalsBetween(scope, s28.from, s28.to),
    db
      .select({ city: orders.cityKey, s: orders.shipState, n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.shipState, [...FINAL]), gte(orders.finalAt, s28.from), lt(orders.finalAt, s28.to), realOrder))
      .groupBy(orders.cityKey, orders.shipState),
    db
      .select({ city: orders.cityKey, reason: orders.returnReason, n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.shipState, ["refused", "returned", "lost"]), gte(orders.finalAt, s28.from), lt(orders.finalAt, s28.to), realOrder))
      .groupBy(orders.cityKey, orders.returnReason),
    spendByDay(scope, two[0]?.ymd ?? yesterday, yesterday),
    ...two.map((d) => cohortCounts(scope, d.from, d.to)),
  ]);
  const cities = new Map<string, { tally: FinalTally; reasons: { reason: string | null; count: number }[] }>();
  for (const r of cityRows) {
    if (!r.city) continue;
    const c = cities.get(r.city) ?? { tally: emptyTally(), reasons: [] };
    addTo(c.tally, r.s, num(r.n));
    cities.set(r.city, c);
  }
  for (const r of reasonRows) {
    const c = r.city ? cities.get(r.city) : undefined;
    if (c) c.reasons.push({ reason: r.reason || null, count: num(r.n) });
  }
  return {
    beCpaPlacedCents: card.result.ok ? card.result.beCpaPlacedCents : null,
    lastDays: two.map((d, i) => ({ day: d.ymd, placed: placed[i]!.placed, spendCents: spend.get(d.ymd)?.cents ?? null })),
    store7,
    store28,
    cities28: [...cities.entries()].map(([cityKey, c]) => ({ cityKey, ...c })),
  };
}

/** One store's pass (see the header); answers the counts. */
export async function runFinAlerts(scope: WriteScope, store: Pick<StoreRow, "handle">): Promise<{ fired: number; kept: number; cleared: number }> {
  const now = opsNow();
  const [facts, openRows] = await Promise.all([
    alertFacts(scope),
    db
      .select({ kind: profitAlerts.kind, key: profitAlerts.key, firedAt: profitAlerts.firedAt, evidence: profitAlerts.evidence })
      .from(profitAlerts)
      .where(whereStore(profitAlerts, scope, isNull(profitAlerts.clearedAt)))
      .limit(500),
  ]);
  const step = stepAlerts(openRows as OpenAlert[], alertConditions(facts), now);
  const pk = (o: OpenAlert) => and(eq(profitAlerts.kind, o.kind), eq(profitAlerts.key, o.key), eq(profitAlerts.firedAt, o.firedAt));
  for (const k of step.keep) await db.update(profitAlerts).set({ evidence: k.evidence }).where(whereStore(profitAlerts, scope, pk(k)));
  for (const c of step.clear) await db.update(profitAlerts).set({ clearedAt: now }).where(whereStore(profitAlerts, scope, pk(c)));
  if (step.fire.length) {
    await db.insert(profitAlerts).values(step.fire.map((f) => storeValues(scope, { kind: f.kind, key: f.key, firedAt: f.firedAt, clearedAt: null, evidence: f.evidence })));
    const telegram = (await getStoreSetting(scope, "notifications")).telegram.profitAlerts;
    for (const f of step.fire) {
      const vars = alertVars(f);
      const dedupeKey = `fin.profit_alert:${f.kind}:${f.key || "-"}:${f.firedAt.getTime()}`;
      await notify({ audience: "store_role", storeId: scope.storeId, roles: ["owner", "admin"] }, "fin.profit_alert", vars, { link: `/app/${store.handle}/finance`, dedupeKey });
      if (telegram) {
        try {
          await enqueue(scope, [{ kind: "telegram", topic: "profit_alert", dedupeKey: `profit_alert:${scope.storeId}:${f.kind}:${f.key || "-"}:${f.firedAt.getTime()}`, payload: { ...vars, evidence: f.evidence } }]);
        } catch (err) {
          // P8's outbox is a typed stub until it merges: the in-app notification stands alone meanwhile
          if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError("fin:alerts-telegram", err);
        }
      }
    }
  }
  return { fired: step.fire.length, kept: step.keep.length, cleared: step.clear.length };
}
