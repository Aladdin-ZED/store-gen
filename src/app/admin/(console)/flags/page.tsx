import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { FlagEditor } from "@/components/console/flags/flag-editor";
import { FlagsTable } from "@/components/console/flags/flags-table";
import { KillCard } from "@/components/console/flags/kill-card";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { PLATFORM_ROLES } from "@/lib/auth/permissions";
import { t as message, translator } from "@/lib/i18n/admin";
import { MARKETS } from "@/lib/page/schema";
import { killSwitchPreview, listFlagOverrides, listFlags, listKillSwitches, type FlagTab, type KillSwitchPreview } from "@/lib/platform/flags";
import { optional, panel } from "@/lib/platform/panel";
import { listPlans } from "@/lib/platform/plans";
import { requirePlatform } from "@/lib/platform/seam";
import { STORE_STATUSES } from "@/lib/platform/stores-filter";
import { STORE_MODES } from "@/lib/tenancy/mode";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/*
 * `/admin/flags?tab=kill|release|ops` (platform.md PLA-§12, PL-12; PD29, PD43). Kill switches: one card per seeded key
 * with its state, last change and history; `kill.manage` gets the toggle, whose sheet carries the preview read here
 * (what stops, banner in ar / fr / en, affected stores, typed phrase) and asks for the step-up. Release / ops: the
 * flags table; `&edit=<key>` opens the editor (default, ordered rules, overrides; `flags.manage`, archived read-only).
 * `experiment` arrives with R3. No toggle exists outside these cards (never from ⌘K or a chord).
 */
export const metadata: Metadata = { title: message("console.flags.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Tab = "kill" | "release" | "ops";
const TABS: readonly Tab[] = ["kill", "release", "ops"];

const tr = translator(CONSOLE_LOCALE);
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";

async function Kill({ ctx }: { ctx: PlatformCtx }) {
  const cards = await panel("flags.kill", () => listKillSwitches(ctx));
  if (cards.state !== "ok") return <section className={card}>{cards.state === "error" ? <PanelError reference={cards.ref} /> : <PanelUnavailable />}</section>;
  const manage = ctx.can("kill.manage");
  const previews = new Map<string, KillSwitchPreview>();
  if (manage) {
    const list = await Promise.all(cards.data.map((c) => optional("flags.kill.preview", () => killSwitchPreview(ctx, c.key))));
    for (const p of list) if (p) previews.set(p.key, p);
  }
  return (
    <div className="grid gap-3">
      {!manage && <p className="text-[12.5px] text-muted-foreground">{tr("console.kill.read_only")}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.data.map((c) => (
          <KillCard key={c.key} card={c} preview={previews.get(c.key) ?? null} />
        ))}
      </div>
    </div>
  );
}

async function Flags({ ctx, tab, edit }: { ctx: PlatformCtx; tab: "release" | "ops"; edit: string | null }) {
  const all = await panel("flags.list", () => listFlags(ctx));
  if (all.state !== "ok") return <section className={card}>{all.state === "error" ? <PanelError reference={all.ref} /> : <PanelUnavailable />}</section>;
  const rows = all.data[tab as FlagTab];
  const row = edit ? (all.data.release.find((r) => r.key === edit) ?? all.data.ops.find((r) => r.key === edit) ?? null) : null;
  if (!edit) return <FlagsTable rows={rows} tab={tab} />;
  const back = (
    <PrefetchLink href={`/admin/flags?tab=${tab}`} className="inline-flex items-center gap-1 justify-self-start rounded-[4px] text-[12.5px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
      <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
      {tr("console.flags.back")}
    </PrefetchLink>
  );
  if (!row) {
    return (
      <div className="grid gap-3">
        {back}
        <p className={cn(card, "px-5 py-8 text-[13px] text-muted-foreground")}>{tr("console.flags.not_found")}</p>
      </div>
    );
  }
  const [overrides, plans] = await Promise.all([optional("flags.overrides", () => listFlagOverrides(ctx, row.key)), listPlans(ctx).catch(() => [])]);
  return (
    <div className="grid gap-3">
      {back}
      <header className="grid gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
          <bdi dir="ltr" className="font-mono">
            {row.key}
          </bdi>
          <span className="text-[12px] font-normal text-muted-foreground">
            {tr(`console.flags.kind.${row.kind}`)} · {tr(`console.flags.type.${row.type}`)}
            {row.ownerTrack ? ` · ${row.ownerTrack}` : ""}
          </span>
        </h2>
        <p className="max-w-prose text-[13px] text-muted-foreground">{row.description}</p>
      </header>
      <FlagEditor
        key={`${row.key}:${row.updatedAt ?? ""}`}
        row={row}
        overrides={overrides ?? []}
        canManage={ctx.can("flags.manage")}
        lists={{ plans: plans.map((p) => p.id), markets: MARKETS, modes: STORE_MODES, statuses: STORE_STATUSES.filter((s) => s !== "purged"), roles: PLATFORM_ROLES }}
      />
    </div>
  );
}

export default async function FlagsPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "kill";
  const editRaw = Array.isArray(sp.edit) ? sp.edit[0] : sp.edit;
  const edit = typeof editRaw === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(editRaw) ? editRaw : null;
  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <header className="grid gap-1">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.flags.title")}</h1>
        <p className="max-w-prose text-[13px] text-muted-foreground">{tr(`console.flags.lead.${tab}`)}</p>
      </header>
      <nav aria-label={tr("console.flags.tabs")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-1 border-b border-[var(--c-hairline)]">
          {TABS.map((x) => (
            <li key={x}>
              <PrefetchLink
                href={`/admin/flags?tab=${x}`}
                aria-current={x === tab ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 border-transparent px-3 text-[13px] text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11",
                  x === tab && "border-[var(--brand)] font-medium text-foreground",
                )}
              >
                {tr(`console.flags.tab.${x}`)}
              </PrefetchLink>
            </li>
          ))}
        </ul>
      </nav>
      <PanelBoundary title={tr(`console.flags.tab.${tab}`)}>{tab === "kill" ? <Kill ctx={ctx} /> : <Flags ctx={ctx} tab={tab} edit={edit} />}</PanelBoundary>
    </div>
  );
}
