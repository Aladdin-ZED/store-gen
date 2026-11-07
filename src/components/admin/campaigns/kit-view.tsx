"use client";
/**
 * One campaign's kit (P3 LANDING, wave 2; landing.md LAN-§13.4, §13.5; core §I.1 `/app/<h>/campaigns/<id>`): the header
 * (name, status, page, the page's thumbnail, the lifecycle buttons), the "The page changed since this kit was made"
 * banner with Recompile, then the copyable cards (./kit-cards.tsx), the results strip (28 days, per link and per angle,
 * rates from 20 orders) and "Share read-only" (the link shown once, Revoke).
 *
 * The template kit shows first. When Cloud AI is on for this member (`ai.use`, the policy's cloud rung), the brief and
 * the objection answers are asked once in the background (pattern A, `refineKitAction`); the chip says which rung
 * answered and the fields cross-fade in. A refusal keeps the template and the quiet "library" chip.
 */
import { ArrowLeftIcon, CircleStopIcon, ExternalLinkIcon, Link2Icon, Loader2Icon, PauseIcon, PlayIcon, RefreshCwIcon, ShieldOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AiPolicy } from "@/lib/ai/policy";
import { HEADLINE_STRUCTURES } from "@/lib/design/consts";
import type { AiFallbackNote } from "@/lib/ai/provider/types";
import type { AiProviderId } from "@/lib/ai/tasks";
import type { CloudKitResult } from "@/lib/campaigns/cloud.server";
import type { CampaignResults, CampaignRow, CampaignKit } from "@/lib/campaigns/types";
import type { StoreInfo } from "@/landing/context";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { AiProviderChip } from "../ai/chip";
import { CopyButton } from "../common/copy-button";
import { ConfirmSheet } from "../landing/confirm-sheet";
import { failText, intFmt } from "../leads/format";
import { LimitSheet } from "../shell/limit-sheet";
import { useStore } from "../shell/store-context";
import { BriefCards, DeliveryCard, LinksCard, PixelCard, ScriptCard, WhatsAppCard, type KitLinkView } from "./kit-cards";
import { CampaignStatusPill } from "./status-pill";

type Failure = { ok: false; error: string; message?: string };
const NETWORK: Failure = { ok: false, error: "network", message: "landing.common.network" };

export interface KitActions {
  recompile: (id: string) => Promise<ActionResult<null>>;
  live: (id: string) => Promise<ActionResult<null>>;
  pause: (id: string) => Promise<ActionResult<null>>;
  end: (id: string) => Promise<ActionResult<null>>;
  share: (id: string) => Promise<ActionResult<{ url: string }>>;
  revoke: (id: string) => Promise<ActionResult<null>>;
  refine: (id: string) => Promise<ActionResult<CloudKitResult>>;
}

export interface KitViewProps {
  row: CampaignRow;
  kit: CampaignKit;
  links: (KitLinkView & { id: string })[];
  results: CampaignResults;
  thumb: { doc: PageDoc; assets: PreviewAssets; store: StoreInfo } | null;
  canWrite: boolean;
  /** Cloud AI may run for this member here (the policy's cloud rung and `ai.use`) */
  cloud: boolean;
  policy: AiPolicy | null;
  /** the `campaigns` gauge (the limit sheet of a refused Go live) */
  gauge: { used: number; limit: number | null };
  actions: KitActions;
}

function ResultsStrip({ results }: { results: CampaignResults }) {
  const t = useT();
  const locale = useAdminLocale();
  const nf = intFmt(locale);
  const pct = new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { style: "percent", maximumFractionDigits: 0 });
  const rows = [
    ...results.links.map((l) => ({ ...l, key: `l:${l.shortLinkId}`, label: t(`landing.links.channel.${l.channel}`), group: "links" as const })),
    ...results.angles.map((a) => ({ ...a, key: `a:${a.key}`, label: a.key === "*" ? t("landing.campaigns.results.noAngle") : (HEADLINE_STRUCTURES as readonly string[]).includes(a.key) ? t(`landing.campaigns.tag.${a.key}`) : a.key, group: "angles" as const })),
  ];
  const rate = (r: number | null) => (r === null ? <span className="text-muted-foreground" title={t("landing.campaigns.results.fewHint")}>{t("landing.campaigns.results.few")}</span> : pct.format(r));
  return (
    <section aria-labelledby="kit-results-title" className="adm-surface grid gap-4 p-5 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="kit-results-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
            {t("landing.campaigns.results.title")}
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">{t("landing.campaigns.results.hint")}</p>
        </div>
        <dl className="flex gap-6">
          {(
            [
              ["clicks", results.total.clicks ?? 0],
              ["orders", results.total.orders],
              ["confirmed", results.total.confirmed],
              ["delivered", results.total.delivered],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="grid gap-0.5">
              <dt className="text-[0.75rem] text-muted-foreground">{t(`landing.campaigns.results.${k}`)}</dt>
              <dd className="text-[1.15rem] font-semibold tracking-[-0.02em] tabular-nums">{nf.format(v)}</dd>
            </div>
          ))}
        </dl>
      </header>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[0.8125rem]">
          <thead>
            <tr className="text-start text-[0.75rem] text-muted-foreground">
              <th scope="col" className="px-1 py-1.5 text-start font-medium">
                {t("landing.campaigns.results.source")}
              </th>
              {(["clicks", "orders", "confirmed", "delivered", "confirmRate", "deliveryRate"] as const).map((k) => (
                <th key={k} scope="col" className="px-1 py-1.5 text-end font-medium">
                  {t(`landing.campaigns.results.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r, i) => (
              <tr key={r.key} className={cn(i === results.links.length && "border-t-2 border-border")}>
                <th scope="row" className="px-1 py-2 text-start font-medium">
                  <span className="me-1.5 text-[0.6875rem] font-normal text-muted-foreground">{t(r.group === "links" ? "landing.campaigns.results.link" : "landing.campaigns.results.angle")}</span>
                  {r.label}
                </th>
                <td className="px-1 py-2 text-end tabular-nums">{r.clicks === null ? "" : nf.format(r.clicks)}</td>
                <td className="px-1 py-2 text-end tabular-nums">{nf.format(r.orders)}</td>
                <td className="px-1 py-2 text-end tabular-nums">{nf.format(r.confirmed)}</td>
                <td className="px-1 py-2 text-end tabular-nums">{nf.format(r.delivered)}</td>
                <td className="px-1 py-2 text-end tabular-nums">{rate(r.confirmRate)}</td>
                <td className="px-1 py-2 text-end tabular-nums">{rate(r.deliveryRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function KitView(p: KitViewProps) {
  const t = useT();
  const store = useStore();
  const router = useRouter();
  const { row } = p;
  const [kit, setKit] = useState(p.kit);
  const [chip, setChip] = useState<{ status: "idle" | "running" | "done"; provider: AiProviderId | null; notes: AiFallbackNote[] }>({
    status: "done",
    provider: p.kit.brief.source === "cloud" ? "server" : "library",
    notes: [],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const asked = useRef(false);
  // a refreshed kit (Recompile, Go live) replaces the local one, adjusted while rendering
  const [seen, setSeen] = useState(p.kit);
  if (seen !== p.kit) {
    setSeen(p.kit);
    setKit(p.kit);
  }

  // the Cloud brief: asked once per visit, only for a template kit of a page still live (pattern A, never blocking)
  useEffect(() => {
    if (asked.current || !p.cloud || !p.canWrite || row.status === "ended" || row.stale || p.kit.brief.source === "cloud") return;
    asked.current = true;
    setChip({ status: "running", provider: "server", notes: [] });
    p.actions
      .refine(row.id)
      .then((res) => {
        if (!res.ok) return setChip({ status: "done", provider: "library", notes: [] });
        setKit((k) => ({ ...k, brief: res.data.brief, script: res.data.script }));
        setChip({ status: "done", provider: res.data.provider, notes: res.data.notes });
      })
      .catch(() => setChip({ status: "done", provider: "library", notes: [] }));
  }, [p.cloud, p.canWrite, p.actions, p.kit.brief.source, row.id, row.stale, row.status]);

  const run = async (name: string, fn: () => Promise<ActionResult<unknown>>, okKey: string): Promise<boolean> => {
    setBusy(name);
    try {
      const res = await fn().catch(() => NETWORK);
      if (!res.ok) {
        if (res.error === "quota") setLimitOpen(true);
        else toast.error(failText(res, t));
        return false;
      }
      toast.success(t(okKey));
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const res = await p.actions.share(row.id).catch(() => NETWORK);
      if (!res.ok) return void toast.error(failText(res, t));
      setShareUrl(res.data.url);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const spin = (name: string) => busy === name && <Loader2Icon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
  const ended = row.status === "ended";

  return (
    <div className="grid gap-6">
      <Link href={store.href("/campaigns")} className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {t("landing.campaigns.back")}
      </Link>

      <header className="adm-rise grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2rem]">{row.name}</h1>
            <CampaignStatusPill status={row.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
            <bdi dir="ltr" className="font-mono">
              utm_campaign={row.slug}
            </bdi>
            {row.pageTitle && (
              <Link href={store.href(`/pages/${row.pageId}/edit`)} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
                {row.pageTitle}
                <ExternalLinkIcon aria-hidden="true" className="size-3" />
              </Link>
            )}
          </div>
          {p.canWrite && !ended && (
            <div className="flex flex-wrap gap-2 pt-1">
              {row.status !== "live" && (
                <Button variant="brand" onClick={() => run("live", () => p.actions.live(row.id), "landing.campaigns.toast.live")} disabled={!!busy || !row.pageLive} className="gap-1.5" title={row.pageLive ? undefined : t("landing.campaigns.error.unpublished")}>
                  {spin("live") || <PlayIcon aria-hidden="true" className="size-4" />}
                  {t(row.status === "paused" ? "landing.campaigns.action.resume" : "landing.campaigns.action.live")}
                </Button>
              )}
              {row.status === "live" && (
                <Button variant="outline" onClick={() => run("pause", () => p.actions.pause(row.id), "landing.campaigns.toast.paused")} disabled={!!busy} className="gap-1.5">
                  {spin("pause") || <PauseIcon aria-hidden="true" className="size-4" />}
                  {t("landing.campaigns.action.pause")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setEnding(true)} disabled={!!busy} className="gap-1.5 text-muted-foreground">
                <CircleStopIcon aria-hidden="true" className="size-4" />
                {t("landing.campaigns.action.end")}
              </Button>
            </div>
          )}
        </div>
        {p.thumb && (
          <div className="hidden w-32 overflow-hidden rounded-[14px] bg-muted ring-1 ring-border/70 sm:block">
            <LandingThumbnail doc={p.thumb.doc} assets={p.thumb.assets} store={p.thumb.store} device="mobile" sections={2} aspectRatio="4 / 5" label={row.pageTitle ?? undefined} />
          </div>
        )}
      </header>

      {row.stale && !ended && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl bg-warn-soft px-4 py-3.5 text-warn-ink sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-0.5">
            <p className="text-[0.875rem] font-semibold">{t("landing.campaigns.stale.title")}</p>
            <p className="text-[0.8125rem] opacity-90">{t("landing.campaigns.stale.body")}</p>
          </div>
          {p.canWrite && (
            <Button variant="outline" onClick={() => run("recompile", () => p.actions.recompile(row.id), "landing.campaigns.toast.recompiled")} disabled={!!busy} className="shrink-0 gap-1.5 bg-background/70">
              {spin("recompile") || <RefreshCwIcon aria-hidden="true" className="size-4" />}
              {t("landing.campaigns.action.recompile")}
            </Button>
          )}
        </div>
      )}

      <LinksCard links={p.links} />
      <div className="grid gap-4 lg:grid-cols-2">
        <WhatsAppCard kit={kit} />
        <ScriptCard kit={kit} />
      </div>
      <BriefCards kit={kit} chip={<AiProviderChip state={chip} policy={p.policy} />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PixelCard plan={kit.pixelPlan} />
        <DeliveryCard kit={kit} />
      </div>

      <ResultsStrip results={p.results} />

      {p.canWrite && (
        <section aria-labelledby="kit-share-title" className="adm-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="grid gap-1">
            <h2 id="kit-share-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
              {t("landing.campaigns.share.title")}
            </h2>
            <p className="max-w-[60ch] text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">{t(row.shared ? "landing.campaigns.share.on" : "landing.campaigns.share.off")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={share} disabled={!!busy} className="gap-1.5">
              {spin("share") || <Link2Icon aria-hidden="true" className="size-4" />}
              {t(row.shared ? "landing.campaigns.share.renew" : "landing.campaigns.share.create")}
            </Button>
            {row.shared && (
              <Button variant="ghost" onClick={() => setRevoking(true)} disabled={!!busy} className="gap-1.5 text-destructive hover:text-destructive">
                <ShieldOffIcon aria-hidden="true" className="size-4" />
                {t("landing.campaigns.share.revoke")}
              </Button>
            )}
          </div>
        </section>
      )}

      <Dialog open={!!shareUrl} onOpenChange={(o) => !o && setShareUrl(null)}>
        <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-md">
          <DialogHeader className="gap-1.5 text-start">
            <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{t("landing.campaigns.share.readyTitle")}</DialogTitle>
            <DialogDescription className="leading-relaxed text-pretty">{t("landing.campaigns.share.readyBody")}</DialogDescription>
          </DialogHeader>
          {shareUrl && (
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2">
              <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[0.75rem]" title={shareUrl}>
                {shareUrl.replace(/^https?:\/\//, "")}
              </bdi>
              <CopyButton value={shareUrl} label={t("landing.campaigns.share.copy")} toastMessage={t("landing.campaigns.copied")} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmSheet
        open={ending}
        onOpenChange={setEnding}
        title={t("landing.campaigns.endConfirm.title")}
        description={t("landing.campaigns.endConfirm.body")}
        confirmLabel={t("landing.campaigns.action.end")}
        cancelLabel={t("landing.links.cancel")}
        destructive
        onConfirm={() => run("end", () => p.actions.end(row.id), "landing.campaigns.toast.ended")}
      />
      <ConfirmSheet
        open={revoking}
        onOpenChange={setRevoking}
        title={t("landing.campaigns.share.revokeTitle")}
        description={t("landing.campaigns.share.revokeBody")}
        confirmLabel={t("landing.campaigns.share.revoke")}
        cancelLabel={t("landing.links.cancel")}
        destructive
        onConfirm={() => run("revoke", () => p.actions.revoke(row.id), "landing.campaigns.toast.revoked")}
      />
      <LimitSheet open={limitOpen} onOpenChange={setLimitOpen} limit={{ kind: "quota", metric: "campaigns", used: Math.max(p.gauge.used, p.gauge.limit ?? p.gauge.used), limit: p.gauge.limit ?? p.gauge.used }} />
    </div>
  );
}
