import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { ConsolePanel, PanelError, PanelSkeleton, PanelUnavailable } from "@/components/console/panel";
import { PeopleFilters } from "@/components/console/people/people-filters";
import { PeopleList } from "@/components/console/people/people-list";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { listPeople, parsePeopleFilter, type PeopleFilter } from "@/lib/platform/people";
import { requirePlatform } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";

/*
 * `/admin/users` (platform.md PLA-§11.1, PD35): every account, newest first, keyset-paged by 50. The search reads an
 * exact e-mail for every role (masked per role by the read model); a name prefix and an exact E.164 phone for admin+.
 * Filters in the URL: platform role, banned, 2FA, created range, no store. `console.read`.
 */
export const metadata: Metadata = { title: message("console.people.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const tr = translator(CONSOLE_LOCALE);

async function People({ ctx, filter, cursor, query }: { ctx: PlatformCtx; filter: PeopleFilter; cursor: string | null; query: string }) {
  const page = await panel("people.list", () => listPeople(ctx, filter, cursor));
  if (page.state !== "ok") {
    return <ConsolePanel title={tr("console.people.title")}>{page.state === "error" ? <PanelError reference={page.ref} /> : <PanelUnavailable />}</ConsolePanel>;
  }
  return <PeopleList page={page.data} query={query} hasFilters={Object.keys(filter).length > 0} />;
}

export default async function UsersPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const sp = await searchParams;
  const params: Record<string, unknown> = {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const one = Array.isArray(v) ? v[0] : v;
    params[k] = one;
    if (typeof one === "string" && one) qs.set(k, one);
  }
  const filter = parsePeopleFilter(params);
  const cursor = typeof params.cursor === "string" && params.cursor ? params.cursor : null;
  const admin = ctx.role === "admin" || ctx.role === "super_admin";
  return (
    <div className="mx-auto grid w-full max-w-[1440px] gap-4 md:gap-5">
      <header className="grid gap-1">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.people.title")}</h1>
        <p className="text-[13px] text-muted-foreground">{tr(admin ? "console.people.lead_admin" : "console.people.lead")}</p>
      </header>
      <PeopleFilters filter={filter} adminSearch={admin} />
      <PanelBoundary title={tr("console.people.title")}>
        <Suspense fallback={<PanelSkeleton title={tr("console.people.title")} rows={10} />}>
          <People ctx={ctx} filter={filter} cursor={cursor} query={qs.toString()} />
        </Suspense>
      </PanelBoundary>
    </div>
  );
}
