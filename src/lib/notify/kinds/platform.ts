/**
 * Notification kinds of the platform track (P1 CONSOLE, platform.md PLA-§18.2).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1), created empty at P0 and imported by
 * src/lib/notify/registry.ts; texts `notify.<kind>.*` live in the track's own i18n file (D67): P1's
 * src/lib/i18n/admin/<locale>/notify.ts, except the team and member kinds, whose texts moved to P2's `team.ts` at P0b
 * (CCR P2-15). Tenant kinds exist in ar, fr and en, staff kinds (`tenant: false`) in en (`test:platform`).
 *
 * Vars are ids, counts, codes, ISO dates and short labels (src/lib/platform/notify-kinds.ts); a member's display name
 * rides as `member`, a store as its handle (`store`), never a customer's data. Links follow the table of PLA-§18.2:
 * the dashboard root is `/app/<h>` (P0 widened the link rule, core §I.4 rev 3), staff links are relative `/admin…`.
 */
import { z } from "zod";
import { accountLink, consolePath, defineKind, tenantLink, v, type DeclaredKind } from "@/lib/platform/notify-kinds";
import type { NotificationKindDef } from "../registry";

/* the label prefixes of the codes (read-time, in the reader's locale; src/lib/i18n/admin/<locale>/notify.ts and P2's team.ts) */
const REASON = { reason: "notify.reason" } as const;
const ROLE = { role: "team.role" } as const;

/** `?r=<requestId>` when the row names a request, else the queue itself */
const queueLink = consolePath<{ requestId?: string }>((vars) => (vars.requestId ? `/queue?r=${vars.requestId}` : "/queue"));
/** the store's console profile (an optional `tab`) when the row names the store id, else the stores list */
const storeLink = (tab = "") => consolePath<{ storeId?: string }>((vars) => (vars.storeId ? `/stores/${vars.storeId}${tab}` : "/stores"));

const lifecycle = (kind: string, severity: "info" | "success" | "warn" | "danger") =>
  defineKind({
    kind,
    group: "store",
    defaultSeverity: severity,
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ reason: v.code.optional(), date: z.union([v.day, v.instant]).optional() }),
    link: tenantLink(""),
    labels: REASON,
  });

const tenantKinds: DeclaredKind[] = [
  /* ---- signup and review (PLA-§3.5, §3.6) ---- */
  defineKind({ kind: "signup.received", group: "store", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({}), link: tenantLink("") }),
  defineKind({ kind: "signup.info_requested", group: "store", defaultSeverity: "warn", audienceHint: "store_role", tenant: true, vars: z.object({}), link: tenantLink("") }),
  defineKind({ kind: "signup.approved", group: "store", defaultSeverity: "success", audienceHint: "store", tenant: true, vars: z.object({ reason: v.code.optional() }), link: tenantLink("/pages") }),
  defineKind({ kind: "signup.rejected", group: "store", defaultSeverity: "warn", audienceHint: "store_role", tenant: true, vars: z.object({ reason: v.code.optional() }), link: tenantLink(""), labels: REASON }),
  defineKind({ kind: "signup.reopened", group: "store", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({ reason: v.code.optional() }), link: tenantLink("") }),

  /* ---- lifecycle (PLA-§8.1; sent by transitionStore with { reason }, + text when the staff note is shown) ---- */
  lifecycle("store.restricted", "warn"),
  lifecycle("store.suspended", "danger"),
  lifecycle("store.restored", "success"),
  lifecycle("store.closed", "warn"),
  lifecycle("store.reopened", "success"),
  lifecycle("store.deletion_scheduled", "danger"),
  lifecycle("store.deletion_cancelled", "success"),

  /* ---- support visits and platform exports (PLA-§10, §7.14) ---- */
  defineKind({
    kind: "store.impersonation_started",
    group: "security",
    defaultSeverity: "info",
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ reason: v.code, from: v.instant, to: v.instant }),
    link: tenantLink("/settings/audit"),
    labels: { reason: "notify.visit_reason" },
  }),
  defineKind({
    kind: "store.impersonation_ended",
    group: "security",
    defaultSeverity: "info",
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ reason: v.code, from: v.instant, to: v.instant }),
    link: tenantLink("/settings/audit"),
    labels: { reason: "notify.visit_reason" },
  }),
  defineKind({ kind: "store.export_by_platform", group: "security", defaultSeverity: "warn", audienceHint: "store_role", tenant: true, vars: z.object({ reason: v.code }), link: tenantLink("/settings/danger"), labels: REASON }),

  /* ---- requests, plan and quota (PLA-§3.7, §9, §22.9) ---- */
  defineKind({
    kind: "request.answered",
    group: "plan",
    defaultSeverity: "info",
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ requestKind: v.code, outcome: z.enum(["granted", "declined"]) }),
    link: tenantLink("/settings/plan"),
    labels: { requestKind: "notify.request_kind", outcome: "notify.outcome" },
  }),
  defineKind({ kind: "plan.changed", group: "plan", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({ plan: v.label }), link: tenantLink("/settings/plan") }),
  defineKind({ kind: "plan.boost_granted", group: "plan", defaultSeverity: "success", audienceHint: "store_role", tenant: true, vars: z.object({ key: v.code, until: v.instant }), link: tenantLink("/settings/plan") }),
  defineKind({ kind: "plan.boost_ending", group: "plan", defaultSeverity: "warn", audienceHint: "store_role", tenant: true, vars: z.object({ key: v.code, until: v.instant }), link: tenantLink("/settings/plan") }),
  defineKind({
    kind: "quota.80",
    group: "plan",
    defaultSeverity: "warn",
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ metric: v.code, used: v.count, limit: v.count, percent: z.number().int().min(0).max(1000) }),
    link: tenantLink("/settings/plan"),
    labels: { metric: "notify.metric" },
  }),
  defineKind({
    kind: "quota.100",
    group: "plan",
    defaultSeverity: "danger",
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ metric: v.code, used: v.count, limit: v.count }),
    link: tenantLink("/settings/plan"),
    labels: { metric: "notify.metric" },
  }),

  /* ---- Store Health (PD67; core §I.4: one per new severity-3 issue, deduped per issue id and week) ---- */
  defineKind({
    kind: "health.issue_new",
    group: "store",
    defaultSeverity: "warn",
    audienceHint: "store_role",
    tenant: true,
    vars: z.object({ issueId: z.string().regex(/^[a-z0-9_]+:[a-z0-9_]+$/).max(60), group: v.code, severity: z.number().int().min(1).max(3), metric: v.code, value: z.number(), n: v.count }),
    link: tenantLink("#health"),
  }),

  /* ---- team (texts in P2's team.ts, except member.joined: P1's notify.ts, CCR r1-p1-3) ---- */
  defineKind({ kind: "member.joined", group: "team", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({ member: v.label, role: v.code }), link: tenantLink("/team"), labels: ROLE }),
  defineKind({ kind: "invite.accepted", group: "team", defaultSeverity: "success", audienceHint: "user", tenant: true, vars: z.object({ member: v.label, role: v.code }), link: tenantLink("/team"), labels: ROLE }),
  defineKind({ kind: "member.role_changed", group: "team", defaultSeverity: "info", audienceHint: "user", tenant: true, vars: z.object({ role: v.code }), link: tenantLink(""), labels: ROLE }),
  defineKind({ kind: "member.suspended", group: "team", defaultSeverity: "warn", audienceHint: "user", tenant: true, vars: z.object({}), link: tenantLink("") }),

  /* ---- account security ---- */
  defineKind({ kind: "security.2fa_required", group: "security", defaultSeverity: "warn", audienceHint: "store", tenant: true, vars: z.object({}), link: accountLink("/two-factor") }),
  defineKind({ kind: "user.2fa_reset", group: "security", defaultSeverity: "warn", audienceHint: "user", tenant: true, vars: z.object({}), link: accountLink("/security") }),
  defineKind({ kind: "user.password_reset", group: "security", defaultSeverity: "warn", audienceHint: "user", tenant: true, vars: z.object({}), link: accountLink("/security") }),

  /* ---- legal (PD17; rev 4: the in-app document sheet) ---- */
  defineKind({
    kind: "legal.updated",
    group: "platform",
    defaultSeverity: "info",
    audienceHint: "user",
    tenant: true,
    vars: z.object({ kind: z.enum(["tos", "privacy", "aup", "dpa"]), version: z.number().int().min(1) }),
    link: accountLink<{ kind: string }>((vars) => `?doc=${vars.kind}`),
    labels: { kind: "notify.legal_kind" },
  }),

  /* ---- a message from Store Gen (PLA-§19.1): the body is the staff text, shown as plain text ---- */
  defineKind({ kind: "staff.message", group: "support", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({}) }),
];

/* staff kinds (tenant: false, en only; audience platform_staff unless stated) */
const staffKinds: DeclaredKind[] = [
  defineKind({
    kind: "staff.signup_new",
    group: "staff",
    defaultSeverity: "info",
    audienceHint: "platform_staff",
    tenant: false,
    vars: z.object({ count: v.count.optional(), store: v.label.optional(), requestId: v.id.optional() }),
    link: queueLink,
    batch: { windowMin: 60 },
  }),
  defineKind({ kind: "staff.signup_hold", group: "staff", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ store: v.label, requestId: v.id.optional() }), link: queueLink }),
  defineKind({ kind: "staff.info_answered", group: "staff", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ store: v.label, requestId: v.id.optional() }), link: queueLink }),
  defineKind({ kind: "staff.appeal", group: "staff", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ store: v.label, requestId: v.id.optional() }), link: queueLink }),
  defineKind({ kind: "staff.request", group: "staff", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ store: v.label, requestKind: v.code.optional(), requestId: v.id.optional() }), link: queueLink }),
  defineKind({ kind: "staff.purge_requested", group: "staff", defaultSeverity: "danger", audienceHint: "platform_staff", tenant: false, vars: z.object({ store: v.label.optional(), by: v.id }), link: consolePath("/security/break-glass") }),
  defineKind({ kind: "staff.purge_confirmed", group: "staff", defaultSeverity: "danger", audienceHint: "platform_staff", tenant: false, vars: z.object({ store: v.label.optional(), by: v.id }), link: consolePath("/security/break-glass") }),
  defineKind({ kind: "staff.super_admin_requested", group: "staff", defaultSeverity: "danger", audienceHint: "platform_staff", tenant: false, vars: z.object({ by: v.id }), link: consolePath("/security/break-glass") }),
  defineKind({
    kind: "staff.alarm",
    group: "staff",
    defaultSeverity: "warn",
    audienceHint: "platform_staff",
    tenant: false,
    // brand_term_live carries the store, the matched term and the field (PLA-§13.3); staff only, never a tenant
    vars: z.object({ alarm: v.code, value: z.number().optional(), store: v.label.optional(), storeId: v.id.optional(), term: v.label.optional(), field: v.code.optional() }),
    link: consolePath("/health"),
    // the short label of the code (`console.alarm.<code>`); the Needs-attention sentence with its numbers is `console.attention.<code>`
    labels: { alarm: "console.alarm" },
  }),
  defineKind({ kind: "staff.kill_changed", group: "staff", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ key: v.code, to: z.boolean() }), link: consolePath("/flags") }),
  defineKind({ kind: "staff.mention", group: "staff", defaultSeverity: "info", audienceHint: "user", tenant: false, vars: z.object({ store: v.label, by: v.id, storeId: v.id.optional() }), link: storeLink("/notes") }),
  defineKind({
    kind: "staff.impersonation_started",
    group: "staff",
    defaultSeverity: "info",
    audienceHint: "platform_staff",
    tenant: false,
    vars: z.object({ store: v.label, by: v.id, minutes: v.count, storeId: v.id.optional() }),
    link: storeLink("/activity"),
  }),
  defineKind({
    kind: "staff.abuse_report",
    group: "staff",
    defaultSeverity: "warn",
    audienceHint: "platform_staff",
    tenant: false,
    vars: z.object({ store: v.label, reason: z.enum(["phishing", "scam", "counterfeit", "prohibited", "impersonation", "other"]), count24h: v.count, storeId: v.id.optional() }),
    link: storeLink(),
    labels: { reason: "notify.abuse_reason" },
  }),
  defineKind({
    kind: "staff.signup_capped",
    group: "staff",
    defaultSeverity: "warn",
    audienceHint: "platform_staff",
    tenant: false,
    // T2's R1.0 signup sends { day } (src/lib/auth/signup.ts); PLA-§18.2's { cap, waitlisted } once the console counts
    vars: z.object({ cap: v.count.optional(), waitlisted: v.count.optional(), day: v.day.optional() }),
    link: consolePath("/settings/signup?tab=waitlist"),
  }),
];

export const kinds: NotificationKindDef[] = [...tenantKinds, ...staffKinds];
