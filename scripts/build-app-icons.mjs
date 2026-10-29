#!/usr/bin/env node
/**
 * build-app-icons — the installable dashboard's icons (P2 SHELL; platform.md PLA-§23.1; design.md DES-§16.14, UX-07):
 * public/icons/app-192.png, app-512.png and app-maskable-512.png, rasterized with sharp from `appIconSvg()` of
 * src/lib/admin-theme/app-icon.ts (the platform initial as a grid monogram on the deep-ink ground, colours from the
 * token generator; loaded through tsx's API like scripts/build-admin-css.mjs, no bundler loader).
 *
 *   node scripts/build-app-icons.mjs           writes the three files (the outputs are committed)
 *   node scripts/build-app-icons.mjs --check   renders them again and compares with the committed files (exit 1 on drift)
 *
 * It fails (exit 1, nothing written) when a colour falls in the owner's orange band (OKLCH hue 25-75°, chroma > 0.06),
 * or when the mark's ink leaves the inner 80 % circle of the maskable icon: measured on the rendered pixels (every
 * pixel brighter than the midpoint of ground and ink must lie within 40 % of the side from the centre), and on the
 * geometry before that. Deterministic: the same generator and sharp give byte-identical files. The maintainer adds it
 * to `prebuild` after build-admin-css.mjs at the P2 merge (r1-p0b-report §2).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "icons");
const ICON_TS = join(ROOT, "src", "lib", "admin-theme", "app-icon.ts");
const CONTRAST_TS = join(ROOT, "src", "lib", "admin-theme", "contrast.ts");
const CHECK = process.argv.includes("--check");

function fail(message) {
  console.error(`build-app-icons: ${message}`);
  process.exit(1);
}

async function load(file) {
  const { tsImport } = await import("tsx/esm/api");
  return tsImport(pathToFileURL(file).href, import.meta.url);
}

/** The farthest "ink" pixel from the centre (px): a pixel brighter than the midpoint of ground and ink, not transparent. */
function inkReach(raw, info, threshold) {
  const { width, height, channels } = info;
  const cx = width / 2;
  const cy = height / 2;
  let reach = 0;
  let inked = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const alpha = channels === 4 ? raw[i + 3] : 255;
      if (alpha < 128) continue;
      const lum = 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
      if (lum < threshold) continue;
      inked++;
      reach = Math.max(reach, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  return { reach, inked };
}

async function main() {
  const icon = await load(ICON_TS);
  const contrast = await load(CONTRAST_TS);
  const { APP_ICONS, appIconSvg, appColors, markReach, SAFE_RADIUS } = icon;
  const { inOrangeBand, oklchToSrgb } = contrast;

  // owner rule 1: no colour of the icon or the manifest in the orange band
  const colors = appColors();
  for (const [name, value] of Object.entries(colors)) if (inOrangeBand(value)) fail(`colour "${name}" is in the orange band`);
  // the geometry first: the mark's reach against the safe circle
  if (markReach("maskable") > SAFE_RADIUS) fail(`the maskable mark reaches ${markReach("maskable").toFixed(3)} of the side, beyond ${SAFE_RADIUS}`);

  const lumOf = (o) => {
    const [r, g, b] = oklchToSrgb(o).map((v) => v * 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const threshold = (Math.max(lumOf(colors.ground), lumOf(colors.groundTop)) + lumOf(colors.ink)) / 2;

  const { default: sharp } = await import("sharp");
  const rendered = [];
  for (const spec of APP_ICONS) {
    const svg = appIconSvg(spec.size, spec.kind);
    const png = await sharp(Buffer.from(svg, "utf8"), { density: 72 }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== spec.size || info.height !== spec.size) fail(`${spec.file} rendered at ${info.width}x${info.height}`);
    const { reach, inked } = inkReach(data, info, threshold);
    if (inked === 0) fail(`${spec.file} has no visible mark`);
    if (spec.kind === "maskable" && reach > SAFE_RADIUS * spec.size + 0.5)
      fail(`${spec.file}: the mark's ink reaches ${reach.toFixed(1)} px from the centre, beyond the safe circle (${(SAFE_RADIUS * spec.size).toFixed(1)} px)`);
    rendered.push({ ...spec, png, reach });
  }

  if (CHECK) {
    const drift = rendered.filter((r) => {
      const path = join(OUT, r.file);
      return !existsSync(path) || !readFileSync(path).equals(r.png);
    });
    if (drift.length) fail(`out of date (run node scripts/build-app-icons.mjs): ${drift.map((d) => d.file).join(", ")}`);
    console.log(`build-app-icons: ${rendered.length} icons up to date`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  for (const r of rendered) {
    writeFileSync(join(OUT, r.file), r.png);
    console.log(`build-app-icons: ${relative(ROOT, join(OUT, r.file)).replace(/\\/g, "/")} ${r.size}x${r.size}, ${r.png.length} B, mark reach ${(r.reach / r.size).toFixed(3)} of the side`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
