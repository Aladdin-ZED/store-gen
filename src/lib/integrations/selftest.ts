/**
 * Integration health self test (P5 INTEGRATIONS; operations.md OPE-§28.2, §27.2, §27.3, §21.4; OPE-§O.4 IN-03, SF-03,
 * SF-06). Offline: no database, no network, no server module. It is the "integrations health" section of
 * scripts/qa/conversions-check.ts (`test:conversions`), and runs alone too:
 *
 *   npx tsx src/lib/integrations/selftest.ts      (exit code 1 on failure)
 *
 * - the `integration_status` state rules per kind (src/lib/integrations/status-rules.ts), the 5-minute Sheets warn,
 *   3 failures, the 24-hour CAPI success window, Telegram's final codes, only a success recovers;
 * - the scaled Sheets backlog threshold (core §H.5);
 * - the causes: every stored code has its plain words, unknown codes never echo, What to check per kind;
 * - the `int:*` / `conv:*` rules on their exported fixtures (fires, silent below minN, severity and metric), their
 *   texts and fix links; the notification kinds, their vars and links; the pulse contributor's role gate;
 * - the copy: every key of the tenant-facing sets in ar, fr and en, every other `int.` key in fr, the same
 *   placeholders in every locale, no em dash, no exclamation mark, and every template renders with its variables.
 * The DB-backed half (the write throttle under 1,000 results, notifications once per incident, the deliveries log,
 * the counts and the rules on seeded stores) is scripts/qa/integrations-db-check.ts (`test:integrations-db`).
 */
import { HEALTH_RULE_PREFIXES, type HealthInputs } from "@/lib/health/types";
import { fixtures, rules } from "@/lib/health/rules/integrations";
import { formatMessage, type AdminLocale } from "@/lib/i18n/admin";
import { messages as ar } from "@/lib/i18n/admin/ar/integrations";
import { messages as en } from "@/lib/i18n/admin/en/integrations";
import { messages as fr } from "@/lib/i18n/admin/fr/integrations";
import { kinds } from "@/lib/notify/kinds/integrations";
import { contributor } from "@/lib/pulse/contributors/integrations";
import type { StoreScope } from "@/lib/tenancy/types";
import { CAUSE_CODES, HINTED_CAUSES, causeFromStatus, causeKey, classifyMetaError, classifySheetsError, classifyTelegramError, whatToCheck } from "./causes";
import { CAPI_SUCCESS_WINDOW_MS, MINUTE_MS, nextStatus, sheetsBacklogThresholdMin, type StatusInput, type StatusRow } from "./status-rules";

export interface SectionResult {
  pass: number;
  failures: string[];
  notes: string[];
  ms: number;
}

/** The wall time this section may add to `test:conversions`. */
const BUDGET_MS = 1000;

export async function integrationsHealthSelftest(): Promise<SectionResult> {
  const t0 = performance.now();
  let pass = 0;
  const failures: string[] = [];
  const notes: string[] = [];
  const ok = (label: string, cond: boolean, info?: unknown) => {
    if (cond) pass++;
    else failures.push(`integrations health: ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
  };
  const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

  /* ---------------- the state rules (OPE-§28.2) ---------------- */
  const T = Date.parse("2026-10-28T10:00:00.000Z");
  const run = (prev: StatusRow | null, steps: (StatusInput & { at?: number })[]) => {
    let row = prev;
    const states: string[] = [];
    for (const s of steps) {
      row = nextStatus(row, s, s.at ?? T);
      states.push(row.state);
    }
    return { row: row!, states };
  };
  const sheets = (outcome: StatusInput["outcome"], extra: Partial<StatusInput> = {}): StatusInput => ({ kind: "sheets", outcome, ...extra });
  const capi = (outcome: StatusInput["outcome"], extra: Partial<StatusInput & { at: number }> = {}) => ({ kind: "capi" as const, targetId: "meta:111", outcome, ...extra });
  const tg = (outcome: StatusInput["outcome"], extra: Partial<StatusInput> = {}): StatusInput => ({ kind: "telegram", outcome, ...extra });

  eq("sheets: a clean run is ok", run(null, [sheets("ok", { oldestPendingAt: new Date(T - 2 * MINUTE_MS) })]).states, ["ok"]);
  eq("sheets: a clean run with an order waiting > 5 min is warn", run(null, [sheets("ok", { oldestPendingAt: new Date(T - 6 * MINUTE_MS), backlog: 3 })]).states, ["warn"]);
  eq("sheets: exactly 5 min is still ok", run(null, [sheets("ok", { oldestPendingAt: new Date(T - 5 * MINUTE_MS) })]).states, ["ok"]);
  eq("sheets: three failed runs → warn, warn, failing", run(null, [sheets("failed", { code: "sheet_not_shared" }), sheets("failed"), sheets("failed")]).states, ["warn", "warn", "failing"]);
  eq("sheets: the breaker fails at once", run(null, [sheets("breaker", { code: "breaker" })]).states, ["failing"]);
  eq("sheets: off when disabled, ok again after a clean run", run(null, [sheets("failed"), sheets("off"), sheets("ok")]).states, ["warn", "off", "ok"]);
  const recovered = run(null, [sheets("failed"), sheets("failed"), sheets("failed"), sheets("ok")]);
  eq("sheets: a clean run recovers and resets the streak", [recovered.states.at(-1), recovered.row.failures, recovered.row.streakAt], ["ok", 0, null]);
  eq("sheets: the code of the last failure is kept after recovery", recovered.row.lastErrorCode, "unknown");

  eq("capi: a 2xx is ok", run(null, [capi("ok")]).states, ["ok"]);
  eq("capi: a retryable failure is warn", run(null, [capi("retry", { status: 503 })]).states, ["warn"]);
  eq("capi: 3 failures and never a success → failing", run(null, [capi("failed", { code: "token_revoked" }), capi("failed"), capi("failed")]).states, ["warn", "warn", "failing"]);
  const okRecently = run(null, [capi("ok", { at: T - 2 * 60 * MINUTE_MS }), capi("failed", { at: T }), capi("failed", { at: T }), capi("failed", { at: T })]);
  eq("capi: 3 failures after a success 2 h ago stay warn", okRecently.states, ["ok", "warn", "warn", "warn"]);
  const okLongAgo = run(null, [capi("ok", { at: T - CAPI_SUCCESS_WINDOW_MS }), capi("failed"), capi("failed"), capi("failed")]);
  eq("capi: 3 failures with the last success 24 h ago → failing", okLongAgo.states, ["ok", "warn", "warn", "failing"]);
  eq("capi: the stored code comes from the status when none is given", run(null, [capi("retry", { status: 503 })]).row.lastErrorCode, "server_error");

  eq("telegram: 401 → failing at once", run(null, [tg("failed", { status: 401 })]).states, ["failing"]);
  eq("telegram: 403 → failing at once", run(null, [tg("failed", { status: 403 })]).states, ["failing"]);
  eq("telegram: chat not found → failing at once", run(null, [tg("failed", { code: "chat_not_found", status: 400 })]).states, ["failing"]);
  eq("telegram: 429 → warn", run(null, [tg("retry", { status: 429 })]).states, ["warn"]);
  const kept = run(null, [tg("failed", { status: 401 }), tg("retry", { status: 429 })]);
  eq("telegram: a 429 after a revoked token stays failing and keeps the cause", [kept.states, kept.row.lastErrorCode, kept.row.failures], [["failing", "failing"], "bot_token_revoked", 2]);
  eq("telegram: only a success recovers", run(null, [tg("failed", { status: 401 }), tg("ok")]).states, ["failing", "ok"]);
  eq("webhook (R2 default): 3 failures → failing", run(null, [{ kind: "webhook", outcome: "failed" }, { kind: "webhook", outcome: "failed" }, { kind: "webhook", outcome: "failed" }]).states, ["warn", "warn", "failing"]);

  const streak = run(null, [sheets("failed", { code: "sheet_not_found" }), { ...sheets("failed"), at: T + 10 * MINUTE_MS } as StatusInput & { at: number }]);
  eq("a streak keeps its first failure as its start", streak.row.streakAt, T);
  eq("a raw message is never stored as a code", run(null, [sheets("failed", { code: "Error: +212600000000 not shared" })]).row.lastErrorCode, "unknown");
  eq("backlog and oldest pending come from the input, else stay", run(null, [sheets("ok", { backlog: 4, oldestPendingAt: new Date(T) }), sheets("failed")]).row.backlog, 4);

  /* ---------------- the scaled threshold (core §H.5, ENGC-33) ---------------- */
  eq(
    "threshold max(15, 5 × ceil(active / 16))",
    [null, 0, 1, 16, 48, 49, 64, 65, 400].map((n) => sheetsBacklogThresholdMin(n)),
    [15, 15, 15, 15, 15, 20, 20, 25, 125],
  );

  /* ---------------- causes and What to check (OPE-§28.1) ---------------- */
  eq("causeKey: nothing failed", [causeKey(null), causeKey(undefined), causeKey("")], [null, null, null]);
  eq("causeKey: a known code", causeKey("chat_not_found"), "int.cause.chat_not_found");
  eq("causeKey: an unknown or raw string never echoes", [causeKey("Bearer abc123"), causeKey("token revoked")], ["int.cause.unknown", "int.cause.unknown"]);
  ok("every cause has its words in en and fr", CAUSE_CODES.every((c) => `int.cause.${c}` in en && !!fr[`int.cause.${c}` as keyof typeof en]), CAUSE_CODES.filter((c) => !(`int.cause.${c}` in en) || !fr[`int.cause.${c}` as keyof typeof en]));
  ok("every checked cause has a hint in en and fr", HINTED_CAUSES.every((c) => `int.hint.${c}` in en && !!fr[`int.hint.${c}` as keyof typeof en]), HINTED_CAUSES);
  for (const kind of ["sheets", "capi", "telegram"] as const) {
    const list = whatToCheck(kind);
    ok(`what to check (${kind}): three causes with a link of the kind`, list.length === 3 && list.every((c) => c.path.startsWith("/integrations/") && c.link in en && c.text in en && c.hint in en), list);
  }
  eq("what to check: the named cause comes first", whatToCheck("sheets", "binding_conflict").map((c) => c.code), ["binding_conflict", "sheet_not_shared", "sheet_not_found"]);
  eq("what to check: a usual suspect is not repeated", whatToCheck("capi", "pixel_not_found").map((c) => c.code), ["pixel_not_found", "token_revoked", "permission_denied"]);
  eq("what to check: a kind without checks", whatToCheck("webhook"), []);
  eq(
    "classify Sheets",
    [
      classifySheetsError({ status: 403, message: "The caller does not have permission" }),
      classifySheetsError({ status: 403, message: "Google Sheets API has not been used in project 1" }),
      classifySheetsError({ status: 404 }),
      classifySheetsError({ status: 400, message: "Unable to parse range: 'Commandes'!A2:C" }),
      classifySheetsError({ status: 400, message: "This operation is not supported for this document" }),
      classifySheetsError({ status: 0, reason: "network" }),
      classifySheetsError({ status: 400, reason: "invalid_grant" }),
      classifySheetsError({ status: 429 }),
    ],
    ["sheet_not_shared", "sheets_api_disabled", "sheet_not_found", "sheet_tab_missing", "sheet_is_xlsx", "network", "sa_invalid", "rate_limited"],
  );
  eq(
    "classify Meta",
    [
      classifyMetaError({ status: 400, code: 190, subcode: 463 }),
      classifyMetaError({ status: 400, code: 190 }),
      classifyMetaError({ status: 400, code: 100, message: "Object with ID '1' does not exist" }),
      classifyMetaError({ status: 400, code: 100, message: "Invalid parameter" }),
      classifyMetaError({ status: 403, code: 200 }),
      classifyMetaError({ status: 400, code: 613 }),
      classifyMetaError({ status: 500 }),
    ],
    ["token_revoked", "token_invalid", "pixel_not_found", "event_rejected", "permission_denied", "rate_limited", "server_error"],
  );
  eq(
    "classify Telegram",
    [
      classifyTelegramError({ status: 401, description: "Unauthorized" }),
      classifyTelegramError({ status: 403, description: "Forbidden: bot was blocked by the user" }),
      classifyTelegramError({ status: 400, description: "Bad Request: chat not found" }),
      classifyTelegramError({ status: 429, description: "Too Many Requests: retry after 5" }),
      classifyTelegramError({ status: 404, description: "Not Found" }),
    ],
    ["bot_token_revoked", "bot_blocked", "chat_not_found", "rate_limited", "bot_token_revoked"],
  );
  eq("status per kind", [causeFromStatus(403, "sheets"), causeFromStatus(403, "capi"), causeFromStatus(403), causeFromStatus(504), causeFromStatus(0)], ["sheet_not_shared", "permission_denied", "refused", "timeout", "network"]);

  /* ---------------- the rules on their fixtures (SF-03) ---------------- */
  const base: HealthInputs = {
    store: { id: "01HZZZZZZZZZZZZZZZZZZZZZZZ", handle: "demo", name: "Demo", mode: "landing", status: "active", planId: "free", market: "MA", currency: "MAD", timezone: "Africa/Casablanca", defaultLocale: "fr", homePageId: null, brandSeed: "0", catalogVersion: 0, addressVersion: 0, requireMember2fa: false, primaryDomain: null } as HealthInputs["store"],
    now: new Date(T),
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
  };
  const scope = { storeId: base.store.id, kind: "system" } as unknown as StoreScope;
  ok("every rule id has one of the file's prefixes (PD79)", rules.every((r) => HEALTH_RULE_PREFIXES.integrations.includes(r.id.split(":")[0]!)), rules.map((r) => r.id));
  eq("one fixture per rule, in rule order", fixtures.map((f) => f.rule), rules.map((r) => r.id));
  const metrics = new Map<string, string>();
  for (const f of fixtures) {
    const rule = rules.find((r) => r.id === f.rule)!;
    const fired = await rule.collect(scope, { ...base, ...f.fires });
    const silent = await rule.collect(scope, { ...base, ...f.silent });
    // no data at all: the lazy server reads fail outside the server bundle, and a failed source keeps the rule silent
    const none = await rule.collect(scope, base);
    ok(`${f.rule}: fires on its fixture`, fired !== null && fired.id === f.rule && fired.severity === f.expect?.severity && fired.evidence.metric === f.expect?.metric && fired.group === rule.group, fired);
    ok(`${f.rule}: silent on its silent fixture${rule.minN ? ` (below minN ${rule.minN})` : ""}`, silent === null, silent);
    ok(`${f.rule}: silent without its data`, none === null, none);
    if (!fired) continue;
    ok(`${f.rule}: points follow severity`, fired.points === ({ 1: 3, 2: 6, 3: 10 } as const)[fired.severity], fired);
    ok(`${f.rule}: evidence carries its n`, Number.isInteger(fired.evidence.n) && fired.evidence.n >= 0 && typeof fired.evidence.window === "string", fired.evidence);
    ok(`${f.rule}: text in ar, fr and en`, fired.text in en && !!fr[fired.text as keyof typeof en] && !!ar[fired.text as keyof typeof en], fired.text);
    ok(`${f.rule}: fix link under the store`, fired.fix.kind === "link" && fired.fix.href("demo").startsWith("/app/demo/") && fired.fix.label in en && !!ar[fired.fix.label as keyof typeof en], fired.fix);
    ok(`${f.rule}: one metric per group`, !metrics.has(`${fired.group}:${fired.evidence.metric}`));
    metrics.set(`${fired.group}:${fired.evidence.metric}`, f.rule);
    for (const locale of ["ar", "fr", "en"] as const) {
      const cat = { ar, fr, en }[locale] as Partial<Record<string, string>>;
      const text = formatMessage(cat[fired.text]!, { value: fired.evidence.value, baseline: fired.evidence.baseline ?? 0, n: fired.evidence.n, window: fired.evidence.window }, locale);
      ok(`${f.rule}: the ${locale} text renders every variable`, !/[{}]/.test(text), text);
    }
  }
  // the minN boundary of the two rules that have one
  const turnstile = rules.find((r) => r.id === "int:turnstile")!;
  const at = (orders: number, flagged: number) => turnstile.collect(scope, { ...base, p5Reads: { captcha: { today: { orders, flagged }, yesterday: { orders: 0, flagged: 0 } } } } as HealthInputs);
  eq("turnstile: 4 of 20 (20 %) is not above the share", await at(20, 4), null);
  ok("turnstile: yesterday fires when today is too small", (await turnstile.collect(scope, { ...base, p5Reads: { captcha: { today: { orders: 3, flagged: 3 }, yesterday: { orders: 40, flagged: 12 } } } } as HealthInputs))?.evidence.window === "yesterday");
  const hint = rules.find((r) => r.id === "conv:trigger_hint")!;
  const withTrigger = (trigger: "order" | "confirmed", decided: number, confirmed: number) =>
    hint.collect(scope, { ...base, orders: { decided, confirmed } as unknown as HealthInputs["orders"], settings: { conversions: { purchaseTrigger: trigger } } as unknown as HealthInputs["settings"] });
  eq("trigger hint: silent when the trigger already waits for confirmation", await withTrigger("confirmed", 100, 90), null);
  eq("trigger hint: silent under 50 % confirmed", await withTrigger("order", 100, 49), null);
  ok("trigger hint: fires at 50 %", (await withTrigger("order", 100, 50))?.evidence.value === 50);
  const backlog = rules.find((r) => r.id === "int:sheets_backlog")!;
  const sheetsRow = (state: "ok" | "warn" | "failing" | "off") => [{ kind: "sheets", targetId: "", state, lastOkAt: null, lastErrorAt: null, lastErrorCode: null, lastErrorKey: null, failures: 0, backlog: 1, oldestPendingAt: null, updatedAt: new Date(T).toISOString() }] as HealthInputs["integrations"];
  const backlogAt = (oldestMin: number, state: "ok" | "warn" | "failing" | "off", active: number) =>
    backlog.collect(scope, { ...base, sheets: { pending: 1, oldestMin, lastRunFailedAt: null }, integrations: sheetsRow(state), p5Reads: { activeSheetsStores: active } } as HealthInputs);
  eq("sheets backlog: 15 min is not beyond 15", await backlogAt(15, "warn", 1), null);
  eq("sheets backlog: silent while Sheets is off", await backlogAt(60, "off", 1), null);
  ok("sheets backlog: 21 min fires with 49 active stores (threshold 20)", (await backlogAt(21, "warn", 49))?.evidence.baseline === 20);
  eq("sheets backlog: 20 min is silent with 49 active stores", await backlogAt(20, "warn", 49), null);

  /* ---------------- notification kinds (OPE-§21.4) ---------------- */
  eq("kinds", kinds.map((k) => k.kind), ["int.sheets_failing", "int.capi_failing", "int.telegram_failing", "int.delivery_dead"]);
  for (const k of kinds) {
    ok(`${k.kind}: tenant-facing, title and body in ar, fr and en`, k.tenant && ["title", "body"].every((p) => `notify.${k.kind}.${p}` in en && !!fr[`notify.${k.kind}.${p}` as keyof typeof en] && !!ar[`notify.${k.kind}.${p}` as keyof typeof en]));
    const sample: Record<string, string | number> = k.kind === "int.delivery_dead" ? { kind: "capi", count: 3 } : { code: "token_revoked", sinceMinutes: 17, backlog: 4 };
    ok(`${k.kind}: vars parse`, k.vars.safeParse(sample).success);
    ok(`${k.kind}: vars refuse customer data and raw text`, !k.vars.safeParse({ ...sample, code: "Phone +212600000000", kind: "mail" }).success);
    const href = k.link?.(sample, { handle: "demo" }) ?? "";
    ok(`${k.kind}: links into the store's integrations`, href === (k.kind === "int.delivery_dead" ? "/app/demo/integrations#deliveries" : "/app/demo/integrations"), href);
    for (const locale of ["ar", "fr", "en"] as const) {
      const cat = { ar, fr, en }[locale] as Partial<Record<string, string>>;
      for (const vars of [sample, { ...sample, sinceMinutes: 0, backlog: 0, count: 1 }]) {
        const body = formatMessage(cat[`notify.${k.kind}.body`]!, vars, locale);
        ok(`${k.kind}: the ${locale} body renders`, !/[{}#]/.test(body) && !/\s\s/.test(body), body);
      }
    }
  }
  ok("int.delivery_dead batches over 60 minutes", kinds.find((k) => k.kind === "int.delivery_dead")?.batch?.windowMin === 60);

  /* ---------------- the pulse contributor (SF-06) ---------------- */
  eq("pulse: an agent gets no integrations key (and no read)", await contributor.contribute(scope, { userId: "u", role: "agent" }), {});
  eq("pulse: an unknown role gets nothing", await contributor.contribute(scope, { userId: "u", role: "nobody" }), {});

  /* ---------------- the copy (OPE-§N, OD58) ---------------- */
  const placeholders = (s: string) =>
    [...new Set([...s.matchAll(/\{(\w+)(?:\}|,\s*plural)/g)].map((m) => m[1]!))]
      .sort()
      .join(",");
  const tenantFacing = (k: string) => k.startsWith("notify.int.") || k.startsWith("health.integrations.");
  const health = Object.keys(en).filter((k) => tenantFacing(k) || /^int\.(cause|hint|link|health|deliveries)\./.test(k));
  for (const key of health) {
    const src = en[key as keyof typeof en] as string;
    const locales: [AdminLocale, Partial<Record<string, string>>][] = [["fr", fr]];
    if (tenantFacing(key)) locales.push(["ar", ar]);
    for (const [locale, cat] of locales) {
      const text = cat[key];
      if (!text) {
        failures.push(`integrations health: ${key} missing in ${locale}`);
        continue;
      }
      ok(`${key}: the same placeholders in ${locale}`, placeholders(text) === placeholders(src), { en: placeholders(src), [locale]: placeholders(text) });
    }
    for (const [locale, text] of [["en", src], ["fr", fr[key as keyof typeof en]], ["ar", ar[key as keyof typeof en]]] as const) {
      if (!text) continue;
      ok(`${key} (${locale}): no em dash, no exclamation mark`, !/[—!]/.test(text), text);
    }
  }
  notes.push(`integrations health: ${health.length} keys checked`);

  const ms = performance.now() - t0;
  ok(`the section stays within ${BUDGET_MS} ms`, ms <= BUDGET_MS, Math.round(ms));
  notes.push(`integrations health section: ${Math.round(ms)} ms`);
  return { pass, failures, notes, ms };
}

// standalone run: npx tsx src/lib/integrations/selftest.ts
if (process.argv[1] && /integrations[\\/]selftest\.ts$/.test(process.argv[1])) {
  void integrationsHealthSelftest().then((r) => {
    for (const n of r.notes) console.log(`· ${n}`);
    for (const f of r.failures) console.log(`✗ ${f}`);
    console.log(r.failures.length ? `✗ ${r.failures.length} failure(s), ${r.pass} passed` : `✓ integrations health self test passed (${r.pass} assertions)`);
    process.exit(r.failures.length ? 1 : 0);
  });
}
