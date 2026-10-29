/**
 * Height-model fitting report (P6 DESIGN; design.md DES-§5.3 "Calibration", DES-§5.12; QUAL-5): reads the committed
 * calibration fixture (src/lib/design/calibration/heights.json), rebuilds each page's document from its recipe and
 * prints, per variant, the measured section height in screens before the density / spacing / G21 terms (median, p10,
 * p90) beside the value the model uses today, and, per hero variant × locale, the measured fold offsets from the hero's
 * top beside the model's. It writes nothing: the fitted values go into the registry's `features.h` (unsheeted
 * variants), the sheets, or `PRE_SHEET` (src/lib/design/heights.ts), reviewed by hand.
 *
 *   npx tsx scripts/qa/design-heights-fit.ts
 */
import { HEIGHTS_CALIBRATION } from "@/lib/design/heights-calibration";
import { DENSITY_FACTOR, estimateHeights, foldType, G21_SCREENS, heightParams, SCREEN, SPACING_FACTOR, TYPE_SCREENS } from "@/lib/design/heights";
import { variantFeatures } from "@/lib/design/features";
import { getFixture } from "@/lib/page/fixtures";
import { validateDoc } from "@/lib/page/validate";

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]! : NaN;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const GAP_TEXT = 12;

function main() {
  const perVariant = new Map<string, number[]>();
  const folds = new Map<string, { meas: Record<string, number>; est: Record<string, number>; chars: number }[]>();
  /** legacy stack constants per hero variant × script (ar / lat): the differences the stack's px rows take */
  const legacy = new Map<string, Record<string, number[]>>();
  const ratios: number[] = [];
  for (const page of HEIGHTS_CALIBRATION.pages) {
    const fx = getFixture(page.fixture, { locale: page.locale, archetype: page.arch ?? undefined, seed: page.seed ?? undefined, now: HEIGHTS_CALIBRATION.now });
    const { doc } = validateDoc(fx.doc);
    if (!doc) continue;
    const p = heightParams(doc, doc.theme.look ?? null);
    const flow = doc.sections.filter((s) => !s.hidden && variantFeatures(s.type, s.variant, s.data).fixed === null);
    const rep = estimateHeights(doc, { look: doc.theme.look ?? null, locale: doc.locale, features: variantFeatures });
    ratios.push(rep.total / page.total);
    page.sections.forEach(([type, variant, px], i) => {
      const s = flow[i];
      if (!s || s.type !== type || s.variant !== variant) return;
      const sp = SPACING_FACTOR[s.spacing];
      const base = (px / SCREEN - (p.space - 1) * G21_SCREENS) / (DENSITY_FACTOR[p.dens] * sp);
      const k = `${type}:${variant}`;
      perVariant.set(k, [...(perVariant.get(k) ?? []), base]);
    });
    // the hero's measured top = the measured heights before it
    const heroAt = page.sections.findIndex(([t]) => t === "hero");
    const measuredTop = page.sections.slice(0, Math.max(0, heroAt)).reduce((a, [, , px]) => a + px, 0);
    const estTop = rep.sections.find((s) => s.type === "hero")?.top ?? 0;
    const key = `${page.hero}/${page.locale}`;
    const meas: Record<string, number> = {};
    const est: Record<string, number> = {};
    for (const [k, v] of Object.entries(page.fold)) meas[k] = v - measuredTop;
    for (const [k, v] of Object.entries(rep.fold.items)) est[k] = v - estTop;
    const hero = doc.sections.find((s) => s.type === "hero");
    const chars = typeof (hero?.data as { title?: unknown })?.title === "string" ? [...((hero!.data as { title: string }).title.replace(/\*+/g, ""))].length : 0;
    folds.set(key, [...(folds.get(key) ?? []), { meas, est, chars }]);
    // the legacy stack's constants: title (and lead) lines from the model, every other row a measured difference
    const ft = foldType(doc, p, doc.locale);
    const lead = typeof (hero?.data as { subtitle?: unknown })?.subtitle === "string" ? [...(hero!.data as { subtitle: string }).subtitle].length : 0;
    const titleBlock = Math.min(3, ft.linesOf(chars, 44, 358, "D")) * ft.lineOf(44, "D");
    const leadBlock = lead ? GAP_TEXT + Math.min(3, ft.linesOf(lead, 18, 358, "L")) * ft.lineOf(18, "L") : 0;
    const m = meas as Record<"title" | "image" | "price" | "cta" | "cod", number>;
    const lk = `${page.hero}/${doc.locale === "ar" ? "ar" : "lat"}`;
    const acc = legacy.get(lk) ?? {};
    const add = (k: string, v: number) => (acc[k] = [...(acc[k] ?? []), v]);
    if (page.hero === "poster") {
      add("pad", m.image);
      add("image", m.price - m.image);
      add("price", m.title - m.price);
      add("gapCta", m.cta - m.title - titleBlock - leadBlock);
      add("cta", m.cod - m.cta);
    } else {
      add("pad", m.title);
      add("gapImage", m.image - m.title - titleBlock - leadBlock);
      add("image", m.price - m.image);
      add("price", m.cta - m.price);
      add("cta", m.cod - m.cta);
    }
    legacy.set(lk, acc);
  }
  console.log(`page total ratio estimate / measured: p10 ${r2(q(ratios, 0.1))} · median ${r2(q(ratios, 0.5))} · p90 ${r2(q(ratios, 0.9))} · in 0.8-1.25: ${ratios.filter((r) => r >= 0.8 && r <= 1.25).length}/${ratios.length}`);
  console.log("\nsection heights in screens before density / spacing / G21 (n · median · p10 · p90 · model today)");
  for (const [k, xs] of [...perVariant.entries()].sort()) {
    const [type, variant] = k.split(":") as [string, string];
    const h = variantFeatures(type, variant, {}).h;
    const today = typeof h === "number" ? h : typeof h === "object" ? `fixed ${h.base}` : (TYPE_SCREENS[type] ?? "?");
    console.log(`  ${k.padEnd(26)} ${String(xs.length).padStart(3)} · ${r2(q(xs, 0.5))} · ${r2(q(xs, 0.1))} · ${r2(q(xs, 0.9))} · ${today}`);
  }
  console.log("\nfold offsets from the hero's top, measured (median) vs the model (median); title chars median");
  for (const [k, rows] of [...folds.entries()].sort()) {
    const items = ["title", "image", "price", "cta", "cod"];
    const line = items.map((it) => {
      const m = rows.map((r) => r.meas[it]).filter((v): v is number => v !== undefined);
      const e = rows.map((r) => r.est[it]).filter((v): v is number => v !== undefined);
      return `${it} ${m.length ? q(m, 0.5) : "-"}/${e.length ? q(e, 0.5) : "-"}`;
    });
    console.log(`  ${k.padEnd(14)} n ${rows.length} · ${line.join(" · ")} · chars ${q(rows.map((r) => r.chars), 0.5)}`);
  }
  console.log("\nlegacy fold stack constants (medians, px) per hero variant × script, for PRE_SHEET");
  for (const [k, acc] of [...legacy.entries()].sort()) console.log(`  ${k.padEnd(14)} ${Object.entries(acc).map(([n, xs]) => `${n} ${Math.round(q(xs, 0.5))}`).join(" · ")}`);
}

main();
