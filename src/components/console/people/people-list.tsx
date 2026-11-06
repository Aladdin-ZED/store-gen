/**
 * The people list (platform.md PLA-§11.1, PD35; server component): name, e-mail (masked for support and analyst by the
 * read model), phone country, stores ("owner of 2"), platform role chip, 2FA, last sign-in, created, and the Banned
 * badge with its reason on hover. Two-line cards under 768 px, the table above; keyset pages by 50 through the URL.
 *
 *   <PeopleList page={await listPeople(ctx, filter, cursor)} query={qs} hasFilters />
 */
import { BanIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { translator } from "@/lib/i18n/admin";
import type { PeoplePage, PersonRow } from "@/lib/platform/people";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { TINT_INK } from "../tints";
import { consoleUrl } from "@/lib/platform/console-url";

const tr = translator(CONSOLE_LOCALE);
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";
const link = "rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:inline-flex max-md:min-h-11 max-md:items-center";

export function RoleChip({ role }: { role: PersonRow["platformRole"] }) {
  if (role === "none") return <span className="text-muted-foreground">—</span>;
  return <span className="inline-flex h-5 items-center rounded-full bg-[var(--brand-soft)] px-2 text-[11.5px] font-medium text-[var(--c-brand-ink)]">{tr(`console.role.${role}`)}</span>;
}

export function TwoFactor({ on }: { on: boolean }) {
  const Icon = on ? ShieldCheckIcon : ShieldOffIcon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px]", on ? TINT_INK.emerald : "text-muted-foreground")}>
      <Icon aria-hidden="true" className="size-3.5" />
      {tr(on ? "console.people.2fa.on" : "console.people.2fa.off")}
    </span>
  );
}

export function BannedBadge({ reason }: { reason: string | null }) {
  const text = reason ? tr("console.people.banned_reason", { reason }) : tr("console.people.banned");
  return (
    <span title={text} className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[var(--c-danger-soft)] px-2 text-[11.5px] font-medium text-[var(--c-danger-ink)]">
      <BanIcon aria-hidden="true" className="size-3" />
      {tr("console.people.banned")}
      {reason && <span className="sr-only">: {reason}</span>}
    </span>
  );
}

function storesText(s: PersonRow["stores"]): string {
  if (s.member === 0) return tr("console.people.stores.none");
  if (s.owner === 0) return tr("console.people.stores.member", { count: s.member });
  return tr("console.people.stores.owner", { count: s.member, owner: s.owner });
}

function Who({ row }: { row: PersonRow }) {
  return (
    <span className="grid min-w-0 gap-px">
      <span className="flex min-w-0 items-center gap-1.5">
        <PrefetchLink href={consoleUrl(`/users/${row.id}`)} className="truncate rounded-[4px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          {row.deleted ? tr("console.people.deleted") : row.name || tr("console.people.no_name")}
        </PrefetchLink>
        {row.banned && <BannedBadge reason={row.banned.reason} />}
      </span>
      <bdi dir="ltr" className="truncate text-start font-mono text-[11.5px] text-muted-foreground">
        {row.email}
      </bdi>
    </span>
  );
}

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn("h-9 px-[var(--cell-x)] text-start text-[11.5px] font-medium text-muted-foreground", className)}>
    {children}
  </th>
);

export function PeopleList({ page, query, hasFilters }: { page: PeoplePage; query: string; hasFilters: boolean }) {
  const rows = page.rows;
  const nextHref = page.next ? consoleUrl(`/users?${new URLSearchParams([...new URLSearchParams(query).entries()].filter(([k]) => k !== "cursor").concat([["cursor", page.next]])).toString()}`) : null;
  const firstHref = new URLSearchParams(query).has("cursor") ? consoleUrl(`/users?${new URLSearchParams([...new URLSearchParams(query).entries()].filter(([k]) => k !== "cursor")).toString()}`) : null;

  return (
    <div className="grid gap-3">
      {page.search === "ignored" && <p className="rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3.5 py-2.5 text-[12.5px]">{tr("console.people.search.ignored")}</p>}
      {rows.length === 0 ? (
        <div className={cn(card, "grid justify-items-start gap-1 px-5 py-10")}>
          <p className="text-[13px] font-medium">{tr(hasFilters ? "console.people.empty.filtered" : "console.people.empty.none")}</p>
          {hasFilters && (
            <PrefetchLink href={consoleUrl("/users")} className={cn(link, "mt-1 text-[12px]")}>
              {tr("console.people.clear")}
            </PrefetchLink>
          )}
        </div>
      ) : (
        <>
          {/* phone: two-line rows */}
          <ul className={cn(card, "divide-y divide-[var(--c-hairline)] md:hidden")}>
            {rows.map((row) => (
              <li key={row.id} className="grid gap-1.5 px-3.5 py-3">
                <Who row={row} />
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span>{storesText(row.stores)}</span>
                  <RoleChip role={row.platformRole} />
                  <TwoFactor on={row.twoFactor} />
                  {row.lastLoginAt ? <Ago iso={row.lastLoginAt} template="console.people.last_login" className="num" /> : <span>{tr("console.people.never")}</span>}
                </div>
              </li>
            ))}
          </ul>

          {/* from 768 px: the table */}
          <div className={cn(card, "hidden overflow-hidden md:block")}>
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead className="border-b border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)]">
                <tr>
                  <Th className="w-[34%] ps-4 lg:w-[28%]">{tr("console.people.col.person")}</Th>
                  <Th className="hidden w-[76px] lg:table-cell">{tr("console.people.col.phone")}</Th>
                  <Th className="w-[132px]">{tr("console.people.col.stores")}</Th>
                  <Th className="w-[104px]">{tr("console.people.col.role")}</Th>
                  <Th className="w-[76px]">{tr("console.people.col.2fa")}</Th>
                  <Th className="w-[120px]">{tr("console.people.col.last_login")}</Th>
                  <Th className="hidden w-[112px] pe-4 xl:table-cell">{tr("console.people.col.created")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={cn("border-b border-[var(--c-hairline)] last:border-0 hover:bg-[color-mix(in_oklch,var(--muted)_40%,transparent)]", row.deleted && "opacity-60")}>
                    <td className="py-2.5 ps-4 pe-[var(--cell-x)] align-middle">
                      <Who row={row} />
                    </td>
                    <td className="hidden px-[var(--cell-x)] align-middle font-mono text-[12px] text-muted-foreground lg:table-cell">
                      <bdi dir="ltr">{row.phoneCountry ?? "—"}</bdi>
                    </td>
                    <td className="truncate px-[var(--cell-x)] align-middle text-[12.5px]">{storesText(row.stores)}</td>
                    <td className="px-[var(--cell-x)] align-middle">
                      <RoleChip role={row.platformRole} />
                    </td>
                    <td className="px-[var(--cell-x)] align-middle">
                      <TwoFactor on={row.twoFactor} />
                    </td>
                    <td className="px-[var(--cell-x)] align-middle text-[12px]">{row.lastLoginAt ? <Ago iso={row.lastLoginAt} className="num" /> : <span className="text-muted-foreground">{tr("console.people.never")}</span>}</td>
                    <td className="hidden px-[var(--cell-x)] pe-4 align-middle text-[12px] text-muted-foreground xl:table-cell">
                      <Ago iso={row.createdAt} className="num" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {(nextHref || firstHref) && (
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          {firstHref ? (
            <PrefetchLink href={firstHref} className={link}>
              {tr("console.queue.first_page")}
            </PrefetchLink>
          ) : (
            <span />
          )}
          {nextHref && (
            <PrefetchLink href={nextHref} className={link}>
              {tr("console.queue.next_page")}
            </PrefetchLink>
          )}
        </div>
      )}
    </div>
  );
}
