/**
 * Homepage check (qa/lead/homepage-spec.md §1, §2, §10): the living models stay true to the product and the owner's
 * rules, offline (no DB, no network, no render):
 *
 *   npm run test:marketing-home
 *
 * - the three designer seeds the hero and the Director show exist, and every bold-gene value shown is in GENE_VOCAB;
 * - the hero rail is a permutation of BOLD_GENES; the four roles are in ACTIVE_STORE_ROLES;
 * - the console pad is ATTEMPT_OUTCOMES in order; the route's trigger rail is PURCHASE_TRIGGERS;
 * - copy: every id-keyed label exists in fr, ar and en; copy.fr.statuses equals ORDER_STATUSES' French labels; no digit
 *   anywhere in COPY.*.home (step numerals are rendered from the index); the same keys in every language;
 * - the page imports no lucide-react; no file of the homepage uses offset-path;
 * - colour: every oklch() literal of the homepage stylesheets is outside the forbidden bands (hue 25-75 above chroma
 *   0.06, 75-95 above 0.06, 255-300 above 0.05), and the crossfades the page performs (the three direction palettes
 *   with each other, jade over the stage and the page grounds) never blend through orange (src/lib/theme/blend.ts).
 * Exits 1 on any failure.
 */
import Module from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

let checks = 0;
let failures = 0;
function check(cond: unknown, label: string, info?: unknown): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL ${label}${info === undefined ? "" : ` ${JSON.stringify(info)}`}`);
  }
}

const ROOT = resolve(__dirname, "..", "..");
const MK = join(ROOT, "src", "app", "(marketing)");

async function main(): Promise<void> {
  // data.ts and outcomes.ts are marked `import "server-only"`: outside Next that import throws
  {
    const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
    const orig = M._resolveFilename;
    const stub = require.resolve("zod");
    M._resolveFilename = function (req: string, ...rest: unknown[]) {
      return req === "server-only" ? stub : orig.call(this, req, ...rest);
    };
  }
  const { homeData, SLOT_SEEDS, RAIL_ORDER, seedValue } = await import("../../src/app/(marketing)/living/data");
  const { COPY, MARKETING_LOCALES } = await import("../../src/app/(marketing)/copy");
  const { DESIGNER_SEEDS } = await import("@/lib/design/seeds");
  const { GENE_VOCAB } = await import("@/lib/design/vocab");
  const { BOLD_GENES, GENE_KEYS } = await import("@/lib/design/genome");
  const { ACTIVE_STORE_ROLES } = await import("@/lib/auth/permissions");
  const { ATTEMPT_OUTCOMES } = await import("@/lib/callcenter/outcomes");
  const { ORDER_STATUSES } = await import("@/lib/orders/contract");
  const { PURCHASE_TRIGGERS } = await import("@/lib/pixels/server-events-shared");
  const { DIRECTOR_SLOTS, RUBRIC_DIMS } = await import("@/lib/ai/director/types");
  const { fromOklch } = await import("@/lib/theme/color");
  const { orangeBlend } = await import("@/lib/theme/blend");

  const d = homeData();

  /* seeds and genes ---------------------------------------------------- */
  for (const [slot, id] of Object.entries(SLOT_SEEDS)) {
    check(DESIGNER_SEEDS.some((s) => s.id === id), `seed ${id} (${slot}) exists`);
    for (const g of BOLD_GENES) {
      const v = seedValue(id, g);
      const vocab = GENE_VOCAB[g as keyof typeof GENE_VOCAB];
      check(v !== undefined && (vocab.values ?? []).includes(v), `${id} ${g}=${v} is in GENE_VOCAB`);
      check(d.genes[g][slot as keyof typeof SLOT_SEEDS] === v, `hero shows ${id} ${g}`);
    }
  }
  check(d.slots.join() === DIRECTOR_SLOTS.join(), "slots are DIRECTOR_SLOTS");
  check(d.rubricDims === RUBRIC_DIMS.length, "the Director's ticks are RUBRIC_DIMS.length");
  check(RAIL_ORDER.length === BOLD_GENES.length && [...RAIL_ORDER].sort().join() === [...BOLD_GENES].sort().join(), "rail order is a permutation of BOLD_GENES", RAIL_ORDER);
  check(d.ledger.length === GENE_KEYS.length && d.ledger.every((b, i) => b.gene === GENE_KEYS[i]), "the ledger has one bar per GENE_KEYS entry");
  check(d.ledger.filter((b) => b.bold).length === BOLD_GENES.length, "the ledger's bold bars are BOLD_GENES");
  for (const r of d.roles) check(ACTIVE_STORE_ROLES.includes(r), `role ${r} is active`);
  check(d.roles.length === 4, "four roles shown", d.roles);
  check(d.outcomes.map((o) => o.id).join() === ATTEMPT_OUTCOMES.join(), "the pad is ATTEMPT_OUTCOMES in order");
  check(d.triggers.join() === PURCHASE_TRIGGERS.join(), "the trigger rail is PURCHASE_TRIGGERS");
  check(d.events.lead === "Lead" && d.events.purchase === "Purchase", "Meta events are Lead and Purchase", d.events);

  /* copy --------------------------------------------------------------- */
  const keysOf = (o: unknown, p = ""): string[] =>
    o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === "object" ? keysOf(v, `${p}${k}.`) : [`${p}${k}`])) : [];
  const ref = keysOf(COPY.fr.home).sort().join();
  for (const l of MARKETING_LOCALES) {
    const home = COPY[l].home;
    check(keysOf(home).sort().join() === ref, `${l}: home has the same keys as fr`);
    for (const id of ATTEMPT_OUTCOMES) check(typeof home.outcomes[id] === "string" && home.outcomes[id].length > 0, `${l}: outcome ${id}`);
    for (const s of DIRECTOR_SLOTS) check(home.slots[s]?.length > 0, `${l}: slot ${s}`);
    for (const r of d.roles) check(home.roles[r]?.length > 0, `${l}: role ${r}`);
    for (const s of ["new", "confirmed", "in_transit", "delivered"] as const) check(home.statuses[s]?.length > 0, `${l}: status ${s}`);
    const strings = keysOf(home).map((k) => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], home) as string);
    const digit = strings.find((s) => /\p{Nd}/u.test(s));
    check(!digit, `${l}: no digit in home copy`, digit);
    check(COPY[l].hero.title.length === 2, `${l}: the h1 is two sentences`);
  }
  for (const s of ["new", "confirmed", "in_transit", "delivered"] as const) {
    const fr = ORDER_STATUSES.find((x) => x.id === s)?.fr;
    check(COPY.fr.home.statuses[s] === fr, `fr status ${s} = ORDER_STATUSES (${fr})`);
    check(d.statusesFr[s] === fr, `data statusesFr ${s}`);
  }

  /* sources ------------------------------------------------------------ */
  const files = [join(MK, "page.tsx"), join(MK, "site-chrome.tsx"), ...readdirSync(join(MK, "living")).map((f) => join(MK, "living", f))];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    check(!/lucide-react/.test(src), `${f.slice(ROOT.length)} imports no lucide-react`);
    check(!/offset-path|offsetPath/.test(src.replace(/no offset-path|\(no offset-path\)|no CSS offset-path/g, "")), `${f.slice(ROOT.length)} uses no offset-path`);
  }
  check(/"use client"/.test(readFileSync(join(MK, "living", "island.tsx"), "utf8")), "island.tsx is the client component");
  for (const f of files.filter((x) => x.endsWith(".tsx") && !x.endsWith("island.tsx"))) check(!/^"use client"/m.test(readFileSync(f, "utf8")), `${f.slice(ROOT.length)} is a server component`);

  /* colour ------------------------------------------------------------- */
  const css = [join(MK, "marketing.module.css"), join(MK, "living", "living.module.css")];
  const lits: { l: number; c: number; h: number; src: string }[] = [];
  for (const f of css) {
    for (const m of readFileSync(f, "utf8").matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) lits.push({ l: Number(m[1]), c: Number(m[2]), h: Number(m[3]), src: m[0] });
  }
  check(lits.length > 60, "the stylesheets' oklch literals were read", lits.length);
  for (const k of lits) {
    const bad = (k.h >= 25 && k.h <= 95 && k.c > 0.06) || (k.h >= 255 && k.h <= 300 && k.c > 0.05);
    check(!bad, `colour ${k.src} is outside the forbidden bands`);
  }
  const hex = (l: number, c: number, h: number) => fromOklch({ l, c, h });
  const palettes = {
    best: [hex(0.985, 0.004, 165), hex(0.22, 0.012, 170), hex(0.52, 0.1, 168), hex(0.94, 0.02, 166)],
    contrast: [hex(0.36, 0.06, 232), hex(0.97, 0.006, 230), hex(0.86, 0.07, 196), hex(0.43, 0.06, 232)],
    explore: [hex(0.945, 0.026, 108), hex(0.27, 0.03, 118), hex(0.47, 0.09, 124), hex(0.9, 0.035, 110)],
  };
  const pairs: [string, string, string][] = [];
  const names = Object.keys(palettes) as (keyof typeof palettes)[];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) pairs.push([`${names[i]}[${k}]×${names[j]}[${m}]`, palettes[names[i]][k], palettes[names[j]][m]]);
  const jade = [hex(0.8, 0.11, 166), hex(0.5, 0.1, 168), hex(0.66, 0.12, 168)];
  const grounds = [hex(0.985, 0.002, 265), hex(0.155, 0.005, 265), hex(0.165, 0.006, 265), hex(0.2, 0.006, 265), hex(0.205, 0.008, 265), hex(0.235, 0.008, 265), hex(0.27, 0.009, 265), hex(1, 0, 0), hex(0, 0, 0)];
  for (const j of jade) for (const g of grounds) pairs.push([`jade ${j} over ${g}`, j, g]);
  const steel = [hex(0.74, 0.08, 220), hex(0.55, 0.05, 235), hex(0.7, 0.05, 235)];
  for (const s of steel) for (const g of grounds) pairs.push([`steel ${s} over ${g}`, s, g]);
  for (const [label, a, b] of pairs) check(orangeBlend(a, b) === null, `blend ${label} stays out of orange`, orangeBlend(a, b));

  console.log(`marketing-home: ${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
