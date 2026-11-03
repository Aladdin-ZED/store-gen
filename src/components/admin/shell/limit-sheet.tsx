"use client";
/**
 * The limit sheet (P2 SHELL; platform.md PLA-§22.9, §22.8 `quota` / `feature_off` / `quota_platform_pending`, §3.7,
 * PL-11; design.md DES-§16.8 "Limit sheet"; docs/STORE-SAAS.md §I.4): what is limited, the store's own use as a meter
 * (never the platform's database percentage, MED-13), one sentence per reason, and the next step:
 *
 * - an owner (`billing.manage`): **Ask for more** for a quota (`createStoreRequestAction` `limit_raise` with the
 *   metric's limit key, used and limit), **Request a plan change** for a plan feature (the plan page, where the plan is
 *   picked), and **See plan & usage**;
 * - any other member: **Ask your store owner**, which copies a short sentence to the clipboard;
 * - a kill switch, a later release or a state: the sentence only, no request;
 * - `note: "pending_ai"` (the platform's AI budget for stores in review) or `"platform_budget"` (uploads): the sentence,
 *   and no "Ask for more" (D69). An open request of the same kind shows "Request sent on <date>" instead of the button.
 *
 *   <LimitSheet open={open} onOpenChange={setOpen} limit={{ kind: "quota", metric: "media_bytes", used, limit }} />
 *   <LimitSheet open={open} onOpenChange={setOpen} limit={{ kind: "feature", key: "sheets", reason: "plan" }} />
 *
 * The frozen `LimitSheetProps` travel as one `limit` prop: its feature variant names a field `key`, which React keeps
 * for itself when spread as props.
 */
import { ClipboardCopyIcon, GaugeIcon, LockIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createStoreRequestAction } from "@/app/app/[store]/settings/plan/actions";
import { dirOf, messageOf, type MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { USAGE_METRICS, type FeatureKey, type UsageMetric } from "@/lib/tenancy/entitlement-keys";
import { cn } from "@/lib/utils";
import { writeClipboard } from "../common/copy-button";
import { SheetCloseX } from "../common/sheet-close";
import { formatDay } from "../common/primitive-logic";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { UsageMeter } from "../common/usage-meter";
import { useOptionalStore } from "./store-context";

/** PLA-§22.9, frozen. */
export type LimitSheetProps =
  | { kind: "quota"; metric: UsageMetric["metric"]; used: number; limit: number }
  | { kind: "feature"; key: FeatureKey; reason: "plan" | "state" | "release" | "kill" };

export interface LimitSheetChrome {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** the platform-level variants of PLA-§22.8: a sentence, and never "Ask for more" */
  note?: "pending_ai" | "platform_budget" | null;
  /** an open request of the same kind (its creation time): "Request sent on <date>" replaces the button */
  requestSentAt?: string | null;
}

const UNIT: Partial<Record<UsageMetric["metric"], "bytes" | "credits">> = {
  media_bytes: "bytes",
  ai_credits: "credits",
  ai_credits_director: "credits",
  ai_credits_day: "credits",
};

/** A message when the catalog has it, else the fallback (a metric or key without its own title). */
const keyOr = (key: string, fallback: MessageKey): MessageKey => (messageOf(key) !== undefined ? key : fallback);

export function LimitSheet({ limit: p, ...chrome }: { limit: LimitSheetProps } & LimitSheetChrome): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  const store = useOptionalStore();
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = store?.can("billing.manage") ?? false;
  const quota = p.kind === "quota";

  const title = quota ? keyOr(`shell.limit.${p.metric}.title`, "shell.limit.generic_quota.title") : keyOr(`shell.limit.${p.key}.title`, "shell.locked.title");
  const metricLabel = quota ? t(keyOr(`shell.metric.${p.metric}`, "shell.plan.usage")) : "";
  const reason: MessageKey | null = chrome.note
    ? `shell.limit.reason.${chrome.note}`
    : quota
      ? null
      : p.reason === "state"
        ? store?.status === "pending"
          ? "shell.limit.reason.pending"
          : "shell.limit.reason.restricted"
        : `shell.limit.reason.${p.reason}`;
  // who may ask: an owner, for a quota or a plan feature, never for a platform-level note, a kill switch or a release
  const askable = !chrome.note && (quota || p.reason === "plan");
  const sent = sentAt ?? chrome.requestSentAt ?? null;
  const planHref = store ? store.href("/settings/plan") : null;

  const askMore = async () => {
    if (!quota || busy) return;
    const limitKey = USAGE_METRICS[p.metric]?.limit;
    if (!limitKey) return;
    setBusy(true);
    try {
      const res = await createStoreRequestAction({ kind: "limit_raise", key: limitKey, used: Math.max(0, Math.round(p.used)), limit: Math.max(0, Math.round(p.limit)) });
      if (res.ok || res.error === "already_requested") {
        setSentAt(new Date().toISOString());
        toast.success(t("shell.limit.request_done"));
      } else {
        toast.error(t(res.message ?? `error.${res.error}`));
      }
    } catch {
      toast.error(t("shell.err.offline"));
    } finally {
      setBusy(false);
    }
  };

  const askOwner = async () => {
    const what = quota ? metricLabel : t(title);
    const ok = await writeClipboard(t("shell.limit.ask_owner_text", { what }));
    if (ok) toast.success(t("shell.limit.ask_owner_copied"));
    else toast.error(t("shell.err.copy_failed"));
  };

  const Icon = quota ? GaugeIcon : LockIcon;
  const action = cn("w-full justify-center gap-2 sm:w-auto", FOCUS_RING, TOUCH);
  return (
    <Sheet open={chrome.open} onOpenChange={chrome.onOpenChange}>
      <SheetContent side={dirOf(locale) === "rtl" ? "left" : "right"} showCloseButton={false} className="w-full gap-0 sm:max-w-[480px]">
        <SheetCloseX />
        <SheetHeader className="gap-3 border-b border-border p-6 pe-14">
          <span aria-hidden="true" className={cn("grid size-10 place-items-center rounded-[var(--r-control)]", quota ? "bg-warn-soft text-warn-ink" : "bg-muted text-muted-foreground")}>
            <Icon className="size-5" />
          </span>
          <SheetTitle className="text-base font-semibold tracking-[-0.006em]">{t(title)}</SheetTitle>
          {reason && <SheetDescription className="leading-relaxed text-pretty">{t(reason)}</SheetDescription>}
        </SheetHeader>
        <div className="grid gap-6 p-6">
          {quota && <UsageMeter label={metricLabel} used={p.used} limit={p.limit} unit={UNIT[p.metric] ?? "count"} />}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {askable && owner && sent && (
              <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <SendIcon aria-hidden="true" className="size-4" />
                {t("shell.limit.request_sent", { date: formatDay(sent, locale) })}
              </p>
            )}
            {askable && owner && !sent && quota && (
              <Button type="button" variant="brand" className={action} disabled={busy} aria-busy={busy || undefined} onClick={() => void askMore()}>
                {t("shell.limit.ask_more")}
              </Button>
            )}
            {askable && owner && !sent && !quota && planHref && (
              <Link href={planHref} className={cn(buttonVariants({ variant: "brand", size: "lg" }), action)}>
                {t("shell.limit.request_plan")}
              </Link>
            )}
            {askable && !owner && (
              <Button type="button" variant="outline" size="lg" className={action} onClick={() => void askOwner()}>
                <ClipboardCopyIcon aria-hidden="true" />
                {t("shell.limit.ask_owner")}
              </Button>
            )}
            {planHref && (
              <Link href={planHref} className={cn(buttonVariants({ variant: askable && owner ? "ghost" : "outline", size: "lg" }), action)}>
                {t("shell.limit.see_plan")}
              </Link>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
