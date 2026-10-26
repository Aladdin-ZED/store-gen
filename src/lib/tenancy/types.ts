/**
 * The StoreScope seam types (docs/STORE-SAAS.md §E.1), frozen in the R1.0 contract step. Types only:
 * nothing here runs, so client and server code may import it.
 *
 * A `StoreScope` is the only value a data function accepts as "which store". It carries a symbol-keyed
 * brand that no code outside the seam can produce without a cast or a spread of another scope (`{ ...scope,
 * storeId }` copies the brand): lint L6 reports both, and Object.assign / structuredClone of a scope, outside
 * the seam files (the one allowed cast site is src/lib/tenancy/seam.ts), so a store id taken from input never
 * reaches a query. A brand a spread cannot copy is CCR r1.0-m-5 (R2 contract step).
 */
import type { SessionUser } from "@/lib/auth";
import type { PlatformPermission, PlatformRole, STORE_PERMISSIONS, StorePermission, StoreRole } from "@/lib/auth/permissions";
import type { MessageKey as I18nMessageKey } from "@/lib/i18n/admin";
import type { StoreMode } from "./mode";

declare const SCOPE: unique symbol;

/** The only value a data function accepts as "which store". Constructible only by the seam functions. */
export interface StoreScope {
  readonly storeId: string;
  readonly kind: "member" | "impersonation" | "public" | "system" | "platform"; // "impersonation" is set by requireStoreMember with the synthetic membership (D70)
  readonly [SCOPE]: true;
}

/**
 * rev 3 (D71, ENGC-6, SEC-8): write capability is a type. Every repository that inserts, updates or deletes a
 * tenant table takes `WriteScope`; `platformScope()` and the impersonation seam return scopes whose `kind` is
 * not assignable to it, so read-only platform access and read-only impersonation are compile-time facts.
 */
export type WriteScope = StoreScope & { readonly kind: "member" | "public" | "system" };
export type ReadScope = StoreScope;

export type StoreStatus = "pending" | "active" | "restricted" | "suspended" | "closed" | "scheduled_deletion" | "purged" | "rejected";

/** Cached view of `stores` (15 s, §E.5). */
export interface StoreRow {
  id: string;
  handle: string;
  name: string;
  mode: StoreMode;
  status: StoreStatus;
  planId: string;
  market: string;
  currency: string;
  timezone: string;
  defaultLocale: string;
  homePageId: string | null;
  brandSeed: string;
  catalogVersion: number;
  addressVersion: number;
  requireMember2fa: boolean;
  primaryDomain: string | null;
}

export interface Membership {
  role: StoreRole;
  status: "active" | "suspended";
  synthetic?: "impersonation";
}

export interface Actor {
  kind: "user" | "platform" | "impersonation" | "system" | "api";
  userId: string | null;
  impersonatorId: string | null;
  ip: string | null;
}

/** "View as store" (§B.8). Declared here so the ctx types stay in one file; src/lib/platform/impersonation.ts re-exports them. */
export type ImpersonationReason = "ticket" | "onboarding" | "abuse_review" | "bug" | "other";
export interface ImpersonationInfo {
  id: string;
  storeId: string;
  staffUserId: string;
  mode: "read";
  reason: ImpersonationReason;
  expiresAt: Date;
}

export interface StoreCtx<S extends ReadScope = ReadScope> {
  user: SessionUser;
  store: StoreRow;
  membership: Membership;
  scope: S;
  actor: Actor;
  impersonation: ImpersonationInfo | null;
  stepUpUntil: Date | null; // rev 4 (PLA Q4.8): step_up_at + 5 min, the tenant step-up chip (§B.7)
  can(p: StorePermission): boolean; // matrix ∧ mode ∧ release ∧ state ∧ impersonation
}

/** rev 4 (D71, STO C5): the keys refused to impersonation (write or sensitive), computed from STORE_PERMISSIONS. */
export type WritePermission = {
  [K in StorePermission]: (typeof STORE_PERMISSIONS)[K] extends { write: true } | { sensitive: true } ? K : never;
}[StorePermission];

/** The ctx storeAction / storeGuard hand fn when every required key is a WritePermission; the only narrowing site is seam.ts. */
export type WriteCtx = StoreCtx<WriteScope>;

/** rev 4 (PLA Q4.7): the ctx of userAction (account pages, no store). */
export interface UserCtx {
  user: SessionUser;
  actor: Actor;
}

export interface PlatformCtx {
  user: SessionUser;
  role: PlatformRole;
  actor: Actor;
  can(p: PlatformPermission): boolean;
  stepUpFresh: boolean;
  stepUpUntil: Date | null; // step_up_at + 5 min, PLA Q.32
}

export interface SystemCtx {
  job: string;
  actor: Actor; // kind "system"
}

export interface PublicTarget {
  store: StoreRow;
  scope: StoreScope; // kind "public"
}

/* ------------------------------------------------------------------ */
/* Action results (§E.2, D65)                                          */
/* ------------------------------------------------------------------ */

/** An admin message key (src/lib/i18n/admin, §I.5): the catalog's keys, open-ended until P0 narrows it. */
export type MessageKey = I18nMessageKey;

/** One refusal or note of a publish-time gate (§M.1); src/lib/render/prepublish.ts re-exports it. */
export interface GateItem {
  id: string; // "<track>:<rule>", e.g. "design:N1", "honesty:D2", "budget:F5"
  level: "hard" | "soft";
  title: MessageKey;
  detail?: MessageKey;
  vars?: Record<string, string | number>;
  field?: string;
  sectionId?: string;
  fix?: { tab?: string; sectionId?: string; actionId?: string };
}

/**
 * The core codes the shell maps to a dedicated surface (limit sheet, publish dialog, job chip, step-up sheet,
 * read-only banner), plus an open tail: a part answers its own codes (listed in its spec, each with an
 * `error.<code>` message in ar/fr/en); an unknown code renders the generic sheet, never raw text.
 */
export type ActionErrorCode =
  | "invalid"
  | "not_found"
  | "forbidden"
  | "read_only"
  | "impersonation_read_only"
  | "quota"
  | "feature_off"
  | "step_up"
  | "busy"
  | "job_queued"
  | "design_blocked"
  | "honesty_blocked"
  | "budget_blocked"
  | "rate_limited"
  | "conflict"
  | "server"
  | (string & {});

/**
 * What storeAction / userAction / platformAction / publicAction answer; never a raw DB message. `items` come
 * with the typed publish refusals, `jobId` with `job_queued` (the `ai_jobs` row a long task became, §H.12).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; items?: GateItem[]; message?: MessageKey; jobId?: string };
