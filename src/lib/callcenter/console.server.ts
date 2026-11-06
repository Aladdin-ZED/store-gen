import "server-only";
/**
 * The agent console's server reads (P4 CALL CENTER; operations.md OPE-§13, §13.2a, §13.4, §15.5 R1 half, §M.1).
 *
 *   consoleBoot(ctx, mode)    the first state the `/queue` page hands its client: presence, the calling window and
 *                             whether it is open, the viewer's callbacks and today's counters (`queueState`), whether
 *                             the viewer holds a claim ("Back to my order"), the daily cap, and what the viewer may do
 *                             (reveal, block, open calls); read-only under impersonation or a read-only store
 *   myFigures(ctx)            `/queue/me`: the viewer's own KPIs for today, 7 and 28 days (each rate with its n,
 *                             "needs 20" below the agent minimum, OD17) and the end-of-day line's callbacks for tomorrow
 *
 * Every read goes through the store's scope; nothing here carries a full phone (`queueState` masks them).
 */
import { and, count, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import type { AdminLocale } from "@/lib/i18n/admin";
import { holdsClaim } from "@/lib/orders/queue";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx } from "@/lib/tenancy/types";
import { queueState, type QueueState } from "./board.server";
import { agentPeriodKpis, agentsToday, periodKpisOf, type AgentPeriodKpis } from "./kpis.server";
import { opsNow, profileOf, type Presence } from "./presence";
import { callingWindowFor } from "./window.server";
import { addDaysYmd, instantAt, isCallable, storeYmd, type EffectiveWindow } from "./window";

/** Why the console shows outcomes hidden (OPE-§13.4 "Store read-only / impersonation"). */
export type ConsoleReadOnly = "impersonation" | "store" | null;

export interface ConsoleBoot {
  handle: string;
  storeId: string;
  storeName: string;
  currency: string;
  userId: string;
  firstName: string;
  locale: AdminLocale;
  tz: string;
  presence: Presence;
  dailyCap: number | null;
  window: EffectiveWindow;
  open: boolean;
  opensAt: string | null;
  state: QueueState;
  held: boolean;
  can: { reveal: boolean; block: boolean; configure: boolean; outcome: boolean };
  readOnly: ConsoleReadOnly;
  /** "Store restricted: no new orders arrive" (OPE-§13.4) */
  restricted: boolean;
  now: string;
}

/** The console's first state (see the header). */
export async function consoleBoot(ctx: StoreCtx, locale: AdminLocale, readOnly: ConsoleReadOnly): Promise<ConsoleBoot> {
  const { scope } = ctx;
  const now = opsNow();
  const [profile, w, state, held] = await Promise.all([
    readOnly ? Promise.resolve(null) : profileOf(scope, ctx.user.id),
    callingWindowFor(scope),
    queueState(scope, ctx.user.id),
    readOnly ? Promise.resolve(false) : holdsClaim(scope, ctx.user.id),
  ]);
  const open = isCallable(now, w);
  return {
    handle: ctx.store.handle,
    storeId: ctx.store.id,
    storeName: ctx.store.name,
    currency: ctx.store.currency,
    userId: ctx.user.id,
    firstName: (ctx.user.name ?? "").trim().split(/\s+/)[0] ?? "",
    locale,
    tz: w.tz,
    presence: (profile?.presence as Presence | undefined) ?? "offline",
    dailyCap: profile?.dailyCap ?? null,
    window: w,
    open: open.open,
    opensAt: open.open ? null : (open.opensAt?.toISOString() ?? null),
    state,
    held,
    can: {
      reveal: !readOnly && ctx.can("orders.reveal_phone"),
      block: !readOnly && ctx.can("blocklist.write"),
      configure: !readOnly && ctx.can("callcenter.configure"),
      outcome: !readOnly && ctx.can("orders.write"),
    },
    readOnly,
    restricted: ctx.store.status === "restricted",
    now: now.toISOString(),
  };
}

export interface MyFigures {
  today: AgentPeriodKpis;
  d7: AgentPeriodKpis;
  d28: AgentPeriodKpis;
  /** "Today: 23 decided · 15 confirmed · 2 callbacks for tomorrow" (`ops.me.endOfDay`) */
  endOfDay: { decided: number; confirmed: number; callbacksTomorrow: number };
  tz: string;
}

/** `/queue/me` (see the header): the viewer's own rows only. */
export async function myFigures(ctx: StoreCtx): Promise<MyFigures> {
  const { scope } = ctx;
  const uid = ctx.user.id;
  const now = opsNow();
  const w = await callingWindowFor(scope);
  const tomorrow = addDaysYmd(storeYmd(now, w.tz), 1);
  const [today, d7, d28, [cb]] = await Promise.all([
    agentsToday(scope),
    agentPeriodKpis(scope, 7),
    agentPeriodKpis(scope, 28),
    db
      .select({ n: count() })
      .from(orders)
      .where(
        whereStore(
          orders,
          scope,
          and(eq(orders.assigneeId, uid), eq(orders.confirmState, "callback"), eq(orders.isTest, false), gte(orders.dueAt, instantAt(tomorrow, "00:00", w.tz)), lt(orders.dueAt, instantAt(addDaysYmd(tomorrow, 1), "00:00", w.tz))),
        ),
      ),
  ]);
  const t = periodKpisOf(uid, 1, today.filter((d) => d.userId === uid));
  const empty = (days: number) => periodKpisOf(uid, days, []);
  return {
    today: t,
    d7: d7.find((k) => k.userId === uid) ?? empty(7),
    d28: d28.find((k) => k.userId === uid) ?? empty(28),
    endOfDay: { decided: t.decided, confirmed: t.confirmed, callbacksTomorrow: Number(cb?.n ?? 0) },
    tz: w.tz,
  };
}
