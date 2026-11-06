"use client";
/**
 * AddressCard (P2 SHELL; platform.md PLA-§22.10.2, §22.17, §22.2, PD61; design.md DES-§16.12, UX-05, UX-30): the live
 * address card, one component in three places (the pages list header, the dashboard after the first publish, the
 * onboarding done step), so it renders identically in each. Top to bottom:
 *
 * - the canonical store URL in mono, `<bdi dir="ltr">`, truncated in the middle, with **Copy** (toast "Link copied")
 *   and **Open** (only while live: a page that is not live answers the neutral 404);
 * - the honest state line: Live · Not live yet: publish a page · Hidden while in review (a `pending` store);
 * - "Updating n pages to the new address" while address renders run (`AddressRenderingProvider`, from
 *   `renderSummary(scope)` on the settings page after a rename);
 * - the P-mode line ("your address becomes a subdomain named <handle>") only while the store is served under `/s/`
 *   (STORE_ROOT_DOMAIN unset); no domain name is invented;
 * - the QR (`QrCode`, encodes the URL, sized from its module count) in a 160 px inline-end column, with PNG and SVG
 *   downloads; **Share on WhatsApp** ("{store}: {url}", ≤ 300 characters);
 * - the `testOrder` and `campaign` slots render only when passed (P3's `TestOrderSlot` / `CampaignSlot`, which the
 *   caller leaves out for a viewer without the permission, so they are absent, not disabled).
 *
 * `compact` drops the QR column and tightens the spacing (Pages, Generate). No aurora. Props as PLA-§22.10.2; the URL
 * comes from the store on screen (`useOptionalStore().live("")`), computed by the server, never in the browser.
 */
import { CircleDotIcon, EyeOffIcon, ExternalLinkIcon, LinkIcon, Loader2Icon } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreRow } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { useOptionalStore } from "../shell/store-context";
import { addressQr, QR_COLUMN_PX, whatsappText } from "./address-math";
import { CopyButton } from "./copy-button";
import { middleTruncate } from "./primitive-logic";
import { QrCode, QrDownloads } from "./qr-code";
import { FOCUS_RING, TOUCH } from "./ui-classes";
import { WhatsAppShareButton } from "./whatsapp-share-button";

export interface AddressCardProps {
  store: Pick<StoreRow, "id" | "handle" | "name" | "status">;
  live: boolean;
  pageId?: string | null;
  slots?: { testOrder?: ReactNode; campaign?: ReactNode };
  compact?: boolean;
}

const RenderingContext = createContext<number>(0);

/** The pages still re-rendering to the store's new address (the settings page passes `renderSummary(scope)`'s count). */
export function AddressRenderingProvider({ count, children }: { count: number; children: ReactNode }) {
  return <RenderingContext.Provider value={Math.max(0, Math.floor(count) || 0)}>{children}</RenderingContext.Provider>;
}

export function AddressCard(p: AddressCardProps) {
  const t = useT();
  const onScreen = useOptionalStore();
  const rendering = useContext(RenderingContext);
  const mine = onScreen && onScreen.handle === p.store.handle ? onScreen : null;
  // the server computed the store's public base; without it (another store's card) the platform path is the honest one
  const url = mine ? mine.live("") : `/s/${p.store.handle}`;
  const pathMode = !mine || /^(?:https?:\/\/[^/]+)?\/s\//i.test(mine.liveBase);
  const hidden = p.store.status === "pending";
  const state = hidden ? "hidden" : p.live ? "live" : "not_live";
  const qr = addressQr(url);
  const shown = url.replace(/^https?:\/\//i, "");
  const waText = whatsappText(t("shell.address.wa_text"), p.store.name, url);
  const testOrder = p.slots?.testOrder ?? null;
  const campaign = p.slots?.campaign ?? null;
  const secondary = cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2", FOCUS_RING, TOUCH);

  return (
    <section
      aria-label={t("shell.address.title")}
      data-state={state}
      className={cn("rounded-[var(--r-card)] bg-card text-card-foreground ring-1 ring-border ring-inset", p.compact ? "p-4" : "p-5 sm:p-6")}
    >
      <div className={cn("flex flex-col gap-5", !p.compact && "sm:flex-row sm:items-start sm:justify-between")}>
        <div className="grid min-w-0 flex-1 gap-4">
          <div className="grid gap-1.5">
            <h2 className="text-[13px] font-medium text-muted-foreground">{t("shell.address.title")}</h2>
            <div className="flex min-w-0 items-center gap-1">
              <LinkIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <bdi dir="ltr" title={url} className={cn("min-w-0 truncate font-mono font-medium tracking-tight", p.compact ? "text-sm" : "text-[15px]")}>
                {middleTruncate(shown, p.compact ? 40 : 52)}
              </bdi>
              <CopyButton value={url} label={t("shell.address.copy")} toastMessage={t("shell.address.link_copied")} className={cn("shrink-0", FOCUS_RING, TOUCH)} />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="sr-only">{t("shell.address.status")}: </span>
              {state === "live" ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-success-ink">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                  {t("shell.address.live")}
                </span>
              ) : state === "hidden" ? (
                <span className="inline-flex items-center gap-1.5 text-info-ink">
                  <EyeOffIcon aria-hidden="true" className="size-3.5" />
                  {t("shell.address.hidden")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CircleDotIcon aria-hidden="true" className="size-3.5" />
                  {t("shell.address.not_live")}
                </span>
              )}
              {rendering > 0 && (
                <span role="status" className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
                  <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                  {t("shell.address.rerendering", { count: rendering })}
                </span>
              )}
            </p>
            {pathMode && !p.compact && <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("shell.address.future_domain", { handle: p.store.handle })}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state === "live" && (
              <a href={url} target="_blank" rel="noopener noreferrer" className={secondary}>
                <ExternalLinkIcon aria-hidden="true" />
                {t("shell.address.open")}
              </a>
            )}
            <WhatsAppShareButton text={waText} label={t("shell.address.share")} />
            {testOrder}
            {campaign}
          </div>
        </div>
        {!p.compact && (
          <div className="flex shrink-0 flex-col items-center gap-2 sm:w-40" style={{ minWidth: QR_COLUMN_PX }}>
            <QrCode value={qr.value} size={QR_COLUMN_PX} label={t("shell.address.qr_alt", { url })} />
            <QrDownloads value={qr.value} fileName={`${p.store.handle}-qr`} />
          </div>
        )}
      </div>
    </section>
  );
}
