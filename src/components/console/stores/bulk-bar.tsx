"use client";
/**
 * The stores list's bulk bar (platform.md PLA-§6.1, §19.1; PD44): while rows are selected, **Message** (≤ 50 stores,
 * `notify.stores`; support one store at a time) and **Export list (CSV)** (the filtered list through
 * GET /api/admin/stores.csv, admin and super admin). No lifecycle action exists in bulk: restricting, suspending or
 * closing is decided one store at a time, from its profile.
 *
 *   <StoresBulkBar count={3} canMessage csvHref="/api/admin/stores.csv?status=active" onMessage={open} onClear={clear} />
 */
import { DownloadIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { MESSAGE_STORES_LIMIT } from "../messages/message-dialog";
import { button, Kbd } from "../queue/decision-dialogs";

export function StoresBulkBar({
  count,
  canMessage,
  messageOne,
  csvHref,
  onMessage,
  onClear,
}: {
  count: number;
  /** notify.stores */
  canMessage: boolean;
  /** support: one store per message */
  messageOne: boolean;
  /** null: the role can't export */
  csvHref: string | null;
  onMessage(): void;
  onClear(): void;
}) {
  const t = useT();
  const blocked = count > MESSAGE_STORES_LIMIT ? t("console.stores.bulk.too_many", { max: MESSAGE_STORES_LIMIT }) : messageOne && count > 1 ? t("console.stores.bulk.one_store") : null;
  return (
    <div role="region" aria-label={t("console.stores.bulk.label")} className="flex flex-wrap items-center gap-2 rounded-[var(--r-card)] bg-[color-mix(in_oklch,var(--brand-soft)_70%,var(--card))] px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_25%,transparent),0_12px_32px_-18px_oklch(0.2_0.01_230/0.35)]">
      <span className="num ps-1 text-[13px] font-medium">{t("console.stores.bulk.selected", { count })}</span>
      {canMessage && (
        <button type="button" disabled={!!blocked} title={blocked ?? undefined} onClick={onMessage} className={cn(button.base, button.primary)}>
          <MessageSquareIcon aria-hidden="true" className="size-3.5" />
          {t("console.stores.bulk.message")}
        </button>
      )}
      {csvHref && (
        <a href={csvHref} download className={cn(button.base, button.secondary)}>
          <DownloadIcon aria-hidden="true" className="size-3.5" />
          {t("console.stores.bulk.export")}
        </a>
      )}
      {blocked && <span className="text-[12px] text-muted-foreground">{blocked}</span>}
      <button type="button" onClick={onClear} className={cn(button.base, button.ghost, "ms-auto")}>
        <XIcon aria-hidden="true" className="size-3.5" />
        {t("console.stores.bulk.clear")}
        <Kbd>Esc</Kbd>
      </button>
    </div>
  );
}
