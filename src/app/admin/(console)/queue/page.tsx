import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { ConsolePanel, PanelError, PanelUnavailable } from "@/components/console/panel";
import { QueueSplit } from "@/components/console/queue/queue-split";
import { QueueSkeleton } from "@/components/console/queue/queue-skeleton";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { listQueue, QUEUE_TABS, type QueueTab } from "@/lib/platform/queue";
import { reviewPane } from "@/lib/platform/queue-pane";
import { requirePlatform } from "@/lib/platform/seam";
import { getPlatformSetting } from "@/lib/settings";
import type { PlatformCtx } from "@/lib/tenancy/types";

/*
 * `/admin/queue` (platform.md PLA-§3.5, §3.7, PL-04; PD16, PD52, PD65): the approval queue. `console.read`; the
 * decisions are `signups.decide` (plan and limit requests `entitlements.override`, blocking `users.manage` with a
 * fresh step-up), each re-checked by its action. `?tab=` picks the tab (Review by default), `?q=` searches, `?cursor=`
 * pages, `?r=<reviewId>` opens a row (the detail sheet below 1280 px). The list and the first row's detail are read
 * here and streamed behind the row skeletons; the split view loads the other rows' details as they are opened.
 */
export const metadata: Metadata = { title: message("console.queue.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Queue({ ctx, tab, q, cursor, r }: { ctx: PlatformCtx; tab: QueueTab; q: string; cursor: string | null; r: string | null }) {
  const tr = translator(CONSOLE_LOCALE);
  const [list, setting] = await Promise.all([panel("queue.list", () => listQueue(ctx, tab, q ? { q } : {}, cursor)), getPlatformSetting("platform")]);
  if (list.state !== "ok") {
    return (
      <ConsolePanel title={tr("console.queue.page_title")}>{list.state === "error" ? <PanelError reference={list.ref} /> : <PanelUnavailable />}</ConsolePanel>
    );
  }
  // the opened row, else the first row: its pane is ready on the first paint
  const first = r && /^[0-9A-Z]{26}$/.test(r) ? r : (list.data.rows[0]?.id ?? null);
  const pane = first ? await panel("queue.pane", () => reviewPane(ctx, first)) : null;
  return (
    <QueueSplit
      list={list.data}
      pane={pane === null ? null : pane.state === "ok" ? { state: "ok", data: pane.data } : { state: "error", ref: pane.state === "error" ? pane.ref : "n/a" }}
      tab={tab}
      q={q}
      cursor={cursor}
      initialActive={r && /^[0-9A-Z]{26}$/.test(r) ? r : null}
      slaHours={setting.signup.slaHours}
      grants={{
        decide: ctx.can("signups.decide"),
        block: ctx.can("users.manage"),
        viewAs: ctx.can("stores.impersonate"),
      }}
    />
  );
}

export default async function QueuePage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const sp = await searchParams;
  const rawTab = one(sp.tab);
  const tab: QueueTab = (QUEUE_TABS as readonly string[]).includes(rawTab) ? (rawTab as QueueTab) : "review";
  const q = one(sp.q).trim().slice(0, 120);
  const cursor = one(sp.cursor) || null;
  const r = one(sp.r) || null;
  const tr = translator(CONSOLE_LOCALE);
  return (
    <PanelBoundary title={tr("console.queue.page_title")}>
      {/* not keyed: a tab or search change keeps the list (and the search field's focus) until the next one streams in */}
      <Suspense fallback={<QueueSkeleton tab={tab} />}>
        <Queue ctx={ctx} tab={tab} q={q} cursor={cursor} r={r} />
      </Suspense>
    </PanelBoundary>
  );
}
