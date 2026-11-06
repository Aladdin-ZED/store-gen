"use client";
/**
 * The pages a store's state renders instead of its screens (P2 SHELL; platform.md PLA-§22.8, §3.5, TN-02): the `[store]`
 * layout picks one with `statePage(status, role)` and the frame shows it in the content area, chrome kept.
 *
 * - `closed` (members other than owner and admin): "This store is closed" and who to ask;
 * - `deletion` (scheduled deletion): the date and support on WhatsApp;
 * - `rejected`: the reason sentence (`shell.rejected.<reason>`, never the risk flags), and one appeal form (≤ 500
 *   characters, owner) → `submitAppealAction`, then "Your appeal was sent"; with the appeal used, the line that says so.
 */
import { ArchiveIcon, CalendarClockIcon, CircleXIcon, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitAppealAction } from "@/app/app/[store]/review-actions";
import { messageOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { formatDay, waHref } from "../common/primitive-logic";
import { FOCUS_RING, NUM, TOUCH } from "../common/ui-classes";
import type { StatePage as StatePageKind } from "./banner-priority";
import { useStore } from "./store-context";
import { useActionError } from "./use-action-error";

export const APPEAL_MAX = 500;

export interface StatePageProps {
  page: StatePageKind;
  /** the deletion date (`stores.purge_after`), ISO */
  date: string | null;
  /** the rejected page: the reason code, and whether the one appeal is still available */
  rejectReason: string | null;
  appealsLeft: 0 | 1;
  supportWhatsapp: string | null;
}

function Frame({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[560px] content-start gap-5 px-4 py-14 sm:px-6 md:py-20">
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-[var(--r-card)] bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-balance">{title}</h1>
      {children}
    </div>
  );
}

function Support({ phone }: { phone: string | null }) {
  const t = useT();
  const store = useStore();
  if (!phone) return <p className="text-sm text-muted-foreground">{t("shell.help.no_contact")}</p>;
  return (
    <a
      href={waHref(t("shell.help.wa_prefill", { handle: store.handle, path: "/", build: "-" }), phone)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex h-9 items-center justify-self-start rounded-[var(--r-control)] px-3.5 text-sm font-medium ring-1 ring-border ring-inset hover:bg-accent", FOCUS_RING, TOUCH)}
    >
      {t("shell.banner.support")}
    </a>
  );
}

function AppealForm() {
  const t = useT();
  const actions = useActionError();
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <p role="status" className="rounded-[var(--r-card)] bg-success-soft px-4 py-3 text-sm text-success-ink">
        {t("shell.appeal.sent")}
      </p>
    );
  }
  const message = text.trim();
  return (
    <form
      className="grid gap-3 rounded-[var(--r-card)] border border-border p-4 sm:p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!message || busy) return;
        setBusy(true);
        const res = await actions.run(() => submitAppealAction({ message }), { toastInvalid: true });
        setBusy(false);
        if (res.ok) setSent(true);
      }}
    >
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.006em]">{t("shell.appeal.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("shell.appeal.lead")}</p>
      </div>
      <label htmlFor={id} className="text-[13px] font-medium">
        {t("shell.appeal.field")}
      </label>
      <Textarea id={id} value={text} maxLength={APPEAL_MAX} rows={5} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{t("shell.appeal.hint")}</span>
        <span className={NUM}>
          {text.length} / {APPEAL_MAX}
        </span>
      </p>
      <Button type="submit" variant="brand" disabled={!message || busy} aria-busy={busy || undefined} className={cn("justify-self-start", TOUCH)}>
        {t("shell.appeal.send")}
      </Button>
    </form>
  );
}

export function StatePage(p: StatePageProps) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  if (p.page === "closed") {
    return (
      <Frame icon={ArchiveIcon} title={t("shell.page.closed")}>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t("shell.page.closed_lead")}</p>
      </Frame>
    );
  }
  if (p.page === "deletion") {
    return (
      <Frame icon={CalendarClockIcon} title={t("shell.page.deletion", { date: formatDay(p.date, locale) || "-" })}>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t("shell.page.deletion_lead")}</p>
        <Support phone={p.supportWhatsapp} />
      </Frame>
    );
  }
  const asked = p.rejectReason && /^[a-z_]{1,40}$/.test(p.rejectReason) ? `shell.rejected.${p.rejectReason}` : null;
  const reason = asked && messageOf(asked) !== undefined ? asked : "shell.rejected.other";
  return (
    <Frame icon={CircleXIcon} title={t("shell.page.rejected")}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{t(reason)}</p>
      {store.role === "owner" && p.appealsLeft === 1 ? (
        <AppealForm />
      ) : store.role === "owner" ? (
        <p className="text-sm text-muted-foreground">{t("shell.appeal.used")}</p>
      ) : null}
      <Support phone={p.supportWhatsapp} />
    </Frame>
  );
}
