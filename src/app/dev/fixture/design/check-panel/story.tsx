"use client";
/**
 * The check-panel fixture's client half (DES-§15.6): the panel view in its rail (360 px at ≥ 1280, 320 below) per
 * state, or the 70 % bottom sheet at 390 (`sheet`). Fix and Ignore act on the story's own copy of the rows.
 */
import { useEffect, useState } from "react";
import "@/components/builder/builder.css";
import { CheckView } from "@/components/builder/design/CheckView";
import type { PanelBands, PanelModel } from "@/lib/design/panel";
import { AdminI18nProvider, useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";

export interface PanelState {
  id: "issues" | "clean" | "stale" | "unavailable" | "checking";
  model: PanelModel | null;
  status: "checking" | "ready" | "stale";
  novelty: { status: "idle" | "loading" | "ready" | "unavailable"; bands: PanelBands | null };
  doc: PageDoc;
}

export function CheckPanelStory({ lang, dark, sheet, states }: { lang: "ar" | "fr" | "en"; dark: boolean; sheet: boolean; states: PanelState[] }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [dark, lang]);
  return (
    <AdminI18nProvider locale={lang}>
      <main className="bld-root min-h-dvh bg-background text-foreground" dir={lang === "ar" ? "rtl" : "ltr"}>
        {sheet ? (
          <div className="relative h-dvh overflow-hidden bg-muted/50">
            <div className="bld-panel absolute inset-x-0 bottom-0 h-[70dvh] overflow-hidden rounded-t-2xl border-t border-[var(--bld-hairline)] shadow-[0_-16px_48px_-24px_rgb(0_0_0/0.4)]">
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-foreground/15" aria-hidden="true" />
              <Panel state={states[0]!} touch />
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto p-4 lg:p-6">
            {states.map((s) => (
              <figure key={s.id} className="grid shrink-0 gap-2">
                <figcaption className="font-mono text-[11px] text-muted-foreground">{s.id}</figcaption>
                <div className="bld-panel h-[820px] w-[320px] overflow-hidden rounded-xl border border-[var(--bld-hairline)] xl:w-[360px]">
                  <Panel state={s} />
                </div>
              </figure>
            ))}
          </div>
        )}
      </main>
    </AdminI18nProvider>
  );
}

function Panel({ state, touch }: { state: PanelState; touch?: boolean }) {
  const t = useT();
  const [model, setModel] = useState(state.model);
  const [ignored, setIgnored] = useState(0);
  const drop = (key: string) =>
    setModel((m) => (m ? { ...m, groups: { blocking: m.groups.blocking.filter((r) => r.key !== key), improve: m.groups.improve.filter((r) => r.key !== key), copy: m.groups.copy.filter((r) => r.key !== key), uniqueness: m.groups.uniqueness.filter((r) => r.key !== key) } } : m));
  const word = (id: string) => state.doc.sections.find((s) => s.id === id)?.type ?? null;
  return (
    <CheckView
      status={state.status}
      skeleton={state.status === "checking"}
      model={model}
      novelty={state.novelty}
      sectionWord={word}
      onFix={(item) => drop(item.key)}
      onFixAll={() => setModel((m) => (m ? { ...m, groups: { ...m.groups, blocking: [] }, blocking: 0 } : m))}
      onIgnore={(item) => {
        drop(item.key);
        setIgnored((n) => n + 1);
      }}
      onSection={() => undefined}
      onGoto={() => undefined}
      ignoredCount={ignored}
      onRestoreIgnored={() => {
        setModel(state.model);
        setIgnored(0);
      }}
      touch={touch}
      headerEnd={<span className="sr-only">{t("design.check.title")}</span>}
    />
  );
}
