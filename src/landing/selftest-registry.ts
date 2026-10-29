/**
 * Registry self-test (`test:registry`; P6 DESIGN; design.md DES-§25.1, DES-§8.4, DES-§5.13; ids DG-04, DG-06):
 *
 *   npx tsx src/landing/selftest-registry.ts
 *
 * Fails when:
 *  - a variant of the registry has no `features`, or no `family` (so no variant dodges the slop score, the fold
 *    contract, the floating-layer rule or the rhythm rules of H35 / V38), or an entry names a variant that does not
 *    exist;
 *  - a hero variant has no `fold`, or a fixed variant (`fixed` set) no `fixedPx`;
 *  - a sheeted, registered variant's `features.fold`, `features.slots` or `features.h` differs from what
 *    src/lib/design/sheets.ts generates (a hand-edited value); a sheet of a family not built yet is listed as
 *    pending and checked strictly once a later step registers its variant;
 *  - a `decor` path is missing from the variant's data schema;
 *  - a variant has `aurora: true` (V40, CRIT2-4);
 *  - a resolved entry is not the frozen `VariantFeaturesResolved` shape (every key, no other key; DES-§8.4);
 *  - the order form does not declare the fixed 1.1-screen height (LAN R12);
 *  - a DES-§5.4 grammar pool names a variant that is neither registered nor sheeted, or puts `scrapbook`,
 *    `problem:chat`, `faq:chat`, `trustBar:stamps` or an `urgency` variant in a pool.
 * Exit code 1 on any failure.
 */
import { GRAMMARS } from "@/lib/page/schema";
import { grammarPools } from "@/lib/design/compile";
import { registeredFeatures, variantFeatures } from "@/lib/design/features";
import { SHEETS, sheetFeatures } from "@/lib/design/sheets";
import type { VariantFeaturesResolved } from "@/lib/design/types";
import { SECTIONS, VARIANT_FEATURES } from "./registry";

let failures = 0;
let checks = 0;
const check = (cond: unknown, message: string) => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${message}`);
  }
};

const FAMILIES: readonly VariantFeaturesResolved["family"][] = ["split", "grid", "list", "statement", "ledger", "table", "media"];
/** The frozen shape's keys (src/lib/design/types.frozen.ts): required, then optional. */
const REQUIRED_KEYS = [
  "glass", "aurora", "centered", "equalCards", "iconHeads", "bento", "scroller", "signature", "details", "ghostWord", "ring", "overlayChips",
  "dots", "numberedEyebrow", "animatesLayout", "family", "ctas", "cardGrid", "picker", "fixed", "fixedPx", "revealNodes",
] as const;
const OPTIONAL_KEYS = ["slots", "fold", "openers", "textRuns", "h"] as const;

/** Deterministic JSON (sorted keys) for deep equality. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

/** The zod node under a schema's wrappers (default, optional, nullable, pipe / transform, readonly). */
function unwrap(node: unknown): unknown {
  let n = node as { _zod?: { def?: Record<string, unknown> } } | undefined;
  for (let i = 0; i < 16 && n?._zod?.def; i++) {
    const def = n._zod.def;
    const type = def.type as string;
    if (type === "default" || type === "optional" || type === "nullable" || type === "readonly" || type === "prefault" || type === "catch" || type === "nonoptional") n = def.innerType as typeof n;
    else if (type === "pipe") n = def.in as typeof n;
    else break;
  }
  return n;
}

/** Whether a dotted path (`notes`, `media.ghost`) exists in a zod object schema (array elements are entered). */
function hasPath(schema: unknown, path: string): boolean {
  let node = unwrap(schema) as { _zod?: { def?: Record<string, unknown> } } | undefined;
  for (const key of path.split(".")) {
    let def = node?._zod?.def;
    while (def && def.type === "array") {
      node = unwrap(def.element) as typeof node;
      def = node?._zod?.def;
    }
    if (!def || def.type !== "object") return false;
    const shape = def.shape as Record<string, unknown> | undefined;
    if (!shape || !(key in shape)) return false;
    node = unwrap(shape[key]) as typeof node;
  }
  return true;
}

function main() {
  const registered = new Set<string>();
  for (const def of SECTIONS) {
    for (const v of def.variants) {
      const key = `${def.type}:${v.id}`;
      registered.add(key);
      const f = registeredFeatures(def.type, v.id);
      check(f, `${key}: no features`);
      if (!f) continue;
      check(FAMILIES.includes(f.family), `${key}: family "${String(f.family)}" is not a layout family`);
      check(f.aurora !== (true as unknown as false), `${key}: aurora true (V40)`);
      if (def.type === "hero") check(f.fold && f.fold.rows.length > 0, `${key}: a hero variant without fold`);
      if (f.fixed) check(typeof f.fixedPx === "number" && f.fixedPx > 0, `${key}: fixed "${f.fixed}" without fixedPx`);
      for (const [decor, path] of Object.entries(f.decor ?? {})) check(hasPath(def.schema, path), `${key}: decor ${decor} path "${path}" is not in the section's data schema`);
      // the frozen shape: every key, no other key, after the data toggles of the type's default data
      const resolved = variantFeatures(def.type, v.id, {});
      const keys = Object.keys(resolved);
      for (const k of REQUIRED_KEYS) check(k in resolved, `${key}: resolved features lack ${k}`);
      for (const k of keys) check((REQUIRED_KEYS as readonly string[]).includes(k) || (OPTIONAL_KEYS as readonly string[]).includes(k), `${key}: resolved features carry an unknown key ${k}`);
      check(resolved.family === f.family && resolved.aurora === false, `${key}: resolved family / aurora`);
      // sheets: fold, slots and h generated, never hand-edited (DS47)
      const sh = SHEETS[key];
      if (sh) {
        const want = sheetFeatures(sh);
        check(canon(f.fold ?? null) === canon(want.fold ?? null), `${key}: features.fold differs from sheet ${sh.id}`);
        check(canon(f.slots ?? []) === canon(want.slots), `${key}: features.slots differ from sheet ${sh.id}`);
        check(canon(f.h) === canon(want.h), `${key}: features.h differs from sheet ${sh.id} (${JSON.stringify(f.h)} ≠ ${want.h})`);
        check(f.family === sh.family, `${key}: family ${f.family} differs from sheet ${sh.id} (${sh.family})`);
      }
    }
  }
  // no entry for a variant that does not exist
  for (const [type, variants] of Object.entries(VARIANT_FEATURES)) for (const id of Object.keys(variants)) check(registered.has(`${type}:${id}`), `features for ${type}:${id}, which the registry does not have`);

  // fixed layers: the sticky bar and the WhatsApp float are never in flow
  for (const def of SECTIONS.filter((d) => d.type === "stickyCta" || d.type === "whatsappFloat"))
    for (const v of def.variants) check(variantFeatures(def.type, v.id, {}).fixed !== null, `${def.type}:${v.id} is not a fixed layer`);

  // the order form: 1.1 screens, fixed, with the per-row terms (LAN R12, DES-§5.3)
  for (const v of SECTIONS.find((d) => d.type === "orderForm")?.variants ?? []) {
    const h = variantFeatures("orderForm", v.id, {}).h;
    check(typeof h === "object" && h.base === 1.1 && h.fixed === true && h.per?.offerRow === 0.15 && h.per.optionGroup === 0.25 && h.per.bump === 0.07, `orderForm:${v.id}: h is not { base: 1.1, fixed: true, per }`);
  }

  // the data toggles (DES-§8.4)
  check(variantFeatures("hero", "stage", { bigWord: "" }).ghostWord === false, "hero:stage with an empty bigWord keeps its ghost word");
  check(variantFeatures("hero", "stage", { notes: [{ title: "a" }] }).overlayChips === 1, "hero:stage chips are not capped by its notes");
  check(variantFeatures("steps", "timeline", { cta: false }).ctas === 0, "data.cta = false keeps a CTA");
  check(variantFeatures("benefits", "numbered", { cta: true }).ctas === 1, "data.cta = true adds no CTA");
  check(canon(variantFeatures("benefits", "numbered", { opener: "number" }).openers) === canon(["number"]), "data.opener does not narrow openers");
  check(canon(variantFeatures("footer", "simple", { opener: "number" }).openers) === canon([]), "data.opener widened a variant without openers");
  const unknown = variantFeatures("nope", "nope", {});
  check(unknown.family === "grid" && unknown.fixed === null && unknown.ctas === 0, "an unknown variant does not answer the documented defaults");

  // DES-§5.4 pools: every pooled variant registered or sheeted; the banned ones in no pool
  const BANNED = new Set(["hero:scrapbook", "problem:chat", "faq:chat", "trustBar:stamps"]);
  const pending = new Set<string>();
  for (const g of GRAMMARS) {
    const { hero, pools } = grammarPools(g);
    const all: [string, string][] = [...hero.map((w) => ["hero", w.variant] as [string, string]), ...Object.entries(pools).flatMap(([t, list]) => (list ?? []).map((w) => [t, w.variant] as [string, string]))];
    for (const [t, v] of all) {
      const key = `${t}:${v}`;
      check(!BANNED.has(key) && t !== "urgency", `pool ${g} names ${key}, which is in no pool (DES-§5.4)`);
      if (!registered.has(key)) {
        check(SHEETS[key], `pool ${g} names ${key}: neither registered nor sheeted`);
        if (SHEETS[key]) pending.add(key);
      }
    }
  }
  const sheeted = Object.keys(SHEETS);
  console.log(`registry: ${registered.size} variants with features · ${sheeted.filter((k) => registered.has(k)).length} sheeted and registered · pending sheets (not built yet): ${sheeted.filter((k) => !registered.has(k)).join(", ")}`);
  console.log(`pools: ${pending.size} pooled variants wait for their build (${[...pending].sort().join(", ")})`);
  console.log(`${checks} checks · ${failures ? `${failures} FAILURE(S)` : "ALL OK"}`);
  process.exit(failures ? 1 : 0);
}

main();
