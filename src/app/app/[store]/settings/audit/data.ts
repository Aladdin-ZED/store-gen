import "server-only";
/**
 * The store's activity log as Settings → Audit shows it (P2 SHELL; platform.md PLA-§22.10.6, PD75, ENGC-8; docs/
 * STORE-SAAS.md §F.5): T1's `listStoreAudit` (the frozen tenant reader: the scope's own rows only, staff rows with a
 * display name and nothing else, `audit.read`) with the P0b filters (actor kind, action area, date range), keyset by
 * id, 50 rows a page. Each row becomes what the screen needs and nothing more:
 *
 * - `sentence`: the catalog key `shell.audit.<action>` when the catalog has it, else null (the raw action shows);
 * - `target`: the store's own page or member it names (a label read in this store only) and the link to it;
 * - `metaSummary`: a few safe facts (`from → to`, role, status, kind, count …) from the already redacted meta, never a
 *   customer field and never a secret (the keys are an allow-list, the values plain scalars cut to 40 characters).
 */
import { auditTargetNames } from "@/lib/admin-data/dashboard";
import { listStoreAudit } from "@/lib/audit";
import { messageOf, type MessageKey } from "@/lib/i18n/admin";
import type { StoreCtx } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";

export const AUDIT_ACTOR_KINDS = ["user", "platform", "impersonation", "system", "api"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];
/** The screen's areas and the action prefix each one reads (one prefix per area, listStoreAudit's `area`). */
export const AUDIT_AREA_PREFIX = {
  pages: "page",
  orders: "orders",
  team: "store.member",
  settings: "settings",
  integrations: "integrations",
  security: "auth",
  platform: "platform",
} as const;
export type AuditAreaId = keyof typeof AUDIT_AREA_PREFIX;
export const AUDIT_PAGE = 50;

export interface AuditViewRow {
  id: number;
  at: string;
  actorKind: AuditActorKind;
  /** the member's or the staff member's display name; null for the system, a job or a deleted user */
  actorName: string | null;
  action: string;
  sentence: MessageKey | null;
  target: { kind: "page" | "member"; label: string; href: string } | null;
  metaSummary: string;
  /** a note the store may read: its own members' notes, or a staff note shown to it (listStoreAudit drops the rest) */
  note: string | null;
  /** the impersonation session anchor (`#imp-<id>`) on the support-view rows */
  anchor: string | null;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SAFE_META = ["from", "to", "role", "status", "kind", "mode", "field", "fields", "count", "reason", "stepUp", "minutes", "documents", "context"] as const;

/** A short, safe summary of a row's (already redacted) meta. Pure. */
export function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  const out: string[] = [];
  const scalar = (v: unknown): string | null => {
    if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 39)}…` : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return (v as string[]).slice(0, 4).join(", ");
    return null;
  };
  const from = scalar(meta.from);
  const to = scalar(meta.to);
  if (from !== null && to !== null) out.push(`${from} → ${to}`);
  for (const key of SAFE_META) {
    if ((key === "from" || key === "to") && from !== null && to !== null) continue;
    const v = scalar(meta[key]);
    if (v !== null && v !== "") out.push(`${key}: ${v}`);
  }
  return out.join(" · ").slice(0, 160);
}

export async function auditViewPage(
  ctx: StoreCtx,
  opts: {
    beforeId?: number;
    actorKind?: AuditActorKind;
    area?: AuditAreaId;
    from?: Date;
    to?: Date;
  },
): Promise<{ rows: AuditViewRow[]; more: boolean }> {
  const entries = await listStoreAudit(ctx, {
    beforeId: opts.beforeId,
    limit: AUDIT_PAGE + 1,
    actorKind: opts.actorKind,
    area: opts.area ? AUDIT_AREA_PREFIX[opts.area] : undefined,
    from: opts.from,
    to: opts.to,
  });
  const page = entries.slice(0, AUDIT_PAGE);
  const pageIds = new Set<string>();
  const userIds = new Set<string>();
  for (const e of page) {
    if (!e.target || !ULID_RE.test(e.target)) continue;
    if (e.action.startsWith("page.")) pageIds.add(e.target);
    else if (e.action.startsWith("store.member.") || e.action.startsWith("auth.")) userIds.add(e.target);
  }
  const { pages: pageName, members: memberName } = await auditTargetNames(ctx.scope, [...pageIds], [...userIds]);
  const handle = ctx.store.handle;
  return {
    more: entries.length > AUDIT_PAGE,
    rows: page.map((e) => {
      const key = `shell.audit.${e.action}`;
      const target =
        e.target && pageName.has(e.target)
          ? {
              kind: "page" as const,
              label: pageName.get(e.target) ?? "",
              href: appHref(handle, `/pages/${e.target}/edit`),
            }
          : e.target && memberName.has(e.target)
            ? {
                kind: "member" as const,
                label: memberName.get(e.target) ?? "",
                href: appHref(handle, "/team"),
              }
            : null;
      return {
        id: e.id,
        at: e.createdAt.toISOString(),
        actorKind: e.actorKind,
        actorName: e.actorName,
        action: e.action,
        sentence: messageOf(key) !== undefined ? key : null,
        target,
        metaSummary: metaSummary(e.meta),
        note: typeof e.meta?.note === "string" && e.meta.note.trim() ? e.meta.note.trim().slice(0, 500) : null,
        anchor: e.action.startsWith("platform.impersonation.") ? `imp-${e.target && /^[A-Za-z0-9_-]{1,40}$/.test(e.target) ? e.target : e.id}` : null,
      };
    }),
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight of `day` (YYYY-MM-DD) in `timeZone`, as an instant; null for anything else. Pure. */
export function zonedMidnight(day: string | undefined, timeZone: string): Date | null {
  if (!day || !DAY_RE.test(day)) return null;
  const utc = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime())) return null;
  try {
    // the zone's offset at that moment: what the zone's wall clock reads at UTC midnight, minus UTC midnight
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(utc)
        .map((p) => [p.type, p.value]),
    );
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return new Date(utc.getTime() - (wall - utc.getTime()));
  } catch {
    return utc;
  }
}
