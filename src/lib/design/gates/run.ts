/**
 * `runGates`, the quality score Q, `summarize` and `toGateItem` (P6 DESIGN; design.md DES-§8.1, DES-§8.5, DES-§8.10,
 * DG-06; core §M.1, §M.5). Pure and isomorphic, ≤ 8 ms p95 per document in Node.
 *
 *   Q = clamp(70 − 15·H − Σ soft − 4·slop + 10·spec + 5·nov + comp, 0, 100), rounded
 *
 * H = hard items, Σ soft = the soft penalties (visual, copy, novelty; the slop items count through 4·slop only),
 * spec = specificity 0-1 (DES-§9.6), nov = 1 when every band is `ok`, 0.5 when the worst is `close`, else 0 (and 0
 * before the first check), comp = the composition score 0-15 (./composition.ts). The base, the slop lines and the
 * floors are calibration.json `preFit` (fixed before the corpus runs, ENGP-29). The anchors: the bland clean page
 * (no item, spec 0.5, bands ok, comp 0) is 80, the keep-list pages ≥ 85, the baseline-like page ≤ 40.
 *
 * Which gates run is the kind's row of KIND_GATES (./kinds.ts). Copy hardness follows the origin class (DS50): D3 and
 * D4 are hard on `engine`, `local` and `cloud` text only, soft on `owner` and `library` lines.
 */
import type { GateItem } from "@/lib/render/prepublish";
import type { PageDoc } from "@/lib/page/schema";
import calibration from "../calibration.json";
import { copyReport, type CopyReport } from "../cliche";
import { composition } from "./composition";
import { KIND_GATES } from "./kinds";
import { noveltyItems } from "./novelty";
import { planFor } from "./plan";
import { slopItems } from "./slop";
import type { DesignGateItem, GateInput, GateReport, GateSummary, OriginClass } from "./types";
import { pageView, type PageView } from "./view";
import { visualItems } from "./visual";

export const PRE_FIT = calibration.preFit;
const GENERATED: ReadonlySet<OriginClass> = new Set(["engine", "local", "cloud"]);
/** the copy items' baseline targets (DES-§8.10) */
const COPY_TARGET: Readonly<Record<string, DesignGateItem["target"]>> = { C04: "D5", D3: "D3", D4: "D4" };

const EMPTY_COPY: CopyReport = { cliche: 0, spec: 0.5, items: [], dashes: 0, bangs: 0, registerBreaches: 0, numbers: { unknown: [], conflicts: [] } };

/** `nov` of DES-§8.5 */
export function noveltyTerm(n: GateInput["novelty"]): number {
  if (!n) return 0;
  const bands = [n.platform, n.niche, n.own === "first" ? "ok" : n.own];
  if (n.clone || bands.includes("too_close")) return 0;
  return bands.includes("close") ? 0.5 : 1;
}

/** Q from its parts (DES-§8.5). */
export function qScore(p: { hard: number; soft: number; slop: number; spec: number; nov: number; comp: number }): number {
  const q = PRE_FIT.qBase - 15 * p.hard - p.soft - 4 * p.slop + 10 * p.spec + 5 * p.nov + p.comp;
  return Math.round(Math.min(100, Math.max(0, q)));
}

/** The copy report with the origin rules this part adds to it (D4 hard on generated text) and the targets. */
function copyOf(doc: PageDoc, input: GateInput, texts: ReadonlyMap<string, string>): CopyReport {
  const r = copyReport(doc, input.facts, input.origin.size ? input.origin : null);
  const items = r.items.map((it): DesignGateItem => {
    const target = COPY_TARGET[String(it.id)];
    const generated = !!it.field && GENERATED.has(input.origin.get(it.field) ?? "library");
    if (it.id === "D4" && generated) return { ...it, level: "hard", penalty: 15, target: "D4", msg: "design.gate.D4", vars: { ...(it.vars ?? {}), text: (it.field ? (texts.get(it.field) ?? "") : "").slice(0, 80) } };
    if (it.id === "D3" && !generated && it.level === "soft") return { ...it, target, msg: "design.gate.D3.owner" };
    return target ? { ...it, target } : it;
  });
  return { ...r, items };
}

/** The view and the raw items of one input (exported for the digest and the repairs). */
export function gateItemsOf(input: GateInput): { view: PageView; items: DesignGateItem[]; slop: { score: number; items: DesignGateItem[] }; copy: CopyReport; comp: ReturnType<typeof composition> } {
  const row = KIND_GATES[input.kind];
  const view = pageView(input);
  const comp = composition(view);
  const allowV = row.visual === "all" ? null : new Set(row.visual);
  const visual = visualItems(view, input, comp.facts).filter((it) => !allowV || allowV.has(String(it.id)));
  if (row.noGlass && view.counts.glass > 0) visual.push({ id: "V06", level: "hard", penalty: 15, msg: "design.gate.V06.commerce", vars: { count: view.counts.glass } });
  const allowS = row.slop === "all" ? null : new Set(row.slop);
  const rawSlop = slopItems(view, input);
  const slopList = rawSlop.items.filter((it) => !allowS || allowS.has(String(it.id)));
  const slop = { score: slopList.reduce((n, it) => n + it.penalty, 0), items: slopList };
  const landing = view.landing;
  const copy = row.copy && landing ? copyOf(landing, input, view.fields) : EMPTY_COPY;
  const novelty = row.novelty ? noveltyItems(input, view.fields) : [];
  const items = [...visual, ...copy.items, ...novelty];
  if (slop.score >= PRE_FIT.slopFail) items.push({ id: "S00", target: "R8", level: "hard", penalty: 15, msg: "design.slop.S00", vars: { score: slop.score, limit: PRE_FIT.slopFail } });
  for (const it of [...items, ...slop.items]) {
    if (it.fix) continue;
    const ops = planFor(it, view);
    if (ops.length) it.fix = ops;
  }
  return { view, items, slop, copy, comp };
}

/** ≤ 8 ms p95: every design gate of the kind, the slop score, the composition and Q. */
export function runGates(input: GateInput): GateReport {
  return gateRun(input).report;
}

/** runGates with its raw items (the repair loop plans its next round from them). */
export function gateRun(input: GateInput): { report: GateReport; items: DesignGateItem[]; slop: { score: number; items: DesignGateItem[] } } {
  const t0 = performance.now();
  const { view, items, slop, copy, comp } = gateItemsOf(input);
  const hard = items.filter((it) => it.level === "hard");
  const soft = items.filter((it) => it.level === "soft");
  const info = items.filter((it) => it.level === "info");
  const q = qScore({ hard: hard.length, soft: soft.reduce((n, it) => n + it.penalty, 0), slop: slop.score, spec: copy.spec, nov: noveltyTerm(input.novelty), comp: comp.score });
  const report: GateReport = { v: 3, q, hard, soft, info, slop, copy, heights: view.heights, ms: Math.round((performance.now() - t0) * 100) / 100, composition: { score: comp.score, items: comp.items } };
  return { report, items, slop };
}

/** `design_genomes.report` (DES-§2.1): ids and counts, never page text. */
export function summarize(r: GateReport): GateSummary {
  return {
    v: 1,
    hard: [...new Set(r.hard.map((it) => it.id))],
    soft: [...new Set(r.soft.map((it) => it.id))],
    slop: [...new Set(r.slop.items.map((it) => String(it.id)))],
    copy: { cliche: r.copy.cliche, spec: Math.round(r.copy.spec * 100) / 100 },
  };
}

/** The core's shared item (core §M.1): one id on both sides, `design:<target or gate id>`, one fix per item. */
export function toGateItem(item: DesignGateItem): GateItem {
  const out: GateItem = { id: `design:${item.target ?? item.id}`, level: item.level === "hard" ? "hard" : "soft", title: item.msg };
  if (item.vars) out.vars = item.vars;
  if (item.section) out.sectionId = item.section;
  if (item.field) out.field = item.field;
  if (item.fix?.length) out.fix = { ...(item.section ? { sectionId: item.section } : {}), actionId: `design:repair:${item.id}` };
  return out;
}

/** The three largest contributions to Q for the panel line ("Good · 86: …", DES-§8.5). */
export function qContributions(r: GateReport): { key: string; points: number }[] {
  const list = [...r.hard, ...r.soft, ...r.slop.items.map((it) => ({ ...it, penalty: it.penalty * 4 }))].map((it) => ({ key: String(it.msg), points: -it.penalty }));
  return list.sort((a, b) => a.points - b.points).slice(0, 3);
}
