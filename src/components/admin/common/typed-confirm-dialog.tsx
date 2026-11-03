"use client";
/**
 * TypedConfirmDialog (P2 SHELL; platform.md PLA-§22.12, §8, §22.11, PD1, PD54): the confirmation of an irreversible or
 * high-impact action that unlocks only when `expected` (the store handle, a localised word such as "delete" /
 * "supprimer" / "حذف" the caller passes) is typed exactly. Focus is trapped, Escape and Cancel close it except while
 * `onConfirm` runs; the typed text starts empty at every opening. The confirm button is crimson for `danger`, ink for
 * `warn` (DES-§16.8: destructive = crimson, confirm for irreversible).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). The dialog closes itself only through `onClose`:
 * the caller closes it after a successful `onConfirm` (a refusal keeps it open with the typed text).
 */
import { Loader2Icon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { TOUCH } from "./ui-classes";

export interface TypedConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  expected: string;
  confirmLabel: string;
  tone: "danger" | "warn";
  onConfirm(): Promise<void>;
  onClose(): void;
}

export function TypedConfirmDialog(p: TypedConfirmDialogProps): ReactElement | null {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={p.open} onOpenChange={(o) => !o && !busy && p.onClose()}>
      {/* remounted per opening, so the typed text always starts empty */}
      {p.open && <Body {...p} busy={busy} setBusy={setBusy} />}
    </AlertDialog>
  );
}

function Body(p: TypedConfirmDialogProps & { busy: boolean; setBusy(b: boolean): void }) {
  const t = useT();
  const inputId = useId();
  const hintId = useId();
  const [typed, setTyped] = useState("");
  const match = typed.trim() === p.expected;
  const danger = p.tone === "danger";
  const Icon = danger ? OctagonAlertIcon : TriangleAlertIcon;
  const confirm = async () => {
    if (!match || p.busy) return;
    p.setBusy(true);
    try {
      await p.onConfirm();
    } finally {
      p.setBusy(false);
    }
  };
  return (
    <AlertDialogContent className="gap-5 rounded-[var(--r-sheet)] p-6 data-[size=default]:sm:max-w-md">
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void confirm();
        }}
      >
        <AlertDialogHeader className="gap-2">
          <AlertDialogMedia className={cn("size-10 rounded-[var(--r-control)]", danger ? "bg-destructive-soft text-destructive-ink" : "bg-warn-soft text-warn-ink")}>
            <Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-base font-semibold tracking-[-0.006em]">{p.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm leading-relaxed text-pretty text-muted-foreground">{p.body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor={inputId} className="text-[13px] font-medium">
            {t("shell.confirm.type", { expected: "⁨" + p.expected + "⁩" })}
          </label>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            disabled={p.busy}
            aria-describedby={hintId}
            aria-invalid={typed.length > 0 && !match ? true : undefined}
            onChange={(e) => setTyped(e.target.value)}
            className={cn("h-9 font-mono", TOUCH)}
          />
          <p id={hintId} aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
            {typed.length > 0 && !match ? t("shell.confirm.mismatch") : ""}
          </p>
        </div>
        <AlertDialogFooter className="gap-2">
          <Button type="button" variant="ghost" className={TOUCH} disabled={p.busy} onClick={p.onClose}>
            {t("shell.common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!match || p.busy}
            aria-busy={p.busy || undefined}
            className={cn(TOUCH, danger ? "bg-destructive text-white hover:bg-destructive/90" : "")}
          >
            {p.busy && <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {p.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  );
}
