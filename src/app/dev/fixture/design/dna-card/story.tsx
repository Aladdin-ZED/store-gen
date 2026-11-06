"use client";
/** The dna-card fixture's client half (DES-§15.6): `DnaCardView` per state at the Theme panel's 320 px. */
import { useEffect, useMemo, useState } from "react";
import "@/components/builder/builder.css";
import { dnaOf, DnaCardView, type DnaCardViewProps } from "@/components/builder/design/DnaCard";
import type { LockGene } from "@/lib/design/brand-apply";
import { genomeOf } from "@/lib/design/derive";
import { AdminI18nProvider, useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";

export function DnaStory({ lang, dark, engine, legacy }: { lang: "ar" | "fr" | "en"; dark: boolean; engine: PageDoc; legacy: PageDoc }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [dark, lang]);
  return (
    <AdminI18nProvider locale={lang}>
      <main className="bld-root min-h-dvh bg-background text-foreground" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="flex flex-wrap items-start gap-4 p-4 lg:p-6">
          <Card id="engine" doc={engine} provenance="engine" />
          <Card id="director · locks" doc={engine} provenance="director" locksOpen pageLocks={["G2", "G9"]} brandLocks={["G4"]} canBrand />
          <Card id="legacy" doc={legacy} provenance={null} />
          <Card id="no brand.write · locks" doc={engine} provenance="engine" locksOpen canBrand={false} novelty="unavailable" />
        </div>
      </main>
    </AdminI18nProvider>
  );
}

function Card({ id, doc, provenance, locksOpen, pageLocks = [], brandLocks = [], canBrand = true, novelty = "ready" }: { id: string; doc: PageDoc; provenance: DnaCardViewProps["provenance"]; locksOpen?: boolean; pageLocks?: LockGene[]; brandLocks?: LockGene[]; canBrand?: boolean; novelty?: "ready" | "unavailable" }) {
  const t = useT();
  const locale = useAdminLocale();
  const dna = useMemo(() => dnaOf(genomeOf(doc), doc, locale, t), [doc, locale, t]);
  const [page, setPage] = useState(new Set(pageLocks));
  const [brand, setBrand] = useState(new Set(brandLocks));
  return (
    <figure className="grid w-full max-w-[320px] gap-2">
      <figcaption className="font-mono text-[11px] text-muted-foreground">{id}</figcaption>
      <div className="bld-panel rounded-xl border border-[var(--bld-hairline)] p-4">
        <DnaCardView
          chips={dna.chips}
          why={dna.why}
          novelty={novelty === "ready" ? { status: "ready", bands: { platform: "ok", niche: id === "engine" ? "close" : "ok", own: "first" } } : { status: "unavailable", bands: null }}
          provenance={provenance}
          legacy={!doc.theme.look}
          genes={dna.genes}
          pageLocks={page}
          brandLocks={brand}
          canBrand={canBrand}
          locksOpen={locksOpen}
          onToggle={(gene, on, scope) => {
            const set = scope === "page" ? setPage : setBrand;
            set((s) => {
              const n = new Set(s);
              if (on) n.add(gene);
              else n.delete(gene);
              return n;
            });
          }}
        />
      </div>
    </figure>
  );
}
