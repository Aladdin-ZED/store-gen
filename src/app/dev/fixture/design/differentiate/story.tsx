"use client";
/** The differentiate fixture's client half (DES-§15.6): `DifferentiateView` per state at the panel's 320 px. */
import { useEffect } from "react";
import "@/components/builder/builder.css";
import { DifferentiateView, type DiffState } from "@/components/builder/design/Differentiate";
import type { PreviewAssets } from "@/components/preview";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";

type Found = Extract<DiffState, { kind: "found" }>["candidate"];

export function DiffStory({ lang, dark, before, found, pairing, colour, assets }: { lang: "ar" | "fr" | "en"; dark: boolean; before: PageDoc; found: Found | null; pairing: PageDoc | null; colour: PageDoc | null; assets: PreviewAssets }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [dark, lang]);
  const states: { id: string; state: DiffState }[] = [
    { id: "close", state: found ? { kind: "found", candidate: found } : { kind: "none", pairing, colour } },
    { id: "too_close", state: { kind: "clone" } },
    { id: "no seed found", state: { kind: "none", pairing, colour } },
    { id: "searching", state: { kind: "searching" } },
  ];
  return (
    <AdminI18nProvider locale={lang}>
      <main className="bld-root min-h-dvh bg-background text-foreground" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="flex flex-wrap items-start gap-4 p-4 lg:p-6">
          {states.map((s) => (
            <figure key={s.id} className="grid w-full max-w-[320px] gap-2">
              <figcaption className="font-mono text-[11px] text-muted-foreground">{s.id}</figcaption>
              <div className="bld-panel rounded-xl border border-[var(--bld-hairline)] pb-4 pt-2">
                <DifferentiateView state={s.state} before={before} assets={assets} onApply={() => undefined} onPhoto={() => undefined} onRemix={() => undefined} />
              </div>
            </figure>
          ))}
        </div>
      </main>
    </AdminI18nProvider>
  );
}
