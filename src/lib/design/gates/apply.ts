/**
 * `applyOps` and `repairDoc` (P6 DESIGN; design.md DES-§8.6, DES-§8.9, DS11). Pure and isomorphic; re-exported by
 * ./repair.ts next to the op vocabulary. `applyOps` runs on a sandbox copy: it never touches owner text (by the origin
 * class of the field), never prices, items, offers, pixels or form fields, and never drops a section the owner added
 * (a section absent from the plan); every op is applied or skipped with its reason. `repairDoc` is the deterministic
 * loop of DES-§8.6: ≤ 3 rounds of ≤ 6 ops (hard items first), `runGates` after each round, the best of {original,
 * round 1, 2, 3} kept by (fewer hard items, then slop below the fail line, then lower slop, then higher Q).
 */
import { VARIANT_FEATURES } from "@/landing/registry";
import { SECTION_BGS, type PageDoc, type ThemeLook } from "@/lib/page/schema";
import { buildTheme } from "@/lib/theme";
import { planPop, sandSignal } from "@/lib/theme/palette";
import { punctuate } from "../cliche";
import { compileLook } from "../compile";
import type { DesignGenome } from "../genome";
import { loadCatalogue } from "../pairings";
import { GENE_PARTS, GENE_VOCAB } from "../vocab";
import { OPTIONAL_TYPES, sameTypeVariant } from "./plan";
import type { RepairOp } from "./repair";
import { gateRun, PRE_FIT } from "./run";
import { NUMBERED_EYEBROW } from "./slop";
import type { DesignGateItem, GateInput, GateReport, OriginClass, RepairLog } from "./types";
import { accepts, type SecView } from "./view";

/** What `applyOps` may not touch: owner text (by origin class) and the sections the owner added (absent from the plan). */
export interface ApplyCtx {
  /** field path → class; absent = every field `library` (the core's rule without a generation record) */
  origin?: ReadonlyMap<string, OriginClass>;
  /** the planned section ids; absent = the genome's sections */
  planned?: ReadonlySet<string>;
}

/** The ops that change the theme (the built tokens are rebuilt after them). */
const THEME_OPS: ReadonlySet<RepairOp["op"]> = new Set(["changeGene", "snapLadder", "snapPop", "flattenSurfaces", "sandSignal", "scopeReveals", "frameImage", "differentiate"]);
const COPY_OPS: ReadonlySet<RepairOp["op"]> = new Set(["rewriteLine", "trimCopy", "punctuate"]);
const PAGE_GENES: ReadonlySet<string> = new Set(["G2", "G3", "G10", "G16", "G18", "G20", "G21", "G22", "G24", "G32", "G33", "G34", "G35"]);
/** the numbered / edition prefix of an eyebrow (S15), removed by `rewriteLine` on a kicker or a cover line */
const EYEBROW_PREFIX = /^\s*(\d{1,3}\b|n[o°º]\.?\s*\d+|vol\.\s*\d*|[ée]dition\s*\d*|chapitre\s*\d*|الإصدار\s*\d*|العدد\s*\d*|رقم\s*\d*)\s*[·:.\-–—|/]*\s*/i;

type Skip = { op: RepairOp; why: string };

/** "kicker" / "hero.kicker" → "kicker" */
const relField = (section: string, field: string) => (field.startsWith(`${section}.`) ? field.slice(section.length + 1) : field);
function getAt(data: Record<string, unknown>, path: string): unknown {
  let v: unknown = data;
  for (const k of path.split(".")) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}
function setAt(data: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let v: Record<string, unknown> = data;
  for (const k of keys.slice(0, -1)) {
    if (v[k] === null || typeof v[k] !== "object") return;
    v = v[k] as Record<string, unknown>;
  }
  v[keys[keys.length - 1]!] = value;
}

/** Whole sentences that fit `max` words (the first one cut at `max` words when it alone is longer). */
export function trimWords(text: string, max: number): string {
  const parts = text.match(/[^.!?؟]+[.!?؟]*\s*/g) ?? [text];
  let out = "";
  let n = 0;
  for (const p of parts) {
    const w = p.trim().split(/\s+/).filter(Boolean).length;
    if (n + w > max) break;
    out += p;
    n += w;
  }
  if (out.trim()) return out.trim();
  const words = text.trim().split(/\s+/).slice(0, max).join(" ").replace(/[,،;:]+$/, "");
  return /[.!?؟]$/.test(words) ? words : `${words}.`;
}

/** A struct gene value "part=value" applied to the gene (validated against GENE_PARTS). */
function structSet(gene: string, current: Record<string, unknown>, to: string): Record<string, unknown> | null {
  const m = /^([A-Za-z]+)=(.+)$/.exec(to);
  if (!m) return null;
  const part = m[1]!;
  const raw = m[2]!;
  if (gene === "G34") return part === "floatCollapses" ? { ...current, floatCollapses: raw === "true" } : null;
  if (gene === "G35") return null;
  const spec = GENE_PARTS[gene as keyof typeof GENE_PARTS]?.[part];
  if (!spec) return null;
  if (spec.values) {
    const hit = spec.values.find((x) => String(x) === raw);
    return hit === undefined || String(current[part]) === raw ? null : { ...current, [part]: hit };
  }
  if (spec.range) {
    const n = Number(raw);
    const [lo, hi] = spec.range;
    return Number.isFinite(n) && n >= lo && n <= hi && current[part] !== n ? { ...current, [part]: n } : null;
  }
  return null;
}

/** The next value of a bold gene for `differentiate` (vocabulary order, deterministic). */
function nextValue(gene: "G2" | "G18" | "G4" | "G9", g: DesignGenome, hasAlpha: boolean): string | null {
  if (gene === "G4") {
    const rows = loadCatalogue().pairings.filter((p) => p.archetype === g.brand.G1);
    const i = rows.findIndex((p) => p.id === g.brand.G4);
    const next = rows[(i + 1) % Math.max(1, rows.length)];
    return next && next.id !== g.brand.G4 ? next.id : null;
  }
  const values = (GENE_VOCAB[gene].values ?? []) as readonly string[];
  const cur = gene === "G9" ? g.brand.G9 : g.page[gene];
  for (let k = 1; k < values.length; k++) {
    const v = values[(values.indexOf(cur) + k) % values.length]!;
    if (gene === "G18" && v === "cutout-stage" && !hasAlpha) continue;
    return v;
  }
  return null;
}

/** A same-type variant for a section of the document (the view fields `sameTypeVariant` reads). */
const variantFor = (type: string, variant: string, ok: Parameters<typeof sameTypeVariant>[1]) =>
  sameTypeVariant({ type, variant, family: VARIANT_FEATURES[type]?.[variant]?.family ?? "grid" } as SecView, ok);

/**
 * The ops on a sandbox copy (DES-§8.6, DES-§8.9): never owner text, never prices, items, offers, pixels or form fields,
 * never a section the owner added; each op applied or skipped with its reason.
 */
export function applyOps(doc: PageDoc, genome: DesignGenome, ops: readonly RepairOp[], ctx: ApplyCtx = {}): { doc: PageDoc; genome: DesignGenome; applied: RepairOp[]; skipped: Skip[] } {
  const d = structuredClone(doc);
  const g = structuredClone(genome);
  const applied: RepairOp[] = [];
  const skipped: Skip[] = [];
  const planned = ctx.planned ?? new Set(g.sections.map((s) => s.id));
  const ownerText = (path: string) => ctx.origin?.get(path) === "owner";
  const find = (id: string) => d.sections.find((s) => s.id === id);
  const look = (): ThemeLook | null => d.theme.look ?? null;
  const relook = () => {
    const l = look();
    if (!l) return;
    const next = compileLook(g, { ...(l.gid ? { gid: l.gid } : {}), ...(l.locks ? { locks: l.locks } : {}) });
    // an estimated cutout keeps its framed plinth until the mask lands (compileLook needs the photo facts for it)
    if (l.img === "framed-stage" && g.page.G18 === "cutout-stage") next.img = "framed-stage";
    d.theme.look = next;
  };
  const swapTo = (id: string, to: string): string | null => {
    const s = find(id);
    if (!s) return "no such section";
    if (!VARIANT_FEATURES[s.type]?.[to]) return "unknown variant";
    if (s.variant === to) return "already";
    s.variant = to;
    const gs = g.sections.find((x) => x.id === id);
    if (gs) gs.variant = to;
    return null;
  };
  const changeGene = (gene: string, to: string): string | null => {
    const l = look();
    if (!l) return "no look";
    if ((l.locks as readonly string[] | undefined)?.includes(gene)) return "locked";
    const entry = GENE_VOCAB[gene as keyof typeof GENE_VOCAB];
    if (!entry) return "vocab";
    if (gene === "G4") {
      const p = loadCatalogue().byId.get(to);
      if (!p) return "vocab";
      if (g.brand.G4 === to) return "already";
      g.brand.G4 = to;
      d.theme.fonts = { display: p.display, body: p.body, ...(p.accent ? { accent: p.accent } : {}), displayAr: p.displayAr, bodyAr: p.bodyAr };
      return null;
    }
    const holder = (PAGE_GENES.has(gene) ? g.page : g.brand) as unknown as Record<string, unknown>;
    if (entry.kind === "enum") {
      if (!(entry.values ?? []).includes(to)) return "vocab";
      if (holder[gene] === to) return "already";
      holder[gene] = to;
      if (gene === "G9") d.theme.palette = { ...d.theme.palette, pop: planPop(d.theme.palette.accent, to as DesignGenome["brand"]["G9"], d.theme.palette.base) };
      relook();
      return null;
    }
    const next = structSet(gene, (holder[gene] ?? {}) as Record<string, unknown>, to);
    if (!next) return gene === "G35" ? "already whole-line" : "vocab";
    holder[gene] = next;
    relook();
    return null;
  };

  for (const op of ops) {
    let why: string | null = null;
    switch (op.op) {
      case "swapVariant":
        why = swapTo(op.section, op.to);
        break;
      case "swapHeroFamily": {
        const hero = d.sections.find((s) => s.type === "hero" && !s.hidden);
        why = hero ? swapTo(hero.id, op.to) : "no hero";
        break;
      }
      case "changeGene":
        why = changeGene(op.gene, op.to);
        break;
      case "differentiate": {
        const to = nextValue(op.gene, g, !!d.product.cutout);
        why = to ? changeGene(op.gene, to) : "no other value";
        break;
      }
      case "rewriteLine": {
        const s = find(op.section);
        const rel = relField(op.section, op.field);
        const text = s ? getAt(s.data, rel) : undefined;
        if (!s || typeof text !== "string") why = "no such field";
        else if (ownerText(`${op.section}.${rel}`)) why = "owner text";
        else {
          // a numbered or edition eyebrow becomes its plain topic ("Édition 01 · Parfum" → "Parfum"), else the
          // punctuation table; a structure change needs the generator's alternative (the wizard recomposes the line)
          const plain = NUMBERED_EYEBROW.test(text) ? text.replace(EYEBROW_PREFIX, "").replace(/^\d{1,3}\s*[·:.\-–—|/]+\s*/, "").trim() : punctuate(text, d.locale);
          if (plain === text) why = "no library alternative";
          else setAt(s.data, rel, plain);
        }
        break;
      }
      case "punctuate":
      case "trimCopy": {
        const s = find(op.section);
        const rel = relField(op.section, op.field);
        const text = s ? getAt(s.data, rel) : undefined;
        if (!s || typeof text !== "string") why = "no such field";
        else if (ownerText(`${op.section}.${rel}`)) why = "owner text";
        else {
          const next = op.op === "punctuate" ? punctuate(text, d.locale) : trimWords(text, op.maxWords);
          if (next === text) why = "unchanged";
          else setAt(s.data, rel, next);
        }
        break;
      }
      case "setBg": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (!(SECTION_BGS as readonly string[]).includes(op.to)) why = "vocab";
        else if (s.bg === op.to) why = "already";
        else s.bg = op.to;
        break;
      }
      case "setAlign": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (accepts(s.type, "align")) s.data.align = op.to;
        else {
          const to = variantFor(s.type, s.variant, (f) => (op.to === "start" ? !f.centered : !!f.centered) && !f.fixed);
          why = to ? swapTo(s.id, to) : "no variant";
        }
        break;
      }
      case "solidifyGlass": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (accepts(s.type, "glass")) s.data.glass = false;
        else {
          const to = variantFor(s.type, s.variant, (f) => !f.glass && !f.fixed && f.h !== 0 && !f.animatesLayout);
          why = to ? swapTo(s.id, to) : "no variant";
        }
        break;
      }
      case "snapLadder": {
        const l = look();
        if (!l) why = "no look";
        else {
          const to = l.ladder === "mixed" ? "crisp" : "soft";
          if (g.brand.G12 === to) why = "already";
          else {
            g.brand.G12 = to;
            relook();
          }
        }
        break;
      }
      case "frameImage": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (accepts(s.type, "frame")) {
          if (s.data.frame === "framed") why = "already";
          else s.data.frame = "framed";
        } else if (s.type === "hero") why = changeGene("G18", "framed");
        else why = "no frame field";
        break;
      }
      case "dropDecor": {
        const s = find(op.section);
        const reg = s ? VARIANT_FEATURES[s.type]?.[s.variant] : undefined;
        if (!s || !reg) why = "no such section";
        else {
          const optIn = op.decor === "ghost" || op.decor === "chips" ? reg.optIn?.[op.decor] : undefined;
          const path = reg.decor?.[op.decor];
          if (optIn && getAt(s.data, optIn) !== undefined && getAt(s.data, optIn) !== false && getAt(s.data, optIn) !== 0) setAt(s.data, optIn, op.decor === "ghost" ? false : 0);
          else if (path) {
            const cur = getAt(s.data, path);
            if (typeof cur === "string" && ownerText(`${s.id}.${path}`)) why = "owner text";
            else if (cur === undefined || cur === false || cur === "" || (Array.isArray(cur) && !cur.length)) why = "already";
            else setAt(s.data, path, Array.isArray(cur) ? [] : typeof cur === "string" ? "" : false);
          } else why = "no decor path";
        }
        break;
      }
      case "dropSection": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (!OPTIONAL_TYPES.has(s.type) && s.type !== "stickyCta" && s.type !== "whatsappFloat") why = "required type";
        else if (!planned.has(s.id)) why = "owner section";
        else {
          d.sections = d.sections.filter((x) => x.id !== s.id);
          g.sections = g.sections.filter((x) => x.id !== s.id);
        }
        break;
      }
      case "moveSection": {
        const i = d.sections.findIndex((x) => x.id === op.section);
        if (i < 0) why = "no such section";
        else {
          const [s] = d.sections.splice(i, 1);
          d.sections.splice(Math.max(0, Math.min(d.sections.length, op.to > i ? op.to - 1 : op.to)), 0, s!);
          if (d.sections.findIndex((x) => x.id === op.section) === i) why = "already";
        }
        break;
      }
      case "dropKicker": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else {
          const text = typeof s.data.kicker === "string" ? s.data.kicker.trim() : "";
          const opener = accepts(s.type, "opener") && s.data.opener !== "bare";
          if (!text && !opener) why = "already";
          else {
            if (opener) s.data.opener = "bare";
            if (text && !ownerText(`${s.id}.kicker`)) s.data.kicker = "";
            else if (text && !opener) why = "owner text";
          }
        }
        break;
      }
      case "setOpener": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (!accepts(s.type, "opener")) why = "no opener field";
        else if (s.data.opener === op.to) why = "already";
        else s.data.opener = op.to;
        break;
      }
      case "collapseCta": {
        const s = find(op.section);
        if (!s) why = "no such section";
        else if (!accepts(s.type, "cta")) why = "no cta field";
        else if (s.data.cta === false) why = "already";
        else s.data.cta = false;
        break;
      }
      case "rebalancePhotos":
        g.page.G33 = structuredClone(op.plan);
        break;
      case "scopeReveals": {
        const l = look();
        if (!l) why = "no look";
        else if (l.mo.scope === op.to) why = "already";
        else {
          g.page.G35 = { ...g.page.G35, scope: op.to };
          relook();
        }
        break;
      }
      case "snapPop": {
        const pop = planPop(d.theme.palette.accent, d.theme.look?.cs ?? g.brand.G9, d.theme.palette.base);
        if (pop === d.theme.palette.pop) why = "already";
        else d.theme.palette = { ...d.theme.palette, pop };
        break;
      }
      case "flattenSurfaces": {
        if (d.theme.surfaces !== "flush") d.theme.surfaces = "flush";
        else if (look() && g.brand.G15 !== "hairline" && g.brand.G15 !== "flat") {
          g.brand.G15 = "hairline";
          relook();
        } else why = "already";
        break;
      }
      case "sandSignal": {
        const p = d.theme.palette;
        const ss = sandSignal(p.accent, { strategy: d.theme.look?.cs ?? g.brand.G9, base: p.base });
        if (ss.accent === p.accent && ss.pop === p.pop) why = "already";
        else d.theme.palette = { ...p, accent: ss.accent, pop: ss.pop, neutralHue: Math.round(ss.neutralHue) };
        break;
      }
      case "setHeroImageVh":
        why = "no image-height field";
        break;
      default:
        why = "unknown op";
    }
    if (why) skipped.push({ op, why });
    else applied.push(op);
  }
  return { doc: d, genome: g, applied, skipped };
}

/** The ordering of the repair loop's candidates (DES-§8.6). */
function better(a: GateReport, b: GateReport): boolean {
  if (a.hard.length !== b.hard.length) return a.hard.length < b.hard.length;
  const fa = a.slop.score >= PRE_FIT.slopFail ? 1 : 0;
  const fb = b.slop.score >= PRE_FIT.slopFail ? 1 : 0;
  if (fa !== fb) return fa < fb;
  if (a.slop.score !== b.slop.score) return a.slop.score < b.slop.score;
  return a.q > b.q;
}

/** The ops of one round: hard items first, then the slop items, then the soft ones; ≤ 6, de-duplicated. */
function roundOps(items: { hard: DesignGateItem[]; slop: DesignGateItem[]; soft: DesignGateItem[] }, allowCopy: boolean): { op: RepairOp; item: DesignGateItem }[] {
  const out: { op: RepairOp; item: DesignGateItem }[] = [];
  const seen = new Set<string>();
  for (const it of [...items.hard, ...items.slop, ...items.soft]) {
    for (const op of it.fix ?? []) {
      if (!allowCopy && COPY_OPS.has(op.op)) continue;
      const key = JSON.stringify(op);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ op, item: it });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/**
 * The deterministic repair loop (DES-§8.6) for a landing document (a store template is gated, not repaired, until
 * R2): ≤ 3 rounds of ≤ 6 ops, `runGates` after each round, the best of {original, round 1, 2, 3} kept. ≤ 30 ms.
 */
export function repairDoc(input: GateInput & { doc: PageDoc }, opts: { rounds?: 1 | 2 | 3; allowCopy?: boolean } = {}): { doc: PageDoc; report: GateReport; log: RepairLog[] } {
  const rounds = opts.rounds ?? 3;
  const allowCopy = opts.allowCopy ?? true;
  const planned = new Set(input.genome.sections.map((s) => s.id));
  const counts = (r: GateReport) => ({ hard: r.hard.length, slop: r.slop.score, q: r.q });
  const first = gateRun(input);
  let cur = { input, report: first.report, items: first.items, slop: first.slop, log: [] as RepairLog[] };
  let best = cur;
  for (let round = 0; round < rounds; round++) {
    const { items, slop } = cur;
    const ops = roundOps({ hard: items.filter((x) => x.level === "hard"), slop: slop.items, soft: items.filter((x) => x.level === "soft") }, allowCopy);
    if (!ops.length) break;
    const res = applyOps(cur.input.doc, cur.input.genome, ops.map((x) => x.op), { origin: input.origin, planned });
    if (!res.applied.length) break;
    const theme = res.applied.some((op) => THEME_OPS.has(op.op)) ? buildTheme(res.doc.theme, res.doc.locale) : cur.input.theme;
    const nextInput: GateInput & { doc: PageDoc } = { ...cur.input, doc: res.doc, genome: res.genome, theme, heights: undefined };
    const run = gateRun(nextInput);
    const report = run.report;
    const log = [...cur.log, ...res.applied.map((op): RepairLog => ({ op, item: ops.find((x) => x.op === op)?.item.id ?? "V00", before: counts(cur.report), after: counts(report) }))];
    cur = { input: nextInput, report, items: run.items, slop: run.slop, log };
    if (better(report, best.report)) best = cur;
  }
  return { doc: best.input.doc, report: best.report, log: best.log };
}
