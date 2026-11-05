/**
 * The visual and structural gates V01-V40 and the composition item C4 (P6 DESIGN; design.md DES-§8.2, DES-§8.10,
 * DS33). Pure and isomorphic: static checks over the page view (./view.ts: doc + registry features + the height model +
 * the type tokens), the built theme's tokens and the asset metadata. Levels are DES-§8.2's: V09 / V24 / V26 / V28 are
 * soft here because their hard level is the core's budget gate (this part reports, never refuses twice), V20 is info
 * (landing's honesty gate refuses), V25 has three zones (≤ 760 ok, 760-938 soft with `vars.estimated = 1`, > 938 hard).
 *
 * Each item names the design-baseline §5 target it enforces (`target`, DES-§8.10) where this part is that target's
 * refuser, so the publish dialog, the Design check panel and Store Health show one id (`design:<target>`).
 *
 * Static readings that stand in for a render (each documented where it is read): the radius ladder from the look's
 * G12 tiers at the element classes' heights; the body measure from the container and the type steps; the marquee
 * clip from the item lengths; the image resolution at 390 with DPR 2 (the hard line) and at 1440 with DPR 1.
 */
import { bigWordOf } from "@/landing/sections/hero/copy";
import { orangeMixesInTokens } from "@/lib/theme/blend";
import { contrast, hexToRgb, isOrange, toOklch, type Hex } from "@/lib/theme/color";
import { COLOR_PLANS, goldBand, popRuleViolation, sandSignal, thirdHues } from "@/lib/theme/palette";
import { LADDER_PX } from "@/lib/theme/tokens";
import type { Grammar } from "@/lib/page/schema";
import { FOLD_TARGET } from "../sheets";
import type { DesignGateItem, GateInput, GateId } from "./types";
import { accepts, type PageView, type SecView } from "./view";

type Item = DesignGateItem;
const HEX = /^#[0-9a-f]{6}$/i;
const isHex = (v: string | undefined): v is Hex => !!v && HEX.test(v);

/* ------------------------------------------------------------------ */
/* small readers                                                       */
/* ------------------------------------------------------------------ */

/** APCA-W3 0.0.98G lightness contrast (advisory, V02): |Lc| of text on a background. */
export function apcaLc(text: Hex, bg: Hex): number {
  const y = (hex: Hex) => {
    const [r, g, b] = hexToRgb(hex).map((c) => c ** 2.4) as [number, number, number];
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v > 0.022 ? v : v + (0.022 - v) ** 1.414;
  };
  const t = y(text);
  const b = y(bg);
  if (Math.abs(b - t) < 0.0005) return 0;
  if (b > t) {
    const s = (b ** 0.56 - t ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (b ** 0.65 - t ** 0.62) * 1.14;
  return s > -0.1 ? 0 : Math.abs((s + 0.027) * 100);
}

/** The blend audit of a token map, once per built theme (the theme object is reused across edits and repair rounds). */
const ORANGE = new WeakMap<object, string[]>();
function orangeOf(tokens: Readonly<Record<string, string>>): string[] {
  let hit = ORANGE.get(tokens);
  if (!hit) ORANGE.set(tokens, (hit = orangeMixesInTokens(tokens)));
  return hit;
}

/** px values of a token ("20px", "6.25rem", "clamp(20px, …, 64px)": the bounds). */
function pxOf(v: string | undefined): number[] {
  if (!v) return [];
  const all = [...v.matchAll(/(-?\d+(?:\.\d+)?)(px|rem)/g)].map((m) => (m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])));
  if (v.startsWith("clamp(") && all.length >= 2) return [all[0]!, all[all.length - 1]!];
  return all;
}

/** "4:5" → 0.8; "free" → null */
const aspectRatio = (a: string | undefined) => {
  const m = /^(\d+):(\d+)$/.exec(a ?? "");
  return m ? Number(m[1]) / Number(m[2]) : null;
};

/** the share of the asset's width a crop keeps (V11, DES-§8.2) */
const CROP_SHARE: Readonly<Record<string, number>> = { full: 1, tight: 0.5, context: 1, bleed: 1 };
/** the grammars whose mobile centred cap is 4 (V08, rev 3 UX-12) */
const CENTRED_GRAMMARS: ReadonlySet<Grammar> = new Set(["poster", "quiet-luxe"]);
/** H20: the underline button is the primary CTA only on these grammars (V21) */
const UNDERLINE_GRAMMARS: ReadonlySet<Grammar> = new Set(["editorial-column", "quiet-luxe", "catalogue"]);
/** V09 exemptions: their length is their content (rev 3 UX-12) */
const DENSITY_EXEMPT: ReadonlySet<string> = new Set(["faq", "specs", "comparison", "orderForm", "footer"]);
/** V09 lists that carry the 3-6 item budget */
const LIST_TYPES: ReadonlySet<string> = new Set(["benefits", "steps", "problem"]);
const WORD_BUDGET = { airy: 35, balanced: 70, dense: 120 } as const;
/** V38: media-led and type-led layout families */
const MEDIA_LED: ReadonlySet<string> = new Set(["split", "media"]);
/** the element-class heights the effective radius reads (V05: `min(token, height / 2)`) */
const ELEMENT_H = { chip: 28, control: 48, card: 320, media: 420 } as const;
const STRONG: ReadonlySet<string> = new Set(["accent", "dark", "pop"]);

const it = (id: GateId, level: Item["level"], penalty: number, msg: Item["msg"], extra: Partial<Item> = {}): Item => ({ id, level, penalty: level === "hard" ? 15 : level === "info" ? 0 : penalty, msg, ...extra });

/* ------------------------------------------------------------------ */
/* the gates                                                           */
/* ------------------------------------------------------------------ */

/** V01 / V02 / V03 / V36 / V37 / V40: the colour gates over the emitted tokens. */
function colourGates(v: PageView, input: GateInput, out: Item[]): void {
  const t = input.theme.tokens;
  const bgs = [...new Set(["base", ...v.all.map((s) => s.bg)])];
  const firstOf = (bg: string) => v.all.find((s) => s.bg === bg)?.id;
  let apcaItems = 0;
  for (const bg of bgs) {
    const k = (n: string) => t[`${bg}:${n}`] ?? (bg === "base" ? t[n] : undefined);
    const ground = k("sec-bg");
    if (!isHex(ground)) continue;
    const pairs: [string, string | undefined, string | undefined, number][] = [
      ["ink", k("sec-ink"), ground, 4.5],
      ["ink-soft", k("sec-ink-soft"), ground, 4.5],
      ["button", k("sec-accent-ink"), k("sec-accent"), 4.5],
      ["card", k("sec-card-ink"), k("sec-card"), 4.5],
      ["line", k("sec-line-strong"), ground, 3],
    ];
    for (const [name, fg, back, min] of pairs) {
      if (!isHex(fg) || !isHex(back)) continue;
      const ratio = contrast(fg, back);
      if (ratio + 1e-6 < min) out.push(it("V01", "hard", 15, "design.gate.V01", { target: input.theme.scheme === "dark" ? "K7" : undefined, section: firstOf(bg), vars: { bg, pair: name, ratio: Math.round(ratio * 100) / 100, min } }));
    }
    const ink = k("sec-ink");
    if (isHex(ink) && apcaItems < 3) {
      const lc = apcaLc(ink, ground);
      if (lc < 75) {
        apcaItems++;
        out.push(it("V02", "soft", 2, "design.gate.V02", { section: firstOf(bg), vars: { bg, lc: Math.round(lc), min: 75 } }));
      }
    }
  }
  // V03: no orange anywhere (the owner rule): the emitted blends and any colour literal in the section data
  const mixes = orangeOf(t);
  if (mixes.length) out.push(it("V03", "hard", 15, "design.gate.V03", { target: "K6", vars: { count: mixes.length } }));
  for (const s of v.all) {
    const literals = JSON.stringify(s.data).match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    if (literals.some((c) => isOrange(c.toLowerCase()))) out.push(it("V03", "hard", 15, "design.gate.V03", { target: "K6", section: s.id, vars: { count: 1 } }));
  }
  // V36 / V37: the pop rule, the third hue on a dark base, the gold band of the accent and pop roles
  const accent = t["lp-accent"];
  const pop = t["lp-pop"];
  const strategy = v.look?.cs ?? v.genome.brand.G9;
  if (isHex(accent) && isHex(pop)) {
    const why = popRuleViolation(accent, pop, strategy);
    if (why && !goldBand(pop)) out.push(it("V36", "hard", 15, "design.gate.V36", { target: "K4", vars: { strategy } }));
    if (input.theme.scheme === "dark" && thirdHues(t).length) out.push(it("V36", "hard", 15, "design.gate.V36", { target: "K4", vars: { strategy, third: thirdHues(t).length } }));
    for (const [role, hex] of [["accent", accent], ["pop", pop]] as const) {
      if (goldBand(hex)) {
        const o = toOklch(hex);
        out.push(it("V37", "hard", 15, "design.gate.V37", { target: "K6", vars: { role, hue: Math.round(o.h), colour: sandSignal(hex, { strategy }).accent } }));
      }
    }
  }
  // V40: no aurora, no grain on a generated page (the regression guard)
  const grain = input.theme.attrs["data-texture"] === "grain" || Object.keys(t).some((n) => /lp-(aurora|grain)/.test(n));
  const aurora = v.all.filter((s) => s.f.aurora);
  if (grain || aurora.length) out.push(it("V40", "hard", 15, "design.gate.V40", { section: aurora[0]?.id, vars: { count: aurora.length + (grain ? 1 : 0) } }));
}

/** V04 / V05: the grid unit and the radius ladder (look pages; a page without look keeps today's audited tokens). */
function shapeGates(v: PageView, input: GateInput, out: Item[]): void {
  const look = v.look;
  if (!look) return;
  const t = input.theme.tokens;
  const u = look.grid.u;
  const bad: string[] = [];
  if (look.grid.w % u) bad.push("container");
  for (const name of ["lp-gutter", "lp-panel-gap", "lp-panel-inset", "lp-space-section", "lp-container"]) for (const px of pxOf(t[name])) if (Math.abs(px / 4 - Math.round(px / 4)) > 0.01) bad.push(name);
  if (bad.length) out.push(it("V04", "hard", 15, "design.gate.V04", { vars: { unit: u, tokens: [...new Set(bad)].join(", ") } }));
  // V05: effective radius = min(token, height / 2); pill-shaped elements (token ≥ height / 2) leave the ordering test
  const [chip, control, card, media] = LADDER_PX[look.ladder];
  const eff = { chip: Math.min(chip, ELEMENT_H.chip / 2), control: Math.min(control, ELEMENT_H.control / 2), card: Math.min(card, ELEMENT_H.card / 2), media: Math.min(media, ELEMENT_H.media / 2) };
  const pill = { chip: chip >= ELEMENT_H.chip / 2, control: control >= ELEMENT_H.control / 2 };
  const ladder: [string, number][] = [];
  if (!pill.chip) ladder.push(["chip", eff.chip]);
  if (!pill.control) ladder.push(["control", eff.control]);
  ladder.push(["card", eff.card]);
  if (look.ladder !== "mixed") ladder.push(["media", eff.media]);
  let ordered = true;
  for (let i = 1; i < ladder.length; i++) {
    const [a, ra] = ladder[i - 1]!;
    const [b, rb] = ladder[i]!;
    // chip < control ≤ card < media
    const strict = (a === "chip" && b !== "chip") || b === "media";
    if (strict ? !(ra < rb) : !(ra <= rb)) ordered = false;
  }
  const mixedOk = look.ladder !== "mixed" || (control <= 8 && (look.mask === "cut" || look.mask === "rect"));
  if (media >= 999) ordered = false;
  if (!ordered || !mixedOk) out.push(it("V05", "hard", 15, "design.gate.V05", { target: "R6", vars: { ladder: look.ladder } }));
}

/** The estimated area of the colour moments (accent / pop grounds, a dark ground on a light page) over the flow (V10, the digest). */
export function accentArea(v: PageView, darkBase: boolean): number {
  void darkBase;
  const total = v.flow.reduce((n, s) => n + s.height, 0);
  const strong = v.flow.filter((s) => s.bg === "accent" || s.bg === "pop").reduce((n, s) => n + s.height, 0);
  return total ? strong / total : 0;
}

/** V06-V10: glass, background rhythm, alignment runs, density words, accent area. */
function rhythmGates(v: PageView, input: GateInput, out: Item[]): void {
  // V06: glass surfaces (the nav and the sticky bar excluded) ≤ 2; the core's budget:R4 refuses above 4
  if (v.counts.glass > 2) out.push(it("V06", "soft", 2, "design.gate.V06", { vars: { count: v.counts.glass, limit: 2 } }));
  // V07: I5, no same-background neighbours in the flow
  for (let i = 1; i < v.flow.length; i++) {
    const a = v.flow[i - 1]!;
    const b = v.flow[i]!;
    if (a.bg === b.bg) out.push(it("V07", "hard", 15, "design.gate.V07", { section: b.id, vars: { bg: b.bg, prev: a.id } }));
  }
  // V08: centred body copy in a row, grammar-aware (display-only sections do not count)
  const g = v.look?.g ?? v.genome.page.G2;
  const cap = CENTRED_GRAMMARS.has(g) || v.hero?.variant === "statement" ? 4 : 2;
  if (v.counts.centeredRun > cap) out.push(it("V08", "soft", 2, "design.gate.V08", { target: "C6", vars: { count: v.counts.centeredRun, limit: cap } }));
  // V09: lead + body words per section by density; list items 3-6; hard above 2×
  const dens = v.look?.dens ?? v.genome.page.G20.l;
  const budget = WORD_BUDGET[dens];
  for (const s of v.flow) {
    if (DENSITY_EXEMPT.has(s.type) || s.type === "hero") continue;
    if (s.words > 2 * budget) out.push(it("V09", "hard", 15, "design.gate.V09", { target: "C7", section: s.id, vars: { count: s.words, limit: budget } }));
    else if (s.words > budget) out.push(it("V09", "soft", 1, "design.gate.V09", { target: "C7", section: s.id, vars: { count: s.words, limit: budget } }));
    if (LIST_TYPES.has(s.type) && s.listItems && (s.listItems < 3 || s.listItems > 6)) out.push(it("V09", "soft", 1, "design.gate.V09.items", { target: "C7", section: s.id, vars: { count: s.listItems, min: 3, max: 6 } }));
  }
  // V10: accent area (moment grounds × heights) within the strategy's band ± 0.03
  const strategy = v.look?.cs ?? v.genome.brand.G9;
  const [lo, hi] = COLOR_PLANS[strategy].area;
  const total = v.flow.reduce((n, s) => n + s.height, 0);
  const area = accentArea(v, input.theme.scheme === "dark");
  // the grounds are a lower bound of the accent area (buttons, rules and chips add to it), so only an excess is read
  void lo;
  if (total && area > hi + 0.03) out.push(it("V10", "soft", 2, "design.gate.V10", { target: "K3", vars: { area: Math.round(area * 100), lo: Math.round(lo * 100), hi: Math.round(hi * 100) } }));
  void input;
}

/** V11-V14: image resolution, focal safe area, cutout, photo reuse. */
function imageGates(v: PageView, input: GateInput, out: Item[]): void {
  const doc = v.landing;
  const focusOf = (asset: string, s: SecView): { x: number; y: number } | null => {
    const meta = input.assets.get(asset)?.focus;
    if (meta) return meta;
    const ref = [...(doc?.product.images ?? []), ...(Array.isArray(s.data.images) ? (s.data.images as { id?: string; fx?: number; fy?: number }[]) : [])].find((r) => r?.id === asset);
    return ref && (ref.fx !== undefined || ref.fy !== undefined) ? { x: ref.fx ?? 0.5, y: ref.fy ?? 0.5 } : null;
  };
  for (const s of v.all) {
    const uses = v.photo.bySection.get(s.id);
    const slot = s.f.slots?.[0];
    if (!uses?.length || !slot) continue;
    for (const u of uses) {
      const meta = input.assets.get(u.asset);
      if (meta && meta.width > 0) {
        const eff = meta.width * (CROP_SHARE[u.crop] ?? 1);
        const need = slot.cssWidth390 * 2;
        const ratio = eff / need;
        if (ratio < 1) out.push(it("V11", "hard", 15, "design.gate.V11", { target: "I6", section: s.id, vars: { section: s.type, px: Math.round(eff), need: Math.round(need) } }));
        else if (ratio < 1.5 || eff < slot.cssWidth1440) out.push(it("V11", "soft", 1, "design.gate.V11.soft", { target: "I6", section: s.id, vars: { section: s.type, px: Math.round(eff), need: Math.round(need * 1.5) } }));
      }
      // V12: the focal point inside the inner 80 % of the crop on the axis the slot crops
      const f = focusOf(u.asset, s);
      const sa = aspectRatio(slot.aspect);
      if (f && sa && meta && meta.width > 0 && meta.height > 0) {
        const aa = meta.width / meta.height;
        const off = (x: number) => x < 0.1 || x > 0.9;
        if ((sa < aa - 0.01 && off(f.x)) || (sa > aa + 0.01 && off(f.y))) out.push(it("V12", "hard", 15, "design.gate.V12", { target: "I2", section: s.id, vars: { section: s.type } }));
      }
    }
  }
  // V13: a cutout-stage hero renders a real alpha mask
  const hero = v.hero;
  if (hero && doc && (v.look?.img ?? v.genome.page.G18) === "cutout-stage" && ["stage", "poster", "spec"].includes(hero.variant)) {
    const cut = doc.product.cutout?.id;
    const first = v.photo.bySection.get(hero.id)?.[0]?.asset ?? doc.product.images[0]?.id;
    const alpha = !!cut || (!!first && input.assets.get(first)?.alpha === true);
    if (!alpha) out.push(it("V13", "hard", 15, "design.gate.V13", { target: "I3", section: hero.id }));
  }
  // V14: the same asset ≤ 3 times, the hero ≤ 2 at its crop, ≥ 3 distinct crops with ≥ 2 assets (when the page has
  // that many photo uses; with one asset the H36 grammar plans two crops and the rule is not raised)
  for (const [asset, n] of Object.entries(v.photo.uses)) if (n > 3) out.push(it("V14", "soft", n - 3, "design.gate.V14", { vars: { count: n, limit: 3, asset: asset.slice(0, 8) } }));
  if (v.photo.heroSameCrop > 2) out.push(it("V14", "soft", v.photo.heroSameCrop - 2, "design.gate.V14.hero", { vars: { count: v.photo.heroSameCrop, limit: 2 } }));
  const totalUses = Object.values(v.photo.uses).reduce((a, b) => a + b, 0);
  if (v.photo.assets >= 2 && v.photo.crops < Math.min(3, totalUses)) out.push(it("V14", "soft", 2, "design.gate.V14.crops", { vars: { count: v.photo.crops, min: Math.min(3, totalUses) } }));
}

/** V15-V18: type contrast, weights, measure, RTL. */
function typeGates(v: PageView, input: GateInput, out: Item[]): void {
  const tt = v.type.tt;
  const t = input.theme.tokens;
  if (tt) {
    if (tt.ratio.m < 2.5 || tt.ratio.d < 2.5 || tt.heroAt390 < 44) out.push(it("V15", "soft", 3, "design.gate.V15", { target: "T6", vars: { ratio: Math.round(Math.min(tt.ratio.m, tt.ratio.d) * 10) / 10, min: 2.5, px: Math.round(tt.heroAt390) } }));
    // V17: body measure at 1440 (the text column, capped at 680 px, over the body size × the Latin average advance 0.52 em)
    const container = v.look?.grid.w ?? 1240;
    const body = tt.steps[0]?.d ?? 18;
    const col = Math.min(680, container * 0.55);
    const ch = col / (body * 0.52);
    if (ch < 45 || ch > 75) out.push(it("V17", "soft", 1, "design.gate.V17", { vars: { ch: Math.round(ch), min: 45, max: 75 } }));
  }
  // V16: font weights a section draws (display, body, strong; the label shares the body's)
  const weights = new Set(["lp-display-weight", "lp-body-weight", "lp-strong-weight"].map((n) => t[n]).filter(Boolean));
  if (weights.size > 3) out.push(it("V16", "soft", 1, "design.gate.V16", { vars: { count: weights.size, limit: 3 } }));
  // V18: Arabic pages: no uppercase, letter-spacing or italic tokens; the engine's --lp-ar-scale
  if (v.ar) {
    const bad: string[] = [];
    for (const n of ["lp-display-case", "lp-label-case"]) if (t[n] && t[n] !== "none") bad.push(n);
    for (const n of ["lp-display-tracking", "lp-label-tracking"]) if (t[n] && !/^(0|0em|0px|normal)$/.test(t[n]!)) bad.push(n);
    if (t["lp-emphasis-style"] === "italic") bad.push("lp-emphasis-style");
    const scale = Number(t["lp-ar-scale"]);
    if (v.look && t["lp-ar-scale"] !== undefined && (!(scale >= 1.04 - 1e-6 && scale <= 1.14 + 1e-6) || (tt && Math.abs(scale - tt.arScale) > 0.006))) bad.push("lp-ar-scale");
    if (bad.length) out.push(it("V18", "hard", 15, "design.gate.V18", { target: "RTL7", vars: { tokens: bad.join(", ") } }));
  }
}

/** V19-V24: strips, proof honesty (info), CTA clarity, choreography, motion, page length. */
function structureGates(v: PageView, input: GateInput, out: Item[]): void {
  const doc = v.landing;
  if (v.counts.marquees > 1) out.push(it("V19", "hard", 15, "design.gate.V19", { vars: { count: v.counts.marquees, limit: 1 } }));
  // V20 (info): proof sections need owner data; the refusal is landing's honesty gate
  for (const s of v.flow) {
    const proof = (s.type === "reviews" || s.type === "socialProof" || s.type === "stats") && !input.ownerProof;
    const pair = s.type === "beforeAfter" && s.images < 2;
    const video = s.type === "video" && !(typeof s.data.url === "string" && s.data.url) && !s.data.file && !s.data.video;
    const gallery = s.type === "gallery" && s.images < 3 && (v.photo.assets < 3);
    if (proof || pair || video || gallery) out.push(it("V20", "info", 0, "design.gate.V20", { section: s.id, vars: { section: s.type } }));
  }
  // V21: the primary CTA (H20 style, a label, #order)
  if (doc && v.hero) {
    const g = v.look?.g ?? v.genome.page.G2;
    const btn = v.look?.btn ?? v.genome.brand.G27;
    const href = typeof v.hero.data.ctaHref === "string" ? v.hero.data.ctaHref : typeof v.hero.data.href === "string" ? v.hero.data.href : "#order";
    const form = v.all.some((s) => s.type === "orderForm");
    if ((btn === "underline" && !UNDERLINE_GRAMMARS.has(g)) || !href.startsWith("#order") || !form) out.push(it("V21", "hard", 15, "design.gate.V21", { section: v.hero.id, vars: { button: btn } }));
  }
  // V22: I2 (the form within 3 screens), I3 (the offer before the final CTA)
  if (doc) {
    const formTop = v.heights.formTop;
    if (formTop !== null && formTop / 844 > 3) out.push(it("V22", "hard", 15, "design.gate.V22", { section: v.all.find((s) => s.type === "orderForm")?.id, vars: { screens: Math.round((formTop / 844) * 10) / 10, limit: 3 } }));
    const lastCta = [...v.flow].reverse().find((s) => s.type === "cta");
    const lateOffer = lastCta && v.flow.find((s) => s.type === "offer" && s.flow > lastCta.flow);
    if (lateOffer) out.push(it("V22", "hard", 15, "design.gate.V22.offer", { section: lateOffer.id }));
  }
  // V23: no overshoot easing outside playground; nothing animates layout properties (variant features)
  const motionOff = doc?.theme.motion === "off" || v.look?.mo.scope === "none";
  if (v.look && v.look.mo.f === "soft-spring" && v.genome.brand.G1 !== "playground") out.push(it("V23", "hard", 15, "design.gate.V23", { vars: { ease: v.look.mo.f } }));
  // a look keeps the reveals of the hero and the section heads only (src/landing/sections/reveal-scope.ts), so a
  // variant's own layout animation runs on a page without look
  if (!motionOff && !v.look) for (const s of v.all.filter((x) => x.f.animatesLayout)) out.push(it("V23.layout", "hard", 15, "design.gate.V23.layout", { section: s.id, vars: { section: s.type } }));
  // V24: 8-14 in-flow sections, ≤ 12,000 px at 390 (the core's budget:C3 refuses above 16 / 15,000)
  if (doc && (v.heights.inFlow < 8 || v.heights.inFlow > 14 || v.heights.total > 12_000)) out.push(it("V24", "soft", 2, "design.gate.V24", { vars: { count: v.heights.inFlow, px: Math.round(v.heights.total), limit: 12_000 } }));
}

/** V25-V28: the fold, CTA count, floating layers, reveals. */
function budgetGates(v: PageView, input: GateInput, out: Item[]): void {
  const doc = v.landing;
  if (doc && v.hero) {
    const items = Object.entries(v.heights.fold.items) as [string, number][];
    const worst = items.reduce((m, [, px]) => Math.max(m, px), 0);
    const late = items.filter(([, px]) => px > FOLD_TARGET).map(([k]) => k);
    if (worst > 938) out.push(it("V25", "hard", 15, "design.gate.V25", { target: "C2", section: v.hero.id, vars: { px: Math.round(worst), items: late.join(", ") } }));
    else if (worst > FOLD_TARGET) out.push(it("V25", "soft", 2, "design.gate.V25.estimated", { target: "C2", section: v.hero.id, vars: { px: Math.round(worst), items: late.join(", "), estimated: 1 } }));
  }
  if (v.counts.ctas > 6) out.push(it("V26", "soft", 2, "design.gate.V26", { vars: { count: v.counts.ctas, limit: 6 } }));
  const bars = v.all.filter((s) => s.f.fixed === "bar");
  const floats = v.all.filter((s) => s.f.fixed === "float");
  const fixedPx = [...bars, ...floats].reduce((n, s) => n + s.f.fixedPx, 0);
  if (bars.length > 1 || floats.length > 1 || fixedPx > 88) out.push(it("V27", "hard", 15, "design.gate.V27", { target: "R7", section: (bars[1] ?? floats[1] ?? floats[0])?.id, vars: { bars: bars.length, floats: floats.length, px: fixedPx, limit: 88 } }));
  const kinds = v.look?.mo.r.length ?? 1;
  if (v.counts.reveals > 60 || kinds > 2) out.push(it("V28", "soft", 2, "design.gate.V28", { vars: { count: v.counts.reveals, limit: 60 } }));
  void input;
}

/** V29-V35: surfaces, openers, duplication, card grids, marquee clipping, watermark. */
function pageRules(v: PageView, input: GateInput, out: Item[]): void {
  const doc = v.landing;
  // V29: one ground and one card tier: panels only with a flat or hairline card tier (H26)
  const panels = input.theme.attrs["data-surfaces"] === "panels";
  const card = input.theme.attrs["data-card"];
  if (panels && card && card !== "flat" && card !== "outlined") out.push(it("V29", "hard", 15, "design.gate.V29", { target: "K5", vars: { card } }));
  // V30: openers (C5): kickers ≤ ⌈n/3⌉ and never on two neighbours; ≥ 5 distinct openers on a long page; no non-bare
  // opener on > 50 % of the headed sections, hard above 70 % (a bare title is the default, never a tell)
  const headed = v.flow.filter((s) => s.type !== "hero" && !(s.f.openers && s.f.openers.length === 0));
  const kickers = headed.filter((s) => s.kicker);
  const adjacent = v.flow.some((s, i) => i > 0 && s.kicker && v.flow[i - 1]!.kicker && v.flow[i - 1]!.type !== "hero");
  const budget = v.counts.eyebrowBudget;
  const share = new Map<string, number>();
  for (const s of headed) share.set(s.opener, (share.get(s.opener) ?? 0) + 1);
  const top = [...share].filter(([o]) => o !== "bare").sort((a, b) => b[1] - a[1])[0];
  const topShare = top && headed.length ? top[1] / headed.length : 0;
  const distinct = share.size;
  const needDistinct = headed.length >= 10 ? 5 : 0;
  if (topShare > 0.7 && headed.length >= 3) out.push(it("V30", "hard", 15, "design.gate.V30", { target: "C5", vars: { count: kickers.length, total: headed.length, budget } }));
  else if (kickers.length > budget || adjacent || topShare > 0.5 || distinct < needDistinct) out.push(it("V30", "soft", 2, "design.gate.V30", { target: "C5", vars: { count: kickers.length, total: headed.length, budget } }));
  // V31: the pack picker once (in the order form)
  const pickers = v.all.filter((s) => s.f.picker);
  if (pickers.length > 1) out.push(it("V31", "hard", 15, "design.gate.V31", { target: "R2", section: pickers.find((s) => s.type !== "orderForm")?.id, vars: { count: pickers.length } }));
  // V32: the trust strip once; the countdown once; urgency never a section of a generated plan
  const trust = v.flow.filter((s) => s.type === "trustBar");
  const countdowns = v.all.filter((s) => s.type === "urgency" && s.variant === "countdown");
  const planned = new Set(v.genome.sections.map((s) => s.id));
  const urgency = v.flow.filter((s) => s.type === "urgency" && !!v.look && planned.has(s.id));
  if (trust.length > 1 || countdowns.length > 1 || urgency.length) out.push(it("V32", "hard", 15, "design.gate.V32", { target: "R3", section: (trust[1] ?? countdowns[1] ?? urgency[0])?.id, vars: { trust: trust.length, countdown: countdowns.length } }));
  // V33: ≤ 3 card grids, never adjacent (hard above 5)
  const grids = v.flow.filter((s) => s.f.cardGrid);
  const adjacentGrids = v.flow.some((s, i) => i > 0 && s.f.cardGrid && v.flow[i - 1]!.f.cardGrid);
  if (grids.length > 5) out.push(it("V33", "hard", 15, "design.gate.V33", { target: "R9", vars: { count: grids.length, limit: 3 } }));
  else if (grids.length > 3 || adjacentGrids) out.push(it("V33", "soft", 2, "design.gate.V33", { target: "R9", vars: { count: grids.length, limit: 3 } }));
  // V34: a marquee item never clips (whole items; an item wider than the 390 track cannot be shown whole)
  for (const s of v.all.filter((x) => x.f.scroller && (x.f.textRuns ?? []).includes("marquee"))) {
    const items = (Array.isArray(s.data.items) ? s.data.items : []) as unknown[];
    const long = items.map((x) => (typeof x === "string" ? x : typeof (x as { text?: unknown })?.text === "string" ? ((x as { text: string }).text) : "")).some((x) => x.length > 44);
    if (long) out.push(it("V34", "hard", 15, "design.gate.V34", { target: "I7", section: s.id }));
  }
  // V35: the watermark word equals the product-name token
  const h = v.hero;
  if (doc && h && h.f.ghostWord) {
    const word = typeof h.data.bigWord === "string" ? h.data.bigWord.trim() : "";
    const norm = (x: string) => x.normalize("NFC").replace(/[ً-ٰٟ]/g, "").toLowerCase();
    if (word && norm(word) !== norm(bigWordOf(doc.product.name)) && !norm(doc.product.name).includes(norm(word))) out.push(it("V35", "hard", 15, "design.gate.V35", { target: "T8", section: h.id, vars: { word } }));
  }
}

/** V38 / V39 / C4: layout rhythm, the hero signature, the composition slots. */
function compositionGates(v: PageView, out: Item[], comp: { fullBleed: boolean; cross: boolean; quiet: boolean; signature: boolean }): void {
  const n = v.flow.length;
  if (v.counts.zigzagRun > 2) out.push(it("V38", "hard", 15, "design.gate.V38", { target: "C8", vars: { count: v.counts.zigzagRun } }));
  const families = new Set(v.flow.map((s) => s.family)).size;
  const need = n >= 8 ? 4 : Math.max(2, Math.round(n / 2));
  if (families < need - 1) out.push(it("V38", "hard", 15, "design.gate.V38.families", { target: "C8", vars: { count: families, min: need } }));
  else if (families < need) out.push(it("V38", "soft", 3, "design.gate.V38.families", { target: "C8", vars: { count: families, min: need } }));
  else {
    let run = 0;
    let worst = 0;
    for (const s of v.flow) {
      run = MEDIA_LED.has(s.family) ? run + 1 : 0;
      worst = Math.max(worst, run);
    }
    if (worst >= 3) out.push(it("V38", "soft", 2, "design.gate.V38.media", { target: "C8", vars: { count: worst } }));
  }
  if (v.hero && !comp.signature) out.push(it("V39", "soft", 4, "design.gate.V39", { target: "C9", section: v.hero.id }));
  const missing = [!comp.fullBleed && "fullBleedMoment", !comp.cross && "boundaryCross", !comp.quiet && "quietScreen"].filter(Boolean) as string[];
  if (v.landing && v.look && missing.length) out.push(it("V10.c4", "soft", 2, "design.gate.C4", { target: "C4", vars: { missing: missing.join(", "), count: missing.length } }));
}

/** Every V gate of DES-§8.2 (plus the C4 composition slots) for one view. */
export function visualItems(v: PageView, input: GateInput, comp: { fullBleed: boolean; cross: boolean; quiet: boolean; signature: boolean }): Item[] {
  const out: Item[] = [];
  colourGates(v, input, out);
  shapeGates(v, input, out);
  rhythmGates(v, input, out);
  imageGates(v, input, out);
  typeGates(v, input, out);
  structureGates(v, input, out);
  budgetGates(v, input, out);
  pageRules(v, input, out);
  compositionGates(v, out, comp);
  return out;
}

export { STRONG as STRONG_BGS, accepts };
