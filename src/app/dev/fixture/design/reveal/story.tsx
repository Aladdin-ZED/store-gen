"use client";
/**
 * The reveal fixture's client half (DES-§15.6): the admin i18n provider, the direction and the theme of the story,
 * the fixture photos through `RevealAssets`, and the four states (store mode shows the PDP placeholder line above
 * the same folds until storefront's PDP drafts exist, R2).
 */
import { useEffect, useState } from "react";
import { RevealAssets, RevealFolds, type RevealDirections } from "@/components/generate/reveal/RevealFolds";
import { setRevealStatus } from "@/components/generate/reveal/status";
import type { PreviewAssets } from "@/components/preview";
import { AdminI18nProvider, useT } from "@/lib/i18n/admin/client";

export type StoryState = "analysing" | "revealed" | "error" | "store";

export function RevealStory({ lang, dark, state, directions, assets }: { lang: "ar" | "fr" | "en"; dark: boolean; state: StoryState; directions: RevealDirections; assets: PreviewAssets }) {
  const [used, setUsed] = useState<string | null>(null);
  useEffect(() => {
    setRevealStatus({ step: state === "analysing" ? "type" : null, novelty: "checked" });
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [state, dark, lang]);
  return (
    <AdminI18nProvider locale={lang}>
      <RevealAssets.Provider value={assets}>
        <main className="min-h-dvh bg-background px-4 py-6 text-foreground lg:px-10 lg:py-10" dir={lang === "ar" ? "rtl" : "ltr"}>
          <div className="mx-auto grid max-w-[1400px] gap-5">
            <Header state={state} used={used} />
            {state === "analysing" ? (
              <RevealFolds state="analysing" directions={null} onUse={setUsed} />
            ) : state === "error" ? (
              <RevealFolds state="error" directions={null} onUse={setUsed} onRetry={() => setUsed(null)} />
            ) : (
              <RevealFolds state="revealed" directions={directions} onUse={setUsed} />
            )}
          </div>
        </main>
      </RevealAssets.Provider>
    </AdminI18nProvider>
  );
}

function Header({ state, used }: { state: StoryState; used: string | null }) {
  const t = useT();
  return (
    <header className="grid gap-1">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("design.reveal.dots")}</h1>
      {state === "store" ? <p className="text-[0.85rem] text-muted-foreground">{t("design.reveal.store")}</p> : null}
      {used ? <p className="font-mono text-xs text-muted-foreground">{used}</p> : null}
    </header>
  );
}
