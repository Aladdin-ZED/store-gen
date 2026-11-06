"use client";

import { LockKeyholeIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";

/** The landing settings screens' read-only line (a member who can read the settings but not change them). */
export function ReadOnly() {
  const t = useT();
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-foreground/[0.035] px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/[0.06] ring-inset">
      <LockKeyholeIcon aria-hidden="true" className="size-4 shrink-0" />
      {t("landing.common.readOnly")}
    </p>
  );
}

/** A field label with the quiet "Optional" mark in the viewer's language (the settings kit's own mark is English only). */
export function opt(t: (k: string, v?: Record<string, string | number>) => string, label: ReactNode): ReactNode {
  return (
    <>
      {label} <span className="font-normal text-muted-foreground">{t("landing.common.optional")}</span>
    </>
  );
}
