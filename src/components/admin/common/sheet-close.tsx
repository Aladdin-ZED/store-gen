"use client";
/**
 * The close button of the shell's sheets and dialogs (P2 SHELL; design.md DES-§16.8 "Drawers / sheets": header with
 * title + close): at the inline-end corner in both directions, named in the viewer's locale, ≥ 44 px on touch. The UI
 * kit's built-in close sits at a physical corner with an English label, so the primitives turn it off and use this.
 */
import { XIcon } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export function SheetCloseX({ kind = "sheet", className }: { kind?: "sheet" | "dialog"; className?: string }) {
  const t = useT();
  const Close = kind === "sheet" ? SheetClose : DialogClose;
  return (
    <Close asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("shell.common.close")} className={cn("absolute top-3 end-3", FOCUS_RING, TOUCH, className)}>
        <XIcon aria-hidden="true" />
      </Button>
    </Close>
  );
}
