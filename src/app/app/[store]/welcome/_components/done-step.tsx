/**
 * The welcome flow's done step (P2 SHELL; platform.md PLA-§22.2 `done` row, PD60, PD61; core §A.2 rev 3): the saved
 * line for the store's mode ("saved as a draft", or "a sales page" for a store-mode shop), "Open in the builder", and
 * the dashboard's own blocks for this store: the In-review card with "Submit for review" (PLA-§22.7), the Store Health
 * ring with the local setup issues (`rules/shell.ts`; "delivery zones empty" is an issue, not a blocker) and the
 * address card with P3's test-order slot (disabled "after publishing" while nothing is live) and campaign slot.
 * Server component: the blocks stream like the dashboard's, each in its own boundary.
 */
import { CheckIcon, PencilRulerIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddressCard } from "@/components/admin/common/address-card";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import { HealthBlock, ReviewBlock, type BlockView } from "@/components/admin/dashboard/dashboard-view";
import { CampaignSlot, TestOrderSlot } from "@/components/admin/landing/address-slots";
import { buttonVariants } from "@/components/ui/button";
import { translator } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import type { StoreMode } from "@/lib/tenancy/mode";
import { appHref } from "@/lib/urls";
import { WelcomeHeader } from "./welcome-header";

export interface DoneStepProps {
  view: BlockView;
  pageId: string | null;
  canPages: boolean;
  /** the store's mode: a store-mode shop's first page is a sales page (core §A.2 rev 3) */
  mode: StoreMode;
}

/** The address card: live once a page is published and the store is approved; the slots only with `pages.write`. */
async function DoneAddress({ v, pageId, canPages }: { v: BlockView; pageId: string | null; canPages: boolean }) {
  const address = await v.load.panels.address;
  const live = address.ok && address.data.livePages > 0 && v.store.status !== "pending";
  const target = (address.ok ? address.data.page?.id : null) ?? pageId;
  return <AddressCard store={v.store} live={live} pageId={target} slots={canPages ? { testOrder: <TestOrderSlot pageId={target} live={live} />, campaign: <CampaignSlot /> } : undefined} />;
}

export function DoneStep({ view: v, pageId, canPages, mode }: DoneStepProps) {
  const tr = translator(v.locale);
  const href = (path: `/${string}` | "") => appHref(v.store.handle, path);
  const slot = (title: string, children: ReactNode) => (
    <div className="min-w-0 [&:has(>section:empty)]:hidden">
      <PanelBoundary title={title}>{children}</PanelBoundary>
    </div>
  );
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <WelcomeHeader progress={4} dashboard />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-8 pb-16 sm:px-8 sm:pt-12">
        <div className="adm-fade grid gap-8">
          <div className="grid gap-4">
            <span className="inline-flex items-center gap-1.5 justify-self-start rounded-full bg-success/12 px-3 py-1 text-[0.8rem] font-medium text-success">
              <CheckIcon className="size-3.5" aria-hidden="true" />
              {tr("onboarding.done_badge")}
            </span>
            <div className="grid gap-2">
              <h1 className="text-balance text-[1.6rem] leading-tight font-semibold tracking-tight sm:text-[1.85rem]">{tr("onboarding.done_title")}</h1>
              <p className="max-w-[62ch] text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                {pageId ? tr(mode === "store" ? "onboarding.reveal.saved_sales_page" : "onboarding.reveal.saved") : tr("onboarding.done_lead")}
              </p>
            </div>
            {pageId && canPages && (
              <Link href={href(`/pages/${pageId}/edit`)} className={cn(buttonVariants({ size: "lg" }), "h-12 justify-self-start rounded-full px-6 text-[0.95rem]", FOCUS_RING)}>
                <PencilRulerIcon aria-hidden="true" />
                {tr("onboarding.reveal.builder")}
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start">
            <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
              {v.store.status === "pending" && slot(tr("shell.review.title"), <ReviewBlock v={v} href={href} />)}
              {slot(tr("shell.address.title"), <DoneAddress v={v} pageId={pageId} canPages={canPages} />)}
            </div>
            <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">{slot(tr("health.title"), <HealthBlock v={v} href={href} />)}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
