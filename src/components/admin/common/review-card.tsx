"use client";
/**
 * ReviewCard (P2 SHELL; platform.md PLA-§22.7, §22.8, §3.5, §3.6, PL-02, PD68; docs/STORE-SAAS.md §A.5.2, §E.2 rev 3):
 * the In-review card of a `pending` store on the dashboard, and a compact form on Pages and Generate. Every state of
 * the store's review (`getReviewCard(scope)`, P1's `requests.ts`):
 *
 * - **before submitting** (`none` / `pending` without `submittedAt`): what works now (the media cap from
 *   `applyStateCap`, 20 MB before submitting and 100 MB after, PD68), what unlocks after approval, **Submit for review**
 *   (owner; a sheet with the optional business context) and **Share a private preview**;
 * - **submitted**: "Submitted. We'll tell you here when it's done.", plus "Usually within n hours" only when the
 *   platform set `slaHours` (no invented promise);
 * - **needs info**: the staff question as a quote and the answer box (≤ 500, owner);
 * - **approved**: "You're approved" with a quiet 240 ms reveal (no confetti), **Publish your page**, dismissible;
 * - **rejected**: the reason sentence and the one appeal (≤ 500, owner), or "already used".
 *
 * The private preview links (72 h, store-bound, at most 10 active): pick a page, create the link, then Copy and
 * WhatsApp; the active links list (page, created, expires, opens) with **Revoke**. The secret URL exists only in the
 * answer of the mint, so a listed link offers Revoke alone. Writes go through P2's review actions; the page refreshes
 * after each.
 */
import { CheckIcon, CircleCheckIcon, ClockIcon, LinkIcon, Loader2Icon, LockIcon, MessageCircleQuestionIcon, SendIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { answerReviewQuestionAction, mintPreviewLinkAction, revokePreviewLinkAction, submitAppealAction, submitForReviewAction } from "@/app/app/[store]/review-actions";
import type { PreviewLink } from "@/lib/admin-data/dashboard";
import { dirOf, messageOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { ReviewCard as ReviewCardData } from "@/lib/platform/requests";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { whatsappText } from "./address-math";
import { CopyButton } from "./copy-button";
import { formatDay } from "./primitive-logic";
import { SheetCloseX } from "./sheet-close";
import { FOCUS_RING, TOUCH } from "./ui-classes";
import { WhatsAppShareButton } from "./whatsapp-share-button";

export interface ReviewCardProps {
  card: ReviewCardData;
  store: { name: string };
  /** the viewer owns the store: submit, answer and appeal are owner-only (the actions re-check) */
  isOwner: boolean;
  /** the pending media cap in MB, from `applyStateCap("pending", "media_bytes", …, { submitted })` */
  mediaMb: number;
  /** `activePreviewLinks(scope)`; omitted for a viewer without `pages.read` (no preview section) */
  previewLinks?: PreviewLink[];
  /** the store's pages a preview can show */
  pages?: { id: string; name: string }[];
  /** the signup phone, prefilled in the WhatsApp field of the submit sheet */
  whatsapp?: string | null;
  /** where "Publish your page" leads once approved */
  publishHref?: string;
  compact?: boolean;
  onDismiss?(): void;
}

const REVIEW_FIELD_MAX = 200;
const REVIEW_TEXT_MAX = 500;

type Run = <T>(p: Promise<ActionResult<T>>) => Promise<ActionResult<T>>;

function useRun(): Run {
  const t = useT();
  return async (promise) => {
    let res;
    try {
      res = await promise;
    } catch {
      res = { ok: false as const, error: "server" as const };
    }
    if (!res.ok) toast.error(t(res.message && messageOf(res.message) !== undefined ? res.message : messageOf(`error.${res.error}`) !== undefined ? `error.${res.error}` : "shell.err.generic", { ref: "-" }));
    return res;
  };
}

export function ReviewCard(p: ReviewCardProps) {
  const t = useT();
  const locale = useAdminLocale();
  const s = p.card.status;
  const before = s === "none" || (s === "pending" && !p.card.submittedAt);
  const submitted = s === "submitted" || (s === "pending" && !!p.card.submittedAt);

  if (p.compact) return <CompactCard {...p} before={before} submitted={submitted} />;

  return (
    <section id="review" aria-labelledby="review-title" className="scroll-mt-24 rounded-[var(--r-card)] bg-card p-5 text-card-foreground ring-1 ring-border ring-inset sm:p-6">
      {s === "approved" ? (
        <Approved {...p} />
      ) : s === "rejected" ? (
        <Rejected {...p} />
      ) : (
        <div className="grid gap-5">
          <header className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[var(--r-control)] bg-info-soft text-info-ink">
              {s === "needs_info" ? <MessageCircleQuestionIcon className="size-[18px]" /> : <ClockIcon className="size-[18px]" />}
            </span>
            <div className="grid gap-1">
              <h2 id="review-title" className="text-base font-semibold tracking-[-0.006em]">
                {s === "needs_info" ? t("shell.review.needs_info") : t("shell.review.title")}
              </h2>
              {submitted && (
                <p className="text-sm text-muted-foreground">
                  {t("shell.review.submitted")}
                  {p.card.slaHours !== null && p.card.slaHours > 0 && <> {t("shell.review.sla", { hours: p.card.slaHours })}</>}
                </p>
              )}
              {submitted && p.card.submittedAt && <p className="text-xs text-muted-foreground tabular-nums">{t("shell.review.submitted_at", { date: formatDay(p.card.submittedAt, locale) })}</p>}
            </div>
          </header>
          {s === "needs_info" && <NeedsInfo {...p} />}
          <ul className="grid gap-2.5 text-sm">
            <li className="flex items-start gap-2.5">
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="text-pretty">{t("shell.review.works_now", { mediaMb: p.mediaMb })}</span>
            </li>
            <li className="flex items-start gap-2.5 text-muted-foreground">
              <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="text-pretty">{t("shell.review.after")}</span>
            </li>
          </ul>
          {before && <SubmitRow {...p} />}
          {p.previewLinks && <Previews {...p} />}
        </div>
      )}
    </section>
  );
}

function CompactCard(p: ReviewCardProps & { before: boolean; submitted: boolean }) {
  const t = useT();
  const s = p.card.status;
  if (s === "approved" || s === "rejected") return null;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-[var(--r-card)] bg-info-soft/60 px-4 py-3 ring-1 ring-info/15 ring-inset sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-info-ink">
        <ClockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="text-pretty">
          <span className="font-medium">{s === "needs_info" ? t("shell.review.needs_info") : t("shell.review.title")}.</span>{" "}
          {p.submitted ? t("shell.review.submitted") : t("shell.review.works_now", { mediaMb: p.mediaMb })}
        </span>
      </p>
      {(p.before || s === "needs_info") && (
        <Link href="#review" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "shrink-0", FOCUS_RING, TOUCH)}>
          {s === "needs_info" ? t("shell.review.answer_send") : t("shell.review.submit")}
        </Link>
      )}
    </div>
  );
}

function SubmitRow(p: ReviewCardProps) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sells, setSells] = useState("");
  const [link, setLink] = useState("");
  const [wa, setWa] = useState(p.whatsapp ?? "");
  const ids = { sells: useId(), link: useId(), wa: useId() };
  if (!p.isOwner) return <p className="text-xs text-muted-foreground">{t("shell.review.owner_only")}</p>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const res = await run(submitForReviewAction({ sells: sells.trim() || null, link: link.trim() || null, whatsapp: wa.trim() || null }));
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      toast.success(t("shell.review.submitted"));
      router.refresh();
    }
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="brand" size="lg" className={cn("gap-2", FOCUS_RING, TOUCH)} onClick={() => setOpen(true)}>
          <SendIcon aria-hidden="true" />
          {t("shell.review.submit")}
        </Button>
      </div>
      <Sheet open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <SheetContent side={dirOf(locale) === "rtl" ? "left" : "right"} showCloseButton={false} className="w-full gap-0 sm:max-w-[480px]">
          <SheetCloseX />
          <form onSubmit={submit} className="flex h-full flex-col">
            <SheetHeader className="gap-1.5 border-b border-border p-6 pe-14">
              <SheetTitle className="text-base font-semibold">{t("shell.review.submit_title")}</SheetTitle>
              <SheetDescription className="leading-relaxed text-pretty">{t("shell.review.submit_lead")}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-5 overflow-y-auto p-6">
              <Field id={ids.sells} label={t("shell.review.context_sell")} hint={t("shell.review.context_hint")}>
                <Input id={ids.sells} value={sells} maxLength={REVIEW_FIELD_MAX} onChange={(e) => setSells(e.target.value)} className={TOUCH} />
              </Field>
              <Field id={ids.link} label={t("shell.review.context_link")} hint={t("shell.review.context_hint")}>
                <Input id={ids.link} value={link} dir="ltr" inputMode="url" maxLength={REVIEW_FIELD_MAX} onChange={(e) => setLink(e.target.value)} className={TOUCH} />
              </Field>
              <Field id={ids.wa} label={t("shell.review.context_whatsapp")} hint={t("shell.field.e164")}>
                <Input id={ids.wa} value={wa} dir="ltr" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} onChange={(e) => setWa(e.target.value)} className={TOUCH} />
              </Field>
            </div>
            <SheetFooter className="mt-auto flex-row justify-end gap-2 border-t border-border p-4">
              <Button type="button" variant="ghost" size="lg" disabled={busy} className={TOUCH} onClick={() => setOpen(false)}>
                {t("shell.common.cancel")}
              </Button>
              <Button type="submit" variant="brand" size="lg" disabled={busy} aria-busy={busy || undefined} className={TOUCH}>
                {busy && <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {t("shell.review.submit")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NeedsInfo(p: ReviewCardProps) {
  const t = useT();
  const router = useRouter();
  const run = useRun();
  const id = useId();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="grid gap-3">
      {p.card.question && (
        <blockquote className="border-s-2 border-info ps-3 text-sm leading-relaxed text-pretty whitespace-pre-line text-foreground">
          <bdi>{p.card.question}</bdi>
        </blockquote>
      )}
      {sent ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success-ink">
          <CircleCheckIcon aria-hidden="true" className="size-4" />
          {t("shell.review.answered")}
        </p>
      ) : p.isOwner ? (
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!answer.trim()) return;
            setBusy(true);
            const res = await run(answerReviewQuestionAction({ answer: answer.trim() }));
            setBusy(false);
            if (res.ok) {
              setSent(true);
              router.refresh();
            }
          }}
        >
          <label htmlFor={id} className="text-[13px] font-medium">
            {t("shell.review.answer")}
          </label>
          <Textarea id={id} value={answer} rows={4} maxLength={REVIEW_TEXT_MAX} onChange={(e) => setAnswer(e.target.value)} className="min-h-24" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("shell.review.answer_hint")} <bdi>{`${answer.length} / ${REVIEW_TEXT_MAX}`}</bdi>
            </p>
            <Button type="submit" variant="brand" size="lg" disabled={busy || !answer.trim()} aria-busy={busy || undefined} className={cn(FOCUS_RING, TOUCH)}>
              {busy && <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {t("shell.review.answer_send")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{t("shell.review.owner_only")}</p>
      )}
    </div>
  );
}

function Approved(p: ReviewCardProps) {
  const t = useT();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className="adm-fade flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[var(--r-control)] bg-success-soft text-success-ink">
          <CircleCheckIcon className="size-[18px]" />
        </span>
        <h2 id="review-title" className="text-base font-semibold tracking-[-0.006em] text-pretty">
          {t("shell.review.approved")}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.publishHref && (
          <Link href={p.publishHref} className={cn(buttonVariants({ variant: "brand", size: "lg" }), FOCUS_RING, TOUCH)}>
            {t("shell.review.approved_cta")}
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={t("shell.review.dismiss")}
          className={cn(FOCUS_RING, TOUCH)}
          onClick={() => {
            setGone(true);
            p.onDismiss?.();
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function Rejected(p: ReviewCardProps) {
  const t = useT();
  const router = useRouter();
  const run = useRun();
  const id = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const reasonKey = p.card.rejectReason ? `shell.rejected.${p.card.rejectReason}` : null;
  return (
    <div className="grid gap-4">
      <h2 id="review-title" className="text-base font-semibold tracking-[-0.006em]">
        {t("shell.page.rejected")}
      </h2>
      {reasonKey && messageOf(reasonKey) !== undefined && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t(reasonKey)}</p>}
      {sent ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success-ink">
          <CircleCheckIcon aria-hidden="true" className="size-4" />
          {t("shell.appeal.sent")}
        </p>
      ) : p.card.appealsLeft === 0 ? (
        <p className="text-sm text-muted-foreground">{t("shell.appeal.used")}</p>
      ) : p.isOwner ? (
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!message.trim()) return;
            setBusy(true);
            const res = await run(submitAppealAction({ message: message.trim() }));
            setBusy(false);
            if (res.ok) {
              setSent(true);
              router.refresh();
            }
          }}
        >
          <p className="text-[13px] font-medium">{t("shell.appeal.title")}</p>
          <p className="text-sm text-muted-foreground">{t("shell.appeal.lead")}</p>
          <label htmlFor={id} className="sr-only">
            {t("shell.appeal.field")}
          </label>
          <Textarea id={id} value={message} rows={4} maxLength={REVIEW_TEXT_MAX} placeholder="" onChange={(e) => setMessage(e.target.value)} className="min-h-24" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("shell.appeal.hint")}</p>
            <Button type="submit" variant="brand" size="lg" disabled={busy || !message.trim()} aria-busy={busy || undefined} className={cn(FOCUS_RING, TOUCH)}>
              {busy && <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {t("shell.appeal.send")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{t("shell.review.owner_only")}</p>
      )}
    </div>
  );
}

function Previews(p: ReviewCardProps) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const run = useRun();
  const selectId = useId();
  const pages = p.pages ?? [];
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const links = p.previewLinks ?? [];
  return (
    <div className="grid gap-4 border-t border-border pt-5">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{t("shell.review.preview")}</h3>
        <p className="text-sm text-muted-foreground">{t("shell.review.preview_lead")}</p>
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("shell.review.preview_no_pages")}</p>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pageId) return;
            setBusy(true);
            const res = await run(mintPreviewLinkAction({ pageId }));
            setBusy(false);
            if (res.ok) {
              setFresh({ url: res.data.url, expiresAt: res.data.expiresAt });
              router.refresh();
            }
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <label htmlFor={selectId} className="text-[13px] font-medium">
              {t("shell.review.preview_page")}
            </label>
            <select
              id={selectId}
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className={cn("h-9 w-full rounded-[var(--r-control)] border border-input bg-background px-3 text-sm", FOCUS_RING, TOUCH)}
            >
              {pages.map((pg) => (
                <option key={pg.id} value={pg.id}>
                  {pg.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" size="lg" disabled={busy || !pageId} aria-busy={busy || undefined} className={cn("gap-2", FOCUS_RING, TOUCH)}>
            {busy ? <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LinkIcon aria-hidden="true" />}
            {t("shell.review.preview_create")}
          </Button>
        </form>
      )}
      {fresh && (
        <div role="status" className="adm-fade grid gap-3 rounded-[var(--r-control)] bg-success-soft/60 p-3 ring-1 ring-success/15 ring-inset">
          <p className="text-sm text-success-ink">{t("shell.review.preview_ready")}</p>
          <div className="flex min-w-0 items-center gap-1 rounded-[var(--r-chip)] bg-card px-2 py-1 ring-1 ring-border ring-inset">
            <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[13px]">
              {fresh.url}
            </bdi>
            <CopyButton value={fresh.url} label={t("shell.address.copy")} toastMessage={t("shell.address.link_copied")} className={cn(FOCUS_RING, TOUCH)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppShareButton text={whatsappText(t("shell.address.wa_text"), p.store.name, fresh.url)} />
            <span className="text-xs text-muted-foreground tabular-nums">{t("shell.review.preview_expires", { date: formatDay(fresh.expiresAt, locale) })}</span>
          </div>
        </div>
      )}
      <div className="grid gap-2">
        <h4 className="text-[11px] font-medium text-muted-foreground">{t("shell.review.preview_active")}</h4>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("shell.review.preview_none")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--r-control)] ring-1 ring-border ring-inset">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5">
                <div className="grid min-w-0 gap-0.5">
                  <p className="truncate text-sm font-medium">{l.pageName ?? t("shell.review.preview_deleted")}</p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
                    <span>{t("shell.review.preview_created", { date: formatDay(l.createdAt, locale) })}</span>
                    <span>{t("shell.review.preview_expires", { date: formatDay(l.expiresAt, locale) })}</span>
                    <span>{l.opened > 0 ? t("shell.review.preview_opened", { count: l.opened }) : t("shell.review.preview_unopened")}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={revoking === l.id}
                  aria-busy={revoking === l.id || undefined}
                  className={cn("text-destructive-ink", FOCUS_RING, TOUCH)}
                  onClick={async () => {
                    setRevoking(l.id);
                    const res = await run(revokePreviewLinkAction({ tokenId: l.id }));
                    setRevoking(null);
                    if (res.ok) {
                      toast.success(t("shell.review.preview_revoked"));
                      router.refresh();
                    }
                  }}
                >
                  {t("shell.review.preview_revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
