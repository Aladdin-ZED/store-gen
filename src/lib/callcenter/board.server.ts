import "server-only";
/**
 * The two polled payloads of `GET /api/app/<h>/ops/state` (P4 CALL CENTER; operations.md OPE-§14.1, §27.3, OD33, OD38,
 * OD44, OD54). Reads only: the route never writes (the heartbeat is `POST /ops/presence`).
 *
 *   boardState   view=board (orders.read_all): the tiles of `queueCounts` plus today's confirmed / decided with the
 *                confirmation rate and its n (placed, confirmed and delivered never share a tile, OD38), the agents
 *                table (presence, current order, today's figures, first touch p50 with its n, cap use, lookups of the
 *                hour), the sheet agents (OD54) and the best-hours strip (OD44: per store-local hour over the trailing
 *                90 days, a rate only from 30 attempts). Cached 5 s per store.
 *   queueState   view=queue (agents.self): the viewer's callbacks (due in the next 24 h or overdue, masked) and the
 *                end-of-day line (today's decided / confirmed / attempts and the confirmation rate with its n).
 *                Cached 5 s per (store, viewer).
 *
 * Names in the agents table are the members' own display names (store staff, not customers); customer fields appear
 * only as the masked first name + initial and a masked phone, through maskIfImpersonation (OD61).
 */
import { asc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentProfiles, orders, storeMembers, users } from "@/lib/db/schema";
import { maskPhone } from "@/lib/orders/masking";
import { orderKpis, queueCounts, type Kpi, type QueueCounts } from "@/lib/orders/profile";
import { maskIfImpersonation, maskName } from "@/lib/platform/mask";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { attemptStats } from "./aggregates";
import { inboundLookupsThisHour } from "./inbound";
import { agentsToday, type AgentDayStats } from "./kpis.server";
import { confirmationRate, contactRate, firstTouchP50 } from "./kpis";
import { isLive, opsNow } from "./presence";
import { callingWindowFor } from "./window.server";
import { sheetAgents, type SheetAgentRow } from "./labels";

export interface BoardAgentRow {
  userId: string;
  name: string;
  role: string;
  presence: "online" | "break" | "offline";
  live: boolean;
  /** the order the agent holds now, and since when (the lease start) */
  current: { orderId: string; since: string } | null;
  decided: number;
  confirmed: number;
  attempts: number;
  reveals: number;
  abandoned: number;
  skipped: number;
  firstTouchP50Min: Kpi;
  dailyCap: number | null;
  /** inbound lookups this hour (OPE-§5.7) */
  lookupsHour: number;
}

export interface BestHourCell {
  hour: number;
  attempts: number;
  contacted: number;
  /** n ≥ 30 attempts (OD44) */
  contactRate: Kpi;
  /** a calling hour of at least one weekday */
  inWindow: boolean;
}

export interface BoardState {
  view: "board";
  tiles: QueueCounts & { confirmedToday: number; decidedToday: number; confirmationRateToday: Kpi };
  agents: BoardAgentRow[];
  sheetAgents: SheetAgentRow[];
  bestHours: BestHourCell[];
  computedAt: string;
}

export interface QueueCallback {
  orderId: string;
  dueAt: string;
  overdue: boolean;
  customer: string;
  phoneMasked: string;
  city: string | null;
}

export interface QueueState {
  view: "queue";
  callbacks: QueueCallback[];
  today: { decided: number; confirmed: number; attempts: number; confirmationRate: Kpi };
  computedAt: string;
}

const boardCache = scopedCache<BoardState>({ name: "ops-state-board", maxEntries: 2_000, ttlMs: 5_000 });
const queueCache = scopedCache<QueueState>({ name: "ops-state-queue", maxEntries: 20_000, ttlMs: 5_000 });
const DAY_MS = 86_400_000;

/** The best-hours strip (pure): attempts of every weekday folded per hour, a rate only from 30 attempts. */
export function bestHoursOf(cells: readonly { weekday: number; hour: number; attempts: number; contacted: number }[], windowHours: ReadonlySet<number>): BestHourCell[] {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, attempts: 0, contacted: 0 }));
  for (const c of cells) {
    const h = byHour[c.hour];
    if (!h) continue;
    h.attempts += c.attempts;
    h.contacted += c.contacted;
  }
  return byHour.map((h) => ({ ...h, contactRate: contactRate(h), inWindow: windowHours.has(h.hour) }));
}

/** The store-local hours a range touches ("09:30"-"12:00" → 9, 10, 11; a range across midnight wraps). Pure. */
export function hoursOf(r: { from: string; to: string }): number[] {
  const fh = Number(r.from.slice(0, 2));
  const th = (Number(r.to.slice(0, 2)) + (r.to.slice(3) === "00" ? 0 : 1)) % 24;
  const out: number[] = [];
  for (let h = fh, i = 0; i < 24 && (h !== th || (i === 0 && r.from > r.to && fh === th)); h = (h + 1) % 24, i++) out.push(h);
  return out;
}

/** The board payload (see the header); 5 s per store. */
export async function boardState(scope: StoreScope): Promise<BoardState> {
  return boardCache.getOrLoad(scope.storeId, "board", async () => {
    const now = opsNow();
    const [counts, today, w, ops, figures, members, profiles, held, sheet, attempts] = await Promise.all([
      queueCounts(scope),
      orderKpis(scope, "today"),
      callingWindowFor(scope),
      getStoreSetting(scope, "ops"),
      agentsToday(scope),
      db
        .select({ userId: storeMembers.userId, role: storeMembers.role, name: users.name })
        .from(storeMembers)
        .innerJoin(users, eq(users.id, storeMembers.userId))
        .where(whereStore(storeMembers, scope, eq(storeMembers.status, "active")))
        .limit(500),
      db.select({ userId: agentProfiles.userId, presence: agentProfiles.presence, lastSeenAt: agentProfiles.lastSeenAt, dailyCap: agentProfiles.dailyCap }).from(agentProfiles).where(whereStore(agentProfiles, scope)),
      db
        .select({ id: orders.id, assigneeId: orders.assigneeId, leaseUntil: orders.leaseUntil })
        .from(orders)
        .where(whereStore(orders, scope, isNotNull(orders.claimToken), isNotNull(orders.assigneeId), gt(orders.leaseUntil, now)))
        .limit(500),
      sheetAgents(scope),
      attemptStats(scope),
    ]);
    const agents = members.filter((m) => can(m.role, "agents.self"));
    const lookups = await inboundLookupsThisHour(
      scope,
      agents.map((a) => a.userId),
    );
    const prof = new Map(profiles.map((p) => [p.userId, p]));
    const fig = new Map<string, AgentDayStats>(figures.map((f) => [f.userId, f]));
    const holding = new Map<string, { orderId: string; since: string }>();
    for (const h of held) {
      if (!h.assigneeId || !h.leaseUntil) continue;
      holding.set(h.assigneeId, { orderId: h.id, since: new Date(h.leaseUntil.getTime() - ops.leaseMinutes * 60_000).toISOString() });
    }
    const rows: BoardAgentRow[] = agents.map((a) => {
      const p = prof.get(a.userId);
      const f = fig.get(a.userId);
      return {
        userId: a.userId,
        name: a.name,
        role: a.role,
        presence: p?.presence ?? "offline",
        live: p ? isLive(p, now) : false,
        current: holding.get(a.userId) ?? null,
        decided: f?.decided ?? 0,
        confirmed: f?.confirmed ?? 0,
        attempts: f?.attempts ?? 0,
        reveals: f?.reveals ?? 0,
        abandoned: f?.abandoned ?? 0,
        skipped: f?.skipped ?? 0,
        firstTouchP50Min: firstTouchP50(f?.firstTouchMin ?? [], "agent"),
        dailyCap: p?.dailyCap ?? null,
        lookupsHour: lookups[a.userId] ?? 0,
      };
    });
    rows.sort((x, y) => Number(y.live) - Number(x.live) || y.decided - x.decided || x.name.localeCompare(y.name));
    const windowHours = new Set<number>();
    for (const list of Object.values(w.days)) for (const r of list) for (const h of hoursOf(r)) windowHours.add(h);
    return {
      view: "board",
      tiles: { ...counts, confirmedToday: today.confirmed, decidedToday: today.decided, confirmationRateToday: today.confirmationRate },
      agents: rows,
      sheetAgents: sheet,
      bestHours: bestHoursOf(attempts, windowHours),
      computedAt: now.toISOString(),
    };
  });
}

/** The agent's own console line (see the header); 5 s per (store, viewer). */
export async function queueState(scope: StoreScope, userId: string): Promise<QueueState> {
  return queueCache.getOrLoad(scope.storeId, `q:${userId}`, async () => {
    const now = opsNow();
    const [rows, figures] = await Promise.all([
      db
        .select({ id: orders.id, dueAt: orders.dueAt, name: orders.name, phone: orders.phone, city: orders.city })
        .from(orders)
        .where(whereStore(orders, scope, eq(orders.assigneeId, userId), inArray(orders.confirmState, ["callback"]), isNotNull(orders.dueAt), lte(orders.dueAt, new Date(now.getTime() + DAY_MS))))
        .orderBy(asc(orders.dueAt))
        .limit(50),
      agentsToday(scope),
    ]);
    const mine = figures.find((f) => f.userId === userId);
    const callbacks = rows.map((r) => {
      const m = maskIfImpersonation(scope, { name: r.name, phone: null, address: null, city: r.city, landmark: null, note: null });
      return {
        orderId: r.id,
        dueAt: r.dueAt!.toISOString(),
        overdue: r.dueAt!.getTime() <= now.getTime(),
        customer: maskName(m.name ?? ""),
        phoneMasked: maskPhone(r.phone),
        city: m.city ?? null,
      };
    });
    const c = { confirmed: mine?.confirmed ?? 0, cancelled: mine?.cancelled ?? 0, unreachable: mine?.unreachable ?? 0 };
    return {
      view: "queue",
      callbacks,
      today: { decided: mine?.decided ?? 0, confirmed: c.confirmed, attempts: mine?.attempts ?? 0, confirmationRate: confirmationRate(c, "agent") },
      computedAt: now.toISOString(),
    };
  });
}

/** Forget the polled payloads of a store (tests). */
export function forgetBoardState(scope: StoreScope): void {
  boardCache.delete(scope.storeId);
  queueCache.delete(scope.storeId);
}

