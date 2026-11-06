import "server-only";
/**
 * The reads of `/app/<h>/team/agents` and `/app/<h>/team/agents/<userId>` (P4 CALL CENTER; operations.md OPE-§14.2,
 * OD17, OD54, OPS-23). Reads only; the edits are the actions of src/app/app/[store]/team/agents/actions.ts.
 *
 *   agentsOverview   the members holding `agents.self` (owners and managers who take calls carry their role chip),
 *                    presence, daily cap, weight, the mapped sheet labels and the 7 / 28-day KPIs with their n; the
 *                    gauge "Agents: 2 of 10" counts members whose role is `agent` only (the `agents_max` limit)
 *   agentDetail      one call taker: the same line plus the 28 store-local days (decided / confirmed / attempts per
 *                    day, the outcome mix, the first-touch distribution) from the one live computation of
 *                    kpis.server.ts, the cancel-reason mix of OPE-§27.6 and the recent orders (masked)
 *
 * A member of another store, a removed member or one without `agents.self` answers null, exactly like a missing id.
 * Test and honeypot orders never count (core D54): the figures come from `computeAgentDays`, which excludes them; the
 * recent orders list shows them with their TEST chip, as the orders list does.
 */
import { desc, eq, or } from "drizzle-orm";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentProfiles, orders, storeMembers, users } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import type { OrderStatus } from "@/lib/orders/contract";
import { maskPhone } from "@/lib/orders/masking";
import type { Kpi } from "@/lib/orders/profile";
import { projectStatus } from "@/lib/orders/state";
import { maskIfImpersonation, maskName } from "@/lib/platform/mask";
import { entitlement } from "@/lib/tenancy/entitlements";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { cancelReasonMix } from "./aggregates";
import { storeTz, trailingDays } from "./insights-sql";
import { agentPeriodKpis, computeAgentDays, periodKpisOf, type AgentPeriodKpis } from "./kpis.server";
import { labelsByMember } from "./labels";
import { isLive, opsNow, type Presence } from "./presence";
import { callingWindowFor } from "./window.server";

const ID26_RE = /^[0-9A-Z]{26}$/;
/** the agent page's recent orders */
export const RECENT_ORDERS = 15;
/** first-touch buckets in window minutes: [0, 5), [5, 15), [15, 30), [30, 60), [60, 120), [120, ∞) */
export const FIRST_TOUCH_EDGES = [5, 15, 30, 60, 120] as const;

export interface AgentListRow {
  userId: string;
  name: string;
  role: string;
  presence: Presence;
  live: boolean;
  dailyCap: number | null;
  weight: number;
  /** sheet labels mapped to this member (OD54) */
  labels: string[];
  d7: AgentPeriodKpis;
  d28: AgentPeriodKpis;
}

export interface AgentsOverview {
  agents: AgentListRow[];
  /** members whose role is `agent` against the plan's `agents_max` (null = unlimited) */
  gauge: { used: number; limit: number | null };
}

export interface AgentDay {
  day: string;
  decided: number;
  confirmed: number;
  attempts: number;
}

export interface AgentDetail extends AgentListRow {
  /** the 28 store-local days, oldest first, today included (days without work are zeros) */
  trend: AgentDay[];
  /** the 28 days' decisions by outcome */
  outcomes: { confirmed: number; cancelled: number; unreachable: number; fake: number; duplicates: number; callbacks: number };
  cancelReasons: Awaited<ReturnType<typeof cancelReasonMix>>;
  /** counts per FIRST_TOUCH_EDGES bucket (6 buckets) and their n */
  firstTouch: { buckets: number[]; n: number; p50: Kpi };
  recent: { id: string; createdAt: string; customer: string; phoneMasked: string; city: string | null; status: OrderStatus; totalCents: number; currency: string; isTest: boolean }[];
}

/** The store's active members who take calls, with their profile row (or the defaults of OPE-§2.4). */
async function callTakers(scope: StoreScope) {
  const [members, profiles] = await Promise.all([
    db
      .select({ userId: storeMembers.userId, role: storeMembers.role, name: users.name })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(whereStore(storeMembers, scope, eq(storeMembers.status, "active")))
      .limit(500),
    db
      .select({ userId: agentProfiles.userId, presence: agentProfiles.presence, lastSeenAt: agentProfiles.lastSeenAt, dailyCap: agentProfiles.dailyCap, weight: agentProfiles.weight })
      .from(agentProfiles)
      .where(whereStore(agentProfiles, scope)),
  ]);
  const prof = new Map(profiles.map((p) => [p.userId, p]));
  const now = opsNow();
  return {
    all: members,
    takers: members
      .filter((m) => can(m.role, "agents.self"))
      .map((m) => {
        const p = prof.get(m.userId);
        return { userId: m.userId, name: m.name, role: m.role as string, presence: (p?.presence ?? "offline") as Presence, live: p ? isLive(p, now) : false, dailyCap: p?.dailyCap ?? null, weight: p?.weight ?? 1 };
      }),
  };
}

/** The agents list (see the header): live first, then by name. */
export async function agentsOverview(scope: StoreScope): Promise<AgentsOverview> {
  const [{ all, takers }, d7, d28, labels, limit] = await Promise.all([
    callTakers(scope),
    agentPeriodKpis(scope, 7),
    agentPeriodKpis(scope, 28),
    labelsByMember(scope),
    entitlement(scope, "agents_max") as Promise<number | null>,
  ]);
  const k7 = new Map(d7.map((k) => [k.userId, k]));
  const k28 = new Map(d28.map((k) => [k.userId, k]));
  const agents = takers
    .map((a) => ({ ...a, labels: labels[a.userId] ?? [], d7: k7.get(a.userId) ?? periodKpisOf(a.userId, 7, []), d28: k28.get(a.userId) ?? periodKpisOf(a.userId, 28, []) }))
    .sort((x, y) => Number(y.live) - Number(x.live) || x.name.localeCompare(y.name));
  return { agents, gauge: { used: all.filter((m) => m.role === "agent").length, limit: typeof limit === "number" ? limit : null } };
}

/** One call taker's page (see the header); null for anyone else. */
export async function agentDetail(scope: StoreScope, userId: string): Promise<AgentDetail | null> {
  if (typeof userId !== "string" || !ID26_RE.test(userId)) return null;
  const { takers } = await callTakers(scope);
  const me = takers.find((a) => a.userId === userId);
  if (!me) return null;
  const tz = await storeTz(scope);
  const days = trailingDays(tz, opsNow(), 28);
  const [list, labels, cancelReasons, recentRows] = await Promise.all([
    callingWindowFor(scope).then((w) => computeAgentDays(scope, days, w)),
    labelsByMember(scope),
    cancelReasonMix(scope, 28, { agent: userId }),
    db
      .select({ id: orders.id, createdAt: orders.createdAt, name: orders.name, phone: orders.phone, city: orders.city, confirmState: orders.confirmState, shipState: orders.shipState, total: orders.total, currency: orders.currency, isTest: orders.isTest })
      .from(orders)
      .where(whereStore(orders, scope, or(eq(orders.confirmedBy, userId), eq(orders.assigneeId, userId))))
      .orderBy(desc(orders.createdAt))
      .limit(RECENT_ORDERS),
  ]);
  const mine = list.filter((d) => d.userId === userId);
  const byDay = new Map(mine.map((d) => [d.day, d]));
  const last7 = new Set(days.slice(-7).map((d) => d.ymd));
  const sum = <K extends "confirmed" | "cancelled" | "unreachable" | "fake" | "duplicates" | "callbacks">(k: K) => mine.reduce((s, d) => s + d[k], 0);
  const touches = mine.flatMap((d) => d.firstTouchMin);
  const buckets = [0, 0, 0, 0, 0, 0];
  for (const m of touches) {
    const i = FIRST_TOUCH_EDGES.findIndex((e) => m < e);
    buckets[i === -1 ? FIRST_TOUCH_EDGES.length : i]! += 1;
  }
  const d28 = periodKpisOf(userId, 28, mine);
  return {
    ...me,
    labels: labels[userId] ?? [],
    d7: periodKpisOf(userId, 7, mine.filter((d) => last7.has(d.day))),
    d28,
    trend: days.map((d) => {
      const s = byDay.get(d.ymd);
      return { day: d.ymd, decided: s?.decided ?? 0, confirmed: s?.confirmed ?? 0, attempts: s?.attempts ?? 0 };
    }),
    outcomes: { confirmed: sum("confirmed"), cancelled: sum("cancelled"), unreachable: sum("unreachable"), fake: sum("fake"), duplicates: sum("duplicates"), callbacks: sum("callbacks") },
    cancelReasons,
    firstTouch: { buckets, n: touches.length, p50: d28.firstTouchP50Min },
    recent: recentRows.map((o) => {
      const m = maskIfImpersonation(scope, { name: o.name, phone: null, address: null, city: o.city, landmark: null, note: null });
      return {
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        customer: String(maskName(String(m.name ?? ""))),
        phoneMasked: maskPhone(o.phone),
        city: m.city === null ? null : String(m.city),
        status: projectStatus({ confirm: o.confirmState, ship: o.shipState }),
        totalCents: toCents(o.total),
        currency: o.currency,
        isTest: o.isTest,
      };
    }),
  };
}

