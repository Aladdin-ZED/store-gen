"use client";
/**
 * Connect → WhatsApp → Templates (operations.md OPE-§22.2, §22.3, OD24; IN-05): the click-to-chat texts per kind and
 * per language, and the store's quick replies.
 *
 * - The kinds of R1 (`shipped` waits for R2): each shows the store's text when someone edited it, else the built-in,
 *   the starting point (no row is ever seeded, never an empty table). The language tabs switch the slot; the Arabic
 *   editor is right-to-left.
 * - The editor (./template-editor.tsx): chips insert at the caret, parse errors inline at their position, 1,000
 *   characters. The preview renders the draft on a recent order (./template-preview.tsx).
 * - Save writes the store's override (`saveTemplateAction`); "Reset to built-in" (confirm) deletes it.
 * - Quick replies are `custom` rows: many, each with a name and a language; add, edit, delete (confirm).
 * Without `canWrite` (view as store) the texts are read-only.
 */
import { Loader2Icon, MessageSquarePlusIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteQuickReplyAction, resetTemplateAction, saveTemplateAction } from "@/app/app/[store]/integrations/whatsapp/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/admin/client";
import { TEMPLATE_VARS } from "@/lib/integrations/template-lang";
import type { TemplateLocale } from "@/lib/integrations/whatsapp/builtins";
import type { TemplatePreview as PreviewFacts } from "@/lib/integrations/whatsapp/screen.server";
import type { TemplateRowView } from "@/lib/integrations/whatsapp/templates.server";
import { cn } from "@/lib/utils";
import { InlineError } from "./hub-states";
import { IntConfirm } from "./int-confirm";
import { StateBadge } from "./state-badge";
import { TemplateEditor } from "./template-editor";
import { TemplatePreview } from "./template-preview";

const LOCALES = ["ar", "fr", "en"] as const satisfies readonly TemplateLocale[];
const QUICK = "custom";

export type BuiltinTexts = Record<string, Record<TemplateLocale, string>>;

type SaveError = { error: string; at?: number } | null;

function without(d: Record<string, string>, key: string): Record<string, string> {
  const next = { ...d };
  delete next[key];
  return next;
}

export function WhatsAppTemplates({
  kinds,
  builtins,
  rows: initialRows,
  preview,
  canWrite,
  defaultLocale,
}: {
  kinds: readonly string[];
  builtins: BuiltinTexts;
  rows: TemplateRowView[] | null;
  preview: PreviewFacts | null | "error";
  canWrite: boolean;
  defaultLocale: TemplateLocale;
}) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows ?? []);
  const [kind, setKind] = useState(kinds[0] ?? "confirm");
  const [locale, setLocale] = useState<TemplateLocale>(defaultLocale);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const slot = `${kind}:${locale}`;
  const row = rows.find((r) => r.kind === kind && r.locale === locale && r.pageId === null);
  const saved = row?.body ?? builtins[kind]?.[locale] ?? "";
  const draft = drafts[slot] ?? saved;
  const dirty = draft !== saved;
  const edited = (k: string, l: TemplateLocale) => rows.some((r) => r.kind === k && r.locale === l && r.pageId === null);
  const previewFacts = preview === "error" ? null : preview;

  if (initialRows === null) return <InlineError />;

  function edit(next: string) {
    setDrafts((d) => ({ ...d, [slot]: next }));
    setSaveError(null);
  }

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveTemplateAction({ channel: "whatsapp", kind, locale, pageId: null, name: row?.name ?? t(`int.wae.kind.${kind}`), body: draft });
      if (!res.ok) return void toast.error(t(res.message ?? `error.${res.error}`));
      if (!res.data.ok) {
        if (res.data.field === "body" && res.data.error !== "invalid") return setSaveError({ error: res.data.error, at: res.data.at });
        return void toast.error(t(`int.wae.err.${res.data.error}`));
      }
      const id = res.data.id;
      setRows((rs) => [...rs.filter((r) => r.id !== id), { ...(row ?? { channel: "whatsapp", kind, locale, pageId: null, status: "active", source: "user", promptVersion: null, position: 0, updatedBy: null }), id, name: row?.name ?? t(`int.wae.kind.${kind}`), body: draft, updatedAt: new Date().toISOString() } as TemplateRowView]);
      setDrafts((d) => without(d, slot));
      toast.success(t("int.wae.saved"));
      router.refresh();
    } catch {
      toast.error(t("int.sheets.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section aria-labelledby="wa-tpl-title" className="adm-surface grid gap-5 p-4 sm:p-6">
        <header className="grid max-w-[64ch] gap-1">
          <h2 id="wa-tpl-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
            {t("int.wae.title")}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.wae.lead")}</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* the kinds: a scrolling row on a phone, a list beside the editor on a wide screen */}
          <nav aria-label={t("int.wae.kinds")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {kinds.map((k) => {
              const on = k === kind;
              const any = LOCALES.some((l) => edited(k, l));
              return (
                <button
                  key={k}
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={() => {
                    setKind(k);
                    setSaveError(null);
                  }}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-xl px-3 text-start text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:min-h-9",
                    on ? "bg-foreground/[0.06] font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
                  )}
                >
                  <span className="whitespace-nowrap">{t(`int.wae.kind.${k}`)}</span>
                  {any && <span aria-label={t("int.wae.edited")} className="size-1.5 shrink-0 rounded-full bg-foreground/50" />}
                </button>
              );
            })}
          </nav>

          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label={t("int.wae.languages")} className="inline-flex rounded-xl bg-foreground/[0.04] p-1">
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={l === locale}
                    onClick={() => {
                      setLocale(l);
                      setSaveError(null);
                    }}
                    className={cn(
                      "relative flex h-11 min-w-16 items-center justify-center gap-1.5 rounded-lg px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-8",
                      l === locale ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`int.wae.lang.${l}`)}
                    {drafts[`${kind}:${l}`] !== undefined && drafts[`${kind}:${l}`] !== (rows.find((r) => r.kind === kind && r.locale === l && r.pageId === null)?.body ?? builtins[kind]?.[l]) && (
                      <span aria-label={t("int.wae.unsaved")} className="size-1.5 rounded-full bg-foreground/60" />
                    )}
                  </button>
                ))}
              </div>
              <StateBadge tone={row ? "success" : "neutral"}>{t(row ? "int.wae.edited" : "int.wae.builtin")}</StateBadge>
            </div>
            <p className="text-xs text-pretty text-muted-foreground">{t(`int.wae.kind.${kind}.help`)}</p>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
              <TemplateEditor
                key={slot}
                value={draft}
                onChange={edit}
                vars={TEMPLATE_VARS}
                label={t("int.wae.text")}
                dir={locale === "ar" ? "rtl" : "ltr"}
                lang={locale}
                serverError={saveError}
                disabled={!canWrite}
              />
              <TemplatePreview
                source={draft}
                values={previewFacts?.values[locale] ?? null}
                phone={previewFacts?.phone ?? null}
                orderId={previewFacts?.orderId ?? null}
                dir={locale === "ar" ? "rtl" : "ltr"}
                lang={locale}
                className="content-start"
              />
            </div>
            {preview === "error" && <InlineError text={t("int.wae.preview.error")} />}

            {canWrite && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.06] pt-4">
                <div>
                  {row && (
                    <Button variant="ghost" className="h-11 px-3 sm:h-8" disabled={saving} onClick={() => setConfirmReset(true)}>
                      <RotateCcwIcon aria-hidden="true" />
                      {t("int.wae.reset")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {dirty && (
                    <Button variant="ghost" className="h-11 px-3 sm:h-8" disabled={saving} onClick={() => edit(saved)}>
                      {t("int.px.discard")}
                    </Button>
                  )}
                  <Button variant="brand" className="h-11 px-4 sm:h-8" disabled={saving || !dirty || !draft.trim()} onClick={() => void save()}>
                    {saving && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                    {t("int.wae.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <QuickReplies
        rows={rows.filter((r) => r.kind === QUICK)}
        values={previewFacts?.values ?? null}
        canWrite={canWrite}
        defaultLocale={defaultLocale}
        onChange={(next, removed) => setRows((rs) => [...rs.filter((r) => r.id !== removed && r.id !== next?.id), ...(next ? [next] : [])])}
      />

      <IntConfirm
        open={confirmReset}
        onOpenChange={setConfirmReset}
        destructive
        icon={<RotateCcwIcon className="size-5" />}
        title={t("int.wae.reset.title")}
        body={t("int.wae.reset.body")}
        confirmLabel={t("int.wae.reset")}
        onConfirm={async () => {
          try {
            const res = await resetTemplateAction({ channel: "whatsapp", kind, locale, pageId: null });
            if (!res.ok) {
              toast.error(t(res.message ?? `error.${res.error}`));
              return false;
            }
            setRows((rs) => rs.filter((r) => !(r.kind === kind && r.locale === locale && r.pageId === null)));
            setDrafts((d) => without(d, slot));
            setSaveError(null);
            toast.success(t("int.wae.reset.done"));
            router.refresh();
            return true;
          } catch {
            toast.error(t("int.sheets.network"));
            return false;
          }
        }}
      />
    </div>
  );
}

/** The quick replies: `custom` rows, each with its own name and language. */
function QuickReplies({
  rows,
  values,
  canWrite,
  defaultLocale,
  onChange,
}: {
  rows: TemplateRowView[];
  values: PreviewFacts["values"] | null;
  canWrite: boolean;
  defaultLocale: TemplateLocale;
  onChange: (next: TemplateRowView | null, removedId: string | null) => void;
}) {
  const t = useT();
  const nameId = useId();
  const [open, setOpen] = useState<null | { id: string | null; name: string; body: string; locale: TemplateLocale }>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError>(null);
  const [removing, setRemoving] = useState<TemplateRowView | null>(null);
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.locale + a.name < b.locale + b.name ? -1 : a.locale + a.name > b.locale + b.name ? 1 : 0)), [rows]);

  async function save() {
    if (!open || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveTemplateAction({ channel: "whatsapp", kind: QUICK, locale: open.locale, pageId: null, name: open.name, body: open.body, ...(open.id ? { id: open.id } : {}) });
      if (!res.ok) return void toast.error(t(res.message ?? `error.${res.error}`));
      if (!res.data.ok) {
        if (res.data.field === "body" && res.data.error !== "invalid") return setError({ error: res.data.error, at: res.data.at });
        return void toast.error(t(res.data.field === "name" ? "int.wae.err.name" : `int.wae.err.${res.data.error}`));
      }
      onChange(
        { id: res.data.id, channel: "whatsapp", kind: QUICK, locale: open.locale, pageId: null, name: open.name.trim(), body: open.body, status: "active", source: "user", promptVersion: null, position: 0, updatedBy: null, updatedAt: new Date().toISOString() },
        null,
      );
      setOpen(null);
      toast.success(t("int.wae.saved"));
    } catch {
      toast.error(t("int.sheets.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="wa-quick-title" className="adm-surface grid gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-[60ch] gap-1">
          <h2 id="wa-quick-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
            {t("int.wae.quick.title")}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.wae.quick.lead")}</p>
        </div>
        {canWrite && !open && (
          <Button variant="outline" className="h-11 px-3 sm:h-8" onClick={() => setOpen({ id: null, name: "", body: "", locale: defaultLocale })}>
            <MessageSquarePlusIcon aria-hidden="true" />
            {t("int.wae.quick.add")}
          </Button>
        )}
      </header>

      {sorted.length === 0 && !open ? (
        <p className="rounded-2xl bg-foreground/[0.025] px-4 py-3.5 text-sm text-pretty text-muted-foreground ring-1 ring-foreground/[0.05] ring-inset">{t("int.wae.quick.empty")}</p>
      ) : (
        sorted.length > 0 && (
          <ul className="grid divide-y divide-foreground/[0.06] rounded-2xl ring-1 ring-foreground/[0.06] ring-inset">
            {sorted.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{r.name}</span>
                    <span className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground uppercase">{r.locale}</span>
                  </span>
                  <p dir={r.locale === "ar" ? "rtl" : "ltr"} lang={r.locale} className="line-clamp-2 text-xs text-pretty text-muted-foreground">
                    {r.body}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="size-11 sm:size-8" aria-label={t("int.wae.quick.edit", { name: r.name })} onClick={() => setOpen({ id: r.id, name: r.name, body: r.body, locale: r.locale })}>
                      <PencilIcon aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:size-8" aria-label={t("int.wae.quick.delete", { name: r.name })} onClick={() => setRemoving(r)}>
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {open && (
        <div className="grid gap-4 rounded-2xl bg-foreground/[0.02] p-4 ring-1 ring-foreground/[0.06] ring-inset">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium">
                {t("int.wae.quick.name")}
              </label>
              <Input id={nameId} value={open.name} maxLength={80} onChange={(e) => setOpen({ ...open, name: e.target.value })} className="h-11 sm:h-9" placeholder={t("int.wae.quick.namePh")} />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t("int.wae.languages")}</span>
              <div role="radiogroup" aria-label={t("int.wae.languages")} className="inline-flex rounded-xl bg-foreground/[0.04] p-1">
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={open.locale === l}
                    onClick={() => setOpen({ ...open, locale: l })}
                    className={cn(
                      "flex h-11 min-w-14 items-center justify-center rounded-lg px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-7",
                      open.locale === l ? "bg-background font-medium shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`int.wae.lang.${l}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <TemplateEditor
              value={open.body}
              onChange={(body) => {
                setOpen({ ...open, body });
                setError(null);
              }}
              vars={TEMPLATE_VARS}
              label={t("int.wae.text")}
              dir={open.locale === "ar" ? "rtl" : "ltr"}
              lang={open.locale}
              serverError={error}
              rows={4}
            />
            <TemplatePreview source={open.body} values={values?.[open.locale] ?? null} phone={null} orderId={null} dir={open.locale === "ar" ? "rtl" : "ltr"} lang={open.locale} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" className="h-11 px-3 sm:h-8" disabled={saving} onClick={() => setOpen(null)}>
              {t("int.sheets.cancel")}
            </Button>
            <Button variant="brand" className="h-11 px-4 sm:h-8" disabled={saving || !open.name.trim() || !open.body.trim()} onClick={() => void save()}>
              {saving && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {t("int.wae.save")}
            </Button>
          </div>
        </div>
      )}

      <IntConfirm
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        destructive
        icon={<Trash2Icon className="size-5" />}
        title={t("int.wae.quick.delete.title")}
        body={t("int.wae.quick.delete.body", { name: removing?.name ?? "" })}
        confirmLabel={t("int.wae.quick.delete.action")}
        onConfirm={async () => {
          if (!removing) return true;
          try {
            const res = await deleteQuickReplyAction(removing.id);
            if (!res.ok) {
              toast.error(t(res.message ?? `error.${res.error}`));
              return false;
            }
            onChange(null, removing.id);
            toast.success(t("int.wae.quick.deleted"));
            return true;
          } catch {
            toast.error(t("int.sheets.network"));
            return false;
          }
        }}
      />
    </section>
  );
}
