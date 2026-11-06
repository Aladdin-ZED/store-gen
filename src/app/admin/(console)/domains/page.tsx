import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { Checklist, Checks, DomainStatusCard, RerenderCard } from "@/components/console/domains/domains";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { getCspNonce } from "@/lib/auth";
import { platformTurnstileKeys } from "@/lib/auth/platform-config";
import { t as message, translator } from "@/lib/i18n/admin";
import { domainStatus, getDomainMove, rerenderProgress } from "@/lib/platform/domain-move";
import { optional, panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { staffNames } from "@/lib/platform/settings-view";

/*
 * `/admin/domains` (platform.md PLA-§16, OS-06, core §C.10): the status card, the re-render progress, the move
 * checklist and the V1 … V13 checks. `domains.manage`. Never a secret value: EDGE_KEY and EDGE_KEY_PREV read set /
 * not set, the Turnstile secret never leaves the server (only the public site key reaches the test widget).
 */
export const metadata: Metadata = { title: message("console.domains.meta") };

const tr = translator(CONSOLE_LOCALE);

export default async function DomainsPage() {
  const ctx = await requirePlatform({ permission: "domains.manage" });
  const [status, move, rerender, widget, nonce] = await Promise.all([
    panel("domains.status", () => domainStatus(ctx)),
    panel("domains.move", () => getDomainMove(ctx)),
    optional("domains.rerender", () => rerenderProgress(ctx)),
    optional("domains.widget", () => platformTurnstileKeys()),
    getCspNonce(),
  ]);
  const names = move.state === "ok" ? await staffNames([...move.data.steps.map((s) => s.done?.by), ...move.data.checks.map((c) => c.passed?.by)]) : {};
  const manage = ctx.can("domains.manage");
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.domains.title")} lead={tr("console.domains.lead")} />
      <PanelBoundary title={tr("console.domains.status")}>{status.state === "ok" ? <DomainStatusCard s={status.data} /> : status.state === "error" ? <PanelError reference={status.ref} /> : <PanelUnavailable />}</PanelBoundary>
      <PanelBoundary title={tr("console.domains.rerender")}>
        <RerenderCard state={rerender} canManage={manage} />
      </PanelBoundary>
      {move.state === "ok" ? (
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <PanelBoundary title={tr("console.domains.checklist")}>
            <Checklist move={move.data} names={names} canManage={manage} />
          </PanelBoundary>
          <PanelBoundary title={tr("console.domains.checks")}>
            <Checks move={move.data} names={names} canManage={manage} siteKey={widget?.siteKey ?? null} nonce={nonce} root={status.state === "ok" ? status.data.storeRootDomain : null} />
          </PanelBoundary>
        </div>
      ) : move.state === "error" ? (
        <PanelError reference={move.ref} />
      ) : (
        <PanelUnavailable />
      )}
    </div>
  );
}
