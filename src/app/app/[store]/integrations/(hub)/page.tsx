import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { BacklogCard } from "@/components/admin/integrations/backlog-card";
import { DeliveriesLog } from "@/components/admin/integrations/deliveries-log";
import { HealthStrip } from "@/components/admin/integrations/health-strip";
import { EmptyHub, InlineError, LockedCard, ReadOnlyNote } from "@/components/admin/integrations/hub-states";
import { WhatToCheck } from "@/components/admin/integrations/what-to-check";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, translator } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { DELIVERIES_PAGES_MAX } from "@/lib/integrations/deliveries";
import { HUB_KINDS, hubFilters, integrationsHub } from "@/lib/integrations/hub.server";
import { REPLAY_ALL_MAX } from "@/lib/integrations/replay";
import { requireStoreMember, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/**
 * Who opens the hub: `callcenter.configure` (owner, admin, manager; `integrations.manage`, owner and admin, is inside
 * it), else the neutral 404. "View as store" holds no write key, so it opens the hub read-only (the replay actions
 * hidden with their reason) instead of the 404 a write key would answer it.
 */
async function hubMember(handle: string): Promise<StoreCtx> {
  try {
    return await requireStoreMember({ handle, permission: "callcenter.configure", throwOnFail: true });
  } catch (err) {
    if (err instanceof SeamError && err.code === "impersonation_read_only") return requireStoreMember({ handle });
    // the page's own refusal: the sign-in redirect, the 2FA step or the neutral 404
    return requireStoreMember({ handle, permission: "callcenter.configure" });
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("int.hub.title") };
}

/**
 * Connect → Integrations (operations.md OPE-§28.1, OD40; core §I.8 screen 9): the health strip, the Google Sheets
 * backlog with its last runs, What to check, and the deliveries log with Replay. `integrations.manage` replays;
 * `callcenter.configure` sees the strip and the log read-only; agents never reach it (OD12: the neutral 404). Under
 * "view as store" the replay actions are hidden with a one-line reason; a pending store sees a locked card.
 *
 * The route group keeps this screen's loading skeleton off the nested Sheets, Pixels and Telegram screens.
 */
/** The request's instant, for the relative times the client then keeps fresh (a module function: render stays pure). */
const requestTime = () => Date.now();

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ kind?: string | string[]; state?: string | string[] }>;
}) {
  const ctx = await hubMember((await params).store);
  const manage = ctx.can("integrations.manage");
  const locale = await viewerLocale(ctx.user);
  const t = translator(locale);
  const impersonating = ctx.scope.kind === "impersonation";
  const locked = ctx.store.status === "pending";
  const filters = hubFilters(await searchParams);
  const hub = locked ? null : await integrationsHub(ctx.scope, filters);
  const now = requestTime();
  const canReplay = manage && !impersonating;

  const nothing = !!hub && hub.tiles?.length === 0 && hub.sheets === null && hub.deliveries?.rows.length === 0 && hub.checks.length === 0 && !filters.kind && !filters.state;
  const failing = (hub?.checks.length ?? 0) > 0;

  return (
    // translated (ar / fr / en): the viewer's language and direction inside the shell (§I.5)
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen>
          <PageHeader title={t("int.hub.title")} description={t("int.hub.lead")} />
          {impersonating ? <ReadOnlyNote text={t("int.hub.impersonation")} /> : !manage ? <ReadOnlyNote text={t("int.hub.readOnly")} /> : null}

          {locked || !hub ? (
            <LockedCard />
          ) : nothing ? (
            <EmptyHub canConnect={manage && !impersonating} />
          ) : (
            <div className="grid gap-8">
              {hub.tiles === null ? <InlineError /> : hub.tiles.length > 0 ? <HealthStrip tiles={hub.tiles} now={now} canOpen={manage} /> : null}

              <div className={cn("grid items-start gap-5", hub.sheets !== null && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
                {hub.sheets === "error" ? <InlineError /> : hub.sheets ? <BacklogCard sheets={hub.sheets} now={now} canOpen={manage} /> : null}
                <div className={cn(failing && "max-lg:order-first")}>
                  <WhatToCheck checks={hub.checks} canOpen={manage} />
                </div>
              </div>

              <DeliveriesLog
                initial={hub.deliveries}
                filters={filters}
                kinds={HUB_KINDS}
                deadByKind={hub.deadByKind}
                canReplay={canReplay}
                limits={{ pages: DELIVERIES_PAGES_MAX, replayAll: REPLAY_ALL_MAX }}
                now={now}
              />
            </div>
          )}
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
