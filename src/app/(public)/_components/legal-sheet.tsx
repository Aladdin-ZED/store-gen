"use client";
/**
 * The legal acceptance of the sign-up forms (platform.md PLA-§22.1, §13.4): one checkbox whose sentence links the
 * three platform documents; each link opens the published text in a side sheet, so the visitor never leaves a
 * half-filled form. A document with no published version reads as plain text, never a link to nothing (owner rule 4). The texts are read on the server (`publishedPlatformDoc`) and passed in.
 */
import { useId, useState } from "react";
import { SheetCloseX } from "@/components/admin/common/sheet-close";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthT } from "@/lib/auth/i18n/client";
import { dirOf } from "@/lib/i18n/admin";
import { useAdminLocale } from "@/lib/i18n/admin/client";

/** Mirrors `PlatformDocKind` / `DocBlock` of src/lib/render/platform-docs.server.ts (a server-only module). */
type PlatformDocKind = "tos" | "privacy" | "aup";
type DocBlock = { kind: "h2" | "h3" | "p" | "li"; text: string };

export interface LegalDocView {
  kind: PlatformDocKind;
  title: string;
  version: number;
  /** the document's locale (it may be a fallback language) */
  locale: string;
  blocks: DocBlock[];
}

const PLACEHOLDER: Record<string, PlatformDocKind> = { terms: "tos", privacy: "privacy", aup: "aup" };
const LINK_KEY = { tos: "auth.signup.legal_terms", privacy: "auth.signup.legal_privacy", aup: "auth.signup.legal_aup" } as const;

export function LegalAcceptance({ docs, name = "acceptLegal", id: fixedId, error }: { docs: readonly LegalDocView[]; name?: string; /** a stable id for the checkbox (#signup-legal) */ id?: string; error?: string }) {
  const t = useAuthT();
  const locale = useAdminLocale();
  const autoId = useId();
  const id = fixedId ?? autoId;
  const [open, setOpen] = useState<LegalDocView | null>(null);
  const parts = t("auth.signup.legal").split(/\{(terms|privacy|aup)\}/);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-start gap-3">
        <Checkbox id={id} name={name} className="mt-0.5 size-5" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {parts.map((part, i) => {
            if (i % 2 === 0) return part ? <label key={i} htmlFor={id} className="cursor-pointer">{part}</label> : null;
            const kind = PLACEHOLDER[part]!;
            const doc = docs.find((d) => d.kind === kind);
            if (!doc) {
              return (
                <span key={i} className="text-foreground">
                  {t(LINK_KEY[kind])}
                </span>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => setOpen(doc)}
                className="rounded-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t(LINK_KEY[kind])}
              </button>
            );
          })}
        </p>
      </div>
      {error && (
        <p id={`${id}-error`} className="ps-8 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side={dirOf(locale) === "rtl" ? "left" : "right"} dir={dirOf(locale)} lang={locale} showCloseButton={false} className="w-full gap-0 sm:max-w-[560px]">
          <SheetCloseX />
          <SheetHeader className="gap-1.5 border-b border-border p-6 pe-14">
            <SheetTitle className="text-lg tracking-[-0.01em]">{open?.title}</SheetTitle>
            <SheetDescription className="sr-only">{open ? t(LINK_KEY[open.kind]) : ""}</SheetDescription>
          </SheetHeader>
          <div lang={open?.locale} dir={open?.locale === "ar" ? "rtl" : "ltr"} className="grid flex-1 content-start gap-3 overflow-y-auto overscroll-contain p-6 text-sm leading-relaxed text-pretty">
            {open?.blocks.map((b, i) =>
              b.kind === "h2" ? (
                <h3 key={i} className="mt-3 text-[0.95rem] font-semibold">
                  {b.text}
                </h3>
              ) : b.kind === "h3" ? (
                <h4 key={i} className="mt-2 font-semibold">
                  {b.text}
                </h4>
              ) : b.kind === "li" ? (
                <p key={i} className="flex gap-2 ps-1 text-muted-foreground">
                  <span aria-hidden="true">·</span>
                  <span>{b.text}</span>
                </p>
              ) : (
                <p key={i} className="text-muted-foreground">
                  {b.text}
                </p>
              ),
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
