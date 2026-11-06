/**
 * Store Health rules of the integrations track (P5 INTEGRATIONS, operations.md OPE-§27.2; platform.md PLA-§6.3.2, PD79;
 * core §I.7, D53). Extension file (docs/STORE-SAAS.md §I.7, §K.3), imported by src/lib/health/registry.ts; texts
 * `health.integrations.<rule>.text` in the track's own i18n file (D67), in ar, fr and en.
 *
 * | Rule | Group | Sev | Fires when (the store's own data) | minN |
 * |---|---|---|---|---|
 * | `int:sheets_backlog` | integrations | 3 | Sheets connected and the oldest waiting order older than `max(15, 5 × ceil(active / 16))` min | — |
 * | `int:capi_failing` | integrations | 2 | a pixel `failing` with an error in the last 24 h (so no success in 24 h) | — |
 * | `int:telegram_failing` | integrations | 2 | Telegram `failing` | — |
 * | `int:delivery_dead` | integrations | 2 | ≥ 1 dead outbox item of the kinds tenants see | — |
 * | `int:turnstile` | integrations | 1 | > 20 % of a store-local day's orders flagged `captcha_missing` / `captcha_unverified` | 20 orders |
 * | `conv:trigger_hint` | conversion | 1 | Purchase trigger `order` while ≥ 50 % of decided orders (28 d) were confirmed by a person | 30 orders |
 *
 * P1's console flags `sheets_backlog`, `capi_failing`, `telegram_failing` and `outbox_dead` are derived from these
 * issues (PD79): one condition, one issue. Each `collect` is read-only and scoped (≤ 40 ms); a source that is null or
 * fails leaves its rule silent.
 *
 * Three rules read beyond `HealthInputs`: the platform count of active Sheets stores (cached 5 min, a count of rows,
 * never another store's data), the store's dead deliveries and its captcha flags over two days. The registry is
 * imported outside the server bundle too (P1's offline `test:health`), so those reads load lazily, and a fixture
 * supplies them under `p5Reads` (merged over the base inputs like every other field; `withReads` below), so every
 * fixture runs without a database. The health job never sets `p5Reads`.
 */
import { sheetsBacklogThresholdMin } from "@/lib/integrations/status-rules";
import { appHref } from "@/lib/urls";
import type { HealthFix, HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

/** What the rules read themselves; a fixture provides it under `p5Reads`. */
export interface IntegrationsRuleReads {
  activeSheetsStores?: number;
  deadDeliveries?: number;
  captcha?: { today: { orders: number; flagged: number }; yesterday: { orders: number; flagged: number } };
}
type WithReads = HealthInputs & { p5Reads?: IntegrationsRuleReads };

/** A fixture's inputs with the rule reads attached (typed as the frozen fixture shape). */
export function withReads(inputs: Partial<HealthInputs>, reads: IntegrationsRuleReads): Partial<HealthInputs> {
  return Object.assign({}, inputs, { p5Reads: reads });
}

const readsOf = (inputs: HealthInputs) => (inputs as WithReads).p5Reads;

/** Turnstile: the share of a day's orders above which the rule fires, and the orders it needs. */
export const TURNSTILE_SHARE = 0.2;
export const TURNSTILE_MIN_N = 20;
/** Purchase trigger hint: the confirmed share of decided orders, and the decided orders it needs. */
export const TRIGGER_CONFIRMED_SHARE = 0.5;
export const TRIGGER_MIN_N = 30;
const DAY_MS = 24 * 60 * 60_000;

const POINTS = { 1: 3, 2: 6, 3: 10 } as const;

const link = (path: `/${string}`, label: string): HealthFix => ({ kind: "link", href: (handle) => appHref(handle, path), label });

function issue(id: string, group: HealthIssue["group"], severity: 1 | 2 | 3, evidence: HealthIssue["evidence"], fix: HealthFix): HealthIssue {
  return { id, group, severity, points: POINTS[severity], evidence, fix, text: `health.integrations.${id.split(":")[1]}.text` };
}

const pct = (part: number, whole: number) => Math.round((part / whole) * 100);

/* ---------------- lazy server reads (never from a fixture) ---------------- */

async function activeSheets(inputs: HealthInputs): Promise<number | null> {
  const given = readsOf(inputs)?.activeSheetsStores;
  if (given !== undefined) return given;
  try {
    const { activeSheetsStores } = await import("@/lib/sheets/history");
    return await activeSheetsStores(inputs.now.getTime());
  } catch {
    return null;
  }
}

async function deadDeliveries(scope: Parameters<HealthRule["collect"]>[0], inputs: HealthInputs): Promise<number | null> {
  const given = readsOf(inputs)?.deadDeliveries;
  if (given !== undefined) return given;
  try {
    const { deadDeliveryCount } = await import("@/lib/integrations/health");
    return await deadDeliveryCount(scope);
  } catch {
    return null;
  }
}

async function captcha(scope: Parameters<HealthRule["collect"]>[0], inputs: HealthInputs): Promise<IntegrationsRuleReads["captcha"] | null> {
  const given = readsOf(inputs)?.captcha;
  if (given !== undefined) return given;
  try {
    const { captchaDays } = await import("@/lib/integrations/health");
    return await captchaDays(scope, inputs.store.timezone, inputs.now);
  } catch {
    return null;
  }
}

/* ---------------- the rules ---------------- */

export const rules: HealthRule[] = [
  {
    id: "int:sheets_backlog",
    group: "integrations",
    release: "R1",
    async collect(_scope, inputs) {
      const sheets = inputs.sheets;
      const row = inputs.integrations?.find((r) => r.kind === "sheets" && r.targetId === "");
      if (!sheets || sheets.oldestMin === null || !row || row.state === "off") return null;
      // the cheap test first: below the floor of 15 minutes no count is needed
      if (sheets.oldestMin <= sheetsBacklogThresholdMin(1)) return null;
      const threshold = sheetsBacklogThresholdMin(await activeSheets(inputs));
      if (sheets.oldestMin <= threshold) return null;
      return issue(
        "int:sheets_backlog",
        "integrations",
        3,
        { metric: "sheets_oldest_pending_min", value: sheets.oldestMin, baseline: threshold, window: "now", n: sheets.pending },
        link("/integrations/sheets", "health.integrations.fix.sheets"),
      );
    },
  },
  {
    id: "int:capi_failing",
    group: "integrations",
    release: "R1",
    async collect(_scope, inputs) {
      const pixels = inputs.integrations?.filter((r) => r.kind === "capi" && r.state !== "off");
      if (!pixels?.length) return null;
      const since = inputs.now.getTime() - DAY_MS;
      const failing = pixels.filter((r) => r.state === "failing" && r.lastErrorAt !== null && Date.parse(r.lastErrorAt) >= since);
      if (!failing.length) return null;
      return issue(
        "int:capi_failing",
        "integrations",
        2,
        { metric: "capi_failing_pixels", value: failing.length, window: "24h", n: pixels.length },
        link("/integrations/pixels", "health.integrations.fix.pixels"),
      );
    },
  },
  {
    id: "int:telegram_failing",
    group: "integrations",
    release: "R1",
    async collect(_scope, inputs) {
      const row = inputs.integrations?.find((r) => r.kind === "telegram" && r.state === "failing");
      if (!row) return null;
      return issue(
        "int:telegram_failing",
        "integrations",
        2,
        { metric: "telegram_failures", value: row.failures, window: "now", n: row.failures },
        link("/integrations/telegram", "health.integrations.fix.telegram"),
      );
    },
  },
  {
    id: "int:delivery_dead",
    group: "integrations",
    release: "R1",
    async collect(scope, inputs) {
      const n = await deadDeliveries(scope, inputs);
      if (n === null || n < 1) return null;
      return issue(
        "int:delivery_dead",
        "integrations",
        2,
        { metric: "outbox_dead", value: n, window: "30d", n },
        link("/integrations#deliveries", "health.integrations.fix.deliveries"),
      );
    },
  },
  {
    id: "int:turnstile",
    group: "integrations",
    minN: TURNSTILE_MIN_N,
    release: "R1",
    async collect(scope, inputs) {
      const days = await captcha(scope, inputs);
      if (!days) return null;
      for (const [window, day] of [["today", days.today], ["yesterday", days.yesterday]] as const) {
        if (day.orders < TURNSTILE_MIN_N || day.flagged / day.orders <= TURNSTILE_SHARE) continue;
        return issue(
          "int:turnstile",
          "integrations",
          1,
          { metric: "captcha_failed_share", value: pct(day.flagged, day.orders), baseline: TURNSTILE_SHARE * 100, window, n: day.orders },
          link("/settings/anti-spam", "health.integrations.fix.antispam"),
        );
      }
      return null;
    },
  },
  {
    id: "conv:trigger_hint",
    group: "conversion",
    minN: TRIGGER_MIN_N,
    release: "R1",
    async collect(_scope, inputs) {
      const orders = inputs.orders;
      if (!orders || inputs.settings?.conversions.purchaseTrigger !== "order") return null;
      if (orders.decided < TRIGGER_MIN_N || orders.confirmed / orders.decided < TRIGGER_CONFIRMED_SHARE) return null;
      return issue(
        "conv:trigger_hint",
        "conversion",
        1,
        { metric: "confirmed_share", value: pct(orders.confirmed, orders.decided), baseline: TRIGGER_CONFIRMED_SHARE * 100, window: "28d", n: orders.decided },
        link("/integrations/pixels#server-events", "health.integrations.fix.trigger"),
      );
    },
  },
];

/* ---------------- fixtures (HealthRuleFixture, P0b: CCR P5-8) ---------------- */

const AT = "2026-10-28T10:00:00.000Z";
const NOW = new Date(AT);
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

type Row = NonNullable<HealthInputs["integrations"]>[number];
const row = (kind: Row["kind"], targetId: string, state: Row["state"], over: Partial<Row> = {}): Row => ({
  kind,
  targetId,
  state,
  lastOkAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
  lastErrorKey: null,
  failures: 0,
  backlog: 0,
  oldestPendingAt: null,
  updatedAt: AT,
  ...over,
});
const failingPixel = row("capi", "meta:111111111111111", "failing", { failures: 3, lastErrorAt: ago(30), lastErrorCode: "token_revoked", lastErrorKey: "int.cause.token_revoked" });
const sheetsOn = row("sheets", "", "warn", { backlog: 4 });
const kpis = (decided: number, confirmed: number) => ({ decided, confirmed }) as unknown as NonNullable<HealthInputs["orders"]>;
const conversions = (purchaseTrigger: "order" | "confirmed") => ({ conversions: { purchaseTrigger, pageOverrides: {}, customEvents: true, manualOrders: false } }) as unknown as NonNullable<HealthInputs["settings"]>;
const day = (orders: number, flagged: number) => ({ orders, flagged });

/**
 * One fixture per rule, `fires` and `silent` merged over P1's empty base inputs (`now` included here, since two rules
 * judge time). The minN rules fire at their minimum and stay silent one order below it with the same share.
 */
export const fixtures: HealthRuleFixture[] = [
  {
    rule: "int:sheets_backlog",
    fires: withReads({ now: NOW, sheets: { pending: 4, oldestMin: 20, lastRunFailedAt: null }, integrations: [sheetsOn] }, { activeSheetsStores: 1 }),
    // 400 active stores: slot 1 reaches each one every 25 ticks, the threshold is 125 min and 20 min is normal there
    silent: withReads({ now: NOW, sheets: { pending: 4, oldestMin: 20, lastRunFailedAt: null }, integrations: [sheetsOn] }, { activeSheetsStores: 400 }),
    expect: { severity: 3, metric: "sheets_oldest_pending_min" },
  },
  {
    rule: "int:capi_failing",
    fires: { now: NOW, integrations: [failingPixel, row("capi", "meta:222222222222222", "ok", { lastOkAt: ago(5) })] },
    silent: { now: NOW, integrations: [{ ...failingPixel, state: "warn", failures: 2 }] },
    expect: { severity: 2, metric: "capi_failing_pixels" },
  },
  {
    rule: "int:telegram_failing",
    fires: { now: NOW, integrations: [row("telegram", "", "failing", { failures: 1, lastErrorAt: ago(2), lastErrorCode: "chat_not_found" })] },
    silent: { now: NOW, integrations: [row("telegram", "", "warn", { failures: 1, lastErrorAt: ago(2), lastErrorCode: "rate_limited" })] },
    expect: { severity: 2, metric: "telegram_failures" },
  },
  {
    rule: "int:delivery_dead",
    fires: withReads({ now: NOW }, { deadDeliveries: 2 }),
    silent: withReads({ now: NOW }, { deadDeliveries: 0 }),
    expect: { severity: 2, metric: "outbox_dead" },
  },
  {
    rule: "int:turnstile",
    // 6 of 20 (30 %) at the minimum: fires; 5 of 19 (26 %) one order below it: silent
    fires: withReads({ now: NOW }, { captcha: { today: day(20, 6), yesterday: day(0, 0) } }),
    silent: withReads({ now: NOW }, { captcha: { today: day(19, 5), yesterday: day(19, 5) } }),
    expect: { severity: 1, metric: "captcha_failed_share" },
  },
  {
    rule: "conv:trigger_hint",
    // 18 of 30 decided orders confirmed (60 %): fires; 18 of 29: silent below minN
    fires: { now: NOW, orders: kpis(30, 18), settings: conversions("order") },
    silent: { now: NOW, orders: kpis(29, 18), settings: conversions("order") },
    expect: { severity: 1, metric: "confirmed_share" },
  },
];
