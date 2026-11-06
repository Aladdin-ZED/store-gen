/**
 * The deterministic repair plan (P6 DESIGN; design.md DES-§8.6): the first matching row per item, as the ops the
 * Design check panel offers as its one-click fix (`DesignGateItem.fix`) and `repairDoc` applies round by round. Pure;
 * reads the page view. A row with no applicable op on this page answers [] (the item stays, the panel shows no fix).
 *
 * Struct genes take `changeGene.to` as `<part>=<value>` (`G5` "dmax=80", `G23` "f=quint", `G25` "nb=plain", `G34`
 * "floatCollapses=true"); enum genes take the value.
 */
import { VARIANT_FEATURES } from "@/landing/registry";
import type { SectionBg } from "@/lib/page/schema";
import { grammarPools } from "../compile";
import type { RepairOp } from "./repair";
import { tellDevices, NUMBERED_EYEBROW } from "./slop";
import type { DesignGateItem } from "./types";
import type { PageView, SecView } from "./view";

/** dropSection is allowed on these types only (DES-§8.6) */
export const OPTIONAL_TYPES: ReadonlySet<string> = new Set(["marquee", "socialProof", "stats", "urgency", "video", "gallery", "beforeAfter"]);
const NEUTRALS: readonly SectionBg[] = ["base", "soft", "surface"];
const NO_GLASS: ReadonlySet<string> = new Set(["header", "stickyCta"]);
/** type-led alternatives for the third split of a run (V38) and the non-grid alternatives of a card grid (V33) */
const TYPE_LED: Readonly<Record<string, string>> = { benefits: "numbered", story: "letter", comparison: "table", showcase: "dimensions" };
const NON_GRID: Readonly<Record<string, string>> = { steps: "timeline", benefits: "numbered", reviews: "summary", socialProof: "ugc", offer: "showcase", gallery: "contact" };
/** the plain variants of the S20 / S21 / S22 / S24 / S06 rows */
const PLAIN: Readonly<Record<string, string>> = { "faq:chat": "accordion", "video:phone": "framed", "stats:big-numbers": "rings", "footer:big": "simple", "marquee:tape": "outline", "beforeAfter:slider": "cards", "cta:banner": "stamp", "hero:stage": "editorial", "hero:spec": "split", "showcase:hotspots": "dimensions" };

const has = (type: string, variant: string) => !!VARIANT_FEATURES[type]?.[variant];
const swap = (s: SecView | undefined, to: string | undefined): RepairOp[] => (s && to && to !== s.variant && has(s.type, to) ? [{ op: "swapVariant", section: s.id, to }] : []);

/** A same-type variant whose resolved features satisfy `ok`, the same layout family first. */
export function sameTypeVariant(s: SecView, ok: (f: (typeof VARIANT_FEATURES)[string][string]) => boolean): string | null {
  const all = Object.entries(VARIANT_FEATURES[s.type] ?? {}).filter(([id, f]) => id !== s.variant && ok(f));
  return (all.find(([, f]) => f.family === s.family) ?? all[0])?.[0] ?? null;
}

/** The neutral ground that differs from both neighbours (V07). */
function neutralFor(v: PageView, s: SecView): SectionBg | null {
  const prev = v.flow[s.flow - 1]?.bg;
  const next = v.flow[s.flow + 1]?.bg;
  return NEUTRALS.find((b) => b !== prev && b !== next && b !== s.bg) ?? null;
}

const byId = (v: PageView, id: string | undefined) => (id ? v.all.find((s) => s.id === id) : undefined);

/** The fold ladder of V25 (rev 3, UX-11): the first rung that still has room on this page. */
function foldRung(v: PageView): RepairOp[] {
  const h = v.hero;
  if (!h) return [];
  const sub = typeof h.data.subtitle === "string" ? h.data.subtitle : "";
  if (sub.split(/\s+/).filter(Boolean).length > 12) return [{ op: "trimCopy", section: h.id, field: "subtitle", maxWords: 12 }];
  if (h.kickerText) return [{ op: "dropKicker", section: h.id }];
  const dmax = v.look?.type.dmax ?? v.genome.brand.G5.dmax;
  if (dmax - 8 >= 48) return [{ op: "changeGene", gene: "G5", to: `dmax=${dmax - 8}` }];
  const pool = grammarPools(v.look?.g ?? v.genome.page.G2, { newHeroes: true }).hero.map((x) => x.variant).filter((x) => x !== h.variant);
  return pool[0] ? [{ op: "swapHeroFamily", to: pool[0] }] : [];
}

/** The ops of one item (DES-§8.6, the first matching row). */
export function planFor(item: DesignGateItem, v: PageView): RepairOp[] {
  const s = byId(v, item.section);
  const id = String(item.id);
  switch (id) {
    case "V06":
    case "S02": {
      const keep = v.look?.glass ?? v.genome.page.G16;
      return v.all
        .filter((x) => x.glass > 0 && !NO_GLASS.has(x.type))
        .slice(keep)
        .map((x): RepairOp => ({ op: "solidifyGlass", section: x.id }));
    }
    case "V05":
    case "S03":
      return [{ op: "snapLadder" }];
    case "V07": {
      const to = s ? neutralFor(v, s) : null;
      return s && to ? [{ op: "setBg", section: s.id, to }] : [];
    }
    case "V08":
    case "S05": {
      const runs: SecView[][] = [];
      let cur: SecView[] = [];
      for (const x of v.flow) {
        if (x.align === "center" && x.words > 0) cur.push(x);
        else if (cur.length) (runs.push(cur), (cur = []));
      }
      if (cur.length) runs.push(cur);
      const run = runs.sort((a, b) => b.length - a.length)[0];
      const mid = run?.[Math.floor(run.length / 2)];
      return mid ? [{ op: "setAlign", section: mid.id, to: "start" }] : [];
    }
    case "V11":
      return s ? (v.photo.bySection.get(s.id)?.some((u) => u.crop === "bleed") ? [{ op: "frameImage", section: s.id, slot: s.f.slots?.[0]?.name ?? "main" }] : [{ op: "changeGene", gene: "G18", to: "framed" }]) : [];
    case "V12":
      return s ? [{ op: "frameImage", section: s.id, slot: s.f.slots?.[0]?.name ?? "main" }] : [];
    case "V13":
      return [{ op: "changeGene", gene: "G18", to: "framed-stage" }];
    case "V19":
    case "S14": {
      const strips = v.all.filter((x) => x.f.scroller && (x.f.textRuns ?? []).includes("marquee"));
      const marquee = strips.find((x) => x.type === "marquee");
      if (marquee) return [{ op: "dropSection", section: marquee.id }];
      const ribbon = strips.find((x) => x.type === "trustBar");
      if (ribbon) return swap(ribbon, "chips");
      const ticker = strips.find((x) => x.type === "announcement");
      return swap(ticker, "static");
    }
    case "V22": {
      const form = v.all.find((x) => x.type === "orderForm");
      if (!form) return [];
      const target = [...v.flow].reverse().find((x) => x.type !== "hero" && x.flow < form.flow && x.top <= 2532);
      return target ? [{ op: "moveSection", section: form.id, to: target.idx }] : [];
    }
    case "V22.offer": {
      const last = [...v.flow].reverse().find((x) => x.type === "cta");
      return s && last ? [{ op: "moveSection", section: s.id, to: last.idx }] : [];
    }
    case "V23":
    case "S09":
      return [{ op: "changeGene", gene: "G23", to: "f=quint" }];
    case "V23.layout":
      return s ? swap(s, sameTypeVariant(s, (f) => !f.animatesLayout) ?? undefined) : [];
    case "V10": {
      const strong = v.flow.filter((x) => (x.bg === "accent" || x.bg === "pop" || x.bg === "dark") && x.type !== "hero" && x.type !== "orderForm");
      const high = Number(item.vars?.area ?? 0) > Number(item.vars?.hi ?? 100);
      if (high) {
        const last = strong[strong.length - 1];
        const to = last ? neutralFor(v, last) : null;
        return last && to ? [{ op: "setBg", section: last.id, to }] : [];
      }
      const cand = v.flow.find((x) => x.type !== "hero" && x.type !== "orderForm" && x.bg !== "accent" && v.flow[x.flow - 1]?.bg !== "accent" && v.flow[x.flow + 1]?.bg !== "accent");
      return cand ? [{ op: "setBg", section: cand.id, to: "accent" }] : [];
    }
    case "S04": {
      const triplets = v.flow.filter((x) => x.f.equalCards === 3).slice(1);
      return triplets.flatMap((x) => swap(x, x.type === "benefits" ? "numbered" : x.type === "steps" ? "timeline" : NON_GRID[x.type]));
    }
    case "S06":
      return v.all.filter((x) => PLAIN[`${x.type}:${x.variant}`] && ["hero:stage", "hero:spec", "cta:banner"].includes(`${x.type}:${x.variant}`)).slice(2).flatMap((x) => swap(x, PLAIN[`${x.type}:${x.variant}`]));
    case "S12":
    case "V35":
      return v.all.filter((x) => x.f.ghostWord).map((x): RepairOp => ({ op: "dropDecor", section: x.id, decor: "ghost" }));
    case "S13":
      return v.all.filter((x) => x.f.overlayChips > 0 && x.images > 0).slice(1).map((x): RepairOp => ({ op: "dropDecor", section: x.id, decor: "chips" }));
    case "S15":
    case "S18": {
      const ops: RepairOp[] = [];
      for (const x of v.all) {
        if (x.kickerText && (id === "S18" || NUMBERED_EYEBROW.test(x.kickerText))) ops.push(x.type === "hero" ? { op: "rewriteLine", section: x.id, field: "kicker" } : { op: "dropKicker", section: x.id });
        if (x.type === "hero" && typeof x.data.issue === "string" && NUMBERED_EYEBROW.test(x.data.issue)) ops.push({ op: "rewriteLine", section: x.id, field: "issue" });
      }
      return id === "S18" ? ops.slice(0, 2) : ops;
    }
    case "S17": {
      const rings = v.all.filter((x) => x.f.ring);
      return rings.flatMap((x): RepairOp[] => {
        const reg = VARIANT_FEATURES[x.type]?.[x.variant];
        if (reg?.decor?.ring) return [{ op: "dropDecor", section: x.id, decor: "ring" }];
        return swap(x, sameTypeVariant(x, (f) => !f.ring) ?? undefined);
      });
    }
    case "C01":
    case "C05":
    case "C07":
      return s && item.field ? [{ op: "punctuate", section: s.id, field: item.field }] : [];
    case "C02":
    case "C03":
    case "C06":
    case "C08":
      return s && item.field ? [{ op: "rewriteLine", section: s.id, field: item.field }] : [];
    case "V09": {
      if (!s) return [];
      const budget = Number(item.vars?.limit ?? 70);
      const field = ["lead", "subtitle", "body", "text", "description", "intro"].find((k) => typeof s.data[k] === "string" && (s.data[k] as string).trim());
      return field ? [{ op: "trimCopy", section: s.id, field, maxWords: Math.max(8, Math.floor(budget * 0.6)) }] : [];
    }
    case "V25":
      return foldRung(v);
    case "V37":
      return [{ op: "sandSignal" }];
    case "V38": {
      const splits = v.flow.filter((x) => x.family === "split");
      const third = splits[2] ?? splits[splits.length - 1];
      return third ? swap(third, TYPE_LED[third.type] ?? sameTypeVariant(third, (f) => f.family !== "split") ?? undefined) : [];
    }
    case "V38.families":
    case "V38.media": {
      const media = v.flow.filter((x) => x.family === "split" || x.family === "media");
      const pick = media[1] ?? media[0];
      return pick ? swap(pick, TYPE_LED[pick.type] ?? sameTypeVariant(pick, (f) => f.family !== "split" && f.family !== "media") ?? undefined) : [];
    }
    case "V39": {
      const h = v.hero;
      if (!h) return [];
      const pool = grammarPools(v.look?.g ?? v.genome.page.G2, { newHeroes: true }).hero.map((x) => x.variant).filter((x) => x !== h.variant && (VARIANT_FEATURES.hero?.[x]?.signature ?? 0) >= 1 && x !== "statement");
      return pool[0] ? [{ op: "swapHeroFamily", to: pool[0] }] : [];
    }
    case "V40":
      return v.all.filter((x) => x.f.aurora).map((x): RepairOp => ({ op: "dropDecor", section: x.id, decor: "aurora" }));
    case "V26": {
      const form = v.all.find((x) => x.type === "orderForm");
      const over = Number(item.vars?.count ?? 0) - 6;
      const lastCta = [...v.flow].reverse().find((x) => x.type === "cta");
      const cands = v.flow
        .filter((x) => x.ctas > 0 && !["hero", "orderForm"].includes(x.type))
        .sort((a, b) => (a === lastCta ? 1 : b === lastCta ? -1 : Math.abs(b.flow - (form?.flow ?? 0)) - Math.abs(a.flow - (form?.flow ?? 0))));
      return cands.slice(0, Math.max(0, over)).map((x): RepairOp => ({ op: "collapseCta", section: x.id }));
    }
    case "V27": {
      const floats = v.all.filter((x) => x.f.fixed === "float");
      const bars = v.all.filter((x) => x.f.fixed === "bar");
      if (bars.length > 1) return [{ op: "dropSection", section: bars[1]!.id }];
      if (floats.length > 1) return [{ op: "dropSection", section: floats[1]!.id }];
      return [{ op: "changeGene", gene: "G34", to: "floatCollapses=true" }];
    }
    case "V28":
      return [{ op: "scopeReveals", to: v.look?.mo.scope === "heads" ? "hero" : "heads" }];
    case "V29":
      return [{ op: "flattenSurfaces" }];
    case "V30": {
      const headed = v.flow.filter((x) => x.type !== "hero" && x.kicker);
      const budget = v.counts.eyebrowBudget;
      const ops: RepairOp[] = [];
      // the kickers above the budget, and the second of two neighbours
      headed.forEach((x, i) => {
        const prev = v.flow[x.flow - 1];
        if (i >= budget || (prev && prev.kicker && prev.type !== "hero")) ops.push({ op: "dropKicker", section: x.id });
      });
      return ops.slice(0, 6);
    }
    case "V31": {
      const offer = v.all.find((x) => x.type === "offer" && x.f.picker);
      return swap(offer, "showcase");
    }
    case "V32": {
      const trust = v.flow.filter((x) => x.type === "trustBar");
      if (trust.length > 1) return [{ op: "dropSection", section: trust[trust.length - 1]!.id }];
      const urgency = v.flow.find((x) => x.type === "urgency");
      return urgency ? [{ op: "dropSection", section: urgency.id }] : [];
    }
    case "V33": {
      const adj = v.flow.find((x, i) => i > 0 && x.f.cardGrid && v.flow[i - 1]!.f.cardGrid) ?? v.flow.filter((x) => x.f.cardGrid)[3];
      return adj ? swap(adj, NON_GRID[adj.type] ?? sameTypeVariant(adj, (f) => !f.cardGrid) ?? undefined) : [];
    }
    case "V34":
      return s ? (s.type === "marquee" && s.variant !== "outline" ? swap(s, "outline") : OPTIONAL_TYPES.has(s.type) ? [{ op: "dropSection", section: s.id }] : []) : [];
    case "V36":
      return [{ op: "snapPop" }];
    case "S19":
      return v.look ? [{ op: "changeGene", gene: "G35", to: "whole-line" }] : [];
    case "S20":
    case "S21":
    case "S22":
    case "S24":
      return s ? swap(s, PLAIN[`${s.type}:${s.variant}`]) : [];
    case "S23": {
      const u = v.all.find((x) => x.type === "urgency");
      return u ? [{ op: "dropSection", section: u.id }] : [];
    }
    case "S26": {
      // the lowest-value devices first, until ≤ 2 remain
      const devices = tellDevices(v);
      const ops: RepairOp[] = [];
      for (const d of ["ghost", "stamp", "tape", "countdown", "footerWord", "bigNumbers", "phone", "chat", "slider", "hotspots", "padded", "eyebrows", "figCaption"]) {
        if (devices.length - ops.length <= 2) break;
        if (!devices.includes(d)) continue;
        const pick = (type: string, variant?: string) => v.all.find((x) => x.type === type && (!variant || x.variant === variant));
        const one: RepairOp[] =
          d === "ghost"
            ? v.all.filter((x) => x.f.ghostWord).map((x): RepairOp => ({ op: "dropDecor", section: x.id, decor: "ghost" }))
            : d === "stamp"
              ? planFor({ ...item, id: "S17" }, v)
              : d === "tape"
                ? swap(pick("marquee", "tape"), "outline")
                : d === "countdown"
                  ? ((u) => (u ? [{ op: "dropSection", section: u.id } as RepairOp] : []))(pick("urgency", "countdown"))
                  : d === "footerWord"
                    ? swap(pick("footer", "big"), "simple")
                    : d === "bigNumbers"
                      ? swap(pick("stats", "big-numbers"), "rings")
                      : d === "phone"
                        ? swap(pick("video", "phone"), "framed")
                        : d === "chat"
                          ? swap(pick("faq", "chat"), "accordion")
                          : d === "slider"
                            ? swap(pick("beforeAfter", "slider"), "cards")
                            : d === "hotspots"
                              ? swap(pick("showcase", "hotspots"), "dimensions")
                              : d === "padded"
                                ? [{ op: "changeGene", gene: "G25", to: "nb=plain" }]
                                : d === "eyebrows"
                                  ? planFor({ ...item, id: "S15" }, v)
                                  : [];
        if (one.length) ops.push(...one);
      }
      return ops.slice(0, 6);
    }
    case "V21":
      return [{ op: "changeGene", gene: "G27", to: "solid" }];
    case "V24": {
      const drop = [...v.flow].reverse().find((x) => OPTIONAL_TYPES.has(x.type));
      return drop && v.heights.inFlow > 8 ? [{ op: "dropSection", section: drop.id }] : [];
    }
    case "N01":
    case "N03":
      return [{ op: "differentiate", gene: "G2", seeds: 6 }];
    default:
      return [];
  }
}
