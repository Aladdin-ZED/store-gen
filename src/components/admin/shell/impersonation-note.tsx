"use client";
/**
 * The ribbon's Note composer (P2 SHELL; platform.md PLA-§10.2, PD69): a one-line note for the store's file in the
 * console, through P1's `addImpersonationNoteAction` (staff only; it never writes a tenant row). Split from
 * ./impersonation-ribbon.tsx and loaded on demand, so only a "view as store" session loads the console's action.
 */
import { NotebookPenIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { addImpersonationNoteAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

export const NOTE_MAX = 300;

/** The ribbon's own focus ring and ghost control (the ink on the violet). */
const RING = "outline-none focus-visible:ring-2 focus-visible:ring-imp-ink focus-visible:ring-offset-2 focus-visible:ring-offset-imp-bg";
const HIT = "max-md:after:absolute max-md:after:-inset-x-1 max-md:after:top-1/2 max-md:after:h-11 max-md:after:-translate-y-1/2 max-md:after:content-['']";
const GHOST = cn("relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--r-control)] px-2 text-xs font-medium text-imp-ink hover:bg-imp-ink/12", RING, HIT);

export function NoteComposer({ storeId }: { storeId: string }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const value = text.trim();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={GHOST}>
        <NotebookPenIcon aria-hidden="true" className="size-3.5" />
        <span className="max-sm:sr-only">{t("shell.impersonation.note")}</span>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 rounded-[var(--r-sheet)] p-4">
        <form
          className="grid gap-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!value || busy) return;
            setBusy(true);
            try {
              const res = await addImpersonationNoteAction({ storeId, text: value });
              if (res.ok) {
                toast.success(t("shell.impersonation.note_saved"));
                setText("");
                setOpen(false);
              } else {
                toast.error(t("shell.err.generic", { ref: res.error }));
              }
            } catch {
              toast.error(t("shell.err.offline"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor={id} className="text-[13px] font-medium">
            {t("shell.impersonation.note_label")}
          </label>
          <Textarea id={id} rows={3} maxLength={NOTE_MAX} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-hint`} />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t("shell.impersonation.note_hint")}
          </p>
          <button
            type="submit"
            disabled={!value || busy}
            className="inline-flex h-8 items-center justify-center justify-self-end rounded-[var(--r-control)] bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("shell.impersonation.note_save")}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
