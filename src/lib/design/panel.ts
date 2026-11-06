/**
 * The Design check panel's model (P6 DESIGN; design.md DES-§15.1, DES-§15.2, DES-§15.3; core §M.1 rule 6, §M.5).
 * Pure and isomorphic: the builder's panel, the publish dialog's one-tap fixes, the story fixtures and `test:design`
 * build the same rows from the same inputs, so the dialog never shows an item the panel did not.
 *
 *   const run = gateRun(builderGateInput(doc, { assets, origin, novelty }));
 *   const model = panelModel({ run, checklist: buildChecklist(doc, ctx), budget: budgetEstimate(doc, run.view) });
 *   const next = applyFix(doc, run.report, item.fix, origin);   // one replaceDoc, one ⌘Z
 *
 * Ids: a design item is `design:<target or gate id>` (toGateItem), a budget estimate `budget:<rule>` (the publish
 * budget gate's ids), a checklist item keeps P3's id. Rows are keyed by id + section + field, so one gate raised on
 * two sections stays two rows while the same check from two sources (the dialog's refusal and the panel's estimate)
 * is one.
 */
import type { CheckFix, Checklist } from "@/lib/editor/checklist";
import type { MessageKey } from "@/lib/i18n/admin";
import type { PageDoc } from "@/lib/page/schema";
import { FOLD_BAND, FOLD_LINE_PX, HEIGHT_BAND, LANDING_PROFILE, type BudgetProfile } from "@/lib/render/prepublish/budget-limits";
import { buildTheme } from "@/lib/theme";
import type { HeightReport, NoveltyBands } from "./types";

/** The bands the builder holds (the server verdict of the page, never a number); `clone` from the same answer. */
export type PanelBands = Pick<NoveltyBands, "platform" | "niche" | "own"> & { clone?: boolean };
import { gateInputFor } from "./gate-input";
import { applyOps } from "./gates/apply";
import type { RepairOp } from "./gates/repair";
import { toGateItem } from "./gates/run";
import type { AssetMeta, DesignGateItem, GateInput, GateReport, OriginClass } from "./gates/types";
import type { PageView } from "./gates/view";

/* ------------------------------------------------------------------ */
/* the header                                                          */
/* ------------------------------------------------------------------ */

export type QLabel = "excellent" | "good" | "fair" | "needsWork";

/** DES-§15.1: Excellent ≥ 90 · Good 80-89 · Fair 65-79 · Needs work < 65. */
export function qLabel(q: number): QLabel {
  return q >= 90 ? "excellent" : q >= 80 ? "good" : q >= 65 ? "fair" : "needsWork";
}

/** The three largest contributions to Q (points off), as the items' own message keys. */
export function qTop(report: GateReport): { key: MessageKey; vars?: Record<string, string | number>; points: number }[] {
  const list = [...report.hard, ...report.soft, ...report.slop.items.map((it) => ({ ...it, penalty: it.penalty * 4 }))];
  return list
    .filter((it) => it.penalty > 0)
    .sort((a, b) => b.penalty - a.penalty || String(a.id).localeCompare(String(b.id)))
    .slice(0, 3)
    .map((it) => ({ key: it.msg, ...(it.vars ? { vars: it.vars } : {}), points: Math.round(it.penalty) }));
}

/* ------------------------------------------------------------------ */
/* the gate input of the builder                                       */
/* ------------------------------------------------------------------ */

/** The page's facts as the builder holds them: the product description's "- " lines, the name, the first price. */
export function panelFacts(doc: PageDoc): GateInput["facts"] {
  const facts = (doc.product.description ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());
  return { facts, productName: doc.product.name, price: doc.items[0]?.price ?? null };
}

/** The landing gate input in the builder's context (DES-§8.7 builder row): the theme is rebuilt from the doc. */
export function builderGateInput(
  doc: PageDoc,
  ctx: { assets: ReadonlyMap<string, AssetMeta>; origin: ReadonlyMap<string, OriginClass>; novelty?: PanelBands | null; context?: GateInput["context"] },
): GateInput {
  const nov = ctx.novelty ? { key: "page", platform: ctx.novelty.platform, niche: ctx.novelty.niche, own: ctx.novelty.own, clone: !!ctx.novelty.clone } : null;
  return gateInputFor(doc, {
    kind: "landing",
    theme: buildTheme(doc.theme, doc.locale),
    look: doc.theme.look ?? null,
    assets: ctx.assets,
    locale: doc.locale,
    context: ctx.context ?? "builder",
    origin: ctx.origin,
    facts: panelFacts(doc),
    ownerProof: false,
    novelty: nov,
  });
}

/* ------------------------------------------------------------------ */
/* rows                                                                */
/* ------------------------------------------------------------------ */

export type PanelGroup = "blocking" | "improve" | "copy" | "uniqueness";
export type PanelSource = "design" | "budget" | "honesty" | "landing";

export interface PanelItem {
  /** the shared id (DES-§15.1): `design:…`, `budget:…` or the checklist's id */
  id: string;
  /** id + section + field: one row */
  key: string;
  level: "hard" | "soft" | "info";
  group: PanelGroup;
  source: PanelSource;
  /** a message key of the admin catalog, or P3's own sentence */
  title: { key: MessageKey; vars?: Record<string, string | number> } | { text: string };
  detail?: string;
  section?: string;
  field?: string;
  /** the RepairOps of "Fix" (DES-§15.2) */
  fix?: RepairOp[];
  /** where P3's fix leads (a section, a tab, an admin page) */
  goto?: CheckFix;
  /** "Ignore on this page": soft items only, never honesty */
  ignorable: boolean;
}

/** P3's honesty ids (sample content, proof, urgency, claims): no Ignore, the attest sheet's deep link. */
const HONESTY_PREFIX = /^(sample|honesty|proof|rating|review|urgency|claim|stock|countdown):/;

const groupOfDesign = (it: DesignGateItem): PanelGroup => {
  if (it.level === "hard") return "blocking";
  const id = String(it.id);
  if (id.startsWith("N")) return "uniqueness";
  if (/^(C|D)\d/.test(id)) return "copy";
  return "improve";
};

function designRow(it: DesignGateItem): PanelItem {
  const shared = toGateItem(it);
  return {
    id: shared.id,
    key: `${shared.id}|${it.section ?? ""}|${it.field ?? ""}`,
    level: it.level,
    group: groupOfDesign(it),
    source: "design",
    title: { key: it.msg, ...(it.vars ? { vars: it.vars } : {}) },
    ...(it.section ? { section: it.section } : {}),
    ...(it.field ? { field: it.field } : {}),
    ...(it.fix?.length ? { fix: it.fix } : {}),
    ignorable: it.level !== "hard",
  };
}

/* ------------------------------------------------------------------ */
/* the budget estimate (client side, the core thresholds)              */
/* ------------------------------------------------------------------ */

export type MeterKey = "sections" | "height" | "ctas" | "glass" | "reveals" | "photos" | "kickers";

export interface BudgetMeter {
  key: MeterKey;
  value: number;
  soft: number;
  /** null: the row has no hard limit (the kicker budget is a soft rule) */
  hard: number | null;
  tone: "ok" | "warn" | "bad";
  /** the height model is still the stub: the height meter is not measured */
  estimated?: boolean;
}

export interface BudgetEstimate {
  meters: BudgetMeter[];
  items: PanelItem[];
}

const toneOf = (v: number, soft: number, hard: number | null): BudgetMeter["tone"] => (hard !== null && v > hard ? "bad" : v > soft ? "warn" : "ok");

const budgetRow = (rule: string, level: "hard" | "soft", key: MessageKey, vars: Record<string, string | number>): PanelItem => ({
  id: `budget:${rule}`,
  key: `budget:${rule}|${String(key)}`,
  level,
  group: level === "hard" ? "blocking" : "improve",
  source: "budget",
  title: { key, vars },
  ignorable: false,
});

const FOLD_KEYS: Record<string, MessageKey> = { image: "budget.C2.image", price: "budget.C2.price", cta: "budget.C2.cta", cod: "budget.C2.cod" };

/**
 * The live meters and the budget rows the publish gate would raise (C3 sections / height, F1, C2), estimated from
 * the gate view's counts and its height report against the landing profile (src/lib/render/prepublish/budget-limits.ts).
 * Honest: every meter is a real count of this doc; a stub height model shows no height row.
 */
export function budgetEstimate(doc: PageDoc, view: Pick<PageView, "counts" | "heights">, profile: BudgetProfile = LANDING_PROFILE): BudgetEstimate {
  const h: HeightReport = view.heights;
  const c = view.counts;
  const photoMax = Math.max(0, ...Object.values(c.photoUses));
  const px = Math.round(h.total);
  const meters: BudgetMeter[] = [
    { key: "sections", value: h.inFlow, soft: profile.sections.soft, hard: profile.sections.hard, tone: toneOf(h.inFlow, profile.sections.soft, profile.sections.hard) },
    { key: "height", value: h.stub ? 0 : px, soft: profile.heightPx.soft, hard: profile.heightPx.hard, tone: h.stub ? "ok" : toneOf(px * HEIGHT_BAND, profile.heightPx.soft, profile.heightPx.hard), ...(h.stub ? { estimated: true } : {}) },
    { key: "ctas", value: c.ctas, soft: profile.ctas.soft, hard: profile.ctas.hard, tone: toneOf(c.ctas, profile.ctas.soft, profile.ctas.hard) },
    { key: "glass", value: c.glass, soft: profile.glass.soft, hard: profile.glass.hard, tone: toneOf(c.glass, profile.glass.soft, profile.glass.hard) },
    { key: "reveals", value: c.reveals, soft: profile.reveals.soft, hard: profile.reveals.hard, tone: toneOf(c.reveals, profile.reveals.soft, profile.reveals.hard) },
    { key: "photos", value: photoMax, soft: profile.photoReuse.soft, hard: profile.photoReuse.hard, tone: toneOf(photoMax, profile.photoReuse.soft, profile.photoReuse.hard) },
    { key: "kickers", value: c.eyebrows, soft: c.eyebrowBudget, hard: null, tone: toneOf(c.eyebrows, c.eyebrowBudget, null) },
  ];
  const items: PanelItem[] = [];
  if (h.inFlow > profile.sections.hard) items.push(budgetRow("C3", "hard", "budget.C3.sections", { count: h.inFlow, limit: profile.sections.hard }));
  else if (h.inFlow > profile.sections.soft) items.push(budgetRow("C3", "soft", "budget.C3.sections", { count: h.inFlow, limit: profile.sections.soft }));
  if (!h.stub) {
    if (px * HEIGHT_BAND > profile.heightPx.hard) items.push(budgetRow("C3", "hard", "budget.C3.height", { px, limit: profile.heightPx.hard }));
    else if (px > profile.heightPx.soft) items.push(budgetRow("C3", "soft", "budget.C3.height", { px, limit: px > profile.heightPx.hard ? profile.heightPx.hard : profile.heightPx.soft }));
    const hasForm = doc.sections.some((s) => !s.hidden && s.type === "orderForm");
    if (!hasForm) items.push(budgetRow("F1", "hard", "budget.F1.missing", {}));
    else if (profile.formTopPx && h.formTop !== null) {
      const top = Math.round(h.formTop);
      const hard = profile.formTopPx.hard;
      if (hard !== null && top * HEIGHT_BAND > hard) items.push(budgetRow("F1", "hard", "budget.F1.position", { px: top, limit: hard }));
      else if (top > profile.formTopPx.soft) items.push(budgetRow("F1", "soft", "budget.F1.position", { px: top, limit: profile.formTopPx.soft }));
    }
    for (const [k, top] of Object.entries(h.fold.items)) {
      if (typeof top !== "number" || !FOLD_KEYS[k]) continue;
      if (top * FOLD_BAND > FOLD_LINE_PX) items.push(budgetRow("C2", "hard", FOLD_KEYS[k]!, { px: Math.round(top), limit: FOLD_LINE_PX }));
    }
  }
  return { meters, items };
}

/* ------------------------------------------------------------------ */
/* the model                                                           */
/* ------------------------------------------------------------------ */

export interface PanelModel {
  q: number;
  label: QLabel;
  top: ReturnType<typeof qTop>;
  groups: Record<PanelGroup, PanelItem[]>;
  meters: BudgetMeter[];
  /** the count badge of the rail tab (hidden at 0) */
  blocking: number;
}

const GROUP_ORDER: readonly PanelGroup[] = ["blocking", "improve", "copy", "uniqueness"];

/** P3's checklist items as rows: errors block, warnings improve; honesty items never get Ignore. */
function checklistRows(list: Checklist): PanelItem[] {
  const rows: PanelItem[] = [];
  for (const [level, items] of [["hard", list.errors], ["soft", list.warnings]] as const) {
    for (const it of items) {
      const honesty = HONESTY_PREFIX.test(it.id);
      rows.push({
        id: it.id,
        key: `${it.id}||`,
        level,
        group: level === "hard" ? "blocking" : "improve",
        source: honesty ? "honesty" : "landing",
        title: { text: it.title },
        ...(it.detail ? { detail: it.detail } : {}),
        ...(it.fix?.sectionId ? { section: it.fix.sectionId } : {}),
        ...(it.fix ? { goto: it.fix } : {}),
        ignorable: level === "soft" && !honesty,
      });
    }
  }
  return rows;
}

/**
 * The panel's groups (DES-§15.1): Blocking (hard design, budget and honesty items alike) · Improve · Copy ·
 * Uniqueness, deduplicated by row key, the ignored keys left out (soft only: a hard item cannot be ignored).
 */
export function panelModel(input: { report: GateReport; items: readonly DesignGateItem[]; slop: readonly DesignGateItem[]; checklist: Checklist | null; budget: BudgetEstimate; ignored?: ReadonlySet<string> }): PanelModel {
  const groups: Record<PanelGroup, PanelItem[]> = { blocking: [], improve: [], copy: [], uniqueness: [] };
  const seen = new Set<string>();
  const add = (row: PanelItem) => {
    if (seen.has(row.key)) return;
    seen.add(row.key);
    if (row.ignorable && input.ignored?.has(row.key)) return;
    groups[row.group].push(row);
  };
  for (const it of input.items) if (it.level !== "info") add(designRow(it));
  for (const it of input.slop) add(designRow(it));
  for (const row of input.budget.items) add(row);
  if (input.checklist) for (const row of checklistRows(input.checklist)) add(row);
  for (const g of GROUP_ORDER) groups[g].sort((a, b) => (a.level === b.level ? 0 : a.level === "hard" ? -1 : 1));
  return { q: input.report.q, label: qLabel(input.report.q), top: qTop(input.report), groups, meters: input.budget.meters, blocking: groups.blocking.length };
}

/* ------------------------------------------------------------------ */
/* fixes (DES-§15.2)                                                   */
/* ------------------------------------------------------------------ */

/**
 * The doc after one item's RepairOps (or "Fix all"'s), or null when no op applied. The builder hands the result to
 * `replaceDoc`, so a fix is exactly one history step (⌘Z reverts it); the gates rerun on the change.
 */
export function applyFix(doc: PageDoc, genome: GateInput["genome"], ops: readonly RepairOp[], origin?: ReadonlyMap<string, OriginClass>): PageDoc | null {
  if (!ops.length) return null;
  const out = applyOps(doc, genome, ops, origin ? { origin } : {});
  return out.applied.length ? out.doc : null;
}

/** "Fix all": every blocking item's ops, in order, once each (the blocking group only). */
export function fixAllOps(model: Pick<PanelModel, "groups">): RepairOp[] {
  const out: RepairOp[] = [];
  const seen = new Set<string>();
  for (const row of model.groups.blocking) {
    for (const op of row.fix ?? []) {
      const k = JSON.stringify(op);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(op);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* uniqueness                                                          */
/* ------------------------------------------------------------------ */

/** DES-§15.3: Differentiate shows on a `close` niche / own band, any `too_close`, or a server N1 / N2. */
export function needsDifferentiate(bands: PanelBands | null, serverIds: readonly string[] = []): boolean {
  if (serverIds.some((id) => id === "design:N1" || id === "design:N2")) return true;
  if (!bands) return false;
  if (bands.clone) return true;
  const all: string[] = [bands.platform, bands.niche, bands.own];
  return all.includes("too_close") || bands.niche === "close" || bands.own === "close";
}

/** The novelty words of a verdict (DES-§20.1): one message key per band, never a number. */
export function noveltyWords(bands: PanelBands): { band: "platform" | "niche" | "own"; tone: "ok" | "close"; key: MessageKey }[] {
  const tone = (b: string): "ok" | "close" => (b === "ok" || b === "first" ? "ok" : "close");
  return [
    { band: "platform", tone: tone(bands.platform), key: bands.platform === "ok" ? "design.novelty.platform.ok" : "design.novelty.platform.close" },
    { band: "niche", tone: tone(bands.niche), key: bands.niche === "ok" ? "design.novelty.niche.ok" : "design.novelty.niche.close" },
    { band: "own", tone: tone(bands.own), key: bands.own === "first" ? "design.novelty.own.first" : bands.own === "ok" ? "design.novelty.own.ok" : "design.novelty.own.close" },
  ];
}

