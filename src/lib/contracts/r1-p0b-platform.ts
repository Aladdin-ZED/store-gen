/**
 * The R1 P0b platform contract (maintainer; docs/STORE-SAAS.md §K.2 P0, §K.3; P0b package C): a compile-time check,
 * written like src/lib/contracts/r1-p0.ts, of the P1 / P2 cross-track stubs the track planners asked for before the
 * eight tracks start (qa/r1-plans.json: P1-4, P1-6, P2-5, P2-6, P2-7, P2-8, P5-8, P6-13):
 *   - the shared primitives of src/components/admin/common/** with exactly the props of the PLA-§22.12 code block
 *     (P2 owns the bodies, P1 builds against the props before P2 merges), each returning `ReactElement | null`;
 *   - P1's tenant-callable `requests.ts` (PLA-§3.7 rev 6) and `legal.ts` (PLA-§22.15), `unsnoozeHealthIssue`, and the
 *     console's `addImpersonationNoteAction` (the impersonation ribbon's Note, PLA-§10.2);
 *   - the health fixture contract every rules file fills for P1's `test:health` (PD79).
 * Types only: nothing here runs and nothing imports it. A track that renames, removes or re-types one of these breaks
 * `tsc` (and so `npm run gate`); a change goes through a CCR (docs/saas/ccr/README.md) and the maintainer updates the
 * entry with it. Not frozen here: the skeleton and `useChords` (the spec gives no signature; P1 adopts P2's after the
 * P2 merge).
 */
import type { ReactElement, ReactNode } from "react";
import type * as consoleStoreActions from "@/app/admin/(console)/stores/[id]/actions";
import type * as funnelChart from "@/components/admin/common/funnel-chart";
import type * as freshnessDot from "@/components/admin/common/freshness-dot";
import type * as healthGroups from "@/components/admin/common/health-groups";
import type * as healthRing from "@/components/admin/common/health-ring";
import type * as issueList from "@/components/admin/common/issue-list";
import type * as jobChip from "@/components/admin/common/job-chip";
import type * as keysetPager from "@/components/admin/common/keyset-pager";
import type * as kpiTile from "@/components/admin/common/kpi-tile";
import type * as lockedControl from "@/components/admin/common/locked-control";
import type { LockReason } from "@/components/admin/common/locked-control";
import type * as maskedValue from "@/components/admin/common/masked-value";
import type * as modeBadge from "@/components/admin/common/mode-badge";
import type * as monogram from "@/components/admin/common/monogram";
import type * as panelBoundary from "@/components/admin/common/panel-boundary";
import type * as qrCode from "@/components/admin/common/qr-code";
import type * as reasonPicker from "@/components/admin/common/reason-picker";
import type * as statusPill from "@/components/admin/common/status-pill";
import type * as stepUpSheet from "@/components/admin/common/step-up-sheet";
import type * as todayBrief from "@/components/admin/common/today-brief";
import type * as typedConfirm from "@/components/admin/common/typed-confirm-dialog";
import type * as usageMeter from "@/components/admin/common/usage-meter";
import type * as waShare from "@/components/admin/common/whatsapp-share-button";
import type { StoreRole } from "@/lib/auth/permissions";
import type { ReviewRequest as SchemaReviewRequest } from "@/lib/db/schema";
import type { KillKey } from "@/lib/flags/registry";
import type * as healthRegistry from "@/lib/health/registry";
import type * as aiRules from "@/lib/health/rules/ai";
import type * as designRules from "@/lib/health/rules/design";
import type * as integrationsRules from "@/lib/health/rules/integrations";
import type * as landingRules from "@/lib/health/rules/landing";
import type * as opsRules from "@/lib/health/rules/ops";
import type * as platformRules from "@/lib/health/rules/platform";
import type * as shellRules from "@/lib/health/rules/shell";
import type * as healthTypes from "@/lib/health/types";
import type { HealthFix, HealthGroup, HealthInputs, HealthIssue, HealthRuleFile, HealthRuleFixture } from "@/lib/health/types";
import type * as healthSnapshot from "@/lib/platform/health-snapshot";
import type * as legal from "@/lib/platform/legal";
import type { LegalDocSummary } from "@/lib/platform/legal";
import type { Masked } from "@/lib/platform/mask";
import type * as requests from "@/lib/platform/requests";
import type { ReviewCard, ReviewRequest, StoreRequestRow } from "@/lib/platform/requests";
import type { StorePulse } from "@/lib/pulse/types";
import type { FeatureKey } from "@/lib/tenancy/entitlement-keys";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { ActionResult, MessageKey, StoreCtx, StoreScope, StoreStatus, UserCtx } from "@/lib/tenancy/types";

/** true when A and B are the same type (parameter names aside; optionality and readonly count). */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
/** What every primitive answers (PLA-§22.12's `JSX.Element`, widened so a body may render nothing). */
type El = ReactElement | null;

/* ------------------------------------------------------------------ */
/* P2 SHELL: the shared primitives (PLA-§22.12, PD1; CCR P1-4)         */
/* ------------------------------------------------------------------ */

export type P2Primitives = [
  Assert<
    Equals<
      typeof stepUpSheet.StepUpSheet,
      (p: { open: boolean; onVerified(): void; onClose(): void; surface: "console" | "tenant"; method?: "totp" | "password" }) => El
    >
  >,
  Assert<
    Equals<
      typeof typedConfirm.TypedConfirmDialog,
      (p: { open: boolean; title: string; body: ReactNode; expected: string; confirmLabel: string; tone: "danger" | "warn"; onConfirm(): Promise<void>; onClose(): void }) => El
    >
  >,
  Assert<
    Equals<
      typeof reasonPicker.ReasonPicker,
      <R extends string>(p: {
        reasons: readonly R[];
        labelKey: (r: R) => MessageKey;
        value: R | null;
        note: string;
        noteRequiredFor?: readonly R[];
        onChange(v: { reason: R | null; note: string }): void;
      }) => El
    >
  >,
  Assert<Equals<typeof usageMeter.UsageMeter, (p: { label: string; used: number; limit: number | null; unit?: "bytes" | "count" | "credits"; warnAt?: number }) => El>>,
  Assert<Equals<typeof maskedValue.MaskedValue, (p: { value: Masked | string; reveal?: { onReveal(): Promise<string>; label: string } }) => El>>,
  Assert<Equals<typeof statusPill.StatusPill, (p: { status: StoreStatus; size?: "sm" | "md" }) => El>>,
  Assert<Equals<typeof modeBadge.ModeBadge, (p: { mode: StoreMode }) => El>>,
  Assert<Equals<typeof monogram.Monogram, (p: { name: string; seed: string; accentHue?: number | null; size: 24 | 32 | 48 }) => El>>,
  Assert<Equals<typeof lockedControl.LockedControl, (p: { reason: LockReason; children: ReactElement }) => El>>,
  Assert<
    Equals<
      LockReason,
      | { kind: "pending" }
      | { kind: "state"; status: StoreStatus }
      | { kind: "plan"; key: FeatureKey }
      | { kind: "kill"; key: KillKey }
      | { kind: "role" }
      | { kind: "release"; release: "R2" | "R3" }
      | { kind: "impersonation" }
    >
  >,
  Assert<Equals<typeof panelBoundary.PanelBoundary, (p: { title: string; children: ReactNode }) => El>>,
  Assert<Equals<typeof keysetPager.KeysetPager, (p: { next: string | null; prev: string | null; param?: string }) => El>>,
  Assert<Equals<typeof waShare.WhatsAppShareButton, (p: { text: string; phone?: string | null; label?: string }) => El>>,
  Assert<Equals<typeof qrCode.QrCode, (p: { value: string; size: number; label: string }) => El>>,
];

/** The rev 2 primitives (PD61, PD62, PD63, PD66, PD67): P2's dashboard, and P1's console with `surface: "console"`. */
export type P2HealthPrimitives = [
  Assert<
    Equals<
      typeof healthRing.HealthRing,
      (p: { score: number | null; attention: 0 | 1 | 2 | 3; size: 40 | 56 | 96; computedAt: string | null; dirty?: boolean; surface: "tenant" | "console"; onRecompute?(): Promise<void> }) => El
    >
  >,
  Assert<Equals<typeof healthGroups.HealthGroups, (p: { components: Record<HealthGroup, number>; caps: Record<HealthGroup, number> }) => El>>,
  Assert<
    Equals<
      typeof issueList.IssueRow,
      (p: {
        issue: HealthIssue;
        locale: "ar" | "fr" | "en";
        onFix?(fix: HealthFix): void;
        onSnooze?(): Promise<void>;
        disabled?: LockReason | null;
        staffView?: { snoozedBy: StoreRole | null };
      }) => El
    >
  >,
  Assert<
    Equals<typeof issueList.IssueList, (p: { issues: HealthIssue[]; max: 5; snoozed: Record<string, string>; emptyKey: MessageKey; children?: (issue: HealthIssue) => ReactNode }) => El>
  >,
  Assert<Equals<typeof todayBrief.TodayBrief, (p: { lines: { key: MessageKey; vars: Record<string, string | number>; href?: string }[] }) => El>>,
  Assert<
    Equals<
      typeof kpiTile.KpiTile,
      (p: {
        label: string;
        value: string;
        delta?: { value: number; period: string };
        hint: string;
        n?: number;
        spark?: number[];
        kind: "count" | "money" | "rate" | "duration";
        emphasis?: boolean;
      }) => El
    >
  >,
  Assert<
    Equals<
      typeof funnelChart.FunnelChart,
      (p: { steps: { id: "orders" | "confirmed" | "shipped" | "delivered" | "collected"; label: string; value: number | null; rate?: number }[]; period: string }) => El
    >
  >,
  Assert<Equals<typeof jobChip.JobChip, (p: { running: number; done: { id: string; label: string; href: string }[]; onDismiss(id: string): void }) => El>>,
  Assert<Equals<typeof freshnessDot.FreshnessDot, (p: { at: string | null; staleAfterMs: number; label: string }) => El>>,
];

/* ------------------------------------------------------------------ */
/* P1 CONSOLE: requests and the review card (PLA-§3.5, §3.7, §22.7)    */
/* ------------------------------------------------------------------ */

export type P1Requests = [
  Assert<Equals<ReviewRequest, SchemaReviewRequest>>,
  Assert<Equals<ReviewRequest["kind"], "plan_change" | "limit_raise" | "mode_change" | "go_live" | "domain">>,
  Assert<
    Equals<
      StoreRequestRow,
      {
        id: string;
        kind: ReviewRequest["kind"];
        status: "pending" | "needs_info" | "approved" | "rejected" | "snoozed" | "withdrawn";
        createdAt: string;
        // P0b review F-15: the decision, never the internal staff note
        outcome: "granted" | "declined" | null;
      }
    >
  >,
  Assert<
    Equals<
      ReviewCard,
      { status: StorePulse["store"]["review"]; question: string | null; submittedAt: string | null; rejectReason: string | null; appealsLeft: 0 | 1; slaHours: number | null }
    >
  >,
  // the card's states are the pulse's (P2 reads both)
  Assert<Equals<ReviewCard["status"], "none" | "pending" | "submitted" | "needs_info" | "approved" | "rejected">>,
  Assert<Equals<typeof requests.createStoreRequest, (ctx: StoreCtx, req: ReviewRequest) => Promise<{ id: string } | { already: true }>>>,
  Assert<Equals<typeof requests.withdrawStoreRequest, (ctx: StoreCtx, requestId: string) => Promise<void>>>,
  Assert<Equals<typeof requests.listStoreRequests, (scope: StoreScope) => Promise<StoreRequestRow[]>>>,
  Assert<Equals<typeof requests.getReviewCard, (scope: StoreScope) => Promise<ReviewCard>>>,
  Assert<Equals<typeof requests.submitForReview, (ctx: StoreCtx, input: { sells: string | null; link: string | null; whatsapp: string | null }) => Promise<{ submittedAt: string }>>>,
  Assert<Equals<typeof requests.answerReviewQuestion, (ctx: StoreCtx, answer: string) => Promise<void>>>,
  Assert<Equals<typeof requests.submitAppeal, (ctx: StoreCtx, message: string) => Promise<{ id: string }>>>,
];

/* ------------------------------------------------------------------ */
/* P1 CONSOLE: legal, health snooze, the impersonation note            */
/* ------------------------------------------------------------------ */

export type P1Platform = [
  Assert<Equals<LegalDocSummary, { id: string; kind: string; title: string; summary: string; version: number }>>,
  Assert<Equals<typeof legal.pendingReacceptance, (userId: string) => Promise<{ docs: LegalDocSummary[] } | null>>>,
  Assert<Equals<typeof legal.recordReacceptance, (ctx: UserCtx, documentIds: readonly string[], meta: { ipHash: string | null; uaLabel: string }) => Promise<void>>>,
  Assert<Equals<typeof healthSnapshot.unsnoozeHealthIssue, (ctx: StoreCtx, issueId: string) => Promise<void>>>,
  // P0's snooze stays as frozen (r1-p0.ts); the unsnooze sits beside it
  Assert<Equals<typeof healthSnapshot.snoozeHealthIssue, (ctx: StoreCtx, issueId: string, days: 7) => Promise<void>>>,
  Assert<Equals<typeof consoleStoreActions.addImpersonationNoteAction, (input: { storeId: string; text: string }) => Promise<ActionResult<{ id: string }>>>>,
];

/* ------------------------------------------------------------------ */
/* The health fixture contract (PD79; CCR P5-8, P6-13)                 */
/* ------------------------------------------------------------------ */

export type HealthFixtures = [
  Assert<Equals<HealthRuleFile, "platform" | "shell" | "landing" | "ops" | "integrations" | "design" | "ai">>,
  Assert<Equals<typeof healthTypes.HEALTH_RULE_PREFIXES, Readonly<Record<HealthRuleFile, readonly string[]>>>>,
  Assert<
    Equals<HealthRuleFixture, { rule: string; fires: Partial<HealthInputs>; silent: Partial<HealthInputs>; expect?: { severity?: 1 | 2 | 3; metric?: string } }>
  >,
  Assert<Equals<typeof healthRegistry.HEALTH_RULE_FIXTURES, readonly { file: HealthRuleFile; fixtures: readonly HealthRuleFixture[] }[]>>,
  // every rules file exports its fixtures beside its rules
  Assert<Equals<typeof platformRules.fixtures, HealthRuleFixture[]>>,
  Assert<Equals<typeof shellRules.fixtures, HealthRuleFixture[]>>,
  Assert<Equals<typeof landingRules.fixtures, HealthRuleFixture[]>>,
  Assert<Equals<typeof opsRules.fixtures, HealthRuleFixture[]>>,
  Assert<Equals<typeof integrationsRules.fixtures, HealthRuleFixture[]>>,
  Assert<Equals<typeof designRules.fixtures, HealthRuleFixture[]>>,
  Assert<Equals<typeof aiRules.fixtures, HealthRuleFixture[]>>,
];
