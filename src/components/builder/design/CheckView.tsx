"use client";
/**
 * The Design check panel's view (P6 DESIGN; design.md DES-§15.1 rev 3 anatomy, DS58; core §I.8 screen 13). Pure
 * props, so the builder panel and the story fixture render the same rows:
 *  - the pinned header: Q as a number with its label and the three largest contributions in plain words;
 *  - collapsible groups (32 px headers, 11 / 500 muted, tabular counts): Blocking (with "Fix all"), Improve, Copy,
 *    Uniqueness (the novelty words and the Differentiate slot), Budgets (40 px meters);
 *  - two-line rows (56 px; 64 px comfortable at ≥ 1280): the sentence and the section chip, then the measured value
 *    or the shared id and "Fix" / "Ignore"; the level is a 3 px inline-start bar, never a dot;
 *  - states: checking (skeleton rows after 150 ms), clean, stale (≤ 400 ms), unavailable (the server checks).
 * `touch` (the 390 bottom sheet) makes "Fix" 44 px tall.
 */
import { Check, ChevronDown, ChevronRight, ShieldCheck, Wand2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { BudgetMeter, MeterKey, PanelGroup, PanelItem, PanelModel } from "@/lib/design/panel";
import { noveltyWords, type PanelBands } from "@/lib/design/panel";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";

export interface CheckViewProps {
  status: "checking" | "ready" | "stale";
  skeleton: boolean;
  model: PanelModel | null;
  novelty: { status: "idle" | "loading" | "ready" | "unavailable"; bands: PanelBands | null };
  /** the section chip's word for a section id (its type), null when the section is gone */
  sectionWord(id: string): string | null;
  onFix(item: PanelItem): void;
  onFixAll(): void;
  onIgnore(item: PanelItem): void;
  onSection(id: string): void;
  /** P3's fix target, or the honesty item's attest sheet */
  onGoto(item: PanelItem): void;
  ignoredCount: number;
  onRestoreIgnored(): void;
  /** rendered inside the Uniqueness group (Differentiate) */
  differentiate?: ReactNode;
  touch?: boolean;
  /** the header's trailing slot (the rail's close button) */
  headerEnd?: ReactNode;
}

const GROUPS: readonly { id: PanelGroup; key: MessageKey }[] = [
  { id: "blocking", key: "design.check.group.blocking" },
  { id: "improve", key: "design.check.group.improve" },
  { id: "copy", key: "design.check.group.copy" },
  { id: "uniqueness", key: "design.check.group.uniqueness" },
];

const LABEL_KEY: Record<PanelModel["label"], MessageKey> = { excellent: "design.check.q.excellent", good: "design.check.q.good", fair: "design.check.q.fair", needsWork: "design.check.q.needsWork" };
const LABEL_TONE: Record<PanelModel["label"], string> = {
  excellent: "bg-brand-soft text-brand",
  good: "bg-brand-soft text-brand",
  fair: "bg-[color-mix(in_oklab,var(--warn)_22%,transparent)] text-warn-ink",
  needsWork: "bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-destructive",
};
const METER_KEY: Record<MeterKey, MessageKey> = {
  sections: "design.check.meter.sections",
  height: "design.check.meter.height",
  ctas: "design.check.meter.ctas",
  glass: "design.check.meter.glass",
  reveals: "design.check.meter.reveals",
  photos: "design.check.meter.photos",
  kickers: "design.check.meter.kickers",
};

const nf = new Intl.NumberFormat("en-US");

export function CheckView(p: CheckViewProps) {
  const t = useT();
  const m = p.model;
  const empty = !!m && GROUPS.every((g) => m.groups[g.id].length === 0);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" aria-busy={p.status !== "ready"}>
      <Header {...p} />
      <div className="bld-scroll min-h-0 flex-1 overflow-y-auto pb-8">
        {p.novelty.status === "unavailable" ? (
          <p role="status" className="mx-4 mt-3 rounded-lg border border-border/70 bg-muted/50 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
            {t("design.check.unavailable")}
          </p>
        ) : null}
        {!m ? (
          p.skeleton ? <Skeleton /> : null
        ) : (
          <div className={cn("transition-opacity duration-200", p.status === "stale" && "opacity-70")}>
            {empty ? <Clean /> : null}
            {GROUPS.map((g) => {
              const rows = m.groups[g.id];
              if (g.id === "uniqueness") return <UniquenessGroup key={g.id} rows={rows} {...p} />;
              if (!rows.length) return null;
              return (
                <Group key={g.id} title={t(g.key)} count={rows.length} trailing={g.id === "blocking" && rows.some((r) => r.fix?.length) ? <FixAll onClick={p.onFixAll} /> : null}>
                  {rows.map((r) => (
                    <Row key={r.key} item={r} {...p} />
                  ))}
                </Group>
              );
            })}
            <Group title={t("design.check.group.budgets")} count={m.meters.filter((x) => x.tone !== "ok").length} countTone="warn">
              {m.meters.map((x) => (
                <Meter key={x.key} meter={x} />
              ))}
            </Group>
            {p.ignoredCount > 0 ? (
              <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[12px] text-muted-foreground">
                <span>{t("design.check.ignored", { count: p.ignoredCount })}</span>
                <button type="button" onClick={p.onRestoreIgnored} className="rounded px-1 font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                  {t("design.check.restore")}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Header(p: CheckViewProps) {
  const t = useT();
  const m = p.model;
  return (
    <div className="shrink-0 border-b border-[var(--bld-hairline,var(--border))] px-4 pb-3 pt-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{t("design.check.title")}</h2>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className={cn("text-[11px] text-muted-foreground transition-opacity duration-150", p.status === "stale" || (p.status === "checking" && p.skeleton) ? "opacity-100" : "opacity-0")}>
            {p.status === "checking" ? t("design.check.checking") : t("design.check.stale")}
          </span>
          {p.headerEnd}
        </div>
      </div>
      {m ? (
        <div className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5">
          <div className="flex flex-col items-start gap-1" aria-label={t("design.check.qAria", { q: m.q, label: t(LABEL_KEY[m.label]) })} role="img">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{m.q}</span>
            <span className={cn("rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium leading-tight", LABEL_TONE[m.label])}>{t(LABEL_KEY[m.label])}</span>
          </div>
          {m.top.length ? (
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">{t("design.check.top")}</p>
              <ul className="mt-1 grid gap-0.5">
                {m.top.map((c, i) => {
                  const text = t(c.key, c.vars);
                  return (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-[12px] leading-[1.35]">
                      <span className="min-w-0 truncate" title={text}>
                        {text}
                      </span>
                      <bdi dir="ltr" className="shrink-0 tabular-nums text-muted-foreground">
                        −{c.points}
                      </bdi>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-3" aria-hidden="true">
          <span className={cn("h-[30px] w-11 rounded-md bg-muted", !p.skeleton && "opacity-0")} />
          <span className={cn("h-3 w-40 rounded bg-muted", !p.skeleton && "opacity-0")} />
        </div>
      )}
    </div>
  );
}

function Group({ title, count, countTone, trailing, children }: { title: string; count: number; countTone?: "warn"; trailing?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section className="pt-2">
      <div className="flex h-8 items-center gap-1 pe-3 ps-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-start text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {open ? <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />}
          <span className="truncate">{title}</span>
          <span className={cn("tabular-nums", countTone === "warn" && count > 0 ? "text-warn-ink" : "text-muted-foreground/80")}>{count}</span>
        </button>
        {trailing}
      </div>
      {open ? (
        <div id={id} className="grid grid-cols-[minmax(0,1fr)]">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function FixAll({ onClick }: { onClick(): void }) {
  const t = useT();
  return (
    <Button type="button" size="sm" variant="secondary" className="h-7 gap-1.5 px-2.5 text-[12px]" onClick={onClick}>
      <Wand2 className="size-3.5" aria-hidden="true" />
      {t("design.check.fixAll")}
    </Button>
  );
}

const BAR: Record<PanelItem["level"], string> = { hard: "bg-destructive", soft: "bg-warn", info: "bg-muted-foreground/45" };

function Row({ item, sectionWord, onFix, onIgnore, onSection, onGoto, touch }: { item: PanelItem } & CheckViewProps) {
  const t = useT();
  const title = "text" in item.title ? item.title.text : t(item.title.key, item.title.vars);
  const word = item.section ? sectionWord(item.section) : null;
  const honesty = item.source === "honesty";
  const second = item.detail ?? item.id;
  return (
    <div className="relative mx-2 flex min-h-14 min-w-0 flex-col justify-center gap-1 rounded-lg py-2 pe-2.5 ps-4 hover:bg-muted/45 xl:min-h-16">
      <span aria-hidden="true" className={cn("absolute inset-y-2.5 start-1.5 w-[3px] rounded-full", BAR[item.level])} />
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] leading-5" title={title}>
          {title}
        </p>
        {word && item.section ? (
          <button
            type="button"
            onClick={() => onSection(item.section!)}
            aria-label={`${t("design.check.section")}: ${word}`}
            className="h-5 max-w-[96px] shrink-0 truncate rounded-[5px] border border-border/80 bg-background px-1.5 text-[11px] font-medium leading-[18px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {word}
          </button>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <p className={cn("min-w-0 flex-1 truncate text-[12px] text-muted-foreground", !item.detail && "font-mono text-[11px] text-muted-foreground/80")} title={second}>
          <bdi dir={item.detail ? undefined : "ltr"}>{second}</bdi>
        </p>
        {honesty ? (
          <Button type="button" size="sm" variant="secondary" className={cn("shrink-0 gap-1 px-2.5 text-[13px] font-medium", touch ? "h-11" : "h-[30px]")} onClick={() => onGoto(item)}>
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("design.check.attest")}
          </Button>
        ) : item.fix?.length ? (
          <Button type="button" size="sm" variant="secondary" className={cn("shrink-0 px-3 text-[13px] font-medium", touch ? "h-11" : "h-[30px]")} onClick={() => onFix(item)}>
            {t("design.check.fix")}
          </Button>
        ) : item.goto ? (
          <Button type="button" size="sm" variant="secondary" className={cn("shrink-0 px-3 text-[13px] font-medium", touch ? "h-11" : "h-[30px]")} onClick={() => onGoto(item)}>
            {t("design.check.goto")}
          </Button>
        ) : null}
        {item.ignorable ? (
          <Button type="button" size="sm" variant="ghost" className={cn("shrink-0 px-2 text-[12px] text-muted-foreground", touch ? "h-11" : "h-[30px]")} onClick={() => onIgnore(item)}>
            {t("design.check.ignore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UniquenessGroup(p: { rows: PanelItem[] } & CheckViewProps) {
  const t = useT();
  const bands = p.novelty.bands;
  if (!p.rows.length && !bands && !p.differentiate) return null;
  return (
    <Group title={t("design.check.group.uniqueness")} count={p.rows.length}>
      {bands ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-1.5 pt-0.5">
          {noveltyWords(bands).map((w) => (
            <span
              key={w.band}
              className={cn(
                "inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-medium leading-none",
                w.tone === "ok" ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success-ink" : "bg-[color-mix(in_oklab,var(--warn)_24%,transparent)] text-warn-ink",
              )}
            >
              {t(w.key)}
            </span>
          ))}
        </div>
      ) : p.novelty.status === "loading" ? (
        <div className="flex gap-1.5 px-4 pb-1.5" aria-hidden="true">
          {[88, 104, 96].map((w) => (
            <span key={w} className="h-5 rounded-[5px] bg-muted" style={{ width: w }} />
          ))}
        </div>
      ) : null}
      {p.rows.map((r) => (
        <Row key={r.key} item={r} {...p} />
      ))}
      {p.differentiate}
    </Group>
  );
}

const FILL: Record<BudgetMeter["tone"], string> = { ok: "bg-brand", warn: "bg-warn", bad: "bg-destructive" };

function Meter({ meter }: { meter: BudgetMeter }) {
  const t = useT();
  const max = meter.hard ?? Math.max(meter.soft * 1.5, meter.value, 1);
  const pct = meter.estimated ? 0 : Math.min(100, (meter.value / max) * 100);
  const unit = meter.key === "height" ? " px" : "";
  const limit = meter.key === "height" || meter.key === "kickers" ? meter.soft : (meter.hard ?? meter.soft);
  return (
    <div className="flex h-10 flex-col justify-center gap-1.5 px-4" title={meter.estimated ? t("design.check.meter.estimated") : undefined}>
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-none">
        <span className="truncate">{t(METER_KEY[meter.key])}</span>
        <bdi dir="ltr" className={cn("shrink-0 text-[12px] tabular-nums", meter.tone === "ok" ? "text-muted-foreground" : meter.tone === "warn" ? "text-warn-ink" : "text-destructive")}>
          {meter.estimated ? "–" : nf.format(meter.value)} / {nf.format(limit)}
          {unit}
        </bdi>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={meter.value} aria-label={t(METER_KEY[meter.key])}>
        <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", FILL[meter.tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Clean() {
  const t = useT();
  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Check className="size-4" aria-hidden="true" />
      </span>
      <p className="pt-1 text-[13px] leading-snug">{t("design.check.clean")}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-1 pt-3" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="mx-2 flex h-14 flex-col justify-center gap-2 rounded-lg ps-4 pe-2.5">
          <span className="h-3 rounded bg-muted" style={{ width: `${78 - i * 7}%` }} />
          <span className="h-2.5 w-1/3 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}
