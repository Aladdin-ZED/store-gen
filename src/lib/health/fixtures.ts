/**
 * The base inputs every `test:health` fixture is merged over (P0b, CCR P5-8, P6-13: `HealthRuleFixture.fires` /
 * `.silent` are `Partial<HealthInputs>` merged over "P1's empty base inputs"), and the builders the fixtures of
 * src/lib/health/rules/*.ts use for the bulkier fields. Pure and isomorphic: no database, no clock read (the base takes
 * its `now`).
 *
 * The base is a store that exists and nothing else: every source field `null` ("the source failed or has nothing",
 * so a rule that needs it stays silent), `slaHours` unset.
 */
import type { OrderKpis } from "@/lib/orders/profile";
import type { StoreRow } from "@/lib/tenancy/types";
import type { HealthInputs } from "./types";

/** A fixed instant, so fixtures never depend on the machine clock. */
export const FIXTURE_NOW = new Date("2026-10-28T10:00:00.000Z");

export function fixtureStore(patch: Partial<StoreRow> = {}): StoreRow {
  return {
    id: "01JH000000000000000000STA1",
    handle: "atlas-argan",
    name: "Atlas Argan",
    mode: "landing",
    status: "active",
    planId: "starter",
    market: "MA",
    currency: "MAD",
    timezone: "Africa/Casablanca",
    defaultLocale: "ar",
    homePageId: null,
    brandSeed: "fixture",
    catalogVersion: 1,
    addressVersion: 1,
    requireMember2fa: false,
    primaryDomain: null,
    ...patch,
  };
}

/** The empty base: a store, a clock, and no source answered. */
export function emptyHealthInputs(patch: Partial<HealthInputs> = {}, now: Date = FIXTURE_NOW): HealthInputs {
  return {
    store: fixtureStore(),
    now,
    slaHours: null,
    pages: null,
    brand: null,
    abuseReports: null,
    orders: null,
    integrations: null,
    sheets: null,
    ai: null,
    design: null,
    usage: null,
    settings: null,
    members: null,
    review: null,
    zones: null,
    ...patch,
  };
}

const kpi = (n: number) => ({ n, min: 30, insufficient: true as const });

/** `inputs.orders` for `placed` orders in the 7-day window, `risky7d` of them at risk ≥ 70. */
export function fixtureOrders(placed: number, patch: Partial<NonNullable<HealthInputs["orders"]>> = {}): NonNullable<HealthInputs["orders"]> {
  const kpis: OrderKpis = {
    window: "7d",
    placed,
    confirmed: 0,
    delivered: 0,
    decided: 0,
    confirmationRate: kpi(placed),
    deliveryRate: kpi(0),
    firstTouchP50Min: kpi(placed),
    unreachableRate: kpi(placed),
    riskyShare: kpi(placed),
    lastOrderAt: placed > 0 ? FIXTURE_NOW.toISOString() : null,
    computedAt: FIXTURE_NOW.toISOString(),
  };
  return { ...kpis, risky7d: 0, firstTouchP50Ms: null, unattempted2h: 0, unreachable7d: 0, unreachable28d: 0, ...patch };
}

/** `inputs.pages` with `published` live pages named after their index. */
export function fixturePages(published: number, patch: Partial<NonNullable<HealthInputs["pages"]>> = {}): NonNullable<HealthInputs["pages"]> {
  const live = Array.from({ length: published }, (_, i) => ({
    id: `01JH0000000000000000PAGE${String(i).padStart(2, "0")}`,
    slug: `page-${i + 1}`,
    updatedAt: FIXTURE_NOW,
    name: `Page ${i + 1}`,
    seoTitle: null,
  }));
  return { published, drafts: 0, lastPublishAt: published ? FIXTURE_NOW : null, renderFailed: 0, live, ...patch };
}
