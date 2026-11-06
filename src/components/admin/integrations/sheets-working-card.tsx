"use client";
/**
 * Working in the sheet (operations.md OPE-§19.8 rev 3, OD54, OPE-§14.3): for a team that works in the sheet instead
 * of the call queue. Which columns come back to the app (Agent, Note agent, Tracking, Transporteur); the "Agent"
 * names seen in the last 28 days that no member is mapped to, with their confirmed and decided counts and "Map to a
 * member" (P4's /team/agents owns the mapping and its 90-day backfill); and in plain words what needs the queue versus
 * what works from the sheet. Counts only, never a rate here: the board shows the rates with their n.
 */
import { ArrowUpRightIcon, CheckIcon, MinusIcon } from "lucide-react";
import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { SheetLabelSeen } from "@/lib/integrations/sheets-screen.server";
import { useStore } from "../shell/store-context";
import { num } from "./hub-format";
import { InlineError } from "./hub-states";

const READ_BACK = [
  { header: "Agent", what: "int.sheets.work.col.agent" },
  { header: "Note agent", what: "int.sheets.work.col.agentNote" },
  { header: "Tracking", what: "int.sheets.work.col.tracking" },
  { header: "Transporteur", what: "int.sheets.work.col.carrier" },
] as const satisfies readonly { header: string; what: MessageKey }[];

const NEEDS_QUEUE: MessageKey[] = [
  "int.sheets.work.q.firstTouch",
  "int.sheets.work.q.handling",
  "int.sheets.work.q.attempts",
  "int.sheets.work.q.abandoned",
  "int.sheets.work.q.skips",
  "int.sheets.work.q.bestHours",
];
const FROM_SHEET: MessageKey[] = ["int.sheets.work.s.rates", "int.sheets.work.s.reasons", "int.sheets.work.s.commissions"];

export function SheetsWorkingCard({ labels }: { labels: SheetLabelSeen[] | null }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const canMap = store.can("callcenter.configure");

  return (
    <section id="agents" aria-labelledby="sheets-work-title" className="adm-surface grid scroll-mt-24 gap-6 p-4 sm:p-6">
      <div className="grid gap-1">
        <h2 id="sheets-work-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
          {t("int.sheets.work.title")}
        </h2>
        <p className="max-w-[64ch] text-sm text-pretty text-muted-foreground">{t("int.sheets.work.lead")}</p>
      </div>

      <div className="grid gap-2.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t("int.sheets.work.readBack")}</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {READ_BACK.map((c) => (
            <li key={c.header} className="flex min-w-0 items-baseline gap-2 rounded-xl bg-foreground/[0.03] px-3 py-2.5 text-sm">
              <bdi lang="fr" className="shrink-0 rounded-md bg-background px-1.5 py-0.5 font-mono text-[0.75rem] font-medium ring-1 ring-foreground/[0.08] ring-inset">
                {c.header}
              </bdi>
              <span className="min-w-0 text-pretty text-muted-foreground">{t(c.what)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-2.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t("int.sheets.work.labels")}</h3>
        {labels === null ? (
          <InlineError />
        ) : labels.length === 0 ? (
          <p className="rounded-xl bg-foreground/[0.03] px-3 py-3 text-sm text-pretty text-muted-foreground">{t("int.sheets.work.labels.none")}</p>
        ) : (
          <>
            <ul className="divide-y divide-foreground/[0.05] overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06] ring-inset">
              {labels.map((l) => (
                <li key={l.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="grid min-w-0 gap-0.5">
                    <bdi className="truncate text-sm font-medium">{l.label}</bdi>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("int.sheets.work.label.counts", { confirmed: num(l.confirmed, locale), decided: num(l.decided, locale) })}
                    </span>
                  </div>
                  {canMap && (
                    <Link
                      href={store.href("/team/agents")}
                      className="-me-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground sm:min-h-8"
                    >
                      {t("int.sheets.work.map")}
                      <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-pretty text-muted-foreground">{t("int.sheets.work.mapHint")}</p>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FeatureList title={t("int.sheets.work.fromSheet")} items={FROM_SHEET} on />
        <FeatureList title={t("int.sheets.work.needsQueue")} items={NEEDS_QUEUE} on={false} />
      </div>
    </section>
  );
}

function FeatureList({ title, items, on }: { title: string; items: MessageKey[]; on: boolean }) {
  const t = useT();
  const Icon = on ? CheckIcon : MinusIcon;
  return (
    <div className="grid content-start gap-2 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="grid gap-1.5">
        {items.map((k) => (
          <li key={k} className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
            <Icon className={on ? "mt-0.5 size-4 shrink-0 text-success-ink" : "mt-0.5 size-4 shrink-0 text-foreground/35"} aria-hidden="true" />
            {t(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}
