/**
 * Store Health selftest (platform.md PLA-§O.1 `test:health`, PLA-§6.3.5; core §I.7, D53, PD79):
 *   npm run test:health        (tsx src/lib/health/selftest.ts; offline: no DB, no network, no React render)
 *
 * Checks:
 *   - the registry scan (PD79): every registered rule id is `<prefix>:<rule>` with a prefix of its own file, no id twice,
 *     every rule has a fixture, and no two rules emit the same evidence `metric` in one group (one condition, one issue);
 *   - every file's fixtures: `fires` answers an issue (with `expect`'s severity and metric), `silent` answers null
 *     (below `minN`, or without the data); P1's rules at and below their `minN`;
 *   - the score: severity → points, the group caps, the clamp, monotonic over 1,000 seeded random removals and snoozes
 *     of 40 fixture issues, a snooze that expires on a fake clock;
 *   - the engine: a throwing, a hanging (40 ms) and a malformed rule are skipped and recorded while the others score,
 *     `minN` enforced whatever a rule returns, release and mode filtering, stored issues round-trip (a link fix
 *     rebuilt for a renamed handle), snooze / unsnooze recompute;
 *   - flags ↔ issues: the flags mirrored from P5's / P3's issues (`sheets_backlog`, `outbox_dead`, `capi_failing`,
 *     `telegram_failing`, `setup_incomplete`) carry the issue's evidence and severity and add no points; every flag of a
 *     P1 condition has its issue; PLA-§6.3.5's 20-minute Sheets backlog scores 90 with a fixture rule standing in for
 *     P5's `int:sheets_backlog`; a suspended store is attention 3 with no point change; dormant flips at 60 days;
 *   - milestones once over two runs; `health.issue_new` once per issue id and ISO week, never on a first computation;
 *     the quota crossings and their keys;
 *   - every tenant-visible P1 sentence renders in ar / fr / en with every variable, the same placeholders everywhere;
 *   - a two-store fixture: store A's issues carry A's numbers only, no store id, handle or name of either store.
 * Exits 1 on any failure.
 */
import Module from "node:module";
import { performance } from "node:perf_hooks";

let checks = 0;
let failures = 0;
function check(cond: unknown, label: string, info?: unknown): void {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  ✗ ${label}${info === undefined ? "" : `\n      ${JSON.stringify(info)}`}`);
}

/** mulberry32: the seeded RNG of the monotonic property (PLA-§O.1: deterministic, ≈ 50 ms). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  // engine.ts records through the platform log line, marked `import "server-only"`: outside Next that import throws
  {
    const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
    const orig = M._resolveFilename;
    const stub = require.resolve("zod");
    M._resolveFilename = function (req: string, ...rest: unknown[]) {
      return req === "server-only" ? stub : orig.call(this, req, ...rest);
    };
  }
  if (process.env.NODE_ENV === "production") throw new Error("the health selftest never runs with NODE_ENV=production");
  const t0 = performance.now();

  const engine = await import("./engine");
  const score = await import("@/lib/platform/health-score");
  const pf = await import("./platform-flags");
  const P = await import("./rules/platform");
  const fx = await import("./fixtures");
  const registry = await import("./registry");
  const notices = await import("./notices");
  const types = await import("./types");
  const { t } = await import("@/lib/i18n/admin");
  const { placeholdersOf } = await import("@/lib/platform/notify-kinds");
  const { messages: en } = await import("@/lib/i18n/admin/en");
  const { messages: frAll } = await import("@/lib/i18n/admin/fr");
  const { messages: arAll } = await import("@/lib/i18n/admin/ar");
  const ruleFiles: Record<import("./types").HealthRuleFile, { rules: readonly import("./types").HealthRule[] }> = {
    platform: await import("./rules/platform"),
    shell: await import("./rules/shell"),
    landing: await import("./rules/landing"),
    ops: await import("./rules/ops"),
    integrations: await import("./rules/integrations"),
    design: await import("./rules/design"),
    ai: await import("./rules/ai"),
    // R2 (contract step C2-D)
    storefront: await import("./rules/storefront"),
    money: await import("./rules/money"),
    logistics: await import("./rules/logistics"),
  };

  type HealthIssue = import("./types").HealthIssue;
  type HealthInputs = import("./types").HealthInputs;
  type HealthRule = import("./types").HealthRule;
  type HealthGroup = import("./types").HealthGroup;
  type StoreScope = import("@/lib/tenancy/types").StoreScope;
  const scopeOf = (storeId: string) => ({ storeId, kind: "system" }) as unknown as StoreScope;
  const SCOPE = scopeOf(fx.fixtureStore().id);
  const NOW = fx.FIXTURE_NOW;
  const DAY = 86_400_000;
  const GROUPS = Object.keys(types.HEALTH_CAPS) as HealthGroup[];
  const silentRecord = () => undefined;
  const run = (rules: readonly HealthRule[], inputs: HealthInputs, opts: Partial<Parameters<typeof engine.runRulesReport>[3]> = {}) =>
    engine.runRulesReport(rules, SCOPE, inputs, { release: "R1", mode: inputs.store.mode, record: silentRecord, ...opts });
  const issue = (id: string, group: HealthGroup, severity: 1 | 2 | 3, metric = id.split(":")[1] ?? id, value = 1, n = 1): HealthIssue => ({
    id,
    group,
    severity,
    points: score.pointsFor(severity),
    evidence: { metric, value, window: "7d", n },
    fix: { kind: "action", actionId: "ops.open_queue", label: "health.platform.quota.fix" },
    text: "health.platform.quota.fix",
  });

  /* ---------------------------------------------------------------- */
  /* 1. registry scan (PD79)                                          */
  /* ---------------------------------------------------------------- */

  const ID_RE = /^([a-z]+):([a-z0-9_]+)$/;
  const allIds = registry.HEALTH_RULES.map((r) => r.id);
  check(new Set(allIds).size === allIds.length, "registry: no rule id twice", allIds);
  for (const [file, mod] of Object.entries(ruleFiles) as [import("./types").HealthRuleFile, { rules: readonly HealthRule[] }][]) {
    for (const rule of mod.rules) {
      const m = ID_RE.exec(rule.id);
      check(m && types.HEALTH_RULE_PREFIXES[file].includes(m[1]!), `registry: ${rule.id} is <prefix>:<rule> with a prefix of rules/${file}.ts`, types.HEALTH_RULE_PREFIXES[file]);
      check(registry.HEALTH_RULES.includes(rule), `registry: ${rule.id} is registered`);
      check(rule.group in types.HEALTH_CAPS, `registry: ${rule.id} names a known group`);
    }
  }
  check(registry.HEALTH_RULES.length === Object.values(ruleFiles).reduce((n, f) => n + f.rules.length, 0), "registry: every registered rule comes from one of the seven files");

  // every fixture against its rule; the evidence metric per group from the firing inputs
  const metricOwner = new Map<string, string>();
  for (const { file, fixtures } of registry.HEALTH_RULE_FIXTURES) {
    for (const f of fixtures) {
      const rule = ruleFiles[file].rules.find((r) => r.id === f.rule);
      check(rule, `fixture of rules/${file}.ts names a rule of that file: ${f.rule}`);
      if (!rule) continue;
      const fired = await run([rule], fx.emptyHealthInputs(f.fires));
      const got = fired.issues[0];
      check(got && fired.failures.length === 0, `${f.rule}: fires`, fired.failures);
      if (got && f.expect?.severity) check(got.severity === f.expect.severity, `${f.rule}: severity ${f.expect.severity}`, got.severity);
      if (got && f.expect?.metric) check(got.evidence.metric === f.expect.metric, `${f.rule}: evidence metric ${f.expect.metric}`, got.evidence.metric);
      const silent = await run([rule], fx.emptyHealthInputs(f.silent));
      check(silent.issues.length === 0 && silent.failures.length === 0, `${f.rule}: silent`, silent.issues.map((i) => i.evidence));
      check((await run([rule], fx.emptyHealthInputs())).issues.length === 0, `${f.rule}: silent on the empty base (every source failed)`);
      if (got) {
        const key = `${got.group}|${got.evidence.metric}`;
        const owner = metricOwner.get(key);
        check(!owner || owner === got.id, `one condition, one issue: ${got.id} and ${owner} both emit ${key}`);
        metricOwner.set(key, got.id);
      }
    }
  }
  for (const rule of registry.HEALTH_RULES) {
    check(registry.HEALTH_RULE_FIXTURES.some((g) => g.fixtures.some((f) => f.rule === rule.id)), `${rule.id} has a fixture`);
  }

  /* ---------------------------------------------------------------- */
  /* 2. P1's rules (PLA-§6.3.2)                                       */
  /* ---------------------------------------------------------------- */

  const p1 = (id: string) => P.rules.find((r) => r.id === id)!;
  check(P.rules.map((r) => r.id).join() === "platform:render_failed,platform:quota_high,platform:quota_full,platform:risky_orders", "rules/platform.ts emits exactly the four tenant issues");
  const risky = async (placed: number, riskyN: number) => (await run([p1("platform:risky_orders")], fx.emptyHealthInputs({ orders: fx.fixtureOrders(placed, { risky7d: riskyN }) }))).issues[0];
  check(!(await risky(19, 19)), "risky_orders: silent at 19 orders (minN 20), every one risky");
  check((await risky(20, 6))?.evidence.n === 20, "risky_orders: fires at 20 orders, 6 risky (30 %)");
  check(!(await risky(20, 5)), "risky_orders: silent at 25 %");
  check((await risky(40, 12))?.severity === 2 && (await risky(40, 12))?.fix.kind === "action", "risky_orders: severity 2, action ops.open_queue");
  const usage = (metric: import("@/lib/tenancy/entitlement-keys").UsageMetricName, used: number, limit: number | null) => ({ metric, period: metric === "orders" || metric === "exports" || metric === "ai_credits" ? "2026-10" : "total", used, limit });
  const quota = async (rows: ReturnType<typeof usage>[]) => (await run([p1("platform:quota_high"), p1("platform:quota_full")], fx.emptyHealthInputs({ usage: rows }))).issues;
  check((await quota([usage("pages", 7, 10)])).length === 0, "quota: 70 % is silent");
  const q80 = await quota([usage("pages", 8, 10), usage("media_bytes", 90 * 1024 * 1024, 100 * 1024 * 1024)]);
  check(q80.length === 1 && q80[0]!.id === "platform:quota_high" && q80[0]!.evidence.metric === "media_bytes_pct" && q80[0]!.evidence.value === 90 && q80[0]!.evidence.n === 90, "quota_high: the worst row (media 90 % over pages 80 %), n in MiB", q80.map((i) => i.evidence));
  check(q80[0]?.text === "health.platform.quota.media_bytes.text", "quota_high: the sentence names its metric");
  const qBoth = await quota([usage("pages", 10, 10), usage("products", 85, 100)]);
  check(qBoth.length === 2 && qBoth.some((i) => i.id === "platform:quota_full" && i.evidence.metric === "pages_full") && qBoth.some((i) => i.id === "platform:quota_high" && i.evidence.metric === "products_pct"), "quota: full and high side by side on two metrics", qBoth.map((i) => i.evidence.metric));
  check((await quota([usage("orders", 5_000, null)])).length === 0, "quota: no limit, no issue");
  const qCap = engine.computeHealth(qBoth, [], {}, NOW);
  check(qCap.components.quota === 5 && qCap.score === 95, "quota: 3 + 6 points capped at 5", qCap);
  const rf = await run([p1("platform:render_failed")], fx.emptyHealthInputs({ pages: fx.fixturePages(3, { renderFailed: 2 }) }));
  check(rf.issues[0]?.group === "setup" && rf.issues[0]?.severity === 2 && rf.issues[0]?.fix.kind === "action", "render_failed: setup, severity 2, action pages.republish_failed");

  /* ---------------------------------------------------------------- */
  /* 3. the score (core §I.7)                                         */
  /* ---------------------------------------------------------------- */

  check(score.pointsFor(1) === 3 && score.pointsFor(2) === 6 && score.pointsFor(3) === 10, "severity → points 3 / 6 / 10");
  check(Object.values(types.HEALTH_CAPS).reduce((a, b) => a + b, 0) === 100, "the caps sum to 100");
  const lying = { ...issue("shell:contact", "setup", 1), points: 10 as const };
  check(engine.computeHealth([lying], [], {}, NOW).score === 97, "points follow the severity whatever a rule wrote");
  const setup3 = [issue("a:x", "setup", 3), issue("b:y", "setup", 3), issue("c:z", "setup", 3)];
  check(engine.computeHealth(setup3, [], {}, NOW).components.setup === 20 && engine.computeHealth(setup3, [], {}, NOW).score === 80, "setup capped at 20");
  const everything = GROUPS.flatMap((g, i) => [issue(`g${i}:a`, g, 3), issue(`g${i}:b`, g, 3)]);
  check(engine.computeHealth(everything, [], {}, NOW).score === 0, "every group at its cap → 0, never negative");
  check(engine.computeHealth([], [], {}, NOW).score === 100 && engine.computeHealth([], [], {}, NOW).attention === 0, "no issue → 100, attention 0");

  // monotonic: 1,000 seeded random removals and snoozes over 40 fixture issues never lower the score
  const random = rng(20261028);
  const pool: HealthIssue[] = Array.from({ length: 40 }, (_, i) => issue(`fx:i${i}`, GROUPS[Math.floor(random() * GROUPS.length)]!, (1 + Math.floor(random() * 3)) as 1 | 2 | 3));
  let monotonic = true;
  let worst: unknown = null;
  const tm = performance.now();
  for (let c = 0; c < 1_000; c++) {
    const set = pool.filter(() => random() < 0.6);
    const snoozed: Record<string, string> = {};
    for (const i of set) if (random() < 0.1) snoozed[i.id] = new Date(NOW.getTime() + DAY).toISOString();
    const before = engine.computeHealth(set, [], snoozed, NOW).score;
    const after = set.filter(() => random() > 0.25);
    const moreSnoozed = { ...snoozed };
    for (const i of after) if (random() < 0.15) moreSnoozed[i.id] = new Date(NOW.getTime() + 7 * DAY).toISOString();
    const next = engine.computeHealth(after, [], moreSnoozed, NOW).score;
    if (next < before) {
      monotonic = false;
      worst = { before, next, removed: set.length - after.length };
      break;
    }
  }
  check(monotonic, "monotonic: 1,000 random removals and snoozes never lower the score", worst);
  check(performance.now() - tm < 500, "monotonic property runs fast", Math.round(performance.now() - tm));

  // a snooze removes the points and keeps the issue, then expires on a fake clock
  const sev3 = issue("int:sheets_backlog", "integrations", 3);
  const until = new Date(NOW.getTime() + 7 * DAY).toISOString();
  check(engine.computeHealth([sev3], [], { [sev3.id]: until }, NOW).score === 100, "a snoozed issue costs no points");
  check(engine.computeHealth([sev3], [], { [sev3.id]: until }, new Date(NOW.getTime() + 7 * DAY + 1)).score === 90, "the snooze expires after 7 days (fake clock)");
  check(engine.computeHealth([sev3], [], { [sev3.id]: "not a date" }, NOW).score === 90, "an unreadable snooze counts as expired");
  const snap = engine.buildSnapshot({ inputs: fx.emptyHealthInputs(), issues: [sev3], flags: [], previous: { issues: [], snoozed: { [sev3.id]: until, "gone:x": new Date(NOW.getTime() - 1).toISOString() }, milestones: null } });
  check(snap.issues[0]?.snoozedUntil === until && snap.score === 100, "buildSnapshot: the issue stays in `issues` with `snoozedUntil`", snap.issues[0]);
  check(!("gone:x" in snap.snoozed) && sev3.id in snap.snoozed, "buildSnapshot: expired snoozes dropped");
  const sev2Before = { issues: [{ id: sev3.id, severity: 2 }], snoozed: { [sev3.id]: until }, milestones: null };
  const rose = engine.buildSnapshot({ inputs: fx.emptyHealthInputs(), issues: [sev3], flags: [], previous: sev2Before });
  check(!(sev3.id in rose.snoozed) && rose.score === 90 && !rose.issues[0]?.snoozedUntil, "a snoozed issue seen again with a higher severity comes back (PLA-§22.16)");
  const same = engine.buildSnapshot({ inputs: fx.emptyHealthInputs(), issues: [sev3], flags: [], previous: { ...sev2Before, issues: [{ id: sev3.id, severity: 3 }] } });
  check(sev3.id in same.snoozed && same.score === 100, "… and stays snoozed at the same severity");

  /* ---------------------------------------------------------------- */
  /* 4. the engine (runRules)                                         */
  /* ---------------------------------------------------------------- */

  const good: HealthRule = { id: "fx:good", group: "setup", release: "R1", collect: async () => issue("fx:good", "setup", 2) };
  const thrower: HealthRule = { id: "fx:throws", group: "setup", release: "R1", collect: async () => { throw new Error("boom"); } };
  const hanging: HealthRule = { id: "fx:hangs", group: "trust", release: "R1", collect: () => new Promise((r) => setTimeout(() => r(issue("fx:hangs", "trust", 3)), 120)) };
  const malformed: HealthRule = { id: "fx:bad", group: "design", release: "R1", collect: async () => ({ ...issue("fx:bad", "design", 2), evidence: { metric: "x", value: Number.NaN, window: "7d", n: 1 } }) };
  const wrongId: HealthRule = { id: "fx:wrong", group: "design", release: "R1", collect: async () => issue("fx:other", "design", 2) };
  const recorded: string[] = [];
  const mixed = await run([good, thrower, hanging, malformed, wrongId], fx.emptyHealthInputs(), { record: (f) => recorded.push(`${f.id}:${f.reason}`) });
  check(mixed.issues.map((i) => i.id).join() === "fx:good", "a throwing, hanging or malformed rule is skipped, the others still score", mixed.issues.map((i) => i.id));
  check(recorded.sort().join() === "fx:bad:invalid,fx:hangs:timeout,fx:throws:threw,fx:wrong:invalid", "each skipped rule is recorded once with its reason", recorded);
  check(mixed.timings.length === 5 && mixed.timings.every((t) => t.ms >= 0), "every rule run is timed");
  const lowN: HealthRule = { id: "fx:minn", group: "operations", minN: 30, release: "R1", collect: async () => issue("fx:minn", "operations", 2, "x", 5, 29) };
  check((await run([lowN], fx.emptyHealthInputs())).issues.length === 0, "minN is enforced whatever the rule returns (29 < 30)");
  const r2: HealthRule = { ...good, id: "fx:r2", release: "R2", collect: async () => issue("fx:r2", "setup", 2) };
  const storeOnly: HealthRule = { ...good, id: "fx:store", mode: "storefront", collect: async () => issue("fx:store", "setup", 2) };
  const filtered = engine.rulesFor([good, r2, storeOnly], { release: "R1", mode: "landing" }).map((r) => r.id);
  check(filtered.join() === "fx:good", "release and mode filtering (R2 out in R1, a storefront rule out of a landing store)", filtered);

  // stored issues: the link fix as a path template, rebuilt for any handle
  const linkIssue: HealthIssue = { ...issue("platform:quota_high", "quota", 1, "pages_pct", 85, 17), fix: { kind: "link", href: (h) => `/app/${h}/settings/plan`, label: "health.platform.quota.fix" } };
  const stored = engine.toStoredIssue(linkIssue, NOW.toISOString());
  const json = JSON.parse(JSON.stringify(stored)) as unknown;
  const back = engine.fromStoredIssue(json);
  check(back?.fix.kind === "link" && back.fix.href("new-handle") === "/app/new-handle/settings/plan", "a stored link fix is rebuilt for a renamed handle", back && back.fix);
  check(engine.firstSeenOf(json) === NOW.toISOString(), "the stored issue keeps when it was first seen");
  check(engine.fromStoredIssue({ id: "x:y", group: "nope" }) === null && engine.fromStoredIssue(null) === null, "a malformed stored issue reads as null");
  const re = engine.resnooze([json, JSON.parse(JSON.stringify(engine.toStoredIssue(sev3)))], [{ code: "suspended", severity: 3, since: NOW.toISOString() }], { [sev3.id]: until }, NOW);
  check(re.score === 97 && re.attention === 3 && re.issues.find((i) => i.id === sev3.id)?.snoozedUntil === until, "resnooze: the points go at once, the flags keep attention", re);

  /* ---------------------------------------------------------------- */
  /* 5. flags ↔ issues (PLA-§6.3.3, PD79)                             */
  /* ---------------------------------------------------------------- */

  const p5 = [issue("int:sheets_backlog", "integrations", 3, "sheets_oldest_min", 20, 14), issue("int:delivery_dead", "integrations", 2, "outbox_dead", 2, 2), issue("int:capi_failing", "integrations", 2, "capi_failures_24h", 9, 30), issue("int:telegram_failing", "integrations", 1, "telegram_failures", 3, 3)];
  const derived = pf.platformFlags(fx.emptyHealthInputs(), p5);
  for (const [issueId, code] of Object.entries(pf.DERIVED_FLAGS)) {
    const from = p5.find((i) => i.id === issueId)!;
    const flag = derived.find((f) => f.code === code);
    check(flag && flag.severity === from.severity && flag.value === from.evidence.value && flag.detail === from.evidence.metric, `${code} is derived from ${issueId} with its evidence and severity`, flag);
  }
  check(pf.platformFlags(fx.emptyHealthInputs()).every((f) => !(Object.values(pf.DERIVED_FLAGS) as string[]).includes(f.code)), "without issues no derived flag (a flag never stands in for an issue)");
  check(engine.computeHealth(p5, derived, {}, NOW).score === engine.computeHealth(p5, [], {}, NOW).score, "the derived flags add no points");
  // P1's own flags and their issues: every flag whose condition is a tenant issue has that issue
  const busy = fx.emptyHealthInputs({
    usage: [usage("pages", 10, 10), usage("media_bytes", 85, 100)],
    orders: fx.fixtureOrders(30, { risky7d: 12 }),
    pages: fx.fixturePages(2, { renderFailed: 1 }),
  });
  const busyIssues = (await run(P.rules, busy)).issues;
  const busyFlags = pf.platformFlags(busy, busyIssues);
  for (const flag of busyFlags) {
    const want = pf.FLAG_ISSUE[flag.code];
    if (want && !want.startsWith("int:") && !want.startsWith("landing:")) check(busyIssues.some((i) => i.id === want), `flag ${flag.code} has its issue ${want}`);
  }
  check(["quota_high", "quota_full", "risky_orders", "render_failed"].every((c) => busyFlags.some((f) => f.code === c)), "P1's four conditions raise their flags", busyFlags.map((f) => f.code));
  // setup_incomplete: derived from P3's landing:no_live_page and its age
  const noLive = issue("landing:no_live_page", "setup", 3);
  const ageOf = (days: number) => ({ issueSince: { [noLive.id]: new Date(NOW.getTime() - days * DAY).toISOString() } });
  check(pf.platformFlags(fx.emptyHealthInputs(), [noLive], ageOf(8)).some((f) => f.code === "setup_incomplete" && f.severity === 1), "setup_incomplete after 7 days of landing:no_live_page");
  check(!pf.platformFlags(fx.emptyHealthInputs(), [noLive], ageOf(6)).some((f) => f.code === "setup_incomplete"), "setup_incomplete: not before 7 days");
  check(!pf.platformFlags(fx.emptyHealthInputs({ store: fx.fixtureStore({ status: "pending" }) }), [noLive], ageOf(30)).some((f) => f.code === "setup_incomplete"), "setup_incomplete: active stores only");

  // PLA-§6.3.5: a 20-minute Sheets backlog (fixture rule standing in for P5's int:sheets_backlog) → score 90, one issue, one flag
  const p5Stand: HealthRule = {
    id: "int:sheets_backlog",
    group: "integrations",
    release: "R1",
    collect: async (_s, inputs) => (inputs.sheets && (inputs.sheets.oldestMin ?? 0) > 15 ? issue("int:sheets_backlog", "integrations", 3, "sheets_oldest_min", inputs.sheets.oldestMin ?? 0, inputs.sheets.pending) : null),
  };
  const sheetsInputs = fx.emptyHealthInputs({ sheets: { pending: 14, oldestMin: 20, lastRunFailedAt: null } });
  const sheetsRun = await run([...P.rules, p5Stand], sheetsInputs);
  const sheetsSnap = engine.buildSnapshot({ inputs: sheetsInputs, issues: sheetsRun.issues, flags: pf.platformFlags(sheetsInputs, sheetsRun.issues), previous: null });
  check(sheetsSnap.score === 90, "PLA-§6.3.5: a 20-minute Sheets backlog scores 90 after one run", sheetsSnap.score);
  check(sheetsSnap.issues.filter((i) => i.id.includes("sheets")).length === 1 && sheetsSnap.flags.filter((f) => f.code === "sheets_backlog").length === 1, "… with the issue once and the derived flag once");
  // a suspended store: attention 3, no point change; dormancy at 60 days on a fake clock
  const suspended = fx.emptyHealthInputs({ store: fx.fixtureStore({ status: "suspended" }) });
  const susSnap = engine.buildSnapshot({ inputs: suspended, issues: [], flags: pf.platformFlags(suspended, []), previous: null });
  check(susSnap.attention === 3 && susSnap.score === 100, "a suspended store: attention 3, score unchanged", { attention: susSnap.attention, score: susSnap.score });
  const quiet = (days: number) => {
    const last = new Date(NOW.getTime() - days * DAY);
    const inputs = fx.emptyHealthInputs({ members: { total: 1, withoutTotpWithOrdersReadAll: 0, lastActiveAt: last, lastLoginAt: last }, orders: { ...fx.fixtureOrders(0), lastOrderAt: last.toISOString() } });
    return engine.buildSnapshot({ inputs, issues: [], flags: pf.platformFlags(inputs, []), previous: null });
  };
  check(!quiet(59).dormant && quiet(61).dormant, "dormant flips after 60 days (fake clock)");
  check(quiet(15).flags.some((f) => f.code === "inactive_14d") && !quiet(13).flags.some((f) => f.code === "inactive_14d"), "inactive_14d after 14 days");
  check(engine.computeHealth([], quiet(61).flags, {}, NOW).score === 100, "dormant and inactive add no points");
  const carried = pf.carrySince([{ code: "restricted", severity: 2, since: NOW.toISOString() }], [{ code: "restricted", severity: 2, since: "2026-10-01T00:00:00.000Z" }]);
  check(carried[0]?.since === "2026-10-01T00:00:00.000Z", "a flag keeps its first `since` across runs");

  /* ---------------------------------------------------------------- */
  /* 6. milestones, issue_new, quota notices (PD40, PD67)             */
  /* ---------------------------------------------------------------- */

  const mInputs = fx.emptyHealthInputs({ pages: fx.fixturePages(1), orders: fx.fixtureOrders(12, { delivered: 1 }), members: { total: 2, withoutTotpWithOrdersReadAll: 0, lastActiveAt: NOW, lastLoginAt: NOW } });
  check(engine.milestonesOf(mInputs).join() === "first_draft,first_publish,first_member,first_order,tenth_order,first_delivered", "milestonesOf reads the six milestones", engine.milestonesOf(mInputs));
  check(engine.milestonesOf(fx.emptyHealthInputs()).length === 0, "no source, no milestone (never a guess)");
  const run1 = engine.buildSnapshot({ inputs: mInputs, issues: [], flags: [], previous: null });
  const run2 = engine.buildSnapshot({ inputs: { ...mInputs, now: new Date(NOW.getTime() + DAY) }, issues: [], flags: [], previous: { issues: [], snoozed: null, milestones: run1.milestones } });
  check(run1.newMilestones.length === 6 && run2.newMilestones.length === 0 && run2.milestones.first_order === run1.milestones.first_order, "milestones are reached once over two runs, the first date kept");

  const fresh = engine.buildSnapshot({ inputs: fx.emptyHealthInputs(), issues: [sev3], flags: [], previous: { issues: [], snoozed: null, milestones: null } });
  check(notices.issuesToNotify(fresh, false, 3).length === 0, "issue_new: never on a store's first computation");
  check(notices.issuesToNotify(fresh, true, 3).map((i) => i.id).join() === sev3.id, "issue_new: a new severity-3 issue");
  const again = engine.buildSnapshot({ inputs: fx.emptyHealthInputs(), issues: [sev3], flags: [], previous: { issues: [{ id: sev3.id }], snoozed: null, milestones: null } });
  check(notices.issuesToNotify(again, true, 3).length === 0, "issue_new: an issue already in the previous row is not new");
  const sev2 = engine.buildSnapshot({ inputs: fx.emptyHealthInputs(), issues: [issue("platform:risky_orders", "operations", 2)], flags: [], previous: { issues: [], snoozed: null, milestones: null } });
  check(notices.issuesToNotify(sev2, true, 3).length === 0 && notices.issuesToNotify(sev2, true, 2).length === 1, "issue_new: issueNotifyMinSeverity 3 by default, 2 when set");
  const mon = new Date("2026-10-26T08:00:00Z");
  const sun = new Date("2026-11-01T22:00:00Z");
  const nextMon = new Date("2026-11-02T00:30:00Z");
  check(notices.healthDedupe.issueNew("S", sev3.id, mon) === notices.healthDedupe.issueNew("S", sev3.id, sun), "issue_new: one key per issue id within an ISO week");
  check(notices.healthDedupe.issueNew("S", sev3.id, sun) !== notices.healthDedupe.issueNew("S", sev3.id, nextMon) && notices.healthDedupe.issueNew("S", sev3.id, mon) === `health:S:${sev3.id}:2026-W44`, "issue_new: a new key the next week (health:<storeId>:<issueId>:<YYYY-Www>)");
  check(score.isoWeek(new Date("2027-01-01T12:00:00Z")) === "2026-W53" && score.isoWeek(new Date("2025-12-29T12:00:00Z")) === "2026-W01", "isoWeek at the year edges");
  const crossings = notices.quotaCrossings(fx.emptyHealthInputs({ usage: [usage("pages", 8, 10), usage("exports", 12, 10), usage("orders", 5, null)] }));
  check(crossings.map((c) => `${c.level}:${c.metric}:${c.period}`).join() === "80:pages:total,80:exports:2026-10,100:exports:2026-10", "quota notices: 80 and 100 per metric and period", crossings);
  check(notices.healthDedupe.quota(80, "S", "pages", "total") === "quota80:S:pages:total", "quota notice key quota<80|100>:<storeId>:<metric>:<period>");

  /* ---------------------------------------------------------------- */
  /* 7. sentences (D67): ar / fr / en with every variable             */
  /* ---------------------------------------------------------------- */

  const catalogs = { en: en as Record<string, string>, fr: frAll as Partial<Record<string, string>>, ar: arAll as Partial<Record<string, string>> };
  const sentenceKeys = ["health.platform.render_failed.text", "health.platform.risky_orders.text", ...P.QUOTA_METRICS.map((m) => `health.platform.quota.${m}.text`)];
  const fixKeys = ["health.platform.render_failed.fix", "health.platform.risky_orders.fix", "health.platform.quota.fix"];
  const evidenceVars = { value: 85, n: 17, baseline: 80, window: "7d", metric: "pages_pct" };
  for (const key of [...sentenceKeys, ...fixKeys]) {
    const ref = catalogs.en[key];
    check(ref, `${key}: en`);
    if (!ref) continue;
    for (const locale of ["fr", "ar"] as const) {
      const tpl = catalogs[locale][key];
      check(tpl && placeholdersOf(tpl).join() === placeholdersOf(ref).join(), `${key}: ${locale} with the same placeholders`, tpl && placeholdersOf(tpl));
    }
    check(placeholdersOf(ref).every((p) => p in evidenceVars), `${key}: only evidence variables`, placeholdersOf(ref));
    for (const locale of ["en", "fr", "ar"] as const) {
      const out = t(key, evidenceVars, locale);
      check(out !== key && !/[{}]/.test(out), `${key}: renders in ${locale} with every variable`, out);
    }
  }
  for (const fixture of P.fixtures) {
    const fired = (await run(P.rules.filter((r) => r.id === fixture.rule), fx.emptyHealthInputs(fixture.fires))).issues[0]!;
    check(sentenceKeys.includes(fired.text) && fixKeys.includes(fired.fix.label), `${fixture.rule}: its text and fix label are catalogued`, { text: fired.text, fix: fired.fix.label });
  }

  /* ---------------------------------------------------------------- */
  /* 8. two stores: no cross-store evidence                           */
  /* ---------------------------------------------------------------- */

  const storeA = fx.fixtureStore({ id: "01JH000000000000000000STA1", handle: "atlas-argan", name: "Atlas Argan" });
  const storeB = fx.fixtureStore({ id: "01JH000000000000000000STB2", handle: "baraka-home", name: "Baraka Home" });
  const inA = fx.emptyHealthInputs({ store: storeA, orders: fx.fixtureOrders(23, { risky7d: 7 }), usage: [usage("pages", 9, 10)], pages: fx.fixturePages(1, { renderFailed: 1 }) });
  const inB = fx.emptyHealthInputs({ store: storeB, orders: fx.fixtureOrders(41, { risky7d: 37 }), usage: [usage("pages", 33, 40)], pages: fx.fixturePages(2, { renderFailed: 5 }) });
  const [ra, rb] = await Promise.all([engine.runRules(P.rules, scopeOf(storeA.id), inA, { release: "R1", mode: "landing" }), engine.runRules(P.rules, scopeOf(storeB.id), inB, { release: "R1", mode: "landing" })]);
  const numbersA = JSON.stringify(ra.map((i) => i.evidence));
  check(ra.length === 3 && ra.every((i) => [23, 7, 90, 9, 1].includes(i.evidence.value) && [23, 9, 1].includes(i.evidence.n)), "store A's issues carry A's numbers", numbersA);
  check(![41, 37, 82, 33, 5].some((n) => ra.some((i) => i.evidence.value === n || i.evidence.n === n)), "… and none of B's");
  const blobA = JSON.stringify(ra.map((i) => engine.toStoredIssue(i)));
  check(![storeA.id, storeB.id, storeA.handle, storeB.handle, storeA.name, storeB.name].some((s) => blobA.includes(s)) && rb.length === 3, "no store id, handle or name inside a stored issue");

  const ms = Math.round(performance.now() - t0);
  if (failures > 0) {
    console.error(`✗ health selftest: ${failures} of ${checks} checks failed (${ms} ms)`);
    process.exit(1);
  }
  console.log(`✓ health selftest: all ${checks} checks passed, ${registry.HEALTH_RULES.length} registered rules (${ms} ms)`);
}

if (/[\\/]src[\\/]lib[\\/]health[\\/]selftest\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((err: unknown) => {
    console.error("✗ health selftest crashed:", err);
    process.exit(1);
  });
}
