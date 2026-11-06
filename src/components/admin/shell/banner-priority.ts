/**
 * Which lifecycle banner the shell shows (P2 SHELL; platform.md PLA-§22.8, TN-02; docs/STORE-SAAS.md §I.4). Pure and
 * isomorphic: `<StoreBanner>` (step p2-07) shows the first banner and a "1 more" chevron for the rest, in this order:
 *
 *   suspended > closed > restricted > pending > platform read-only > another kill switch > require-2FA > quota ≥ 80 %
 *
 * Some states are a page, not a banner: `closed` for members other than owner and admin, `scheduled_deletion` (and
 * `purged`), `rejected`. Legal re-acceptance is a blocking sheet (§22.15) and impersonation is the ribbon (§10.2), so
 * neither is here. State banners and the platform read-only warning cannot be dismissed; informational banners (a
 * kill switch, members without 2FA, a quota) can, for 24 h per viewer: the caller passes the ids hidden right now.
 */
import type { KillKey } from "@/lib/flags/registry";
import type { MessageKey } from "@/lib/i18n/admin";
import type { StoreStatus } from "@/lib/tenancy/types";

export type BannerTone = "danger" | "warning" | "info";
export type BannerId = "suspended" | "closed" | "restricted" | "pending" | "platform_read_only" | `kill:${KillKey}` | "require_2fa" | `quota:${string}`;

export interface Banner {
  id: BannerId;
  tone: BannerTone;
  key: MessageKey;
  vars: Record<string, string | number>;
  /** variables that are themselves message keys, translated before `key` is rendered (the quota's meter name) */
  varKeys?: Record<string, MessageKey>;
  /** informational: hidden for 24 h when dismissed (localStorage, per viewer) */
  dismissible: boolean;
}

export type StatePage = "closed" | "deletion" | "rejected";

export interface BannerState {
  status: StoreStatus;
  /** the viewer's role; owner and admin see the closed banner (with Reopen), the others the closed page */
  role: string;
  /** the status reason sentence already rendered for the viewer (`shell.status_reason.*`), or null */
  reason: string | null;
  /** closed / deletion dates, already formatted in the viewer's locale */
  closedOn?: string | null;
  reopenUntil?: string | null;
  /** the pulse's active kill switches */
  kill: readonly KillKey[];
  /** owners only: members without 2FA while the store requires it; null or 0 = no banner */
  membersWithout2fa?: number | null;
  /** usage meters with a limit (gauges and monthly counters) */
  quota?: readonly { metric: string; used: number; limit: number | null }[];
  /** banner ids the viewer dismissed less than 24 h ago */
  dismissed?: ReadonlySet<string>;
}

export const QUOTA_BANNER_PCT = 80;
export const BANNER_DISMISS_MS = 24 * 60 * 60_000;

/** The meters with a name in the shell catalog (`shell.metric.*`); the AI sub-budgets show in the AI settings instead. */
export const QUOTA_BANNER_METRICS: ReadonlySet<string> = new Set(["media_bytes", "pages", "products", "members", "agents", "exports", "ai_credits", "orders", "campaigns", "short_links"]);

/** The kill switches that have no tenant banner (sign-ups concern the public sign-up page, not a store). */
const NO_TENANT_BANNER: ReadonlySet<KillKey> = new Set<KillKey>(["signups_enabled"]);

/** The page a state renders instead of the dashboard, or null. */
export function statePage(status: StoreStatus, role: string): StatePage | null {
  if (status === "scheduled_deletion" || status === "purged") return "deletion";
  if (status === "rejected") return "rejected";
  if (status === "closed" && role !== "owner" && role !== "admin") return "closed";
  return null;
}

/** Every banner that applies, in priority order, the dismissed ones left out. */
export function pickBanners(state: BannerState): Banner[] {
  const out: Banner[] = [];
  const reason = state.reason ?? "";
  const s = state.status;
  if (s === "suspended") out.push({ id: "suspended", tone: "danger", key: "shell.banner.suspended", vars: { reason }, dismissible: false });
  if (s === "closed" && statePage(s, state.role) === null) {
    out.push({ id: "closed", tone: "warning", key: "shell.banner.closed", vars: { date: state.closedOn ?? "", until: state.reopenUntil ?? "" }, dismissible: false });
  }
  if (s === "restricted") out.push({ id: "restricted", tone: "warning", key: "shell.banner.restricted", vars: { reason }, dismissible: false });
  if (s === "pending") out.push({ id: "pending", tone: "info", key: "shell.banner.pending", vars: {}, dismissible: false });

  const kill = new Set(state.kill);
  if (kill.has("platform_read_only")) out.push({ id: "platform_read_only", tone: "warning", key: "shell.kill.platform_read_only", vars: {}, dismissible: false });
  for (const k of [...kill].sort()) {
    if (k === "platform_read_only" || NO_TENANT_BANNER.has(k)) continue;
    out.push({ id: `kill:${k}`, tone: "info", key: `shell.kill.${k}`, vars: {}, dismissible: true });
  }

  const without2fa = state.membersWithout2fa ?? 0;
  if (Number.isSafeInteger(without2fa) && without2fa > 0) {
    out.push({ id: "require_2fa", tone: "info", key: "shell.banner.require_2fa", vars: { count: without2fa }, dismissible: true });
  }

  // the fullest meter at or above 80 %; a meter without a limit never shows
  let worst: { metric: string; percent: number } | null = null;
  for (const q of state.quota ?? []) {
    if (!QUOTA_BANNER_METRICS.has(q.metric) || q.limit === null || !(q.limit > 0) || !Number.isFinite(q.used) || q.used < 0) continue;
    const percent = Math.floor((q.used / q.limit) * 100);
    if (percent >= QUOTA_BANNER_PCT && (!worst || percent > worst.percent)) worst = { metric: q.metric, percent };
  }
  if (worst) out.push({ id: `quota:${worst.metric}`, tone: "info", key: "shell.banner.quota", vars: { percent: worst.percent }, varKeys: { metric: `shell.metric.${worst.metric}` }, dismissible: true });

  const dismissed = state.dismissed;
  return dismissed ? out.filter((b) => !b.dismissible || !dismissed.has(b.id)) : out;
}

/** Is a dismissal stored at `at` (ms) still in force at `now`? (24 h) */
export function dismissalActive(at: number, now: number): boolean {
  return Number.isFinite(at) && now - at >= 0 && now - at < BANNER_DISMISS_MS;
}
