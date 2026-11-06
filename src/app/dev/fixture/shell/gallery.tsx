"use client";
/**
 * The primitives' gallery (P2 SHELL; development only, see ./page.tsx). Demo data, made up for the fixture and never
 * shown to a seller: the store "Atlas Argan" and its numbers exist only here, so the screenshots show each primitive in
 * each state (loading, empty, error, limit, the review states).
 */
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AddressCard } from "@/components/admin/common/address-card";
import { EmptyState } from "@/components/admin/common/empty-state";
import { FreshnessDot } from "@/components/admin/common/freshness-dot";
import { FunnelChart } from "@/components/admin/common/funnel-chart";
import { HealthGroups } from "@/components/admin/common/health-groups";
import { HealthRing } from "@/components/admin/common/health-ring";
import { honestKpi, r1Funnel } from "@/components/admin/common/honest";
import { IssueList, IssueRow } from "@/components/admin/common/issue-list";
import { JobChip } from "@/components/admin/common/job-chip";
import { KeysetPager } from "@/components/admin/common/keyset-pager";
import { KpiTile } from "@/components/admin/common/kpi-tile";
import { LockedControl } from "@/components/admin/common/locked-control";
import { MaskedValue } from "@/components/admin/common/masked-value";
import { ModeBadge } from "@/components/admin/common/mode-badge";
import { ModeCards } from "@/components/admin/common/mode-explainer";
import { Monogram } from "@/components/admin/common/monogram";
import { PanelError } from "@/components/admin/common/panel-boundary";
import { ReasonPicker } from "@/components/admin/common/reason-picker";
import { ReviewCard, type ReviewCardProps } from "@/components/admin/common/review-card";
import { RoleExplainer } from "@/components/admin/common/role-explainer";
import { PanelSkeleton } from "@/components/admin/common/skeleton";
import { StatusPill } from "@/components/admin/common/status-pill";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { TodayBrief } from "@/components/admin/common/today-brief";
import { TypedConfirmDialog } from "@/components/admin/common/typed-confirm-dialog";
import { UsageMeter } from "@/components/admin/common/usage-meter";
import { WhatsAppShareButton } from "@/components/admin/common/whatsapp-share-button";
import { LimitSheet } from "@/components/admin/shell/limit-sheet";
import { StoreProvider, type StoreClientInfo } from "@/components/admin/shell/store-context";
import type { HealthIssue } from "@/lib/health/types";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";

export type GalleryPart = "a" | "b" | "c" | "limit" | "confirm" | "stepup";

const MB = 1024 * 1024;
const HOUR = 3_600_000;
// a fixed clock for the fixture (relative times are computed from the browser's clock at render)
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const STORE: StoreClientInfo = {
  id: "01JFIXTURESTORE0000000000A",
  handle: "atlas-argan",
  name: "Atlas Argan",
  mode: "landing",
  status: "active",
  role: "owner",
  viewerId: "01JFIXTUREUSER00000000000A",
  grants: ["billing.manage", "pages.read", "pages.write", "settings.write"],
  liveBase: "http://localhost:3462/s/atlas-argan",
  timeZone: "Africa/Casablanca",
  currency: "MAD",
};

const link = (path: string) => ({ kind: "link" as const, href: (h: string) => `/app/${h}${path}`, label: "" });
const ISSUES: HealthIssue[] = [
  { id: "shell:legal_identity", group: "trust", severity: 2, points: 6, evidence: { metric: "legal", value: 0, window: "28d", n: 1 }, fix: { ...link("/settings/general"), label: "health.shell.legal_identity.fix" }, text: "health.shell.legal_identity.text" },
  { id: "shell:contact", group: "trust", severity: 3, points: 10, evidence: { metric: "contact", value: 0, window: "28d", n: 1 }, fix: { ...link("/settings/general"), label: "health.shell.contact.fix" }, text: "health.shell.contact.text" },
  { id: "shell:2fa_orders", group: "setup", severity: 1, points: 3, evidence: { metric: "members", value: 2, window: "7d", n: 4 }, fix: { ...link("/team"), label: "health.shell.2fa_orders.fix" }, text: "health.shell.2fa_orders.text" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <h2 className="font-mono text-[11px] text-muted-foreground" dir="ltr">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--r-card)] bg-card p-5 ring-1 ring-border ring-inset ${className}`}>{children}</div>;
}

function PartA() {
  const [reason, setReason] = useState<{ reason: "brand_impersonation" | "prohibited_goods" | "other" | null; note: string }>({ reason: "other", note: "" });
  const statuses: StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "rejected", "purged"];
  const modes: StoreMode[] = ["landing", "store", "both"];
  return (
    <>
      <Section title="StatusPill · ModeBadge · Monogram">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.slice(0, 4).map((s) => (
            <StatusPill key={s} status={s} size="sm" />
          ))}
          {modes.map((m) => (
            <ModeBadge key={m} mode={m} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Monogram name="Atlas Argan" seed="01JFIXTURESTORE0000000000A" size={48} />
          <Monogram name="Baraka Home" seed="01JFIXTURESTORE0000000000B" size={32} />
          <Monogram name="متجر النور" seed="nour" size={32} />
          <Monogram name="Sahara Shop" seed="x" accentHue={250} size={24} />
        </div>
      </Section>
      <Section title="UsageMeter · MaskedValue · FreshnessDot">
        <Card className="grid gap-5 sm:grid-cols-2">
          <UsageMeter label="Media storage" used={Math.round(16.4 * MB)} limit={20 * MB} unit="bytes" />
          <UsageMeter label="Pages" used={3} limit={10} />
          <UsageMeter label="AI credits this month" used={100} limit={100} unit="credits" />
          <UsageMeter label="Members" used={4} limit={null} />
        </Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <MaskedValue value="+212 6•• ••• •34" reveal={{ label: "Show", onReveal: async () => "+212 6 12 34 56 34" }} />
          <MaskedValue value="s•••@g••••.com" />
          <FreshnessDot at={ago(2 * 60_000)} staleAfterMs={HOUR} label="Store health" />
          <FreshnessDot at={ago(30 * HOUR)} staleAfterMs={HOUR} label="Store health" />
          <FreshnessDot at={null} staleAfterMs={HOUR} label="Store health" />
        </div>
      </Section>
      <Section title="LockedControl · WhatsAppShareButton · KeysetPager">
        <div className="flex flex-wrap items-center gap-2">
          <LockedControl reason={{ kind: "pending" }}>
            <Button variant="brand" size="lg">
              Publish
            </Button>
          </LockedControl>
          <LockedControl reason={{ kind: "plan", key: "sheets" }}>
            <Button variant="outline" size="lg">
              Google Sheets
            </Button>
          </LockedControl>
          <LockedControl reason={{ kind: "kill", key: "publishing_enabled" }}>
            <Button variant="outline" size="lg">
              Republish
            </Button>
          </LockedControl>
          <WhatsAppShareButton text="Atlas Argan: http://localhost:3462/s/atlas-argan" />
        </div>
        <KeysetPager prev="c1" next="c2" />
      </Section>
      <Section title="ReasonPicker">
        <Card>
          <ReasonPicker
            reasons={["brand_impersonation", "prohibited_goods", "other"] as const}
            labelKey={(r) => `shell.rejected.${r}`}
            value={reason.reason}
            note={reason.note}
            noteRequiredFor={["other"]}
            onChange={setReason}
          />
        </Card>
      </Section>
      <Section title="PanelBoundary (loading · error) · Skeleton">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <PanelSkeleton />
          </Card>
          <PanelError title="Orders" error={{ digest: "3f9a1c2e" }} retry={() => undefined} />
        </div>
      </Section>
    </>
  );
}

function PartB() {
  const locale = useAdminLocale();
  const [done, setDone] = useState([{ id: "j1", label: "Store home", href: "#" }]);
  return (
    <>
      <Section title="TodayBrief · JobChip">
        <Card className="grid gap-5">
          <TodayBrief
            lines={[
              { key: "brief.confirmed", vars: { count: 3 }, href: "#" },
              { key: "brief.callbacks", vars: { count: 2 }, href: "#" },
              { key: "brief.queue", vars: { count: 5 } },
            ]}
          />
          <JobChip running={1} done={done} onDismiss={(id) => setDone((d) => d.filter((j) => j.id !== id))} />
        </Card>
      </Section>
      <Section title="HealthRing · HealthGroups">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="grid gap-5">
            <HealthRing score={72} attention={2} size={96} computedAt={ago(4 * 60_000)} surface="tenant" onRecompute={async () => undefined} />
            <div className="flex items-center gap-3">
              <HealthRing score={91} attention={0} size={56} computedAt={ago(HOUR)} surface="tenant" />
              <HealthRing score={41} attention={2} size={56} computedAt={ago(HOUR)} surface="tenant" />
              <HealthRing score={18} attention={3} size={40} computedAt={ago(HOUR)} surface="console" />
              <HealthRing score={null} attention={0} size={40} computedAt={null} surface="console" />
            </div>
            <HealthRing score={null} attention={0} size={96} computedAt={null} surface="tenant" />
          </Card>
          <Card>
            <HealthGroups
              components={{ setup: 3, trust: 10, design: 0, conversion: 6, operations: 0, integrations: 4, quota: 0 }}
              caps={{ setup: 20, trust: 15, design: 15, conversion: 15, operations: 15, integrations: 15, quota: 5 }}
            />
          </Card>
        </div>
      </Section>
      <Section title="IssueList · IssueRow">
        <Card>
          <IssueList issues={ISSUES} max={5} snoozed={{ "shell:2fa_orders": ago(-5 * 24 * HOUR) }} emptyKey="health.all_good">
            {(issue) => <IssueRow issue={issue} locale={locale} onFix={() => undefined} onSnooze={async () => undefined} />}
          </IssueList>
        </Card>
        <Card>
          <IssueRow issue={ISSUES[0]!} locale={locale} onFix={() => undefined} disabled={{ kind: "impersonation" }} staffView={{ snoozedBy: "admin" }} />
          <IssueList issues={[]} max={5} snoozed={{}} emptyKey="health.celebrate" />
        </Card>
      </Section>
      <Section title="KpiTile">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile kind="money" emphasis label="Revenue confirmed" value="18 450 MAD" hint="Confirmed orders, last 7 days" delta={{ value: 12.4, period: "vs previous 7 days" }} spark={[8, 11, 9, 14, 12, 17, 19, 18]} />
          <KpiTile kind="count" label="Orders placed" value="128" hint="Last 7 days" delta={{ value: -6, period: "vs previous 7 days" }} spark={[22, 19, 20, 17, 18, 16, 16]} />
          <KpiTile {...honestKpi({ kind: "rate", label: "Confirmation rate", value: "62 %", hint: "Of placed orders", n: 84 })} />
          <KpiTile {...honestKpi({ kind: "rate", label: "Delivery rate", value: "0 %", hint: "Of shipped orders", n: 12 })} />
        </div>
      </Section>
      <Section title="FunnelChart (R1 table · bars)">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <FunnelChart
              period="Last 7 days"
              steps={r1Funnel([
                { id: "orders", label: "Placed", value: 128 },
                { id: "confirmed", label: "Confirmed", value: 84 },
                { id: "shipped", label: "Shipped", value: null },
                { id: "delivered", label: "Delivered", value: null },
                { id: "collected", label: "Cash collected", value: null },
              ])}
            />
          </Card>
          <Card>
            <FunnelChart
              period="Last 28 days"
              steps={[
                { id: "orders", label: "Placed", value: 512 },
                { id: "confirmed", label: "Confirmed", value: 331 },
                { id: "shipped", label: "Shipped", value: 298 },
                { id: "delivered", label: "Delivered", value: 241 },
                { id: "collected", label: "Cash collected", value: 236 },
              ]}
            />
          </Card>
        </div>
      </Section>
      <Section title="EmptyState (quiet · celebration)">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <EmptyState
              compact
              title="No orders yet"
              description="New orders appear here the moment a customer sends the form."
              actions={
                <Button variant="brand" size="lg">
                  Share your page
                </Button>
              }
              teach="Tip: send the link to a friend and place a test order."
            />
          </Card>
          <Card>
            <EmptyState compact variant="celebration" celebration={{ number: 1, label: "Your first order" }} title="Call the customer to confirm it." />
          </Card>
        </div>
      </Section>
    </>
  );
}

const PREVIEW_LINKS: NonNullable<ReviewCardProps["previewLinks"]> = [
  { id: "01JFIXTUREPREVIEW00000000A", pageId: "p1", pageName: "Huile d'argan 100 ml", expiresAt: ago(-60 * HOUR), opened: 3, lastOpenedAt: ago(HOUR), createdAt: ago(12 * HOUR) },
];
const baseCard = { question: null, submittedAt: null, rejectReason: null, appealsLeft: 1 as const, slaHours: null };

function PartC() {
  const [mode, setMode] = useState<StoreMode | null>("landing");
  const [notify, setNotify] = useState(true);
  return (
    <>
      <Section title="AddressCard (live · compact not live · in review)">
        <AddressCard store={{ id: STORE.id, handle: STORE.handle, name: STORE.name, status: "active" }} live />
        <div className="grid gap-4 md:grid-cols-2">
          <AddressCard store={{ id: STORE.id, handle: STORE.handle, name: STORE.name, status: "active" }} live={false} compact />
          <AddressCard store={{ id: STORE.id, handle: STORE.handle, name: STORE.name, status: "pending" }} live={false} compact />
        </div>
      </Section>
      <Section title="ReviewCard (before · submitted · needs info · approved · rejected · compact)">
        <ReviewCard card={{ ...baseCard, status: "pending" }} store={{ name: STORE.name }} isOwner mediaMb={20} previewLinks={PREVIEW_LINKS} pages={[{ id: "p1", name: "Huile d'argan 100 ml" }]} />
        <ReviewCard card={{ ...baseCard, status: "submitted", submittedAt: ago(3 * HOUR), slaHours: 24 }} store={{ name: STORE.name }} isOwner mediaMb={100} />
        <ReviewCard card={{ ...baseCard, status: "needs_info", submittedAt: ago(26 * HOUR), question: "Can you share a photo of the product label?" }} store={{ name: STORE.name }} isOwner mediaMb={100} />
        <ReviewCard card={{ ...baseCard, status: "approved", submittedAt: ago(30 * HOUR) }} store={{ name: STORE.name }} isOwner mediaMb={100} publishHref="#" />
        <ReviewCard card={{ ...baseCard, status: "rejected", rejectReason: "incomplete" }} store={{ name: STORE.name }} isOwner mediaMb={20} />
        <ReviewCard compact card={{ ...baseCard, status: "pending" }} store={{ name: STORE.name }} isOwner mediaMb={20} />
      </Section>
      <Section title="ModeCards · RoleExplainer">
        <ModeCards value={mode} onChange={setMode} notify={{ checked: notify, onChange: setNotify }} />
        <Card className="grid gap-6 md:grid-cols-2">
          <RoleExplainer role="manager" />
          <RoleExplainer role="agent" />
        </Card>
      </Section>
    </>
  );
}

export function Gallery({ part }: { part: GalleryPart }) {
  const [open, setOpen] = useState(true);
  return (
    <StoreProvider value={STORE}>
      <main className="mx-auto grid max-w-5xl gap-8 bg-background px-4 py-8 text-foreground sm:px-6">
        <h1 className="text-xl font-semibold tracking-[-0.011em]" dir="ltr">
          Shell primitives · {part}
        </h1>
        {part === "a" && <PartA />}
        {part === "b" && <PartB />}
        {part === "c" && <PartC />}
        {part === "limit" && <LimitSheet open={open} onOpenChange={setOpen} limit={{ kind: "quota", metric: "media_bytes", used: Math.round(19.4 * MB), limit: 20 * MB }} />}
        {part === "confirm" && (
          <TypedConfirmDialog
            open={open}
            title="Close Atlas Argan?"
            body="Your pages go offline and orders stop. You can reopen the store for 30 days."
            expected="atlas-argan"
            confirmLabel="Close the store"
            tone="danger"
            onConfirm={async () => setOpen(false)}
            onClose={() => setOpen(false)}
          />
        )}
        {part === "stepup" && <StepUpSheet open={open} surface="tenant" method="password" onVerified={() => setOpen(false)} onClose={() => setOpen(false)} />}
      </main>
    </StoreProvider>
  );
}
