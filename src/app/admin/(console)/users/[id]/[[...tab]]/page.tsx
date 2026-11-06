import type { Metadata } from "next";
import { ArrowLeftIcon, MonitorSmartphoneIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Monogram } from "@/components/admin/common/monogram";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { Ago } from "@/components/console/ago";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelSkeleton, PanelUnavailable } from "@/components/console/panel";
import { BannedBadge, RoleChip, TwoFactor } from "@/components/console/people/people-list";
import { UserActions } from "@/components/console/people/user-actions";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { NotesTab } from "@/components/console/profile/notes-tab";
import { t as message, translator, type MessageKey } from "@/lib/i18n/admin";
import { listMentionableStaff, listNotes } from "@/lib/platform/notes";
import { optional, panel, type Panel } from "@/lib/platform/panel";
import { getUserProfile, ownedStoresBlocking, userActivity, userLinked, userSessions, userSignups, type UserProfile } from "@/lib/platform/people";
import { requirePlatform } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/*
 * `/admin/users/<id>/<tab>` (platform.md PLA-§11.2; PD34, PD35, PD81): the header (name, e-mail and phone as PD35
 * allows, UI locale, created, last sign-in, platform role, 2FA, ban state with reason, date and author) with the account
 * actions when the staff member may act, then six tabs: Stores (default), Sessions, Sign-up, Linked, Activity
 * (`?before=` keyset) and Notes (never for analysts). An unknown id answers "No person with this id"; an unknown tab
 * is the 404. Every read goes through src/lib/platform/people.ts (masking happens there).
 */
const TABS = ["stores", "sessions", "signup", "linked", "activity", "notes"] as const;
type Tab = (typeof TABS)[number];

type Props = { params: Promise<{ id: string; tab?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const tr = translator(CONSOLE_LOCALE);
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";
const link = "rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const tabOf = (tab: string[] | undefined): Tab | null => {
  if (!tab || tab.length === 0) return "stores";
  if (tab.length > 1) return null;
  return (TABS as readonly string[]).includes(tab[0]!) ? (tab[0] as Tab) : null;
};

/** a message, or the raw value when the catalog has no line for it */
const label = (key: MessageKey, raw: string) => {
  const s = tr(key);
  return s === key ? raw : s;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  const t = tabOf(tab) ?? "stores";
  return { title: message("console.user.meta", { tab: message(`console.user.tab.${t}`) }) };
}

export default async function UserProfilePage({ params, searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const [{ id, tab: raw }, sp] = await Promise.all([params, searchParams]);
  const tab = tabOf(raw);
  if (!tab) notFound();
  const p = await panel("user.profile", () => getUserProfile(ctx, id));
  const storeCount = p.state === "ok" && p.data ? p.data.stores.length : 0;
  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PrefetchLink href="/admin/users" className={cn(link, "inline-flex items-center gap-1 justify-self-start text-[12.5px] max-md:min-h-11")}>
        <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {tr("console.people.title")}
      </PrefetchLink>
      {p.state !== "ok" ? (
        <section className={card}>{p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}</section>
      ) : !p.data ? (
        <section className={cn(card, "grid justify-items-start gap-1 px-5 py-10")}>
          <h1 className="text-[15px] font-semibold">{tr("console.user.not_found")}</h1>
          <p className="text-[13px] text-muted-foreground">{tr("console.user.not_found_lead")}</p>
        </section>
      ) : (
        <>
          <Header ctx={ctx} user={p.data} />
          <nav aria-label={tr("console.user.tabs")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <ul className="flex min-w-max gap-1 border-b border-[var(--c-hairline)]">
              {TABS.filter((x) => x !== "notes" || ctx.role !== "analyst").map((x) => (
                <li key={x}>
                  <PrefetchLink
                    href={x === "stores" ? `/admin/users/${id}` : `/admin/users/${id}/${x}`}
                    aria-current={x === tab ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex h-10 items-center border-b-2 border-transparent px-3 text-[13px] text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11",
                      x === tab && "border-[var(--brand)] font-medium text-foreground",
                    )}
                  >
                    {tr(`console.user.tab.${x}`)}
                    {x === "stores" && <span className="num ms-1.5 text-[11.5px] text-muted-foreground">{storeCount}</span>}
                  </PrefetchLink>
                </li>
              ))}
            </ul>
          </nav>
          <PanelBoundary title={tr(`console.user.tab.${tab}`)}>
            <Suspense key={`${tab}:${String(sp.before ?? "")}`} fallback={<PanelSkeleton title={tr(`console.user.tab.${tab}`)} rows={6} />}>
              <TabBody ctx={ctx} user={p.data} tab={tab} before={typeof sp.before === "string" ? Number(sp.before) : null} />
            </Suspense>
          </PanelBoundary>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The header                                                          */
/* ------------------------------------------------------------------ */

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-[11.5px] text-muted-foreground">{term}</dt>
      <dd className="min-w-0 truncate text-[13px]">{children}</dd>
    </div>
  );
}

async function Header({ ctx, user }: { ctx: PlatformCtx; user: UserProfile }) {
  const blocking = user.canManage ? await ownedStoresBlocking(user.id).catch(() => []) : [];
  const why: MessageKey | null = user.canManage
    ? null
    : user.deleted
      ? "console.user.cannot.deleted"
      : user.id === ctx.user.id
        ? "console.user.cannot.self"
        : user.platformRole !== "none"
          ? "console.user.cannot.staff"
          : null;
  return (
    <section className={cn(card, "grid gap-4 px-4 py-4 md:px-5")}>
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <Monogram name={user.name || "?"} seed={user.id} size={48} />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-[20px] leading-tight font-semibold tracking-[-0.014em]">{user.deleted ? tr("console.people.deleted") : user.name || tr("console.people.no_name")}</h1>
            {user.platformRole !== "none" && <RoleChip role={user.platformRole} />}
            {user.banned && <BannedBadge reason={user.banned.reason} />}
          </div>
          <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
            <bdi dir="ltr" className="truncate font-mono">
              {user.email}
            </bdi>
            {user.phone && (
              <bdi dir="ltr" className="font-mono">
                {user.phone}
              </bdi>
            )}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Fact term={tr("console.user.fact.locale")}>{user.locale ? label(`console.user.locale.${user.locale}`, user.locale) : "—"}</Fact>
        <Fact term={tr("console.user.fact.created")}>
          <Ago iso={user.createdAt} className="num" />
        </Fact>
        <Fact term={tr("console.user.fact.last_login")}>{user.lastLoginAt ? <Ago iso={user.lastLoginAt} className="num" /> : <span className="text-muted-foreground">{tr("console.people.never")}</span>}</Fact>
        <Fact term={tr("console.user.fact.role")}>{user.platformRole === "none" ? tr("console.people.role.none") : tr(`console.role.${user.platformRole}`)}</Fact>
        <Fact term={tr("console.user.fact.2fa")}>
          <TwoFactor on={user.twoFactor} />
        </Fact>
        <Fact term={tr("console.user.fact.ban")}>
          {user.banned ? (
            <span className="grid gap-px whitespace-normal">
              <span className="text-[var(--c-danger-ink)]">{user.banned.reason ?? tr("console.people.banned")}</span>
              <span className="text-[11.5px] text-muted-foreground">
                {user.banned.at && <Ago iso={user.banned.at} />}
                {user.banned.by && ` · ${tr("console.user.ban_by", { name: user.banned.by })}`}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{tr("console.user.not_banned")}</span>
          )}
        </Fact>
      </dl>
      {user.canManage ? (
        <div className="border-t border-[var(--c-hairline)] pt-3.5">
          <UserActions user={{ id: user.id, name: user.name, email: String(user.email), banned: !!user.banned }} blocking={blocking} canLifecycle={ctx.can("stores.lifecycle")} />
        </div>
      ) : (
        why &&
        ctx.can("users.manage") && (
          <p className="border-t border-[var(--c-hairline)] pt-3.5 text-[12.5px] text-muted-foreground">
            {tr(why)}
            {why === "console.user.cannot.staff" && ctx.can("staff.manage") && (
              <>
                {" "}
                <PrefetchLink href="/admin/security?tab=staff" className={link}>
                  {tr("console.user.cannot.staff_link")}
                </PrefetchLink>
              </>
            )}
          </p>
        )
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The tabs                                                            */
/* ------------------------------------------------------------------ */

function Quiet<T>({ p }: { p: Panel<T> }) {
  return <section className={card}>{p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}</section>;
}

function Empty({ text }: { text: string }) {
  return <p className={cn(card, "px-5 py-8 text-[13px] text-muted-foreground")}>{text}</p>;
}

/** a list that is a table from 768 px and two-line rows below */
function Rows({ head, rows }: { head: { label: string; className?: string }[]; rows: { key: string; cells: ReactNode[]; phone: ReactNode }[] }) {
  return (
    <section className={cn(card, "overflow-hidden")}>
      <ul className="divide-y divide-[var(--c-hairline)] md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-1 px-3.5 py-3 text-[13px]">
            {r.phone}
          </li>
        ))}
      </ul>
      <table className="hidden w-full table-fixed border-collapse text-[13px] md:table">
        <thead className="border-b border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)]">
          <tr>
            {head.map((h) => (
              <th key={h.label} scope="col" className={cn("h-9 px-[var(--cell-x)] text-start text-[11.5px] font-medium text-muted-foreground first:ps-4 last:pe-4", h.className)}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[var(--c-hairline)] last:border-0">
              {r.cells.map((c, i) => (
                <td key={i} className={cn("truncate px-[var(--cell-x)] py-2.5 align-middle first:ps-4 last:pe-4", head[i]?.className)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <span className="text-[12px] text-muted-foreground">{children}</span>;

function StoreLink({ id, name, handle }: { id: string; name: string | null; handle: string | null }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <PrefetchLink href={`/admin/stores/${id}`} className={cn(link, "truncate")}>
        {name ?? (handle ? `@${handle}` : id)}
      </PrefetchLink>
      {name && handle && (
        <bdi dir="ltr" className="truncate font-mono text-[11.5px] text-muted-foreground">
          @{handle}
        </bdi>
      )}
    </span>
  );
}

async function TabBody({ ctx, user, tab, before }: { ctx: PlatformCtx; user: UserProfile; tab: Tab; before: number | null }) {
  switch (tab) {
    case "stores": {
      if (user.stores.length === 0) return <Empty text={tr("console.user.stores.none")} />;
      return (
        <Rows
          head={[{ label: tr("console.user.col.store"), className: "w-[34%]" }, { label: tr("console.user.col.role") }, { label: tr("console.user.col.membership") }, { label: tr("console.user.col.store_status") }, { label: tr("console.user.col.joined") }, { label: tr("console.user.col.last_active") }]}
          rows={user.stores.map((s) => {
            const role = label(`team.role.${s.role}`, s.role);
            const membership = label(`console.user.membership.${s.status}`, s.status);
            const status = label(`console.status.${s.storeStatus}`, s.storeStatus);
            const last = s.lastActiveAt ? <Ago iso={s.lastActiveAt} className="num" /> : <Muted>{tr("console.people.never")}</Muted>;
            return {
              key: s.storeId,
              cells: [<StoreLink key="s" id={s.storeId} name={s.name} handle={s.handle} />, role, membership, status, <Ago key="j" iso={s.joinedAt} className="num" />, last],
              phone: (
                <>
                  <StoreLink id={s.storeId} name={s.name} handle={s.handle} />
                  <Muted>
                    {role} · {membership} · {status} · {s.lastActiveAt ? <Ago iso={s.lastActiveAt} template="console.user.active_ago" /> : tr("console.people.never")}
                  </Muted>
                </>
              ),
            };
          })}
        />
      );
    }
    case "sessions": {
      const p = await panel("user.sessions", () => userSessions(ctx, user.id));
      if (p.state !== "ok") return <Quiet p={p} />;
      if (p.data.length === 0) return <Empty text={tr("console.user.sessions.none")} />;
      return (
        <Rows
          head={[{ label: tr("console.user.col.device"), className: "w-[34%]" }, { label: tr("console.user.col.ip") }, { label: tr("console.user.col.created") }, { label: tr("console.user.col.last_seen") }]}
          rows={p.data.map((s) => {
            const device = (
              <span className="flex min-w-0 items-center gap-2">
                <MonitorSmartphoneIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.device}</span>
                {s.viewing && <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--c-imp-soft)] px-2 text-[11px] font-medium text-[var(--c-imp-ink)]">{tr("console.user.sessions.viewing")}</span>}
              </span>
            );
            const ip = (
              <bdi dir="ltr" className="font-mono text-[12px]">
                {s.ip}
              </bdi>
            );
            return {
              key: s.id,
              cells: [device, ip, <Ago key="c" iso={s.createdAt} className="num" />, <Ago key="l" iso={s.lastSeenAt} className="num" />],
              phone: (
                <>
                  {device}
                  <Muted>
                    {ip} · <Ago iso={s.lastSeenAt} template="console.user.seen_ago" />
                  </Muted>
                </>
              ),
            };
          })}
        />
      );
    }
    case "signup": {
      const p = await panel("user.signups", () => userSignups(ctx, user.id));
      if (p.state !== "ok") return <Quiet p={p} />;
      if (p.data.length === 0) return <Empty text={tr("console.user.signup.none")} />;
      return (
        <Rows
          head={[{ label: tr("console.user.col.store"), className: "w-[28%]" }, { label: tr("console.user.col.kind") }, { label: tr("console.user.col.score") }, { label: tr("console.user.col.decision") }, { label: tr("console.user.col.created") }]}
          rows={p.data.map((r) => {
            const kind = label(`console.queue.kind.${r.kind}`, r.kind);
            const score = (
              <span className="num">
                {r.score} · {label(`console.band.${r.band}`, r.band)}
              </span>
            );
            const decision = (
              <span className="grid gap-px">
                <span>{label(`console.timeline.review_status.${r.status}`, r.status)}</span>
                {r.decidedAt && <Ago iso={r.decidedAt} className="num text-[11.5px] text-muted-foreground" />}
              </span>
            );
            return {
              key: r.id,
              cells: [<StoreLink key="s" id={r.storeId} name={null} handle={r.handle} />, kind, score, decision, <Ago key="c" iso={r.createdAt} className="num" />],
              phone: (
                <>
                  <StoreLink id={r.storeId} name={null} handle={r.handle} />
                  <Muted>
                    {kind} · {r.score} {label(`console.band.${r.band}`, r.band)} · {label(`console.timeline.review_status.${r.status}`, r.status)}
                  </Muted>
                </>
              ),
            };
          })}
        />
      );
    }
    case "linked": {
      const p = await panel("user.linked", () => userLinked(ctx, user.id));
      if (p.state !== "ok") return <Quiet p={p} />;
      if (p.data.length === 0) return <Empty text={tr("console.user.linked.none")} />;
      return (
        <Rows
          head={[{ label: tr("console.user.col.person"), className: "w-[36%]" }, { label: tr("console.user.col.shares") }, { label: tr("console.user.col.stores") }, { label: tr("console.user.col.state") }]}
          rows={p.data.map((r) => {
            const who = (
              <span className="grid min-w-0 gap-px">
                <PrefetchLink href={`/admin/users/${r.userId}`} className={cn(link, "truncate")}>
                  {r.name || tr("console.people.no_name")}
                </PrefetchLink>
                <bdi dir="ltr" className="truncate text-start font-mono text-[11.5px] text-muted-foreground">
                  {r.email}
                </bdi>
              </span>
            );
            const kinds = r.kinds.map((k) => label(`console.user.link.${k}`, k)).join(" · ");
            const state = r.banned ? <BannedBadge reason={null} /> : <Muted>{tr("console.user.not_banned")}</Muted>;
            return {
              key: r.userId,
              cells: [who, kinds, <span key="n" className="num">{r.stores}</span>, state],
              phone: (
                <>
                  {who}
                  <span className="flex flex-wrap items-center gap-2">
                    <Muted>
                      {kinds} · {tr("console.people.stores.member", { count: r.stores })}
                    </Muted>
                    {r.banned && <BannedBadge reason={null} />}
                  </span>
                </>
              ),
            };
          })}
        />
      );
    }
    case "activity": {
      const p = await panel("user.activity", () => userActivity(ctx, user.id, before !== null && Number.isSafeInteger(before) && before > 0 ? before : null));
      if (p.state !== "ok") return <Quiet p={p} />;
      if (p.data.rows.length === 0) return <Empty text={tr("console.user.activity.none")} />;
      return (
        <div className="grid gap-3">
          <Rows
            head={[{ label: tr("console.user.col.when"), className: "w-[132px]" }, { label: tr("console.user.col.what"), className: "w-[44%]" }, { label: tr("console.user.col.store") }, { label: tr("console.user.col.by") }]}
            rows={p.data.rows.map((r) => {
              const what = label(`console.audit.${r.action}`, r.action);
              const by = label(`console.activity_tab.actor.${r.actorKind}`, r.actorKind);
              return {
                key: String(r.id),
                cells: [<Ago key="a" iso={r.at} className="num text-[12px]" />, <span key="w" title={r.action}>{what}</span>, r.storeId ? <StoreLink key="s" id={r.storeId} name={null} handle={null} /> : <Muted>{tr("console.user.platform_row")}</Muted>, <Muted key="b">{by}</Muted>],
                phone: (
                  <>
                    <span>{what}</span>
                    <Muted>
                      <Ago iso={r.at} /> · {by}
                    </Muted>
                  </>
                ),
              };
            })}
          />
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            {before !== null ? (
              <PrefetchLink href={`/admin/users/${user.id}/activity`} className={link}>
                {tr("console.queue.first_page")}
              </PrefetchLink>
            ) : (
              <span />
            )}
            {p.data.next !== null && (
              <PrefetchLink href={`/admin/users/${user.id}/activity?before=${p.data.next}`} className={link}>
                {tr("console.user.activity.older")}
              </PrefetchLink>
            )}
          </div>
        </div>
      );
    }
    case "notes": {
      if (!ctx.can("stores.notes") || ctx.role === "analyst") return <Empty text={tr("console.notes_tab.not_for_role")} />;
      const [notes, staff] = await Promise.all([panel("user.notes", () => listNotes(ctx, { userId: user.id })), optional("user.notes.staff", () => listMentionableStaff(ctx))]);
      if (notes.state !== "ok") return <Quiet p={notes} />;
      return <NotesTab userId={user.id} notes={notes.data} staff={staff ?? []} />;
    }
  }
}
