"use client";
/**
 * The legal editor (platform.md PLA-§13.4, §13.6; PD17, PD49): title, body in markdown-lite with its live preview,
 * What changed (≤ 500), effective date, "Ask people to accept again" (platform kinds), the line diff against the
 * previous version, and the actions: Save draft (a new version once published), Mark reviewed (typed `reviewed`),
 * Publish (an unreviewed template needs the acknowledgement and the typed `publish unreviewed`), Retire. Store
 * templates show P3's placeholder fields as chips; the server refuses an unknown one.
 */
import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { markLegalReviewedAction, publishLegalAction, retireLegalAction, saveLegalDraftAction } from "@/app/admin/(console)/settings/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { DiffOp } from "@/lib/platform/legal-rules";
import { renderMarkdownLite } from "@/lib/platform/markdown-lite";
import { POLICY_TEMPLATE_FIELDS } from "@/lib/policies/fields";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { PrefetchLink } from "../prefetch-link";
import { ConsoleDialog } from "../queue/decision-dialogs";
import { Banner, button, card, Field, inputCls, StatusText, SwitchRow, TypedConfirm, typedOk } from "../kit";

export interface LegalEditorDoc {
  id: string | null;
  kind: string;
  locale: string;
  platform: boolean;
  version: number;
  status: "draft" | "published" | "retired" | "new";
  title: string;
  body: string;
  summary: string;
  effectiveAt: string | null;
  requiresReacceptance: boolean;
  needsLegalReview: boolean;
  reviewedAt: string | null;
  /** the newest version of this kind and locale (the save's conflict guard) */
  latestVersion: number;
  previous: { version: number } | null;
  diff: DiffOp[];
  diffStats: { added: number; removed: number };
}

type Confirm = "reviewed" | "publish" | "retire" | null;

export function LegalEditor({ doc }: { doc: LegalEditorDoc }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.settings.save_failed");
  const init = { title: doc.title, body: doc.body, summary: doc.summary, effectiveAt: doc.effectiveAt?.slice(0, 10) ?? "", requiresReacceptance: doc.requiresReacceptance };
  const [v, setV] = useState(init);
  const [view, setView] = useState<"write" | "preview">("write");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  const store = !doc.platform;
  const preview = useMemo(() => renderMarkdownLite(v.body, store ? { placeholders: { fields: POLICY_TEMPLATE_FIELDS } } : {}), [v.body, store]);
  const back = "/admin/settings/legal";

  const insert = (field: string) => {
    const el = area.current;
    const token = `{{${field}}}`;
    if (!el) return setV({ ...v, body: v.body + token });
    const at = el.selectionStart ?? v.body.length;
    setV({ ...v, body: v.body.slice(0, at) + token + v.body.slice(el.selectionEnd ?? at) });
  };
  const saveDraft = () =>
    g.run(
      (opId) =>
        saveLegalDraftAction({
          kind: doc.kind,
          locale: doc.locale,
          title: v.title,
          body: v.body,
          summary: v.summary || null,
          effectiveAt: v.effectiveAt ? `${v.effectiveAt}T00:00:00.000Z` : null,
          requiresReacceptance: v.requiresReacceptance,
          baseVersion: doc.latestVersion,
          opId,
        }),
      (d) => {
        g.reset();
        toast.success(t("console.legal.saved", { version: d.version }));
        router.push(`/admin/settings/legal?doc=${d.id}`);
        router.refresh();
      },
    );
  const editable = doc.status === "draft" || doc.status === "new";
  return (
    <div className="grid gap-4">
      <PrefetchLink href={back} className="inline-flex items-center gap-1 justify-self-start rounded-[4px] text-[12.5px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
        <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {t("console.legal.back")}
      </PrefetchLink>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
          {t(`console.legal.kind.${doc.kind}`)} · {t(`console.locale.${doc.locale}`)}
        </h2>
        <span className="rounded-[var(--r-chip)] bg-muted px-1.5 py-0.5 text-[11.5px] text-muted-foreground">{doc.status === "new" ? t("console.legal.first_version") : t("console.legal.version", { version: doc.version })}</span>
        {doc.status !== "new" && <StatusText tone={doc.status === "published" ? "ok" : doc.status === "draft" ? "info" : "neutral"}>{t(`console.legal.status.${doc.status}`)}</StatusText>}
        {doc.needsLegalReview && <span className="rounded-[var(--r-chip)] bg-[var(--c-warn-soft)] px-1.5 py-0.5 text-[11.5px] font-medium">{t("console.legal.needs_review")}</span>}
      </header>
      {!editable && <Banner tone="info">{t("console.legal.immutable", { next: doc.latestVersion + 1 })}</Banner>}

      <section className={cn(card, "grid gap-4 p-4 md:p-5")}>
        <Field label={t("console.legal.title_label")}>{(id) => <input id={id} value={v.title} maxLength={160} onChange={(e) => setV({ ...v, title: e.target.value })} className={inputCls} />}</Field>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium">{t("console.legal.body")}</span>
            <div role="tablist" aria-label={t("console.legal.body")} className="flex gap-1 lg:hidden">
              {(["write", "preview"] as const).map((x) => (
                <button key={x} type="button" role="tab" aria-selected={view === x} onClick={() => setView(x)} className={cn(button.base, view === x ? button.secondary : button.ghost, "h-8")}>
                  {t(`console.legal.${x}`)}
                </button>
              ))}
            </div>
          </div>
          {store && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">{t("console.legal.placeholders")}</span>
              {POLICY_TEMPLATE_FIELDS.slice(0, 40).map((f) => (
                <button key={f} type="button" onClick={() => insert(f)} className="rounded-[var(--r-chip)] px-1.5 py-0.5 font-mono text-[11px] shadow-[inset_0_0_0_1px_var(--border)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                  {f}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <textarea
              ref={area}
              aria-label={t("console.legal.body")}
              value={v.body}
              rows={22}
              onChange={(e) => setV({ ...v, body: e.target.value })}
              className={cn("min-h-[320px] w-full resize-y rounded-[var(--r-control)] bg-background px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)]", view === "preview" && "max-lg:hidden")}
            />
            <div
              aria-label={t("console.legal.preview")}
              dir={doc.locale === "ar" ? "rtl" : "ltr"}
              lang={doc.locale}
              className={cn("prose-legal max-h-[640px] min-h-[320px] overflow-y-auto rounded-[var(--r-control)] bg-muted/30 px-4 py-3 text-[13px] leading-[1.65] [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ms-5 [&_li]:list-disc [&_p]:my-2", view === "write" && "max-lg:hidden")}
            >
              {v.body.trim() ? preview : <p className="text-muted-foreground">{t("console.legal.preview_empty")}</p>}
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label={t("console.legal.summary")} optional hint={t("console.legal.summary_hint", { count: v.summary.length })}>
            {(id, d) => <textarea id={id} aria-describedby={d} rows={2} maxLength={500} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} className={cn(inputCls, "h-auto py-2")} />}
          </Field>
          <Field label={t("console.legal.effective")} optional>
            {(id) => <input id={id} type="date" value={v.effectiveAt} onChange={(e) => setV({ ...v, effectiveAt: e.target.value })} className={inputCls} />}
          </Field>
        </div>
        {doc.platform && <SwitchRow label={t("console.legal.reaccept")} hint={t("console.legal.reaccept_hint")} checked={v.requiresReacceptance} onChange={(x) => setV({ ...v, requiresReacceptance: x })} />}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-hairline)] pt-3">
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          {doc.status === "published" && (
            <button type="button" onClick={() => setConfirm("retire")} className={cn(button.base, button.danger)}>
              {t("console.legal.retire")}
            </button>
          )}
          {doc.status === "draft" && doc.needsLegalReview && !dirty && (
            <button type="button" onClick={() => setConfirm("reviewed")} className={cn(button.base, button.secondary)}>
              {t("console.legal.mark_reviewed")}
            </button>
          )}
          {doc.status === "draft" && !dirty && (
            <button type="button" onClick={() => setConfirm("publish")} className={cn(button.base, button.secondary)}>
              {t("console.legal.publish")}
            </button>
          )}
          <button type="button" disabled={!dirty || g.busy || !v.title.trim() || !v.body.trim()} onClick={() => void saveDraft()} className={cn(button.base, button.primary)}>
            {g.busy ? t("console.form.saving") : t(editable ? "console.legal.save_draft" : "console.legal.save_new")}
          </button>
        </div>
      </section>

      {doc.previous && (
        <section aria-label={t("console.legal.diff")} className={card}>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
            <h2 className="me-auto text-[14px] font-semibold">{t("console.legal.diff_title", { version: doc.previous.version })}</h2>
            <span className="num text-[12px] text-[oklch(0.42_0.1_160)] dark:text-[oklch(0.82_0.1_160)]">+{doc.diffStats.added}</span>
            <span className="num text-[12px] text-[var(--c-danger-ink)]">−{doc.diffStats.removed}</span>
          </div>
          <pre dir="auto" className="max-h-[420px] overflow-auto border-t border-[var(--c-hairline)] py-2 font-mono text-[12px] leading-[1.55]">
            {doc.diff.map((d, i) =>
              d.op === "same" ? null : (
                <div key={i} className={cn("px-4 whitespace-pre-wrap md:px-5", d.op === "add" ? "bg-[var(--c-success-soft)]" : "bg-[var(--c-danger-soft)] line-through decoration-[var(--c-danger-ink)]/40")}>
                  <span aria-hidden="true" className="me-2 select-none text-muted-foreground">
                    {d.op === "add" ? "+" : "−"}
                  </span>
                  {d.text || " "}
                </div>
              ),
            )}
            {doc.diff.every((d) => d.op === "same") && <p className="px-5 py-2 font-sans text-muted-foreground">{t("console.legal.diff_none")}</p>}
          </pre>
        </section>
      )}
      {confirm && doc.id && <ConfirmDialog kind={confirm} id={doc.id} needsReview={doc.needsLegalReview} onClose={() => setConfirm(null)} />}
      {g.sheet}
    </div>
  );
}

function ConfirmDialog({ kind, id, needsReview, onClose }: { kind: Exclude<Confirm, null>; id: string; needsReview: boolean; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.settings.save_failed");
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const word = kind === "reviewed" ? "reviewed" : kind === "publish" && needsReview ? "publish unreviewed" : null;
  const ready = (!word || typedOk(typed, word)) && (kind !== "publish" || !needsReview || ack);
  const finish = (msg: string) => {
    toast.success(msg);
    onClose();
    router.refresh();
  };
  const go = () => {
    if (kind === "reviewed") return g.run((opId) => markLegalReviewedAction({ id, typed, opId }), () => finish(t("console.legal.reviewed_done")));
    if (kind === "publish") return g.run((opId) => publishLegalAction({ id, acknowledge: ack, typed, opId }), () => finish(t("console.legal.published_done")));
    return g.run((opId) => retireLegalAction({ id, opId }), () => finish(t("console.legal.retired_done")));
  };
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(`console.legal.confirm.${kind}`)}
      description={t(`console.legal.confirm.${kind}_lead`)}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.form.cancel")}
          </button>
          <button type="button" disabled={!ready || g.busy} onClick={() => void go()} className={cn(button.base, kind === "retire" ? button.dangerSolid : button.primary)}>
            {t(`console.legal.confirm.${kind}_go`)}
          </button>
          {g.sheet}
        </>
      }
    >
      {kind === "publish" && needsReview && (
        <>
          <Banner tone="warn">{t("console.legal.unreviewed_warning")}</Banner>
          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
            {t("console.legal.ack")}
          </label>
        </>
      )}
      {word && <TypedConfirm word={word} value={typed} onChange={setTyped} />}
    </ConsoleDialog>
  );
}
