import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader, TabNav } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { InviteCodes, Waitlist } from "@/components/console/settings/signup-codes";
import { SignupMode } from "@/components/console/settings/signup-mode";
import { TurnstileTab } from "@/components/console/settings/signup-turnstile";
import { getCspNonce } from "@/lib/auth";
import { t as message, translator } from "@/lib/i18n/admin";
import { MARKETS } from "@/lib/page/schema";
import { panel, type Panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { signupSettingsView } from "@/lib/platform/settings-view";
import { listInviteCodes, listWaitlist, type WaitlistFilter } from "@/lib/platform/signup-admin";
import type { PlatformCtx } from "@/lib/tenancy/types";

/*
 * `/admin/settings/signup?tab=mode|codes|waitlist|turnstile` (platform.md PLA-§3.2, §3.3, §13.2; PD68, D69): the mode
 * and its thresholds, ceilings and weights (`platform.settings`), the invite codes and the waitlist (`signups.decide`,
 * admin+: daily ops), and the platform Turnstile widget (`platform.settings`). A tab the viewer cannot use is hidden.
 */
export const metadata: Metadata = { title: message("console.signup.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Tab = "mode" | "codes" | "waitlist" | "turnstile";
const tr = translator(CONSOLE_LOCALE);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

function Fallback({ p }: { p: Exclude<Panel<unknown>, { state: "ok" }> }) {
  return p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />;
}

async function Body({ ctx, tab, sp }: { ctx: PlatformCtx; tab: Tab; sp: Record<string, string | string[] | undefined> }) {
  const raw = one(sp.cursor);
  const cursor = raw && CURSOR.test(raw) ? raw : null;
  if (tab === "codes") {
    const p = await panel("signup.codes", () => listInviteCodes(ctx, cursor));
    return p.state === "ok" ? <InviteCodes rows={p.data.rows} next={p.data.next} canDecide={ctx.can("signups.decide")} /> : <Fallback p={p} />;
  }
  if (tab === "waitlist") {
    const s = one(sp.status) ?? "waiting";
    const status = ["waiting", "cap", "invited", "dropped", "all"].includes(s) ? s : "waiting";
    const filter: WaitlistFilter = status === "cap" ? { status: "waiting", source: "cap" } : status === "all" ? {} : { status: status as "waiting" | "invited" | "dropped" };
    const p = await panel("signup.waitlist", () => listWaitlist(ctx, filter, cursor));
    return p.state === "ok" ? <Waitlist rows={p.data.rows} next={p.data.next} canDecide={ctx.can("signups.decide")} status={status} /> : <Fallback p={p} />;
  }
  const view = await panel("signup.view", () => signupSettingsView(ctx));
  if (view.state !== "ok") return <Fallback p={view} />;
  if (tab === "turnstile") return <TurnstileTab siteKey={view.data.turnstile.siteKey} secret={view.data.turnstile.secret} nonce={await getCspNonce()} />;
  return <SignupMode view={view.data} markets={MARKETS} />;
}

export default async function SignupSettingsPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const settings = ctx.can("platform.settings");
  const decide = ctx.can("signups.decide");
  if (!settings && !decide) notFound();
  const tabs = [
    ...(settings ? [{ id: "mode", href: "/admin/settings/signup?tab=mode", label: tr("console.signup.tab.mode") }] : []),
    ...(decide ? [{ id: "codes", href: "/admin/settings/signup?tab=codes", label: tr("console.signup.tab.codes") }] : []),
    ...(decide ? [{ id: "waitlist", href: "/admin/settings/signup?tab=waitlist", label: tr("console.signup.tab.waitlist") }] : []),
    ...(settings ? [{ id: "turnstile", href: "/admin/settings/signup?tab=turnstile", label: tr("console.signup.tab.turnstile") }] : []),
  ];
  const sp = await searchParams;
  const asked = one(sp.tab);
  const tab = (tabs.find((x) => x.id === asked) ?? tabs[0]!).id as Tab;
  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.signup.title")} lead={tr(`console.signup.lead.${tab}`)} />
      <TabNav label={tr("console.signup.tabs")} tabs={tabs} current={tab} />
      <PanelBoundary title={tr(`console.signup.tab.${tab}`)}>
        <Body ctx={ctx} tab={tab} sp={sp} />
      </PanelBoundary>
    </div>
  );
}
