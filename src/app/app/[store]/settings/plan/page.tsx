import type { Metadata } from "next";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { viewerLocale } from "@/lib/auth/locale";
import { t } from "@/lib/i18n/admin";
import { listStoreRequests } from "@/lib/platform/requests";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { memberCtx } from "../../member-ctx";
import { createStoreRequestAction, withdrawStoreRequestAction } from "./actions";
import { planFacts } from "./data";
import { PlanView } from "./_components/plan-view";

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.plan.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/plan"))),
  };
}

/**
 * Settings → Plan & usage (P2 SHELL; platform.md PLA-§22.10.4, PL-11, P0b review F-15), `billing.read`: the plan's
 * name and its one line (no price: "Beta: free while Store Gen is in beta"), the usage meters, the features with their
 * lock reasons, the active boosts, the requests (owner, `billing.manage`: a plan change, more of a metric, Withdraw)
 * with their outcome but never the staff's note, and the subscription history. Read-only without `billing.manage`.
 */
export default async function PlanSettingsPage({ params }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "billing.read",
  });
  const [facts, requests] = await Promise.all([planFacts(ctx.scope, ctx.store), listStoreRequests(ctx.scope)]);
  return (
    <PlanView
      facts={facts}
      requests={requests.filter((r) => r.kind === "plan_change" || r.kind === "limit_raise" || r.kind === "mode_change")}
      canManage={ctx.can("billing.manage")}
      create={createStoreRequestAction}
      withdraw={withdrawStoreRequestAction}
    />
  );
}
