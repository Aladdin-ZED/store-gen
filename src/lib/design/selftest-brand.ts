/**
 * `test:design` groups of step 13 (P6 DESIGN; design.md DES-§25.1, DES-§12.4-§12.6, DES-§1.4 BK-1, DS17, DS32, UX-05):
 *  - monogram: every A-Z / 0-9 skeleton renders; the SVG is path-only (no `<text>`, no other element); the ink centroid
 *    is within 2 % of the enclosure centre for every letter, pair and enclosure; the stroke per vibe, the caps from
 *    G27, arch only for souk / bloom, the glyph for an Arabic-only name;
 *  - favicon: `brandIcon` picks the mark, else a logo of aspect ≤ 1.6, else the grid monogram (no fonts);
 *  - brand-kit: the colour guard records a move, the gold path keeps the sand neutral, unknown genes are dropped,
 *    the logo palette is allowed and ≤ 6, the changed roles;
 *  - qr: the address card's QR is module count × 4 px with a 4-module quiet zone at both URL lengths (P2's `QrCode`).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { QrCode } from "@/components/admin/common/qr-code";
import type { LandingRenderContext } from "@/landing/context";
import { brandIcon, iconSource } from "@/lib/logo/favicon";
import { GRID_GLYPHS, gridMonogram, monogramLetters, strokeForVibe, type MonogramEnclosure } from "@/lib/logo/monogram-grid";
import { BrandSetting } from "@/lib/settings/keys/brand";
import { nearOrange, toOklch } from "@/lib/theme/color";
import type { BuiltTheme } from "@/lib/theme/types";
import { applyColor, changedRoles, cleanGenes, logoContrast, logoPalette } from "./brand-kit";
import { registerDesignGroup } from "./selftest";

const ONLY_PATHS = (svg: string) => [...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]).every((tag) => tag === "svg" || tag === "path");

registerDesignGroup({
  id: "monogram",
  title: "grid monogram: 36 skeletons, path-only, centroid within 2 %, stroke per vibe, caps, enclosures, the glyph",
  ids: ["DS32", "BK-1"],
  async run({ check, note }) {
    const encs: MonogramEnclosure[] = ["none", "circle", "rounded", "arch"];
    const chars = Object.keys(GRID_GLYPHS);
    check(chars.length === 36 && [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].every((c) => chars.includes(c)), `skeletons ${chars.length}`);
    let worst = 0;
    let n = 0;
    const names = [...chars.map((c) => c), ...chars.map((c, i) => `${c} ${chars[(i * 7 + 3) % chars.length]}`)];
    for (const enc of encs) {
      for (const name of names) {
        const m = gridMonogram({ name, vibe: enc === "arch" ? "souk" : "maison", enclosure: enc, caps: "butt", glyph: "dot", ground: "#1d4f45", ink: "#ffffff" });
        n++;
        if (!m.svg.includes("<path") || m.svg.includes("<text") || !ONLY_PATHS(m.svg) || /NaN|Infinity/.test(m.svg)) {
          check(false, `${enc} "${name}": not a clean path-only SVG`);
          continue;
        }
        const d = Math.hypot(m.centroid.x - m.centre.x, m.centroid.y - m.centre.y) / 22;
        worst = Math.max(worst, d);
        if (d > 0.02) check(false, `${enc} "${name}": centroid ${(d * 100).toFixed(2)} % off`);
      }
    }
    check(worst <= 0.02, `worst centroid ${(worst * 100).toFixed(2)} %`);
    check(strokeForVibe("maison") === 2.5 && strokeForVibe("souk") === 3 && strokeForVibe("garage") === 3.5, "stroke per vibe");
    const round = gridMonogram({ name: "Dar Nour", vibe: "souk", enclosure: "circle", caps: "round", glyph: "dot", ground: "#1d4f45", ink: "#fff" });
    check(round.letters === "DN" && round.svg.includes('stroke-linecap="round"') && round.svg.includes('stroke-width="3"'), "two initials, round caps, souk stroke");
    check(gridMonogram({ name: "Lumen", vibe: "maison", enclosure: "arch", caps: "butt", glyph: "dot", ground: "#1d4f45", ink: "#fff" }).svg.includes("A6 6"), "arch outside souk / bloom falls back to the rounded square");
    check(gridMonogram({ name: "Bloom", vibe: "bloom", enclosure: "arch", caps: "butt", glyph: "dot", ground: "#1d4f45", ink: "#fff" }).svg.includes("A10 10"), "bloom keeps the arch");
    const ar = gridMonogram({ name: "دار النور", vibe: "souk", enclosure: "circle", caps: "butt", glyph: "spark", ground: "#1d4f45", ink: "#fff" });
    check(ar.kind === "glyph" && ar.letters === "" && ONLY_PATHS(ar.svg) && !ar.svg.includes("stroke-width"), "an Arabic-only name draws the brand glyph");
    check(monogramLetters("Élan d'Or") === "ED" && monogramLetters("  ") === "" && monogramLetters("3 Pommes") === "3P", "initials: diacritics folded, digits kept");
    note(`${n} monograms over ${encs.length} enclosures; worst centroid offset ${(worst * 100).toFixed(2)} % of the enclosure`);
  },
});

registerDesignGroup({
  id: "favicon",
  title: "brandIcon: the mark, else a logo of aspect ≤ 1.6, else the grid monogram (path-only, no fonts)",
  ids: ["DS32", "DES-R11"],
  async run({ check }) {
    check(iconSource({ id: "m", width: 64, height: 64 }, { id: "l", width: 900, height: 200 }) === "mark", "the mark first");
    check(iconSource(null, { id: "l", width: 500, height: 400 }) === "logo", "a squarish logo");
    check(iconSource(null, { id: "l", width: 900, height: 300 }) === "monogram", "a wide logo (3:1) falls back to the monogram");
    check(iconSource(null, null) === "monogram", "no logo: the monogram");
    const theme = { tokens: { "lp-accent": "#1d4f45", "lp-accent-ink": "#ffffff" }, attrs: { "data-arch": "apothecary", "data-btn": "pill", "data-mask": "rounded", "data-glyph": "dot" } } as unknown as BuiltTheme;
    const ctx = (logo: { id: string; width: number; height: number } | null) =>
      ({
        locale: "fr",
        store: { name: "Atelier Nour", logo },
        product: { name: "Huile" },
        assets: { url: (ref: { id: string }) => ({ url: `/media/${ref.id}-64.webp`, width: 64, height: 64, mime: "image/webp" }) },
      }) as unknown as LandingRenderContext;
    const mono = brandIcon(ctx(null), theme);
    const svg = decodeURIComponent(mono.href.replace(/^data:image\/svg\+xml,/, ""));
    check(mono.type === "image/svg+xml" && ONLY_PATHS(svg) && !svg.includes("font") && svg.includes("#1d4f45") && svg.includes('stroke-linecap="round"'), "the monogram icon: accent ground, pill caps, no text or font");
    check(brandIcon(ctx({ id: "sq", width: 512, height: 512 }), theme).href === "/media/sq-64.webp", "a square logo is the icon");
    check(brandIcon(ctx({ id: "wide", width: 1200, height: 300 }), theme).type === "image/svg+xml", "a wide logo is not");
  },
});

registerDesignGroup({
  id: "brand-kit",
  title: "brand kit rules: moves recorded, the gold path, genes against GENE_VOCAB, the logo palette, changed roles",
  ids: ["BK-1", "DS17"],
  async run({ check }) {
    const cur = BrandSetting.parse({}).colors;
    const orange = applyColor(cur, "accent", "#e07a2f", "2026-11-06T00:00:00.000Z");
    check(!!orange.moved && orange.colors.accent !== "#e07a2f" && !nearOrange(toOklch(orange.colors.accent!)) && orange.colors.moves.length === 1 && orange.colors.moves[0]!.from === "#e07a2f", `an orange accent is moved and the move recorded ${JSON.stringify(orange.moved)}`);
    const twice = applyColor(orange.colors, "accent", orange.colors.accent, "2026-11-06T00:00:01.000Z");
    check(!twice.moved && twice.colors.moves.length === 0, "an allowed colour records no move and clears the role's old one");
    const gold = applyColor(cur, "pop", "#d4a514", "2026-11-06T00:00:00.000Z");
    check(gold.moved?.band === "gold" && typeof gold.colors.neutralHue === "number", `a gold pop takes sand + signal and keeps the sand as the neutral ${JSON.stringify(gold.moved)}`);
    const lockedNeutral = applyColor({ ...cur, neutralHue: 200, locks: ["neutral"] }, "pop", "#d4a514", "2026-11-06T00:00:00.000Z");
    check(lockedNeutral.colors.neutralHue === 200, "a locked neutral is never moved by the gold path");
    check(applyColor(cur, "accent", "#1d4f45", "x").colors.accent === "#1d4f45", "an allowed colour is stored as given");
    const genes = cleanGenes({ G9: "duotone", G1: "nonsense", G99: "x", G23: null });
    check(genes.genes.G9 === "duotone" && genes.dropped.includes("G1=nonsense") && genes.dropped.includes("G99=x") && !("G23" in genes.genes), `unknown gene values are dropped and named ${JSON.stringify(genes)}`);
    const pal = logoPalette({ colors: [{ hex: "#e07a2f", weight: 0.6 }, { hex: "#1d4f45", weight: 0.3 }, ...Array.from({ length: 8 }, (_, i) => ({ hex: `#${(20 + i * 20).toString(16).padStart(2, "0")}3060`, weight: 0.01 }))] });
    check(pal.length <= 6 && pal.every((h) => !nearOrange(toOklch(h))) && pal.includes("#1d4f45"), `the logo palette is allowed and ≤ 6 ${pal.join()}`);
    check(logoContrast({ alpha: true, palette: { colors: [{ hex: "#101010", weight: 1 }] } }).dark && !logoContrast({ alpha: false, palette: { colors: [{ hex: "#101010", weight: 1 }] } }).dark, "the dark-ground warning for a transparent dark logo only");
    const a = BrandSetting.parse({});
    const b = BrandSetting.parse({ colors: { accent: "#1d4f45", locks: ["accent"] } });
    check(changedRoles(a, b).join() === "colors.accent,colors.locks", `the audit names the changed roles only: ${changedRoles(a, b).join()}`);
  },
});

registerDesignGroup({
  id: "qr",
  title: "UX-05: the address card's QR is module count × 4 px with a 4-module quiet zone, at both URL lengths",
  ids: ["UX-05"],
  async run({ check, note }) {
    const urls = ["https://nour.storegen.ma", "https://atelier-nour-maroc.storegen.ma/p/huile-argan-pressee-a-froid-flacon-50ml?c=wa-launch-2026"];
    const sizes: number[] = [];
    for (const url of urls) {
      const n = QRCode.create(url, { errorCorrectionLevel: "M" }).modules.size;
      sizes.push(n);
      const px = (n + 8) * 4;
      const svg = renderToStaticMarkup(createElement(QrCode, { value: url, size: px, label: "QR" }));
      const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      const width = /width="(\d+)"/.exec(svg);
      const xs = [...svg.matchAll(/M(\d+) (\d+)h1/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
      check(box !== null && Number(box[1]) === n + 8 && Number(width?.[1]) === px, `${url.length} chars: ${n} modules → ${px} px, viewBox ${box?.[1]}`);
      check(xs.length > 0 && Math.min(...xs.map((p) => p[0])) === 4 && Math.min(...xs.map((p) => p[1])) === 4 && Math.max(...xs.map((p) => p[0])) === n + 3, `${url.length} chars: a 4-module quiet zone on every side`);
      check(px / (n + 8) === 4, "each module is 4 px");
    }
    check(sizes[0]! < sizes[1]!, `the long URL needs more modules (${sizes.join(" < ")})`);
    note(`module counts ${sizes.join(" / ")} → ${sizes.map((s) => (s + 8) * 4).join(" / ")} px`);
  },
});
