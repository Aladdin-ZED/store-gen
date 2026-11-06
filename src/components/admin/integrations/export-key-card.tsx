"use client";
/**
 * The store's Google key for PHP exports (EXP-03, OPE-§19.8 "the export key card below"): write-only. Set shows the
 * service account and the key id (what to delete in Google Cloud if a ZIP leaks), never the key; not set shows the
 * field (its label above). Saving is a secret write: a `step_up` answer opens the step-up sheet and the save runs
 * once more. Remove sits behind a confirm. Without `canWrite` (view as store) only the state shows.
 */
import { KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { deleteExportKeyAction, saveExportKeyAction } from "@/app/app/[store]/integrations/sheets/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExportKeyInfo } from "@/lib/export/service-account";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { useStoreStepUp } from "../shell/step-up";
import { relTime } from "./hub-format";
import { InlineError, useNow } from "./hub-states";
import { IntConfirm } from "./int-confirm";
import { StateBadge } from "./state-badge";

/** A refusal of either answer shape (the action itself, or `stepUp.action` around it). */
type Refusal = { ok: false; error: string; message?: string };

export function ExportKeyCard({ initial, canWrite, now: serverNow }: { initial: ExportKeyInfo | null; canWrite: boolean; now: number }) {
  const t = useT();
  const locale = useAdminLocale();
  const now = useNow(serverNow);
  const stepUp = useStoreStepUp();
  const fieldId = useId();
  const [info, setInfo] = useState(initial);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const words = (res: Refusal) => (res.error === "step_up" ? t("int.sheets.stepUpNeeded") : t(res.message ?? `error.${res.error}`));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !raw.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await stepUp.action(() => saveExportKeyAction(raw));
      if (!res.ok) return setError(words(res));
      setInfo(res.data);
      setRaw("");
      setReplacing(false);
      toast.success(t("int.sheets.key.saved"));
    } catch {
      setError(t("int.sheets.network"));
    } finally {
      setSaving(false);
    }
  }

  const set = !!info?.set;
  const showForm = canWrite && (!set || replacing);

  return (
    <section aria-labelledby="sheets-key-title" className="adm-surface grid gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[64ch] gap-1">
          <h2 id="sheets-key-title" className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
            <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("int.sheets.key.title")}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.sheets.key.lead")}</p>
        </div>
        {info && <StateBadge tone={set ? "success" : "neutral"}>{t(set ? "int.sheets.key.set" : "int.sheets.key.notSet")}</StateBadge>}
      </header>

      {info === null ? (
        <InlineError />
      ) : (
        <>
          {set && (
            <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset sm:flex-row sm:items-center sm:justify-between">
              <div className="grid min-w-0 gap-0.5">
                {info.email && (
                  <bdi dir="ltr" className="truncate text-start font-mono text-[0.8rem]">
                    {info.email}
                  </bdi>
                )}
                <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {info.keyId ? t("int.sheets.key.id", { id: `${info.keyId.slice(0, 12)}…` }) : t("int.sheets.key.set")}
                  {info.setAt && ` · ${t("int.sheets.key.savedAgo", { ago: relTime(info.setAt, locale, now) })}`}
                </span>
              </div>
              {canWrite && (
                <div className="flex shrink-0 gap-2">
                  {!replacing && (
                    <Button variant="ghost" className="h-11 px-3 sm:h-8" onClick={() => setReplacing(true)}>
                      {t("int.sheets.key.replace")}
                    </Button>
                  )}
                  <Button variant="ghost" className="h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8" onClick={() => setConfirmRemove(true)}>
                    <Trash2Icon aria-hidden="true" />
                    {t("int.sheets.key.remove")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {showForm && (
            <form onSubmit={save} className="grid gap-2.5">
              <label htmlFor={fieldId} className="text-sm font-medium">
                {t("int.sheets.key.label")}
              </label>
              <Textarea
                id={fieldId}
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setError(null);
                }}
                rows={5}
                dir="ltr"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!!error}
                aria-describedby={`${fieldId}-help`}
                placeholder={'{ "type": "service_account", "client_email": "…", "private_key": "…" }'}
                className="min-h-28 font-mono text-[0.75rem]"
              />
              <p id={`${fieldId}-help`} className="text-xs text-pretty text-muted-foreground">
                {t("int.sheets.key.help")}
              </p>
              {error && (
                <p role="alert" className="rounded-xl bg-destructive/[0.06] px-3.5 py-2.5 text-sm text-pretty text-destructive ring-1 ring-destructive/15 ring-inset">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="outline" className="h-11 px-4 sm:h-8" disabled={saving || !raw.trim()}>
                  {saving ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <KeyRoundIcon aria-hidden="true" />}
                  {t("int.sheets.key.save")}
                </Button>
                {replacing && (
                  <Button type="button" variant="ghost" className="h-11 px-3 sm:h-8" onClick={() => setReplacing(false)}>
                    {t("int.sheets.cancel")}
                  </Button>
                )}
              </div>
            </form>
          )}
        </>
      )}

      <IntConfirm
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        destructive
        icon={<Trash2Icon className="size-5" />}
        title={t("int.sheets.key.remove.title")}
        body={t("int.sheets.key.remove.body")}
        confirmLabel={t("int.sheets.key.remove")}
        onConfirm={async () => {
          try {
            const res = await deleteExportKeyAction();
            if (!res.ok) {
              toast.error(words(res));
              return false;
            }
            setInfo(res.data);
            setReplacing(false);
            toast.success(t("int.sheets.key.removed"));
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
