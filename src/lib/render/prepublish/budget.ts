/**
 * The budget gate (maintainer; docs/STORE-SAAS.md §M.2, D52, D66, DES-R19; design-baseline §5 C2, C3, F1, F5): the
 * core's publish check `budget`, registered here at import (src/lib/render/prepublish.ts imports this file). One
 * profile per page kind: landing pages use `LANDING_PROFILE`; the R2 contract step registers the store kinds through
 * `registerBudgetProfile` from src/lib/render/prepublish/storefront.ts (each hard value clamped to the D52 ceilings).
 * Items keep their `budget:*` ids whatever the kind.
 *
 * Measurement (DS33): design's two frozen P0 modules and the rendered document, nothing else. `estimateHeights` gives
 * rows C3 (height), F1 (form position) and C2 (fold); `variantFeatures` the glass count of R4; the document's gzip,
 * pictures and font faces give F5, its primary order buttons R1 and its `data-reveal` nodes R5; the doc's section
 * backgrounds give K2 and its asset references I1. In-page experiment arms (`[data-xa]`, R3) do not exist in R1, so
 * every count is the control arm.
 *
 * While design's P0 stubs are in place (`heightModelIsStub()`, i.e. before P6 merges; §K.2 stub rule) nothing is
 * derived from the stub's 600 px sections, rows C2, C3 and F1 are notes with `vars.stub = 1`, and (P0 maintainer
 * decision, recorded in §K.2's build note) so are F5, R1, R4, R5, K2 and I1: `budgetReport` still classifies every
 * row hard or soft, but `budgetCheck` refuses nothing. Today's engine output is the design baseline the D52 rows
 * were written against (the argan fixture: 171 KB gz, 20 primary order buttons, 315 reveal nodes, 6 colour bands),
 * and the CTA, reveal and weight plans that bring a generated page under them are P6's; enforcing those rows before
 * P6 would refuse every page the platform can generate and turn every earlier track's merge gate red. Every row is
 * hard from the P6 merge on, and the locks below keep a build with the advisory gate from ever shipping.
 *
 * STUB-BUILD LOCK (P0 maintainer decision 5; §H.10, §K.2): at module load under NODE_ENV=production this throws while
 * the height model is the stub, unless SG_STUB_BUILD_OK=1 (the maintainer's merge gates before P6). With the prebuild
 * check (scripts/qa/stub-lock.ts) and the gate file's `stubBuild` flag (scripts/qa/gate-ok.ts, refused by
 * scripts/deploy/archive.mjs), a build whose D52 hard gates are notes can never ship.
 */
import { gzipSync } from "node:zlib";
import type { pages } from "@/lib/db/schema";
import { variantFeatures } from "@/lib/design/features";
import { estimateHeights } from "@/lib/design/heights";
import type { FoldItem, HeightReport } from "@/lib/design/types.frozen";
import type { PageDoc } from "@/lib/page/schema";
import type { BuiltTheme } from "@/lib/theme/types";
import type { GateItem, MessageKey } from "@/lib/tenancy/types";
import { registerPrePublishCheck, type PrePublishCtx, type PrePublishResult } from "../prepublish";
import {
  COLOUR_MOMENTS,
  D52_CEILINGS,
  FOLD_BAND,
  FOLD_LINE_PX,
  FOLD_SOFT_PX,
  FONT_FAMILIES_SOFT,
  FONT_FILES_SOFT,
  HEIGHT_BAND,
  heightModelIsStub,
  LANDING_PROFILE,
  PICTURES_SOFT,
  STUB_LOCK_MESSAGE,
  type BudgetProfile,
} from "./budget-limits";

export { LANDING_PROFILE, type BudgetProfile } from "./budget-limits";

/** 'landing' | 'home' | 'product' | 'collection' | 'page' | 'policy' | 'search' | 'cart' | 'checkout' | 'not_found' (§D.2, 0004) */
export type PageKind = (typeof pages.kind.enumValues)[number];

/* ------------------------------------------------------------------ */
/* STUB-BUILD LOCK                                                     */
/* ------------------------------------------------------------------ */

/** Throws the lock message in production while the height model is the stub, unless SG_STUB_BUILD_OK=1. */
export function assertStubBuildAllowed(env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (env.NODE_ENV === "production" && heightModelIsStub() && env.SG_STUB_BUILD_OK !== "1") throw new Error(STUB_LOCK_MESSAGE);
}

assertStubBuildAllowed();

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

declare global {
  var __sgBudgetProfiles: Map<Exclude<PageKind, "landing">, BudgetProfile> | undefined;
}

/** A function declaration: a track file may register while src/lib/render/prepublish.ts is still evaluating. */
function profiles(): Map<Exclude<PageKind, "landing">, BudgetProfile> {
  return (globalThis.__sgBudgetProfiles ??= new Map());
}

const clampPair = (p: { soft: number; hard: number }, ceiling: number) => ({ soft: Math.min(p.soft, ceiling), hard: Math.min(p.hard, ceiling) });

/** Per-kind thresholds (D66): every hard value is clamped to the D52 ceilings; a second registration of a kind throws. */
export function registerBudgetProfile(kind: Exclude<PageKind, "landing">, profile: BudgetProfile): void {
  if ((kind as PageKind) === "landing") throw new Error("budget: the landing profile is LANDING_PROFILE and is never re-registered");
  if (profiles().has(kind)) throw new Error(`budget: a profile for "${kind}" is already registered`);
  profiles().set(kind, {
    ...profile,
    sections: clampPair(profile.sections, D52_CEILINGS.sections),
    heightPx: clampPair(profile.heightPx, D52_CEILINGS.heightPx),
    ctas: clampPair(profile.ctas, D52_CEILINGS.ctas),
    glass: clampPair(profile.glass, D52_CEILINGS.glass),
    reveals: clampPair(profile.reveals, D52_CEILINGS.reveals),
    photoReuse: clampPair(profile.photoReuse, D52_CEILINGS.photoReuse),
    htmlGz: clampPair(profile.htmlGz, D52_CEILINGS.htmlGz),
  });
}

/** The profile of a kind: landing (and any unregistered kind, the strictest R1 default) → LANDING_PROFILE. */
export function budgetProfileFor(kind: PageKind): BudgetProfile {
  return kind === "landing" ? LANDING_PROFILE : (profiles().get(kind) ?? LANDING_PROFILE);
}

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

export interface BudgetInput {
  doc: PageDoc;
  /** the rendered document (F5, R1, R5 measure it); without it those rows are skipped */
  html?: string;
  theme?: Pick<BuiltTheme, "fontIds">;
}

export interface BudgetReport {
  /** hard items refuse (`budget_blocked`), soft items are notes */
  items: GateItem[];
  heights: HeightReport;
  stub: boolean;
}

/** Sections that are no surface of their own for R4 (nav and the sticky bar may carry glass, §M.2) */
const NAV_OR_STICKY = new Set(["header", "stickyCta"]);
/** I1: the sticky and form thumbnails are excluded from the photo count (DES-§5.10) */
const PHOTO_EXCLUDED = new Set(["stickyCta", "orderForm"]);
const ASSET_ID = /^[a-f0-9]{16,64}$/;
const FOLD_TITLES: Record<FoldItem, MessageKey> = { image: "budget.C2.image", price: "budget.C2.price", cta: "budget.C2.cta", cod: "budget.C2.cod" };

const item = (rule: string, level: GateItem["level"], title: MessageKey, vars: Record<string, string | number>): GateItem => ({ id: `budget:${rule}`, level, title, vars });

/** The level of a count against a soft / hard pair: null when within both. */
const levelOf = (n: number, p: { soft: number; hard: number }): GateItem["level"] | null => (n > p.hard ? "hard" : n > p.soft ? "soft" : null);

/** Asset references in a section's data (AssetRef objects at any depth), with their counts. */
function countAssets(value: unknown, into: Map<string, number>, depth = 0): void {
  if (depth > 8 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) countAssets(v, into, depth + 1);
    return;
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.id === "string" && ASSET_ID.test(rec.id)) into.set(rec.id, (into.get(rec.id) ?? 0) + 1);
  for (const [k, v] of Object.entries(rec)) if (k !== "id") countAssets(v, into, depth + 1);
}

/** The faces of the document's one stylesheet: files = @font-face rules, families = distinct font-family names. */
function fontFaces(html: string): { files: number; families: number } {
  const families = new Set<string>();
  let files = 0;
  for (const m of html.matchAll(/@font-face\{font-family:"([^"]+)"/g)) {
    files++;
    families.add(m[1]!);
  }
  return { files, families: families.size };
}

/**
 * Every budget row of one document against a profile. Pure over its input (no clock, no I/O); `budgetCheck` maps the
 * hard items to a refusal and the soft ones to notes.
 */
export function budgetReport(input: BudgetInput, profile: BudgetProfile = LANDING_PROFILE): BudgetReport {
  const { doc, html } = input;
  const items: GateItem[] = [];
  const heights = estimateHeights(doc, { look: doc.theme.look ?? null, locale: doc.locale, features: variantFeatures });
  const stub = heights.stub === true;
  /** C2 / C3 / F1 while the height model is the stub: notes, flagged */
  const heightRow = (level: GateItem["level"]): GateItem["level"] => (stub ? "soft" : level);
  const stubVars: Record<string, number> = stub ? { stub: 1 } : {};
  const visible = doc.sections.filter((s) => !s.hidden);

  // F5 page weight (the rendered document)
  if (html) {
    const bytes = gzipSync(Buffer.from(html, "utf8"), { level: 9 }).length;
    const weight = levelOf(bytes, profile.htmlGz);
    if (weight) items.push(item("F5", weight, "budget.F5.weight", { kb: Math.round(bytes / 1024), limit: Math.round((weight === "hard" ? profile.htmlGz.hard : profile.htmlGz.soft) / 1024) }));
    const pictures = (html.match(/<picture\b/g) ?? []).length;
    if (pictures > PICTURES_SOFT) items.push(item("F5", "soft", "budget.F5.pictures", { count: pictures, limit: PICTURES_SOFT }));
    const fonts = fontFaces(html);
    if (fonts.families > FONT_FAMILIES_SOFT || fonts.files > FONT_FILES_SOFT) items.push(item("F5", "soft", "budget.F5.fonts", { families: fonts.families, files: fonts.files }));
  }

  // C3 length: the in-flow section count is exact; the height is the model's (never the stub's 600 px sections)
  const sections = levelOf(heights.inFlow, profile.sections);
  if (sections) items.push(item("C3", heightRow(sections), "budget.C3.sections", { count: heights.inFlow, limit: sections === "hard" ? profile.sections.hard : profile.sections.soft, ...stubVars }));
  if (!stub) {
    const px = Math.round(heights.total);
    if (px * HEIGHT_BAND > profile.heightPx.hard) items.push(item("C3", "hard", "budget.C3.height", { px, limit: profile.heightPx.hard }));
    else if (px > profile.heightPx.hard) items.push(item("C3", "soft", "budget.C3.height", { px, limit: profile.heightPx.hard, estimated: 1 }));
    else if (px > profile.heightPx.soft) items.push(item("C3", "soft", "budget.C3.height", { px, limit: profile.heightPx.soft }));
  }

  // F1 form position
  if (profile.formTopPx) {
    const hasForm = visible.some((s) => s.type === "orderForm");
    if (!hasForm) items.push(item("F1", heightRow("hard"), "budget.F1.missing", { ...stubVars }));
    else if (!stub && heights.formTop !== null) {
      const px = Math.round(heights.formTop);
      const hard = profile.formTopPx.hard;
      if (hard !== null && px * HEIGHT_BAND > hard) items.push(item("F1", "hard", "budget.F1.position", { px, limit: hard }));
      else if (px > profile.formTopPx.soft) items.push(item("F1", "soft", "budget.F1.position", { px, limit: profile.formTopPx.soft, estimated: 1 }));
    }
  }

  // C2 fold contract (the hero family's fold items at 390 × 844)
  if (profile.fold !== "none" && !stub) {
    let lowest: { key: FoldItem; px: number } | null = null;
    for (const [key, top] of Object.entries(heights.fold.items) as [FoldItem, number][]) {
      if (top * FOLD_BAND > FOLD_LINE_PX) items.push(item("C2", "hard", FOLD_TITLES[key], { px: Math.round(top), limit: FOLD_LINE_PX }));
      else if (!lowest || top > lowest.px) lowest = { key, px: top };
    }
    if (lowest && lowest.px >= FOLD_SOFT_PX && !items.some((i) => i.id === "budget:C2")) items.push(item("C2", "soft", FOLD_TITLES[lowest.key], { px: Math.round(lowest.px), limit: FOLD_LINE_PX, estimated: 1 }));
  }

  // R1 primary order buttons (the sticky bar's is one of them)
  if (html) {
    const ctas = (html.match(/class="[^"]*\blp-btn--primary\b/g) ?? []).length;
    const level = levelOf(ctas, profile.ctas);
    if (level) items.push(item("R1", level, "budget.R1.ctas", { count: ctas, limit: level === "hard" ? profile.ctas.hard : profile.ctas.soft }));
  }

  // R4 glass surfaces outside nav and the sticky bar (variant features)
  const glass = visible.filter((s) => !NAV_OR_STICKY.has(s.type)).reduce((n, s) => n + variantFeatures(s.type, s.variant, s.data).glass, 0);
  const glassLevel = levelOf(glass, profile.glass);
  if (glassLevel) items.push(item("R4", glassLevel, "budget.R4.glass", { count: glass, limit: glassLevel === "hard" ? profile.glass.hard : profile.glass.soft }));

  // R5 reveal nodes
  if (html) {
    const reveals = (html.match(/\sdata-reveal(?=[\s=>])/g) ?? []).length;
    const level = levelOf(reveals, profile.reveals);
    if (level) items.push(item("R5", level, "budget.R5.reveals", { count: reveals, limit: level === "hard" ? profile.reveals.hard : profile.reveals.soft }));
  }

  // K2 full-bleed accent / pop moments
  const moments = visible.filter((s) => (s.bg === "accent" || s.bg === "pop") && variantFeatures(s.type, s.variant, s.data).fixed === null).length;
  const momentLevel = levelOf(moments, COLOUR_MOMENTS);
  if (momentLevel) items.push(item("K2", momentLevel, "budget.K2.moments", { count: moments, limit: momentLevel === "hard" ? COLOUR_MOMENTS.hard : COLOUR_MOMENTS.soft }));

  // I1 the same photo used again and again
  const uses = new Map<string, number>();
  for (const s of visible) if (!PHOTO_EXCLUDED.has(s.type)) countAssets(s.data, uses);
  const most = Math.max(0, ...uses.values());
  const reuse = levelOf(most, profile.photoReuse);
  if (reuse) items.push(item("I1", reuse, "budget.I1.reuse", { count: most, limit: reuse === "hard" ? profile.photoReuse.hard : profile.photoReuse.soft }));

  return { items, heights, stub };
}

/** The gate's answer for one document: hard items refuse with `budget_blocked`, soft items ride along as notes. Pure. */
export function budgetResult(input: BudgetInput, profile: BudgetProfile = LANDING_PROFILE): PrePublishResult {
  const { items, stub } = budgetReport(input, profile);
  // before P6 (design's P0 stubs): every row is a note, flagged (see the header); the locks keep this build unshipped
  if (stub) return { ok: true, notes: items.map((i) => ({ ...i, level: "soft" as const, vars: { ...i.vars, stub: 1 } })) };
  const hard = items.filter((i) => i.level === "hard");
  return hard.length ? { ok: false, code: "budget_blocked", items } : { ok: true, notes: items };
}

/** The registered check (§M.1): landing documents in R1; the R2 contract step picks the profile from the doc's kind. */
export async function budgetCheck(ctx: PrePublishCtx): Promise<PrePublishResult> {
  return budgetResult({ doc: ctx.doc, html: ctx.html, theme: ctx.theme }, LANDING_PROFILE);
}

registerPrePublishCheck("budget", budgetCheck);
