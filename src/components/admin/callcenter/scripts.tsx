"use client";
/**
 * The Scripts tab of `/team/callcenter` (P4 CALL CENTER; operations.md OPE-§7.3, §7.4, AI-15; core §I.8).
 *
 *   bar        language tabs (ar / fr / en) and the scope: "Every page" or one live page
 *   editor     the steps (drag to reorder, or the up / down buttons; add ≤ 12, remove), each with its title, what to
 *              say, ≤ 4 checks, when (always / only with an upsell) and its button; variable chips insert `{var}` at
 *              the caret of the last text field touched; the policy sentences show only when the owner set the fact;
 *              ≤ 6 objection answers
 *   preview    the script compiled against the page's most recent order (masked) or, with no order yet, a "Preview
 *              sample" from the page's lead item and price; it follows every keystroke
 *   suggested  the AI drafts of this language with Approve (→ active, the previous one archived) and Discard; agents
 *              never see a draft
 *
 * Edits are kept per (scope, language) until saved, so switching tabs loses nothing. "Reset to built-in" archives the
 * stored script of the pair; a page without its own script reads the store's, else the built-in one.
 */
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, FileTextIcon, GripVerticalIcon, Loader2Icon, PlusIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { approveScriptDraftAction, discardScriptDraftAction, resetScriptAction, saveScriptAction, scriptPreviewAction } from "@/app/app/[store]/team/callcenter/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BUILTIN_SCRIPTS } from "@/lib/callcenter/script-builtins";
import { compileScriptDoc, OBJECTION_IDS, ScriptDoc, SCRIPT_LOCALES, type CompiledScript, type ObjectionId, type ScriptLocale } from "@/lib/callcenter/script";
import type { CallCenterView, PreviewValues, ScriptRowView } from "@/lib/callcenter/settings-view.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { dirOf } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { settle } from "../orders/ops-ui";
import { errorKey } from "./parts";
import { previewRender } from "./preview-render";

const ALL = "all";
const MAX_STEPS = 12;
const MAX_CHECKS = 4;
const MAX_OBJECTIONS = 6;
/** The variables offered as chips (the rest of TEMPLATE_VARS stays typeable). */
const VAR_CHIPS = [
  "customer_first_name",
  "product",
  "offer_label",
  "qty",
  "total",
  "shipping_text",
  "city",
  "address",
  "landmark",
  "eta_text",
  "store_name",
  "agent_first_name",
  "confirm_hours",
  "upsell_title",
  "upsell_price",
] as const;

type Step = ScriptDoc["steps"][number];
type Focus = { kind: "step" | "obj"; index: number } | null;
const pairKey = (pageId: string | null, locale: ScriptLocale) => `${pageId ?? ALL}:${locale}`;

function freshId(steps: Step[]): string {
  let n = steps.length + 1;
  while (steps.some((s) => s.id === `step_${n}`)) n++;
  return `step_${n}`;
}

/** The stored script of the pair, and where it comes from. */
function storedOf(scripts: ScriptRowView[], pageId: string | null, locale: ScriptLocale): { doc: ScriptDoc; source: "own" | "own_ai" | "store" | "builtin"; row: ScriptRowView | null } {
  const own = scripts.find((s) => s.status === "active" && s.locale === locale && s.pageId === pageId);
  if (own) return { doc: own.doc, source: own.source === "ai" ? "own_ai" : "own", row: own };
  if (pageId) {
    const store = scripts.find((s) => s.status === "active" && s.locale === locale && s.pageId === null);
    if (store) return { doc: store.doc, source: "store", row: null };
  }
  return { doc: BUILTIN_SCRIPTS[locale], source: "builtin", row: null };
}

export function ScriptsEditor({ view, canEdit }: { view: CallCenterView; canEdit: boolean }) {
  const t = useT();
  const adminLocale = useAdminLocale();
  const router = useRouter();
  const uid = useId();
  const [locale, setLocale] = useState<ScriptLocale>((SCRIPT_LOCALES as readonly string[]).includes(adminLocale) ? (adminLocale as ScriptLocale) : "fr");
  const [pageId, setPageId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, ScriptDoc>>({});
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // a step drags only from its handle, so selecting text in its fields never starts a drag
  const [armed, setArmed] = useState<number | null>(null);
  const focus = useRef<Focus>(null);
  const fields = useRef(new Map<string, HTMLTextAreaElement>());

  const key = pairKey(pageId, locale);
  const stored = storedOf(view.scripts, pageId, locale);
  const doc = edits[key] ?? stored.doc;
  const dirty = key in edits && JSON.stringify(edits[key]) !== JSON.stringify(stored.doc);
  const parsed = ScriptDoc.safeParse(doc);
  const idsUnique = new Set(doc.steps.map((s) => s.id)).size === doc.steps.length;
  const valid = parsed.success && idsUnique;
  const snippets = view.policySnippets[locale];
  const drafts = view.scripts.filter((s) => s.status === "draft" && s.locale === locale);
  const pageName = (id: string | null) => (id === null ? t("ops.cc.script.everyPage") : (view.pages.find((p) => p.id === id)?.name ?? t("ops.cc.script.otherPage")));

  const edit = (next: ScriptDoc) => setEdits({ ...edits, [key]: next });
  const setStep = (i: number, patch: Partial<Step>) => edit({ ...doc, steps: doc.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= doc.steps.length || from === to) return;
    const steps = [...doc.steps];
    const [s] = steps.splice(from, 1);
    steps.splice(to, 0, s!);
    edit({ ...doc, steps });
  };

  /** Insert text at the caret of the last text field touched (else at the end of the first step). */
  function insert(text: string) {
    const f = focus.current ?? { kind: "step" as const, index: 0 };
    const el = fields.current.get(`${f.kind}:${f.index}`);
    const cur = f.kind === "step" ? (doc.steps[f.index]?.say ?? "") : (doc.objections[f.index]?.say ?? "");
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    if (f.kind === "step") setStep(f.index, { say: next.slice(0, 400) });
    else edit({ ...doc, objections: doc.objections.map((o, j) => (j === f.index ? { ...o, say: next.slice(0, 300) } : o)) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function save() {
    if (!valid || busy) return;
    setBusy("save");
    const res = await settle<{ id: string }>(saveScriptAction({ pageId, locale, doc: parsed.data }));
    setBusy(null);
    if (!res.ok) return void toast.error(res.error === "limit" ? t("ops.cc.script.limit") : t(errorKey(res.error)));
    const rest = { ...edits };
    delete rest[key];
    setEdits(rest);
    toast.success(t("ops.cc.script.saved"));
    router.refresh();
  }

  async function reset() {
    setBusy("reset");
    const res = await settle<{ archived: number }>(resetScriptAction({ pageId, locale }));
    setBusy(null);
    setResetOpen(false);
    if (!res.ok) return void toast.error(t(errorKey(res.error)));
    const rest = { ...edits };
    delete rest[key];
    setEdits(rest);
    toast.success(t("ops.cc.script.resetDone"));
    router.refresh();
  }

  const sourceText = {
    own: t("ops.cc.script.source.store"),
    own_ai: t("ops.cc.script.source.ai"),
    store: t("ops.cc.script.source.inherits"),
    builtin: t("ops.cc.script.source.builtin"),
  }[stored.source];

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label={t("ops.cc.script.lang")} className="inline-flex w-fit rounded-[12px] border border-border bg-muted/40 p-0.5">
          {SCRIPT_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={locale === l}
              onClick={() => setLocale(l)}
              className={cn(
                "q-sm relative h-8 rounded-[10px] px-3.5 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                locale === l ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`ops.cc.script.lang.${l}`)}
              {pairKey(pageId, l) in edits && <span className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-[var(--q-info)]" aria-label={t("ops.cc.unsaved")} />}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-scope`} className="q-xs font-medium text-muted-foreground">
            {t("ops.cc.script.scope")}
          </label>
          <Select value={pageId ?? ALL} onValueChange={(v) => setPageId(v === ALL ? null : v)}>
            <SelectTrigger id={`${uid}-scope`} className="w-full sm:w-72">
              <SelectValue>{pageId === null ? t("ops.cc.script.everyPage") : (view.pages.find((p) => p.id === pageId)?.name ?? t("ops.cc.script.everyPage"))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("ops.cc.script.everyPage")}</SelectItem>
              {view.pages.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
        <section aria-labelledby={`${uid}-ed`} className="grid gap-4 rounded-[18px] border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <h2 id={`${uid}-ed`} className="q-md font-semibold text-foreground">
                {t("ops.cc.script.title")}
              </h2>
              <p className="q-xs inline-flex items-center gap-1.5 text-muted-foreground">
                <FileTextIcon className="size-3.5" aria-hidden="true" />
                {sourceText}
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {stored.row && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={!!busy} onClick={() => setResetOpen(true)}>
                    <RotateCcwIcon className="size-3.5" aria-hidden="true" />
                    {t("ops.cc.script.reset")}
                  </Button>
                )}
                {dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => {
                      const rest = { ...edits };
                      delete rest[key];
                      setEdits(rest);
                    }}
                  >
                    {t("ops.cc.discard")}
                  </Button>
                )}
                <Button type="button" size="sm" className="gap-1.5" disabled={!dirty || !valid || !!busy} onClick={save}>
                  {busy === "save" && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
                  {t("ops.cc.script.save")}
                </Button>
              </div>
            )}
          </div>
          <p className="q-sm text-muted-foreground">{t("ops.cc.script.hint")}</p>

          {canEdit && (
            <div className="grid gap-2 rounded-[12px] bg-muted/40 p-2.5">
              <span className="q-2xs font-medium text-muted-foreground">{t("ops.cc.script.vars")}</span>
              <div className="flex flex-wrap gap-1.5">
                {VAR_CHIPS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(`{${v}}`)}
                    className="q-xs inline-flex h-7 items-center rounded-full border border-border bg-background px-2.5 text-foreground transition-colors duration-150 hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    title={`{${v}}`}
                  >
                    {t(`ops.cc.script.var.${v}`)}
                  </button>
                ))}
              </div>
              {snippets.length > 0 && (
                <>
                  <span className="q-2xs mt-1 font-medium text-muted-foreground">{t("ops.cc.script.policies")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {snippets.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        dir={dirOf(locale)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert(` ${s.text}`)}
                        className="q-xs inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border bg-background px-2.5 py-1 text-start text-foreground hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <PlusIcon className="size-3 shrink-0" aria-hidden="true" />
                        {s.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <ol className="grid gap-2.5">
            {doc.steps.map((s, i) => (
              <li
                key={`${s.id}-${i}`}
                draggable={canEdit && armed === i}
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) moveStep(dragFrom, i);
                  setDragFrom(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setArmed(null);
                }}
                className={cn("grid gap-2.5 rounded-[14px] border border-border bg-background p-3 transition-opacity duration-150", dragFrom === i && "opacity-50")}
              >
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <span className="grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-muted" title={t("ops.cc.script.drag")} onPointerDown={() => setArmed(i)} onPointerUp={() => setArmed(null)}>
                      <GripVerticalIcon className="size-4" aria-hidden="true" />
                    </span>
                  )}
                  <span className="q-2xs q-num grid size-5 shrink-0 place-items-center rounded-full bg-muted font-medium text-muted-foreground">{i + 1}</span>
                  <label htmlFor={`${uid}-t${i}`} className="sr-only">
                    {t("ops.cc.script.stepTitle")}
                  </label>
                  <Input
                    id={`${uid}-t${i}`}
                    value={s.title}
                    maxLength={40}
                    disabled={!canEdit}
                    dir={dirOf(locale)}
                    aria-invalid={!s.title.trim() || undefined}
                    placeholder={t("ops.cc.script.stepTitle")}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                    className="h-8 flex-1 font-medium"
                  />
                  {canEdit && (
                    <span className="flex items-center">
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={i === 0} aria-label={t("ops.cc.up")} onClick={() => moveStep(i, i - 1)}>
                        <ChevronUpIcon className="size-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={i === doc.steps.length - 1} aria-label={t("ops.cc.down")} onClick={() => moveStep(i, i + 1)}>
                        <ChevronDownIcon className="size-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={doc.steps.length <= 1} aria-label={t("ops.cc.script.removeStep")} onClick={() => edit({ ...doc, steps: doc.steps.filter((_, j) => j !== i) })}>
                        <XIcon className="size-4" aria-hidden="true" />
                      </Button>
                    </span>
                  )}
                </div>
                <label htmlFor={`${uid}-s${i}`} className="sr-only">
                  {t("ops.cc.script.say")}
                </label>
                <Textarea
                  id={`${uid}-s${i}`}
                  ref={(el) => {
                    if (el) fields.current.set(`step:${i}`, el);
                    else fields.current.delete(`step:${i}`);
                  }}
                  value={s.say}
                  maxLength={400}
                  rows={2}
                  disabled={!canEdit}
                  dir={dirOf(locale)}
                  placeholder={t("ops.cc.script.say")}
                  onFocus={() => (focus.current = { kind: "step", index: i })}
                  onChange={(e) => setStep(i, { say: e.target.value })}
                  className="min-h-16 resize-y"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.checks.map((c, ci) => (
                    <span key={ci} className="inline-flex items-center rounded-full border border-border bg-card ps-2.5 pe-0.5">
                      <CheckIcon className="size-3 text-muted-foreground" aria-hidden="true" />
                      <input
                        value={c}
                        maxLength={60}
                        disabled={!canEdit}
                        dir={dirOf(locale)}
                        aria-label={t("ops.cc.script.checks")}
                        onChange={(e) => setStep(i, { checks: s.checks.map((x, j) => (j === ci ? e.target.value : x)) })}
                        className="q-xs h-7 w-32 bg-transparent px-1.5 outline-none"
                      />
                      {canEdit && (
                        <button type="button" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={t("ops.cc.script.removeCheck")} onClick={() => setStep(i, { checks: s.checks.filter((_, j) => j !== ci) })}>
                          <XIcon className="size-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && s.checks.length < MAX_CHECKS && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground" onClick={() => setStep(i, { checks: [...s.checks, ""] })}>
                      <PlusIcon className="size-3" aria-hidden="true" />
                      {t("ops.cc.script.addCheck")}
                    </Button>
                  )}
                  <span className="ms-auto flex flex-wrap gap-1.5">
                    <Select value={s.when} disabled={!canEdit} onValueChange={(v) => setStep(i, { when: v as Step["when"] })}>
                      <SelectTrigger size="sm" className="q-xs h-7" aria-label={t("ops.cc.script.when")}>
                        <SelectValue>{t(`ops.cc.script.when.${s.when}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">{t("ops.cc.script.when.always")}</SelectItem>
                        <SelectItem value="upsell">{t("ops.cc.script.when.upsell")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={s.action} disabled={!canEdit} onValueChange={(v) => setStep(i, { action: v as Step["action"] })}>
                      <SelectTrigger size="sm" className="q-xs h-7" aria-label={t("ops.cc.script.action")}>
                        <SelectValue>{t(`ops.cc.script.action.${s.action}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(["none", "add_upsell", "edit_address"] as const).map((a) => (
                          <SelectItem key={a} value={a}>
                            {t(`ops.cc.script.action.${a}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {canEdit && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={doc.steps.length >= MAX_STEPS}
                onClick={() => edit({ ...doc, steps: [...doc.steps, { id: freshId(doc.steps), title: "", say: "", checks: [], when: "always", action: "none" }] })}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                {t("ops.cc.script.addStep")}
              </Button>
              {doc.steps.length >= MAX_STEPS && <span className="q-xs text-muted-foreground">{t("ops.cc.script.stepsMax")}</span>}
            </div>
          )}

          <div className="grid gap-2.5 border-t border-border/70 pt-4">
            <div className="grid gap-0.5">
              <h3 className="q-sm font-medium text-foreground">{t("ops.cc.script.objections")}</h3>
              <p className="q-xs text-muted-foreground">{t("ops.cc.script.objectionsHint")}</p>
            </div>
            {doc.objections.map((o, i) => (
              <div key={`${o.id}-${i}`} className="grid gap-1.5 rounded-[12px] border border-border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="q-xs font-medium text-foreground">{t(`ops.script.obj.${o.id}`)}</span>
                  {canEdit && (
                    <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={t("ops.cc.script.removeObjection")} onClick={() => edit({ ...doc, objections: doc.objections.filter((_, j) => j !== i) })}>
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <Textarea
                  ref={(el) => {
                    if (el) fields.current.set(`obj:${i}`, el);
                    else fields.current.delete(`obj:${i}`);
                  }}
                  value={o.say}
                  maxLength={300}
                  rows={2}
                  disabled={!canEdit}
                  dir={dirOf(locale)}
                  aria-label={t(`ops.script.obj.${o.id}`)}
                  onFocus={() => (focus.current = { kind: "obj", index: i })}
                  onChange={(e) => edit({ ...doc, objections: doc.objections.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)) })}
                  className="min-h-14 resize-y"
                />
              </div>
            ))}
            {canEdit && doc.objections.length < MAX_OBJECTIONS && (
              <Select value="" onValueChange={(id) => edit({ ...doc, objections: [...doc.objections, { id: id as ObjectionId, say: "" }] })}>
                <SelectTrigger size="sm" className="w-fit gap-1.5" aria-label={t("ops.cc.script.addObjection")}>
                  <PlusIcon className="size-3.5" aria-hidden="true" />
                  <span>{t("ops.cc.script.addObjection")}</span>
                </SelectTrigger>
                <SelectContent>
                  {OBJECTION_IDS.filter((id) => !doc.objections.some((o) => o.id === id)).map((id) => (
                    <SelectItem key={id} value={id}>
                      {t(`ops.script.obj.${id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {dirty && !valid && (
            <p role="alert" className="q-sm text-destructive">
              {t("ops.cc.script.invalid")}
            </p>
          )}
        </section>

        <div className="grid gap-5 lg:sticky lg:top-4">
          <Preview doc={doc} pageId={pageId} locale={locale} />
          <Suggested drafts={drafts} canEdit={canEdit} pageName={pageName} />
        </div>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ops.cc.script.resetTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ops.cc.script.resetBody", { page: pageName(pageId), language: t(`ops.cc.script.lang.${locale}`) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "reset"}>{t("ops.cc.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "reset"}
              onClick={(e) => {
                e.preventDefault();
                void reset();
              }}
            >
              {t("ops.cc.script.reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Preview({ doc, pageId, locale }: { doc: ScriptDoc; pageId: string | null; locale: ScriptLocale }) {
  const t = useT();
  const [cache, setCache] = useState<Record<string, PreviewValues | "error">>({});
  const asked = useRef(new Set<string>());
  const key = pairKey(pageId, locale);
  const entry = cache[key];
  useEffect(() => {
    // one request per (scope, language); undefined in the cache reads as loading
    if (asked.current.has(key)) return;
    asked.current.add(key);
    void settle<PreviewValues>(scriptPreviewAction({ pageId, locale })).then((res) => setCache((c) => ({ ...c, [key]: res.ok ? res.data : "error" })));
  }, [key, pageId, locale]);

  const compiled = useMemo((): CompiledScript | null => {
    if (!entry || entry === "error") return null;
    // a variable the order or sample has no value for shows its name in brackets, never an invented value; the upsell
    // pair stays empty so upsell-only steps appear exactly when an upsell is offered
    const values: Record<string, string> = { ...entry.values };
    for (const v of [...VAR_CHIPS, "units_text"] as const) if (v !== "upsell_title" && v !== "upsell_price" && !values[v]?.trim()) values[v] = `[${t(`ops.cc.script.var.${v}`)}]`;
    try {
      return compileScriptDoc(doc, values as typeof entry.values, previewRender, { locale, source: "store", templateId: "preview" });
    } catch {
      return null;
    }
  }, [doc, entry, locale, t]);

  return (
    <section aria-labelledby="cc-preview" className="grid gap-3 rounded-[18px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cc-preview" className="q-md font-semibold text-foreground">
          {t("ops.cc.script.preview")}
        </h2>
        {entry && entry !== "error" && (
          <span className={cn("q-2xs rounded-full px-2 py-0.5 font-medium", entry.source === "order" ? "bg-muted text-muted-foreground" : "cc-info border text-foreground")}>
            {entry.source === "order" ? t("ops.cc.script.previewOrder") : t("ops.cc.script.previewSample")}
          </span>
        )}
      </div>
      {entry === undefined ? (
        <div className="grid gap-2" aria-busy="true">
          <div className="adm-shimmer h-3 w-2/3 rounded-full" />
          <div className="adm-shimmer h-3 w-full rounded-full" />
          <div className="adm-shimmer h-3 w-5/6 rounded-full" />
        </div>
      ) : entry === "error" || !compiled ? (
        <p className="q-sm text-muted-foreground">{t("ops.error.generic")}</p>
      ) : (
        <>
          {entry.source !== "order" && <p className="q-xs text-muted-foreground">{t("ops.cc.script.previewSampleHint")}</p>}
          {compiled.steps.length === 0 ? (
            <p className="q-sm text-muted-foreground">{t("ops.cc.script.previewEmpty")}</p>
          ) : (
            <ol className="grid gap-3" dir={dirOf(locale)} lang={locale}>
              {compiled.steps.map((s, i) => (
                <li key={`${s.id}-${i}`} className="grid gap-1">
                  <span className="q-xs font-medium text-muted-foreground">
                    {i + 1}. {s.title}
                  </span>
                  <p className="q-sm leading-relaxed text-foreground">{s.text}</p>
                  {s.checks.filter(Boolean).length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {s.checks.filter(Boolean).map((c, ci) => (
                        <li key={ci} className="q-2xs inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          <CheckIcon className="size-3" aria-hidden="true" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          {compiled.objections.length > 0 && (
            <div className="grid gap-1.5 border-t border-border/70 pt-3" dir={dirOf(locale)} lang={locale}>
              <span className="q-2xs font-medium text-muted-foreground">{t("ops.script.objections")}</span>
              {compiled.objections.map((o) => (
                <p key={o.id} className="q-xs text-foreground">
                  <span className="font-medium">{t(`ops.script.obj.${o.id}`)}: </span>
                  {o.text}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Suggested({ drafts, canEdit, pageName }: { drafts: ScriptRowView[]; canEdit: boolean; pageName: (id: string | null) => string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  async function act(id: string, kind: "approve" | "discard") {
    setBusy(id);
    const res = await settle<{ id: string }>(kind === "approve" ? approveScriptDraftAction(id) : discardScriptDraftAction(id));
    setBusy(null);
    if (!res.ok) return void toast.error(t(errorKey(res.error)));
    toast.success(t(kind === "approve" ? "ops.cc.script.approved" : "ops.cc.script.discarded"));
    router.refresh();
  }
  return (
    <section aria-labelledby="cc-suggested" className="grid gap-3 rounded-[18px] border border-border bg-card p-4">
      <div className="grid gap-1">
        <h2 id="cc-suggested" className="q-md inline-flex items-center gap-1.5 font-semibold text-foreground">
          <SparklesIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("ops.cc.script.suggested")}
        </h2>
        <p className="q-xs text-muted-foreground">{t("ops.cc.script.suggestedHint")}</p>
      </div>
      {drafts.length === 0 ? (
        <p className="q-sm text-muted-foreground">{t("ops.cc.script.noSuggested")}</p>
      ) : (
        <ul className="grid gap-2">
          {drafts.map((d) => (
            <li key={d.id} className="grid gap-2 rounded-[12px] border border-border bg-background p-3">
              <button type="button" className="grid gap-0.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
                <span className="q-sm font-medium text-foreground">{pageName(d.pageId)}</span>
                <span className="q-xs text-muted-foreground">{t("ops.cc.script.stepsCount", { n: d.doc.steps.length })}</span>
              </button>
              {open === d.id && (
                <ol className="q-xs grid list-decimal gap-1 ps-5 text-muted-foreground" dir={dirOf(d.locale)}>
                  {d.doc.steps.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium text-foreground">{s.title}</span> {s.say}
                    </li>
                  ))}
                </ol>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="gap-1.5" disabled={busy === d.id} onClick={() => act(d.id, "approve")}>
                    {busy === d.id ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <CheckIcon className="size-4" aria-hidden="true" />}
                    {t("ops.cc.script.approve")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy === d.id} onClick={() => act(d.id, "discard")}>
                    {t("ops.cc.script.discard")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
