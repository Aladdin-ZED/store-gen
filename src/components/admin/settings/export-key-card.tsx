"use client";
/**
 * The store's Google export key (EXP-03): the only key a PHP export may carry. Write-only — once saved, the key is
 * never shown again; the card names the account and key id, which is what to delete in Google Cloud if a ZIP leaks.
 */
import { KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { saveExportKeyAction, deleteExportKeyAction } from "@/app/admin/(panel)/settings/sheets/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExportKeyInfo } from "@/lib/export/service-account";
import { ConfirmDialog } from "../common/confirm-dialog";
import { StatusChip } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { runAction } from "../lib/action-result";
import { SettingsSection } from "./form-kit";

export function ExportKeyCard({ initial }: { initial: ExportKeyInfo }) {
  const [info, setInfo] = useState(initial);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const next = await runAction(saveExportKeyAction(raw), { success: "Export key saved — PHP exports can now include it" });
    setSaving(false);
    if (next) {
      setInfo(next);
      setRaw("");
      setReplacing(false);
    }
  };

  const showForm = !info.set || replacing;

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" /> Key for PHP exports
        </span>
      }
      description="Optional. A PHP export can write its orders to your sheet by itself, with a Google key of its own. Use a second service account created only for this, shared as Editor with your sheet: if a ZIP ever leaks, you delete that key in Google Cloud and nothing else stops."
      aside={<StatusChip tone={info.set ? "emerald" : "neutral"}>{info.set ? "Key saved" : "No key"}</StatusChip>}
      style={{ ["--i" as string]: 3 }}
    >
      {info.set && (
        <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset sm:flex-row sm:items-center sm:justify-between">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-mono text-[0.8rem]">{info.email}</span>
            <span className="text-xs text-muted-foreground">
              {info.keyId ? (
                <>
                  Key id <span className="font-mono">{info.keyId.slice(0, 12)}…</span>
                </>
              ) : (
                "Key saved"
              )}
              {info.setAt && (
                <>
                  {" · "}saved <RelativeTime iso={info.setAt} />
                </>
              )}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            {!replacing && (
              <Button variant="ghost" className="rounded-full" onClick={() => setReplacing(true)}>
                Replace
              </Button>
            )}
            <Button variant="ghost" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon /> Remove
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="grid grid-cols-1 gap-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            placeholder={'{ "type": "service_account", "client_email": "…", "private_key": "-----BEGIN PRIVATE KEY-----…" }'}
            aria-label="Service-account key (JSON)"
            className="min-h-28 font-mono text-[0.75rem]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="rounded-xl px-5" disabled={saving || !raw.trim()}>
              {saving ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
              {saving ? "Saving…" : "Save key"}
            </Button>
            {replacing && (
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => setReplacing(false)}>
                Cancel
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Paste the whole JSON file. It is stored encrypted and never shown again.</span>
          </div>
        </form>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirmDelete(false)}
          destructive
          icon={<Trash2Icon />}
          title="Remove the export key?"
          description="New PHP exports won't include it. Exports you already made keep their copy: delete the key in Google Cloud to stop them."
          confirmLabel="Remove"
          pendingLabel="Removing…"
          onConfirm={async () => {
            const next = await runAction(deleteExportKeyAction(), { success: "Export key removed" });
            if (!next) return false;
            setInfo(next);
            setReplacing(false);
            return true;
          }}
        />
      )}
    </SettingsSection>
  );
}
