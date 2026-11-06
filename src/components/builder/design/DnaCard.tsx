"use client";
/**
 * The DNA card of the Theme panel (P6 DESIGN; design.md DES-§15.4 rev 3 / rev 4 anatomy, DS58; SF-02).
 * Fits 320 px: a 2 × 2 grid of 148 × 32 chips (the gene's label, its value under it), the why line (≤ 2 lines), the
 * three novelty words as status chips (never a number), the provenance line, and one "Locks" disclosure with the
 * seven bold-gene toggles and a "For this page" / "For my brand" segmented control under the list.
 *  - The page side writes `doc.theme.look.locks` (one undoable edit).
 *  - The brand side needs `brand.write`: G1 / G9 / G23 in `brand.genes`, G4 as `brand.fonts.locked`, G28 as the
 *    store voice (`setBrandLockAction`); G2 and G18 are page genes: disabled with "Page genes lock per page".
 *  - A doc without `look` shows the back-derived chips with "Generated before design DNA; remix to upgrade".
 * `DnaCardView` is pure (the story fixture renders it); `ThemeDna` wires it to the builder.
 */
import { Bot, ChevronDown, ChevronRight, PenLine, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { brandLockedGenes, geneValue, LOCK_GENES, PAGE_ONLY_GENES, type LockGene } from "@/lib/design/brand-apply";
import { setBrandLockAction } from "@/lib/design/actions";
import { genomeOf } from "@/lib/design/derive";
import { explainGenome } from "@/lib/design/explain";
import type { DesignGenome } from "@/lib/design/genome";
import { noveltyWords, type PanelBands } from "@/lib/design/panel";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";
import { ARCHETYPE_DEFS } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "../context";
import { Segmented } from "../ui";
import { useDesignCheck } from "./check-context";

export interface DnaChip {
  gene: string;
  label: string;
  /** one or two lines (the pairing chip: the two family names) */
  value: string[];
}

export interface DnaCardViewProps {
  chips: DnaChip[];
  why: string;
  novelty: { status: "idle" | "loading" | "ready" | "unavailable"; bands: PanelBands | null };
  provenance: "engine" | "director" | null;
  legacy: boolean;
  /** per gene: its label and the page's value (the toggle rows) */
  genes: { gene: LockGene; label: string; value: string }[];
  pageLocks: ReadonlySet<LockGene>;
  brandLocks: ReadonlySet<LockGene>;
  canBrand: boolean;
  onToggle(gene: LockGene, on: boolean, scope: "page" | "brand"): void;
  /** the locks disclosure starts open (fixtures) */
  locksOpen?: boolean;
}

const GENE_LABEL: Record<LockGene, MessageKey> = { G1: "design.gene.G1", G2: "design.gene.G2", G4: "design.gene.G4", G9: "design.gene.G9", G18: "design.gene.G18", G23: "design.gene.G23", G28: "design.gene.G28" };

export function DnaCardView(p: DnaCardViewProps) {
  const t = useT();
  const [open, setOpen] = useState(!!p.locksOpen);
  const [scope, setScope] = useState<"page" | "brand">("page");
  const id = useId();
  const bands = p.novelty.bands;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        {p.chips.map((c) => (
          <div key={c.gene} className="flex min-h-8 min-w-0 flex-col justify-center rounded-md border border-border/70 bg-background px-2 py-1">
            <span className="truncate text-[11px] font-medium leading-tight text-muted-foreground">{c.label}</span>
            {c.value.map((v, i) => (
              <span key={i} className="truncate text-[12px] font-medium leading-tight" title={v}>
                <bdi dir={c.gene === "G4" ? "ltr" : undefined}>{v}</bdi>
              </span>
            ))}
          </div>
        ))}
      </div>
      {p.legacy ? <p className="text-[12px] leading-snug text-muted-foreground">{t("design.dna.legacy")}</p> : null}
      {p.why ? <p className="line-clamp-2 text-[13px] leading-snug">{p.why}</p> : null}
      <div className="flex flex-wrap gap-1.5" aria-label={t("design.check.group.uniqueness")}>
        {bands ? (
          noveltyWords(bands).map((w) => (
            <span
              key={w.band}
              className={cn(
                "inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-medium leading-none",
                w.tone === "ok" ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success-ink" : "bg-[color-mix(in_oklab,var(--warn)_24%,transparent)] text-warn-ink",
              )}
            >
              {t(w.key)}
            </span>
          ))
        ) : p.novelty.status === "unavailable" ? (
          <span className="text-[12px] text-muted-foreground">{t("design.wizard.uniqueUnavailable")}</span>
        ) : (
          <span className="inline-flex h-5 items-center rounded-[5px] bg-muted px-1.5 text-[11px] text-muted-foreground">{t("design.dna.checking")}</span>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        {p.provenance === "director" ? <Sparkles className="size-3.5" aria-hidden="true" /> : p.provenance === "engine" ? <Bot className="size-3.5" aria-hidden="true" /> : <PenLine className="size-3.5" aria-hidden="true" />}
        {p.provenance === "director" ? t("design.dna.refined") : p.provenance === "engine" ? t("design.dna.engine") : t("design.dna.manual")}
      </p>
      <div className="border-t border-border/60 pt-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-full items-center justify-between rounded-md px-1 text-[13px] font-medium hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span>{t("design.dna.locks")}</span>
          <span className="flex items-center gap-1.5 text-[12px] font-normal text-muted-foreground">
            <span className="tabular-nums">{(scope === "page" ? p.pageLocks : p.brandLocks).size}</span>
            {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />}
          </span>
        </button>
        {open ? (
          <div id={id} className="grid pt-1">
            {p.genes.map((g) => {
              const pageOnly = scope === "brand" && PAGE_ONLY_GENES.has(g.gene);
              const disabled = scope === "brand" ? pageOnly || !p.canBrand : p.legacy;
              const on = scope === "page" ? p.pageLocks.has(g.gene) : p.brandLocks.has(g.gene);
              const hint = pageOnly ? t("design.dna.pageOnly") : scope === "brand" && !p.canBrand ? t("design.dna.noBrand") : undefined;
              const label = t(GENE_LABEL[g.gene]);
              return (
                <label key={g.gene} className={cn("flex h-9 items-center justify-between gap-3 rounded-md px-1", disabled ? "opacity-55" : "cursor-pointer hover:bg-muted/40")} title={hint}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-[13px]">{label}</span>
                    <bdi className="truncate text-[12px] text-muted-foreground">{g.value}</bdi>
                  </span>
                  <Switch className="data-[state=checked]:bg-brand" checked={on} disabled={disabled} onCheckedChange={(v) => p.onToggle(g.gene, v, scope)} aria-label={`${label}: ${scope === "page" ? t("design.dna.scope.page") : t("design.dna.scope.brand")}`} />
                </label>
              );
            })}
            <div className="pt-2">
              <Segmented
                value={scope}
                onChange={setScope}
                label={t("design.dna.scope")}
                size="sm"
                options={[
                  { value: "page", label: t("design.dna.scope.page") },
                  { value: "brand", label: t("design.dna.scope.brand") },
                ]}
              />
              {scope === "brand" ? <p className="pt-1.5 text-[11px] leading-snug text-muted-foreground">{p.canBrand ? t("design.dna.pageOnly") : t("design.dna.noBrand")}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The chips and gene rows of a genome in the viewer's locale. */
export function dnaOf(g: DesignGenome, doc: PageDoc, locale: "en" | "fr" | "ar", t: (k: MessageKey, v?: Record<string, string | number>) => string): { chips: DnaChip[]; why: string; genes: DnaCardViewProps["genes"] } {
  const { chips, why } = explainGenome(g, { locale, accent: doc.theme.palette.accent });
  const out: DnaChip[] = chips.map((c) => ({
    gene: c.gene,
    label: t(GENE_LABEL[c.gene as LockGene] ?? ("design.gene.G2" as MessageKey)),
    value: c.gene === "G4" && c.vars ? [c.vars.display ?? "", c.vars.displayAr ?? ""].filter((v, i, a) => v && a.indexOf(v) === i) : [t(c.key, c.vars)],
  }));
  const valueText = (gene: LockGene): string => {
    const v = geneValue(g, gene);
    if (gene === "G1") return ARCHETYPE_DEFS[g.brand.G1]?.label ?? v;
    if (gene === "G2") return t(`design.chip.grammar.${v}` as MessageKey);
    if (gene === "G9") return t(`design.chip.strategy.${v}` as MessageKey);
    if (gene === "G18") return t(`design.chip.treatment.${v}` as MessageKey);
    if (gene === "G28") return t(`design.chip.voice.${v}` as MessageKey);
    if (gene === "G4") return out.find((c) => c.gene === "G4")?.value.join(" / ") ?? v;
    return v;
  };
  return { chips: out, why: t(why.key, why.vars), genes: LOCK_GENES.map((gene) => ({ gene, label: t(GENE_LABEL[gene]), value: valueText(gene) })) };
}

/** The builder's DNA card (Theme panel). */
export function ThemeDna() {
  const t = useT();
  const locale = useAdminLocale();
  const check = useDesignCheck();
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const want = check?.wantNovelty;
  useEffect(() => (want ? want() : undefined), [want]);
  const genome = useMemo(() => {
    try {
      return genomeOf(doc);
    } catch {
      return null;
    }
  }, [doc]);
  const dna = useMemo(() => (genome ? dnaOf(genome, doc, locale, t) : null), [genome, doc, locale, t]);
  if (!genome || !dna) return null;

  const pageLocks = new Set<LockGene>((doc.theme.look?.locks ?? []) as LockGene[]);
  const brandLocks = new Set<LockGene>(brandLockedGenes(check?.context?.brand ?? null));
  const toggle = (gene: LockGene, on: boolean, scope: "page" | "brand") => {
    if (scope === "page") {
      store.getState().updateDoc((d) => {
        const look = d.theme.look;
        if (!look) return;
        const next = new Set(look.locks ?? []);
        if (on) next.add(gene);
        else next.delete(gene);
        if (next.size) look.locks = LOCK_GENES.filter((g) => next.has(g));
        else delete look.locks;
      });
      return;
    }
    void setBrandLockAction({ gene, on, value: geneValue(genome, gene) })
      .then((r) => {
        if (r.ok) {
          check?.setBrand(r.data);
          toast.success(t("design.dna.lockSaved"));
        } else toast.error(t("design.dna.lockFailed"));
      })
      .catch(() => toast.error(t("design.dna.lockFailed")));
  };
  return (
    <DnaCardView
      chips={dna.chips}
      why={dna.why}
      novelty={check?.novelty ?? { status: "idle", bands: null }}
      provenance={check?.context?.source ?? null}
      legacy={!doc.theme.look}
      genes={dna.genes}
      pageLocks={pageLocks}
      brandLocks={brandLocks}
      canBrand={!!check?.context?.canBrand}
      onToggle={toggle}
    />
  );
}
