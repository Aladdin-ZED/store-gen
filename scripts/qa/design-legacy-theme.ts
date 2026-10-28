/**
 * The no-look theme golden (P6 DESIGN; design.md DS4, DES-§4.5.2, DES-§23.1, DES-§25.1 `test:render`).
 *
 * A document without `theme.look` must keep today's tokens and `<html>` attributes. This module records, per token
 * key, one digest over every build of a fixed set of theme specs, and compares a fresh run with the recorded file
 * (`src/lib/design/calibration/legacy-theme.json`). Only the reviewed allow-list below may differ, each entry with its
 * reason:
 *  - DS28: `SPRINGS.soft` moves from ζ 0.78 to 0.86, and `--lp-ease-pop` is never the bouncy spring outside
 *    `playground`;
 *  - core D60 (rev 3), DS4: no grain on generated pages (`--lp-grain*` are not emitted, `data-texture` is always
 *    `none`) and no aurora custom property (`--lp-aurora`, `--lp-aurora-1..3`; V40).
 *
 * Two sets, so each suite stays inside its time budget:
 *  - `fixtures`: the seven page fixtures × ar / fr / en, compared by `scripts/qa/render-cases/design.ts` (test:render);
 *  - `matrix`: every archetype × its legacy pairings × light / dark, and the builder overrides per archetype,
 *    compared by `test:design` (src/lib/design/selftest.ts).
 *
 *   npx tsx scripts/qa/design-legacy-theme.ts            compare both sets (exit 1 on a difference)
 *   npx tsx scripts/qa/design-legacy-theme.ts --record   re-record the file (only after a reviewed change)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getFixture, FIXTURE_NAMES } from "@/lib/page/fixtures";
import { ARCHETYPES, ThemeSpec, type Locale } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { buildTheme, type BuiltTheme } from "@/lib/theme";

export const LEGACY_THEME_FILE = join(__dirname, "..", "..", "src", "lib", "design", "calibration", "legacy-theme.json");

/** The reviewed allow-list: keys that may differ from (or be absent against) the recorded digests. */
export const LEGACY_ALLOW: readonly { key: RegExp; reason: string }[] = [
  { key: /^(?:[a-z]+:)?lp-ease-(?:spring|pop)$/, reason: "DS28: SPRINGS.soft ζ 0.78 → 0.86; --lp-ease-pop is not the bouncy spring outside playground" },
  { key: /^(?:[a-z]+:)?lp-grain(?:-opacity)?$/, reason: "core D60 rev 3: no grain on generated pages" },
  { key: /^attr:data-texture$/, reason: "DS4 rev 6, core D60: data-texture is always none" },
  { key: /^(?:[a-z]+:)?lp-aurora(?:-[123])?$/, reason: "core D60 rev 3, V40: no --lp-aurora / --lp-aurora-1..3 custom property" },
];
export const isAllowed = (key: string) => LEGACY_ALLOW.some((a) => a.key.test(key));

export type LegacySet = "fixtures" | "matrix";
export interface LegacyGolden {
  v: 1;
  recorded: string;
  /** per set: key → the first 16 hex of sha256 over "<label>=<value>\n" for every build */
  sets: Record<LegacySet, Record<string, string>>;
}

const NOW = "2026-10-07T12:00:00.000Z";

/** Every spec of a set, with a stable label. */
export function legacySpecs(set: LegacySet): { label: string; spec: ThemeSpec; locale: Locale }[] {
  const out: { label: string; spec: ThemeSpec; locale: Locale }[] = [];
  if (set === "fixtures") {
    for (const name of FIXTURE_NAMES) {
      for (const locale of ["ar", "fr", "en"] as const) {
        const { doc } = validateDoc(getFixture(name, { now: NOW, locale }).doc);
        if (doc) out.push({ label: `${name}/${locale}`, spec: doc.theme, locale });
      }
    }
    return out;
  }
  let seed = 11;
  for (const a of ARCHETYPES) {
    const d = ARCHETYPE_DEFS[a];
    const sig = d.signature[0]!;
    for (const p of d.fonts) {
      for (const base of ["light", "dark"] as const) {
        const spec = ThemeSpec.parse({
          archetype: a,
          seed: seed++,
          palette: { accent: sig.accent, pop: sig.pop, base, harmony: d.harmony },
          fonts: { display: p.display, body: p.body, ...(p.accent ? { accent: p.accent } : {}), displayAr: p.displayAr, bodyAr: p.bodyAr },
          motion: d.defaultMotion,
        });
        for (const locale of ["ar", "fr"] as const) out.push({ label: `${a}/${p.id}/${base}/${locale}`, spec, locale });
      }
    }
    // builder overrides (DS4: an explicit value wins), one spec per row
    const p = d.fonts[0]!;
    const overrides = [
      { radius: "none", shadow: "glow", texture: "grain", surfaces: "panels", motion: "calm" },
      { radius: "round", shadow: "none", texture: "none", surfaces: "flush", motion: "lively" },
      { radius: "soft", shadow: "deep", texture: "archetype", surfaces: "archetype", motion: "off" },
    ] as const;
    overrides.forEach((o, i) => {
      const spec = ThemeSpec.parse({
        archetype: a,
        seed: seed++,
        palette: { accent: d.signature[1]?.accent ?? sig.accent, pop: d.signature[1]?.pop ?? sig.pop, base: "tinted", harmony: d.harmony },
        fonts: { display: p.display, body: p.body, ...(p.accent ? { accent: p.accent } : {}), displayAr: p.displayAr, bodyAr: p.bodyAr },
        ...o,
      });
      for (const locale of ["ar", "fr"] as const) out.push({ label: `${a}/override${i}/${locale}`, spec, locale });
    });
  }
  return out;
}

/** The flat key → value view of a build (tokens, attributes, fonts, dividers, scheme). */
export function themeEntries(t: BuiltTheme): Record<string, string> {
  const out: Record<string, string> = { ...t.tokens };
  for (const [k, v] of Object.entries(t.attrs)) out[`attr:${k}`] = v;
  out.fontIds = t.fontIds.join(",");
  out.fontWeights = t.fontWeights.join(",");
  out.dividers = t.dividers.join(",");
  out.scheme = t.scheme;
  return out;
}

/** Per-key digests over the builds of a set. */
export function digestSet(set: LegacySet): Record<string, string> {
  const builds = legacySpecs(set).map((s) => ({ label: s.label, entries: themeEntries(buildTheme(s.spec, s.locale)) }));
  const keys = new Set<string>();
  for (const b of builds) for (const k of Object.keys(b.entries)) keys.add(k);
  const out: Record<string, string> = {};
  for (const k of [...keys].sort()) {
    const h = createHash("sha256");
    for (const b of builds) h.update(`${b.label}=${b.entries[k] ?? "∅"}\n`);
    out[k] = h.digest("hex").slice(0, 16);
  }
  return out;
}

/** The recorded file, or null when it is missing or unreadable. */
export function readGolden(): LegacyGolden | null {
  try {
    return JSON.parse(readFileSync(LEGACY_THEME_FILE, "utf8")) as LegacyGolden;
  } catch {
    return null;
  }
}

/**
 * Differences between a fresh run and the recorded digests, allow-listed keys excluded: a changed key, a key that
 * disappeared, or a new key (a new token on a doc without look is a back-compat break too).
 */
export function compareSet(set: LegacySet, golden: LegacyGolden | null = readGolden()): string[] {
  if (!golden) return [`${LEGACY_THEME_FILE} is missing (run npx tsx scripts/qa/design-legacy-theme.ts --record before changing the theme)`];
  const want = golden.sets[set];
  const got = digestSet(set);
  const out: string[] = [];
  for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
    if (isAllowed(k)) continue;
    if (!(k in got)) out.push(`${set}: ${k} is no longer emitted`);
    else if (!(k in want)) out.push(`${set}: ${k} is new on documents without look`);
    else if (want[k] !== got[k]) out.push(`${set}: ${k} changed`);
  }
  return out;
}

if (require.main === module) {
  if (process.argv.includes("--record")) {
    const golden: LegacyGolden = { v: 1, recorded: new Date().toISOString().slice(0, 10), sets: { fixtures: digestSet("fixtures"), matrix: digestSet("matrix") } };
    writeFileSync(LEGACY_THEME_FILE, JSON.stringify(golden, null, 1) + "\n");
    console.log(`recorded ${Object.keys(golden.sets.fixtures).length} fixture keys and ${Object.keys(golden.sets.matrix).length} matrix keys → ${LEGACY_THEME_FILE}`);
  } else {
    const diffs = [...compareSet("fixtures"), ...compareSet("matrix")];
    for (const d of diffs.slice(0, 40)) console.log("  FAIL " + d);
    console.log(diffs.length ? `${diffs.length} difference(s) outside the allow-list` : "no-look themes: unchanged outside the allow-list");
    process.exit(diffs.length ? 1 : 0);
  }
}
