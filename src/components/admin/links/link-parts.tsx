"use client";
/**
 * Small pieces of the links screen (P3 LANDING; landing.md LAN-§12.2): the target label ("Store home", "Policy ·
 * Delivery and returns", a page's title, or the "page not live" warning), the channel mark, the UTM tags, the status
 * pill and the QR dialog (`QrCode`, ink on white at the 7:1 contrast of DES-§16.12, with PNG and SVG downloads).
 * Codes and URLs sit in `<bdi dir="ltr">` so an Arabic screen never mirrors them.
 */
import { CircleAlertIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/admin/client";
import type { ShortLinkRow, ShortLinkUtm } from "@/lib/links/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "../common/copy-button";
import { QrCode, QrDownloads } from "../common/qr-code";

/** "/go/abc123": the short form of a link's address shown in rows and titles. */
export const shortPath = (code: string) => `/go/${code}`;
/** The URL without its scheme, for display. */
export const shownUrl = (url: string) => url.replace(/^https?:\/\//, "");

export function TargetLabel({ link, className }: { link: Pick<ShortLinkRow, "target" | "targetTitle" | "targetLive">; className?: string }) {
  const t = useT();
  const { target } = link;
  if (!link.targetLive) {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-destructive", className)} title={t("landing.links.target.missingHint")}>
        <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{link.targetTitle ? `${link.targetTitle} · ${t("landing.links.target.missing")}` : t("landing.links.target.missing")}</span>
      </span>
    );
  }
  const text =
    target.kind === "home"
      ? t("landing.links.target.home")
      : target.kind === "policy"
        ? t("landing.links.target.policy", { kind: t(`landing.links.policy.${target.policy}`) })
        : (link.targetTitle ?? t("landing.links.target.page"));
  return (
    <span className={cn("block min-w-0 truncate", className)} title={text}>
      {text}
    </span>
  );
}

export function ChannelText({ channel }: { channel: ShortLinkRow["channel"] }) {
  const t = useT();
  return <span className={cn("truncate", !channel && "text-muted-foreground")}>{t(channel ? `landing.links.channel.${channel}` : "landing.links.channel.none")}</span>;
}

/** The set tags as quiet chips ("facebook / paid_social", then the campaign). */
export function UtmTags({ utm, className }: { utm: ShortLinkUtm; className?: string }) {
  const t = useT();
  const pair = [utm.source, utm.medium].filter(Boolean).join(" / ");
  const rest = [utm.campaign, utm.content].filter(Boolean) as string[];
  if (!pair && !rest.length) return <span className={cn("text-muted-foreground", className)}>{t("landing.links.noUtm")}</span>;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {[pair, ...rest].filter(Boolean).map((v, i) => (
        <bdi key={i} dir="ltr" className="max-w-[11rem] truncate rounded-md bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[0.6875rem] leading-4 text-foreground/75">
          {v}
        </bdi>
      ))}
    </span>
  );
}

export function LinkStatus({ status, className }: { status: ShortLinkRow["status"]; className?: string }) {
  const t = useT();
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        active ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/15 dark:text-emerald-300" : "bg-foreground/[0.05] text-muted-foreground ring-border",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/60")} />
      {t(active ? "landing.links.status.active" : "landing.links.status.paused")}
    </span>
  );
}

export function QrDialog({ link, onClose }: { link: Pick<ShortLinkRow, "code" | "url"> | null; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-sm">
        {link && (
          <>
            <DialogHeader className="gap-1.5 text-start">
              <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">
                {t("landing.links.qr.title", { code: link.code }).replace(shortPath(link.code), "")}
                <bdi dir="ltr" className="font-mono">
                  {shortPath(link.code)}
                </bdi>
              </DialogTitle>
              <DialogDescription className="leading-relaxed text-pretty">{t("landing.links.qr.description")}</DialogDescription>
            </DialogHeader>
            <div className="grid justify-items-center gap-4">
              {/* ink on white whatever the theme: a printed code must scan (≥ 7:1) */}
              <div className="rounded-2xl bg-white p-3 text-[#0b0d10] shadow-sm ring-1 ring-black/[0.06]">
                <QrCode value={link.url} size={208} label={t("landing.links.qr.title", { code: link.code })} />
              </div>
              <div className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2">
                <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]" title={link.url}>
                  {shownUrl(link.url)}
                </bdi>
                <CopyButton value={link.url} label={t("landing.links.action.copy")} toastMessage={t("landing.links.toast.copied")} size="icon-sm" className="text-muted-foreground" />
              </div>
              <QrDownloads value={link.url} fileName={`go-${link.code}`} className="w-full" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
