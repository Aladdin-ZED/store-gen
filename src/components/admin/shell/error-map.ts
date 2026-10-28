/**
 * Error codes → UI (P2 SHELL; platform.md PLA-§22.8 table; docs/STORE-SAAS.md §E.2, D65). Pure and isomorphic: every
 * failed `ActionResult` and every refused route answer goes through `errorUi()`, and the shell renders the surface it
 * names. Never raw text: a code becomes a message key, a sheet, the publish dialog or the job chip.
 *
 * - the 16 core codes each have a dedicated surface (`CORE_ERROR_UI`, exhaustive by type);
 * - PLA-§22.8's platform codes: `quota_platform_pending` (limit sheet, no "Ask for more"), `brand_protected` (limit
 *   sheet variant), `status_changed` / `cooldown_handle_required` (the console's lifecycle sheet reloads);
 * - any other code with an `error.<code>` key in the catalog renders the generic sheet with that sentence (D65);
 * - anything else: the generic toast with the error reference, never the code itself.
 */
import { messageOf, type MessageKey } from "@/lib/i18n/admin";
import type { KillKey } from "@/lib/flags/registry";
import type { ActionErrorCode, GateItem, StoreStatus } from "@/lib/tenancy/types";

/** The core union of §E.2 without its open tail. */
export const CORE_ERROR_CODES = [
  "invalid",
  "not_found",
  "forbidden",
  "read_only",
  "impersonation_read_only",
  "quota",
  "feature_off",
  "step_up",
  "busy",
  "job_queued",
  "design_blocked",
  "honesty_blocked",
  "budget_blocked",
  "rate_limited",
  "conflict",
  "server",
] as const;
export type CoreErrorCode = (typeof CORE_ERROR_CODES)[number];

/** PLA-§22.8's platform codes with a surface of their own. */
export const PLATFORM_ERROR_CODES = ["quota_platform_pending", "brand_protected", "status_changed", "cooldown_handle_required"] as const;
export type PlatformErrorCode = (typeof PLATFORM_ERROR_CODES)[number];

export type ErrorUi =
  | { ui: "page_not_found" }
  | { ui: "toast"; key: MessageKey; vars?: Record<string, string | number> }
  | { ui: "field"; key: MessageKey }
  | { ui: "limit_sheet"; variant: "quota" | "feature" | "pending_ai" | "brand"; key: MessageKey }
  | { ui: "step_up"; opId: string | null }
  | { ui: "publish_dialog"; code: "design_blocked" | "honesty_blocked" | "budget_blocked"; items: GateItem[] }
  | { ui: "job_chip"; jobId: string | null }
  | { ui: "reload_sheet"; key: MessageKey }
  | { ui: "sheet"; key: MessageKey };

export interface ErrorContext {
  /** a page load renders the shell's neutral 404; an action toasts */
  where?: "page" | "action";
  /** the store's status (read_only names the state) */
  status?: StoreStatus;
  /** the pulse's kill switches (read_only from the platform read-only switch) */
  kill?: readonly KillKey[];
  /** busy from the scrypt semaphore (auth pages) rather than the AI */
  source?: "ai" | "auth";
  /** the operation id the step-up re-runs with */
  opId?: string | null;
  /** the publish refusals */
  items?: GateItem[];
  /** the job a long task became */
  jobId?: string | null;
  /** the reference shown with the generic message (the error_events id, or a short client id) */
  ref?: string;
}

const READ_ONLY_STATES: ReadonlySet<StoreStatus> = new Set<StoreStatus>(["restricted", "suspended", "closed", "scheduled_deletion"]);

/** One entry per core code: the `Record` makes a code without a surface a type error. */
const CORE_ERROR_UI: Record<CoreErrorCode, (c: ErrorContext) => ErrorUi> = {
  invalid: () => ({ ui: "field", key: "error.invalid" }),
  not_found: (c) => (c.where === "page" ? { ui: "page_not_found" } : { ui: "toast", key: "shell.err.not_found" }),
  forbidden: () => ({ ui: "toast", key: "shell.err.forbidden" }),
  read_only: (c) =>
    c.kill?.includes("platform_read_only")
      ? { ui: "toast", key: "shell.kill.platform_read_only" }
      : c.status && READ_ONLY_STATES.has(c.status)
        ? { ui: "toast", key: `shell.err.read_only.${c.status}` }
        : { ui: "toast", key: "error.read_only" },
  impersonation_read_only: () => ({ ui: "toast", key: "shell.impersonation.write_refused" }),
  quota: () => ({ ui: "limit_sheet", variant: "quota", key: "error.quota" }),
  feature_off: () => ({ ui: "limit_sheet", variant: "feature", key: "error.feature_off" }),
  step_up: (c) => ({ ui: "step_up", opId: c.opId ?? null }),
  busy: (c) => ({ ui: "toast", key: c.source === "auth" ? "auth.busy" : "shell.err.busy" }),
  job_queued: (c) => ({ ui: "job_chip", jobId: c.jobId ?? null }),
  design_blocked: (c) => ({ ui: "publish_dialog", code: "design_blocked", items: c.items ?? [] }),
  honesty_blocked: (c) => ({ ui: "publish_dialog", code: "honesty_blocked", items: c.items ?? [] }),
  budget_blocked: (c) => ({ ui: "publish_dialog", code: "budget_blocked", items: c.items ?? [] }),
  rate_limited: () => ({ ui: "toast", key: "shell.err.rate_limited" }),
  conflict: () => ({ ui: "toast", key: "error.conflict" }),
  server: (c) => generic(c),
};

const PLATFORM_ERROR_UI: Record<PlatformErrorCode, (c: ErrorContext) => ErrorUi> = {
  quota_platform_pending: () => ({ ui: "limit_sheet", variant: "pending_ai", key: "shell.limit.reason.pending_ai" }),
  brand_protected: () => ({ ui: "limit_sheet", variant: "brand", key: "shell.limit.brand_protected" }),
  status_changed: () => ({ ui: "reload_sheet", key: "error.status_changed" }),
  cooldown_handle_required: () => ({ ui: "reload_sheet", key: "error.cooldown_handle_required" }),
};

function generic(c: ErrorContext): ErrorUi {
  return { ui: "toast", key: "shell.err.generic", vars: { ref: c.ref && /^[A-Za-z0-9-]{1,40}$/.test(c.ref) ? c.ref : "-" } };
}

const isCore = (code: string): code is CoreErrorCode => (CORE_ERROR_CODES as readonly string[]).includes(code);
const isPlatform = (code: string): code is PlatformErrorCode => (PLATFORM_ERROR_CODES as readonly string[]).includes(code);
const CODE_RE = /^[a-z][a-z0-9_]{1,47}$/;

/** The surface of an error code. `jobId` and `items` may come from the `ActionResult` itself. */
export function errorUi(code: ActionErrorCode | null | undefined, ctx: ErrorContext = {}): ErrorUi {
  if (typeof code !== "string" || !CODE_RE.test(code)) return generic(ctx);
  if (isCore(code)) return CORE_ERROR_UI[code](ctx);
  if (isPlatform(code)) return PLATFORM_ERROR_UI[code](ctx);
  // a part-level code (D65): its own sentence when the catalog has it, else the generic message
  const key = `error.${code}`;
  return messageOf(key) !== undefined ? { ui: "sheet", key } : generic(ctx);
}

/** `errorUi` for a failed `ActionResult` (its `jobId` and `items` win over the context's). */
export function resultErrorUi(r: { error: ActionErrorCode; items?: GateItem[]; jobId?: string }, ctx: ErrorContext = {}): ErrorUi {
  return errorUi(r.error, { ...ctx, items: r.items ?? ctx.items, jobId: r.jobId ?? ctx.jobId });
}
