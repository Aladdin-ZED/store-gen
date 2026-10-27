"use client";
/**
 * Settings → Audit log (owner): every sensitive change and sign-in event as a day-grouped timeline,
 * filterable by area, with keyset "load older" paging through a server action.
 */
import {
  BanIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  LogInIcon,
  PackageIcon,
  ReceiptTextIcon,
  Settings2Icon,
  ShieldIcon,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AuditRow } from "@/lib/admin-data/security";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { Segmented } from "../common/segmented";
import { runAction, type ActionResult } from "../lib/action-result";
import { fullDate } from "../lib/format";
import { SettingsSection } from "./form-kit";

type Area = "" | "auth" | "page" | "orders" | "blocklist" | "media" | "settings" | "export";

const AREA_META: Record<Exclude<Area, "">, { label: string; icon: LucideIcon; tile: string }> = {
  auth: { label: "Sign-in & security", icon: ShieldIcon, tile: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  page: { label: "Pages", icon: FileTextIcon, tile: "bg-brand/10 text-brand" },
  orders: { label: "Orders", icon: ReceiptTextIcon, tile: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  blocklist: { label: "Blocklist", icon: BanIcon, tile: "bg-destructive/10 text-destructive" },
  media: { label: "Media", icon: ImageIcon, tile: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  settings: { label: "Settings", icon: Settings2Icon, tile: "bg-foreground/[0.06] text-foreground/75" },
  export: { label: "Exports", icon: PackageIcon, tile: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
};

/** Sentence fragments for known actions ("<who> <phrase>"). Unknown ones are humanized. */
const ACTION_LABEL: Record<string, string> = {
  "auth.login.success": "signed in",
  "auth.login.failure": "failed to sign in",
  "auth.login.locked": "was locked out after failed sign-ins",
  "auth.login.rate_limited": "hit the sign-in rate limit",
  "auth.login.mfa_pending": "entered a correct password (code pending)",
  "auth.logout": "signed out",
  "auth.mfa.success": "passed two-step verification",
  "auth.mfa.failure": "entered a wrong two-step code",
  "auth.mfa.locked": "was locked out of two-step verification",
  "auth.mfa.recovery_used": "signed in with a recovery code",
  "auth.2fa.enrollment_started": "started setting up two-step verification",
  "auth.2fa.enabled": "turned on two-step verification",
  "auth.2fa.disabled": "turned off two-step verification",
  "auth.2fa.recovery_regenerated": "generated new recovery codes",
  "auth.password.changed": "changed their password",
  "auth.password.reset": "reset a member's password",
  "auth.sessions.revoked": "signed out other devices",
  "auth.setup.owner_created": "created the owner account",
  "auth.setup.failure": "failed the first-run setup",
  "auth.user.created": "added a team member",
  "auth.user.disabled": "disabled a team member",
  "auth.user.enabled": "enabled a team member",
  "auth.user.role_changed": "changed a member's role",
  "page.generated": "generated a page",
  "page.published": "published a page",
  "page.unpublished": "unpublished a page",
  "page.archived": "archived a page",
  "page.unarchived": "restored a page from the archive",
  "page.deleted": "deleted a page",
  "page.duplicated": "duplicated a page",
  "page.home_set": "changed the home page",
  "page.meta_updated": "renamed a page or changed its link",
  "page.autosaved": "saved a draft",
  "page.draft_overwritten": "replaced a draft",
  "page.version_created": "saved a version",
  "page.version_restored": "restored a version",
  "page.version_duplicated": "made a page from a version",
  "page.version_renamed": "renamed a version",
  "page.version_starred": "starred a version",
  "page.version_unstarred": "unstarred a version",
  "page.pixels_applied": "copied the store pixels into pages",
  "orders.status_changed": "changed an order status",
  "orders.exported": "downloaded orders as CSV",
  "orders.sheet_requeued": "re-sent an order to Google Sheets",
  "orders.sheet_retry_all": "retried all failed sheet syncs",
  "blocklist.added": "blocked a number",
  "blocklist.removed": "unblocked a number",
  "media.uploaded": "uploaded media",
  "media.deleted": "deleted media",
  "media.alt_updated": "edited an image description",
  "settings.updated": "updated settings",
  "export.created": "exported a page",
  "export.revoked": "revoked an export",
};

const PROBLEM = /\.(failure|locked|rate_limited)$/;
/** internal ids (pages, users, exports) say nothing to a human — they are shown by name or not at all */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function phrase(action: string): string {
  return ACTION_LABEL[action] ?? action.split(".").slice(1).join(" ").replace(/_/g, " ");
}

function areaOf(action: string): Exclude<Area, ""> | null {
  const a = action.split(".")[0] as Exclude<Area, "">;
  return a in AREA_META ? a : null;
}

/** Flat "key: value" chips from the sanitized meta object (values are already redacted server-side). */
function metaChips(meta: Record<string, unknown> | null): string[] {
  if (!meta) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    // nothing to say: no value, or an empty list/object (e.g. "failed sections: ")
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    let text: string;
    if (Array.isArray(v)) text = v.slice(0, 6).map(String).join(", ") + (v.length > 6 ? "…" : "");
    else if (typeof v === "object") text = JSON.stringify(v);
    else text = String(v);
    out.push(`${k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}: ${text.length > 60 ? `${text.slice(0, 57)}…` : text}`);
    if (out.length >= 5) break;
  }
  return out;
}

/** Formatters pinned to the store time zone, so server and browser render the same days. */
function formatters(timeZone: string) {
  return {
    day: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }),
    key: new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }),
  };
}

export function AuditLog({
  initial,
  timeZone,
  load,
}: {
  initial: { items: AuditRow[]; nextBefore: number | null };
  /** store time zone (IANA) */
  timeZone: string;
  load: (opts: { beforeId?: number; area?: string }) => Promise<ActionResult<{ items: AuditRow[]; nextBefore: number | null }>>;
}) {
  const [area, setArea] = useState<Area>("");
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.nextBefore);
  const [loading, setLoading] = useState<"filter" | "more" | null>(null);
  const request = useRef(0);

  const changeArea = async (value: Area) => {
    setArea(value);
    setLoading("filter");
    const id = ++request.current;
    const res = await runAction(load({ area: value || undefined }));
    // ignore answers to filters the user has already moved away from
    if (id !== request.current) return;
    setLoading(null);
    if (res) {
      setItems(res.items);
      setNext(res.nextBefore);
    }
  };

  const more = async () => {
    if (next === null) return;
    setLoading("more");
    const id = request.current;
    const res = await runAction(load({ beforeId: next, area: area || undefined }));
    if (id !== request.current) return;
    setLoading(null);
    if (res) {
      setItems((cur) => [...cur, ...res.items]);
      setNext(res.nextBefore);
    }
  };

  const fmt = useMemo(() => formatters(timeZone), [timeZone]);
  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: AuditRow[] }[] = [];
    for (const row of items) {
      const at = new Date(row.createdAt);
      const key = fmt.key.format(at);
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(row);
      else out.push({ key, label: fmt.day.format(at), rows: [row] });
    }
    return out;
  }, [items, fmt]);

  return (
    <SettingsSection
      title="Activity"
      description="Sign-ins, publishing, order changes and settings, kept so you can always see who did what. Secrets are never recorded."
      style={{ ["--i" as string]: 1 }}
    >
      <div className="-mx-1 overflow-x-auto px-1 adm-scroll">
        <Segmented<Area>
          label="Filter by area"
          size="sm"
          value={area}
          onChange={(v) => void changeArea(v)}
          options={[{ value: "", label: "All" }, ...(Object.keys(AREA_META) as Exclude<Area, "">[]).map((a) => ({ value: a, label: AREA_META[a].label }))]}
        />
      </div>

      <div className={cn("transition-opacity duration-300", loading === "filter" && "opacity-50")} aria-busy={loading === "filter"}>
        {items.length === 0 ? (
          <EmptyState
            compact
            illustration="audit"
            title={area ? `Nothing in ${AREA_META[area].label.toLowerCase()} yet` : "No activity yet"}
            description="Events appear here as soon as someone signs in or changes something."
          />
        ) : (
          <ol className="grid gap-6">
            {groups.map((g) => (
              <li key={g.key} className="grid gap-2">
                <h3 className="sticky top-16 z-[1] -mx-1 w-fit rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold tracking-wide text-muted-foreground backdrop-blur">
                  {g.label}
                </h3>
                <ol className="relative grid gap-1 ps-5 before:absolute before:inset-y-2 before:start-[0.6rem] before:w-px before:bg-foreground/10">
                  <AnimatePresence initial={false}>
                    {g.rows.map((row) => {
                      const a = areaOf(row.action);
                      const meta = a ? AREA_META[a] : null;
                      const Icon = meta?.icon ?? LogInIcon;
                      const problem = PROBLEM.test(row.action);
                      const chips = metaChips(row.meta);
                      return (
                        <motion.li
                          key={row.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group relative flex gap-3 rounded-xl py-2 pe-2 ps-3 transition-colors hover:bg-foreground/[0.025]"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute top-4 -start-[0.95rem] size-2 rounded-full ring-4 ring-card",
                              problem ? "bg-destructive" : "bg-foreground/25 group-hover:bg-brand",
                            )}
                          />
                          <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", problem ? "bg-destructive/10 text-destructive" : (meta?.tile ?? "bg-foreground/[0.06]"))}>
                            <Icon className="size-4" />
                          </span>
                          <div className="grid min-w-0 flex-1 gap-1">
                            <p className="text-sm text-pretty">
                              <span className="font-medium">{row.user?.name ?? (row.action.startsWith("auth.") ? "Someone" : "System")}</span>
                              {(row.actorKind === "platform" || row.actorKind === "impersonation") && (
                                <span className="ms-1.5 inline-flex h-5 items-center rounded-md bg-foreground/[0.06] px-1.5 align-[0.08em] text-[0.68rem] font-medium text-muted-foreground">
                                  Platform team
                                </span>
                              )}{" "}
                              <span className={cn(problem ? "text-destructive" : "text-foreground/80")}>{phrase(row.action)}</span>
                              {row.targetLabel && row.targetLabel !== row.user?.name ? (
                                <span className="font-medium"> “{row.targetLabel}”</span>
                              ) : row.target && !ULID.test(row.target) ? (
                                <>
                                  {" "}
                                  <code className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-[0.72rem] text-muted-foreground">{row.target.length > 28 ? `${row.target.slice(0, 26)}…` : row.target}</code>
                                </>
                              ) : null}
                            </p>
                            {chips.length > 0 && (
                              <ul className="flex flex-wrap gap-1">
                                {chips.map((c) => (
                                  <li key={c} className="max-w-full truncate rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[0.7rem] text-muted-foreground ring-1 ring-foreground/[0.06] ring-inset">
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <time dateTime={row.createdAt} title={fullDate(row.createdAt)} className="shrink-0 pt-1 text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                            {fmt.time.format(new Date(row.createdAt))}
                          </time>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
              </li>
            ))}
          </ol>
        )}
      </div>

      {next !== null && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-full px-5" onClick={() => void more()} disabled={loading !== null}>
            {loading === "more" && <Loader2Icon className="animate-spin" />}
            Load older activity
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
