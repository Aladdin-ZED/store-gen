/**
 * The Store Health engine (docs/STORE-SAAS.md §I.7, D53; platform.md PLA-§6.3.1), its pure half: everything that turns
 * one store's `HealthInputs` into the row both audiences read, with no database and no clock of its own.
 *
 *   const issues = await runRules(HEALTH_RULES, scope, inputs, { release: "R1", mode: store.mode });
 *   const next = buildSnapshot({ inputs, issues, flags: platformFlags(inputs, issues, { terms }), previous });
 *
 * - `runRules` filters the registry by release and store mode, runs every rule in parallel inside its 40 ms budget, and
 *   keeps only well-formed answers: the id and group the rule declares, a severity of 1-3 whose points are the
 *   severity's (a rule cannot weigh more than its severity says), finite evidence numbers, and silence below the
 *   rule's `minN` whatever the rule returned. A rule that throws, times out or answers garbage is skipped and recorded
 *   (area "health"); the others still score.
 * - `computeHealth` is src/lib/platform/health-score.ts's (re-exported: one computation for both rings).
 * - `milestonesOf` reads the PD40 milestones off the inputs; `buildSnapshot` keeps the first date of each, sorts and
 *   bounds the issues (20 stored), drops expired snoozes (and the snooze of an issue whose severity rose), marks the
 *   live ones on their issue, and reports what is new since the previous row (milestones to audit, issue ids to notify).
 * - Stored issues (`toStoredIssue` / `fromStoredIssue`): `HealthFix.href` is a function of the handle, so a link fix is
 *   stored as its path with the handle token `{h}` and rebuilt on read; a handle rename never stales a stored link.
 *
 * The orchestration with the database (`computeStoreHealth`, the job's per-store step, and the tick) is ./run.ts, the
 * `store_health` statements ./rows.ts, the notification rules ./notices.ts; this file stays importable by `test:health`
 * without a database.
 */
import { recordPlatformError } from "@/lib/platform/log";
import { computeHealth, ISSUES_MAX, isSnoozed, liveSnoozes, pointsFor, sortIssues } from "@/lib/platform/health-score";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";
import { modeAllows, type StoreMode } from "@/lib/tenancy/mode";
import { HEALTH_CAPS, type HealthFix, type HealthFlag, type HealthGroup, type HealthInputs, type HealthIssue, type HealthMetrics, type HealthRule, type Milestone } from "./types";

export { computeHealth, HEALTH_GROUPS, ISSUES_MAX, isSnoozed, liveSnoozes, pointsFor, sortIssues } from "@/lib/platform/health-score";

/** A rule's budget (core §I.7: "≤ 40 ms, read-only, scoped"). */
export const RULE_BUDGET_MS = 40;

const RELEASE_ORDER = { R1: 1, R2: 2, R3: 3 } as const;
type Release = keyof typeof RELEASE_ORDER;

/** PLA-§6.3.1 */
export interface HealthComputation {
  score: number;
  attention: 0 | 1 | 2 | 3;
  components: Record<HealthGroup, number>;
  issues: HealthIssue[];
  flags: HealthFlag[];
  dormant: boolean;
  reached: Milestone[];
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/** The registered rules that apply to a store of `mode` in `release`. */
export function rulesFor(rules: readonly HealthRule[], opts: { release: Release; mode: StoreMode }): HealthRule[] {
  return rules.filter((r) => RELEASE_ORDER[r.release] <= RELEASE_ORDER[opts.release] && (!r.mode || modeAllows(opts.mode, r.mode)));
}

export type RuleFailure = { id: string; reason: "threw" | "timeout" | "invalid" };

export interface RuleRun {
  issues: HealthIssue[];
  /** wall time per rule run (ms, rounded), the job's `rulesSlowest` */
  timings: { id: string; ms: number }[];
  failures: RuleFailure[];
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** A rule's answer as the engine keeps it, or null when it is not one (wrong id or group, bad severity or evidence). */
export function checkedIssue(rule: Pick<HealthRule, "id" | "group" | "minN">, raw: unknown): HealthIssue | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  const i = raw as Partial<HealthIssue>;
  const ev = i.evidence as Partial<HealthIssue["evidence"]> | undefined;
  const sev = i.severity;
  if (i.id !== rule.id || i.group !== rule.group || (sev !== 1 && sev !== 2 && sev !== 3)) return "invalid";
  if (!ev || typeof ev.metric !== "string" || !ev.metric || typeof ev.window !== "string" || !finite(ev.value) || !finite(ev.n) || ev.n < 0) return "invalid";
  if (ev.baseline !== undefined && !finite(ev.baseline)) return "invalid";
  if (typeof i.text !== "string" || !i.text || !validFix(i.fix)) return "invalid";
  // a rule stays silent below its sample size whatever it returned (core §I.7)
  if (rule.minN !== undefined && ev.n < rule.minN) return null;
  return {
    id: rule.id,
    group: rule.group,
    severity: sev,
    points: pointsFor(sev),
    evidence: { metric: ev.metric.slice(0, 60), value: ev.value, ...(ev.baseline !== undefined ? { baseline: ev.baseline } : {}), window: ev.window.slice(0, 20), n: Math.trunc(ev.n) },
    fix: i.fix!,
    text: i.text,
  };
}

function validFix(fix: unknown): fix is HealthFix {
  const f = fix as Partial<{ kind: string; href: unknown; actionId: unknown; label: unknown }> | null | undefined;
  if (!f || typeof f.label !== "string" || !f.label) return false;
  if (f.kind === "link") return typeof f.href === "function";
  return f.kind === "action" && typeof f.actionId === "string" && /^[a-z][a-z0-9_.-]{1,60}$/.test(f.actionId);
}

/** One rule inside its budget: its issue, null (silent), or why it was skipped. */
async function runOne(rule: HealthRule, scope: StoreScope, inputs: HealthInputs, budgetMs: number): Promise<HealthIssue | null | RuleFailure["reason"]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });
  try {
    const raw = await Promise.race([Promise.resolve().then(() => rule.collect(scope, inputs)), timeout]);
    if (raw === "timeout") return "timeout";
    const checked = checkedIssue(rule, raw);
    return checked === "invalid" ? "invalid" : checked;
  } catch {
    return "threw";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every applicable rule, in parallel, each inside `budgetMs` (40 ms); a failing rule is recorded once per run with
 * `record` (default: the platform error line, area "health", store id only) and the others still score.
 */
export async function runRulesReport(
  rules: readonly HealthRule[],
  scope: StoreScope,
  inputs: HealthInputs,
  opts: { release: Release; mode: StoreMode; budgetMs?: number; record?: (failure: RuleFailure) => void },
): Promise<RuleRun> {
  const record = opts.record ?? ((f: RuleFailure) => recordPlatformError(`health rule ${f.id} ${f.reason}`, new Error(`health_rule_${f.reason}`), { storeId: scope.storeId, area: "health" }));
  const applicable = rulesFor(rules, opts);
  const timings: RuleRun["timings"] = [];
  const failures: RuleFailure[] = [];
  const results = await Promise.all(
    applicable.map(async (rule) => {
      const t0 = performance.now();
      const out = await runOne(rule, scope, inputs, opts.budgetMs ?? RULE_BUDGET_MS);
      timings.push({ id: rule.id, ms: Math.round(performance.now() - t0) });
      if (typeof out === "string") {
        const failure = { id: rule.id, reason: out };
        failures.push(failure);
        record(failure);
        return null;
      }
      return out;
    }),
  );
  return { issues: results.filter((i): i is HealthIssue => i !== null), timings, failures };
}

/** PLA-§6.3.1's signature: the issues only. */
export async function runRules(rules: readonly HealthRule[], scope: StoreScope, inputs: HealthInputs, opts: { release: Release; mode: StoreMode }): Promise<HealthIssue[]> {
  return (await runRulesReport(rules, scope, inputs, opts)).issues;
}

/* ------------------------------------------------------------------ */
/* Milestones (PD40)                                                   */
/* ------------------------------------------------------------------ */

/** The order the milestones are reached in (and listed). */
export const MILESTONES: readonly Milestone[] = ["first_draft", "first_publish", "first_member", "first_order", "tenth_order", "first_delivered"];

/**
 * The milestones the inputs prove reached. A lower bound, never a guess: `tenth_order` needs ten orders inside one
 * window the inputs carry (the 7-day count or this month's `orders` counter), so a store whose tenth order came slowly
 * reaches it on its first busy week or month; a source that failed proves nothing.
 */
export function milestonesOf(inputs: HealthInputs): Milestone[] {
  const out = new Set<Milestone>();
  const pages = inputs.pages;
  if (pages && (pages.drafts > 0 || pages.published > 0)) out.add("first_draft");
  if (pages && (pages.published > 0 || pages.lastPublishAt !== null)) out.add("first_publish");
  if (inputs.members && inputs.members.total >= 2) out.add("first_member");
  const orders = inputs.orders;
  const monthOrders = inputs.usage?.find((u) => u.metric === "orders" && u.period !== "total")?.used ?? 0;
  if ((orders && (orders.placed > 0 || orders.lastOrderAt !== null)) || monthOrders > 0) out.add("first_order");
  if (Math.max(orders?.placed ?? 0, monthOrders) >= 10) out.add("tenth_order");
  if (orders && orders.delivered > 0) out.add("first_delivered");
  return MILESTONES.filter((m) => out.has(m));
}

/* ------------------------------------------------------------------ */
/* The snapshot                                                        */
/* ------------------------------------------------------------------ */

/** What a previous row contributes to the next one (null fields = no row yet). */
export interface PreviousSnapshot {
  issues: readonly (Pick<HealthIssue, "id"> & { severity?: number; firstSeenAt?: string })[];
  snoozed: Readonly<Record<string, string>> | null;
  milestones: Partial<Record<Milestone, string>> | null;
  flags?: readonly HealthFlag[] | null;
}

/** Issue id → the instant it was first seen: kept from the previous row while the issue stays, else `now`. */
export function issueSinceOf(issues: readonly Pick<HealthIssue, "id">[], previous: PreviousSnapshot | null, now: Date): Record<string, string> {
  const before = new Map((previous?.issues ?? []).map((i) => [i.id, i.firstSeenAt]));
  const out: Record<string, string> = {};
  for (const i of issues) {
    const was = before.get(i.id);
    out[i.id] = was && Number.isFinite(Date.parse(was)) && Date.parse(was) <= now.getTime() ? was : now.toISOString();
  }
  return out;
}

export interface SnapshotDraft extends HealthComputation {
  /** every issue, sorted, the first ISSUES_MAX kept, live snoozes marked */
  issues: HealthIssue[];
  snoozed: Record<string, string>;
  milestones: Partial<Record<Milestone, string>>;
  metrics: HealthMetrics;
  /** milestones reached for the first time in this run (audited once, PD40) */
  newMilestones: Milestone[];
  /** issues absent from the previous row (the `health.issue_new` candidates, PD67) */
  newIssues: HealthIssue[];
}

const iso = (d: Date | null | undefined) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/** store_health.metrics (PLA-§6.3): counts and dates only. */
export function metricsOf(inputs: HealthInputs): HealthMetrics {
  const media = inputs.usage?.find((u) => u.metric === "media_bytes");
  const lastActive = inputs.members?.lastActiveAt ?? null;
  return {
    orders7d: inputs.orders?.placed ?? 0,
    risky7d: inputs.orders?.risky7d ?? 0,
    lastActiveAt: iso(lastActive),
    lastOrderAt: inputs.orders?.lastOrderAt ?? null,
    publishedPages: inputs.pages?.published ?? 0,
    mediaPct: media && media.limit ? Math.min(999, Math.round((media.used * 100) / media.limit)) : null,
  };
}

/** The next row from this run's issues and flags and the previous row (pure; `now` is `inputs.now`). */
export function buildSnapshot(args: { inputs: HealthInputs; issues: readonly HealthIssue[]; flags: readonly HealthFlag[]; previous: PreviousSnapshot | null }): SnapshotDraft {
  const { inputs, flags, previous } = args;
  const now = inputs.now;
  const snoozed = liveSnoozes(previous?.snoozed, now);
  // a snoozed issue the job sees again with a higher severity comes back at once (PLA-§22.16)
  const wasSeverity = new Map((previous?.issues ?? []).map((i) => [i.id, i.severity]));
  for (const i of args.issues) {
    const was = wasSeverity.get(i.id);
    if (snoozed[i.id] && typeof was === "number" && i.severity > was) delete snoozed[i.id];
  }
  const { score, components, attention } = computeHealth([...args.issues], [...flags], snoozed, now);
  const issues = sortIssues(args.issues)
    .slice(0, ISSUES_MAX)
    .map((i): HealthIssue => {
      const { snoozedUntil, ...rest } = i;
      void snoozedUntil; // a rule never decides a snooze: the stored map does
      return isSnoozed(i.id, snoozed, now) ? { ...rest, snoozedUntil: snoozed[i.id] } : rest;
    });
  const day = now.toISOString().slice(0, 10);
  const reached = milestonesOf(inputs);
  const milestones: Partial<Record<Milestone, string>> = { ...(previous?.milestones ?? {}) };
  const newMilestones: Milestone[] = [];
  for (const m of reached) {
    if (milestones[m]) continue;
    milestones[m] = day;
    newMilestones.push(m);
  }
  const before = new Set((previous?.issues ?? []).map((i) => i.id));
  return {
    score,
    attention,
    components,
    issues,
    flags: [...flags],
    dormant: flags.some((f) => f.code === "dormant_60d"),
    reached,
    snoozed,
    milestones,
    metrics: metricsOf(inputs),
    newMilestones,
    newIssues: issues.filter((i) => !before.has(i.id)),
  };
}

/* ------------------------------------------------------------------ */
/* Stored issues                                                       */
/* ------------------------------------------------------------------ */

/** The handle token of a stored link fix ("/app/{h}/settings/plan"). */
export const HANDLE_TOKEN = "{h}";

export type StoredFix = { kind: "link"; path: string; label: MessageKey } | { kind: "action"; actionId: string; label: MessageKey };
/** An issue as `store_health.issues` holds it (JSON: the link fix as a path template, and when it was first seen). */
export type StoredIssue = Omit<HealthIssue, "fix"> & { fix: StoredFix; firstSeenAt?: string };

export function toStoredIssue(issue: HealthIssue, firstSeenAt?: string): StoredIssue {
  const fix: StoredFix = issue.fix.kind === "link" ? { kind: "link", path: issue.fix.href(HANDLE_TOKEN), label: issue.fix.label } : { kind: "action", actionId: issue.fix.actionId, label: issue.fix.label };
  return { ...issue, fix, ...(firstSeenAt ? { firstSeenAt } : {}) };
}

/**
 * A stored row after a snooze or an unsnooze (PD67): the issues keep their place, each marked with its live snooze,
 * and the score, components and attention are computed again from them, so the seller sees the points go at once.
 */
export function resnooze(storedIssues: readonly unknown[], flags: readonly HealthFlag[], snoozed: Readonly<Record<string, string>>, now: Date): { issues: StoredIssue[]; score: number; components: Record<HealthGroup, number>; attention: 0 | 1 | 2 | 3 } {
  const live = liveSnoozes(snoozed, now);
  const issues: StoredIssue[] = [];
  const parsed: HealthIssue[] = [];
  for (const raw of storedIssues) {
    const issue = fromStoredIssue(raw);
    if (!issue) continue;
    const { snoozedUntil, ...rest } = issue;
    void snoozedUntil;
    const next: HealthIssue = live[issue.id] ? { ...rest, snoozedUntil: live[issue.id] } : rest;
    parsed.push(next);
    issues.push(toStoredIssue(next, firstSeenOf(raw)));
  }
  return { issues, ...computeHealth(parsed, [...flags], live, now) };
}

/** The first-seen instant a stored issue carries (PLA-§6.3.3: the age of `landing:no_live_page`). */
export function firstSeenOf(raw: unknown): string | undefined {
  const at = (raw as { firstSeenAt?: unknown } | null)?.firstSeenAt;
  return typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : undefined;
}

const GROUPS: ReadonlySet<string> = new Set(Object.keys(HEALTH_CAPS));

/** A stored issue back to a `HealthIssue` (the link rebuilt for any handle), or null when the JSON is not one. */
export function fromStoredIssue(raw: unknown): HealthIssue | null {
  const s = raw as Partial<StoredIssue> | null;
  if (!s || typeof s !== "object" || typeof s.id !== "string" || !GROUPS.has(String(s.group)) || (s.severity !== 1 && s.severity !== 2 && s.severity !== 3)) return null;
  const ev = s.evidence;
  if (!ev || typeof ev.metric !== "string" || !finite(ev.value) || !finite(ev.n) || typeof ev.window !== "string" || typeof s.text !== "string") return null;
  const f = s.fix as Partial<StoredFix & { path: unknown; actionId: unknown }> | undefined;
  let fix: HealthFix;
  if (f?.kind === "link" && typeof f.path === "string" && typeof f.label === "string") {
    const path = f.path;
    fix = { kind: "link", href: (handle: string) => path.split(HANDLE_TOKEN).join(handle), label: f.label };
  } else if (f?.kind === "action" && typeof f.actionId === "string" && typeof f.label === "string") {
    fix = { kind: "action", actionId: f.actionId, label: f.label };
  } else return null;
  return {
    id: s.id,
    group: s.group as HealthGroup,
    severity: s.severity,
    points: pointsFor(s.severity),
    evidence: { metric: ev.metric, value: ev.value, ...(finite(ev.baseline) ? { baseline: ev.baseline } : {}), window: ev.window, n: ev.n },
    fix,
    text: s.text,
    ...(typeof s.snoozedUntil === "string" ? { snoozedUntil: s.snoozedUntil } : {}),
  };
}
