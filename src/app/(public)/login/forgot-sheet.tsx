"use client";
/**
 * "Forgot password?" on /login (platform.md PLA-§22.1, R1): a sheet that says who can send a reset link (the store
 * owner or the platform's support) with the support WhatsApp button when one is set. R2 replaces it with the
 * self-service form (IN-08).
 */
import { KeyRoundIcon, MessageCircleIcon } from "lucide-react";
import { useState } from "react";
import { waHref } from "@/components/admin/common/primitive-logic";
import { SheetCloseX } from "@/components/admin/common/sheet-close";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthT } from "@/lib/auth/i18n/client";
import { dirOf } from "@/lib/i18n/admin";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "../_components/control";

export function ForgotPassword({ supportWhatsapp }: { supportWhatsapp: string | null }) {
  const t = useAuthT();
  const locale = useAdminLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-my-2 rounded-sm py-2 text-[13px] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("auth.login.forgot")}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" dir={dirOf(locale)} lang={locale} showCloseButton={false} className="mx-auto w-full max-w-[30rem] gap-0 rounded-t-[var(--r-card)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetCloseX />
          <SheetHeader className="gap-3 p-6 pe-14">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-[var(--r-control)] bg-muted text-muted-foreground">
              <KeyRoundIcon className="size-5" />
            </span>
            <SheetTitle className="text-lg tracking-[-0.01em]">{t("auth.forgot.title")}</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed text-pretty">{t("auth.forgot.r1")}</SheetDescription>
          </SheetHeader>
          {supportWhatsapp && (
            <div className="px-6">
              <a
                href={waHref("", supportWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  CONTROL_CLASS,
                  "inline-flex w-full items-center justify-center gap-2 rounded-[var(--r-control)] bg-brand px-4 font-medium text-brand-foreground transition-[filter] duration-150 outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              >
                <MessageCircleIcon aria-hidden="true" className="size-4" />
                {t("auth.forgot.whatsapp")}
              </a>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
