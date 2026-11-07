/**
 * Fixture builders of the design gates (P6 DESIGN; design.md DES-§8.10, DES-§25.1 TC-1, DES-§8.13; test-only module):
 * the documents the `test:design` gates group and the maintainer's `test:prepublish` design cases read, so both suites
 * gate the same pages. Pure and deterministic (fixed seeds, fixed clock); never imported by app code.
 *
 *  - `fixtureInput` / `directionsOf`: a page fixture's wizard input and its three engine directions;
 *  - `gateInputOf`: the landing `GateInput` of a document (`gateInputFor` with the fixture assets, the product facts
 *    and the novelty-ok verdict unless one is passed);
 *  - `cleanDoc`: a generated direction after the wizard's repair (0 hard items): the passing side of every TC-1 pair;
 *  - `baselineDoc`: a fixture default without look (the 27-section baseline-like page: slop ≥ 6, Q ≤ 40);
 *  - `slopDoc`: the ghost word / ring / three-glass / two-strips / numbered-eyebrow page (slop ≥ 6, ≤ 2 after repair);
 *  - `mutate`: a sandbox copy with one change (the failing side of a TC-1 pair);
 *  - `storeTemplate`: a `defaultTemplate`-style store document per kind (the DES-§8.13 table, R2 interim).
 */
import { FIXTURE_ASSETS, getFixture, type FixtureName } from "@/lib/page/fixtures";
import type { PageDoc, SectionInstance } from "@/lib/page/schema";
import { buildTheme } from "@/lib/theme";
import { generateDirections, type GenerateInput } from "@/lib/generator/directions";
import { gateInputFor } from "../gate-input";
import { repairDoc } from "../gates/repair";
import type { AssetMeta, GateInput, OriginClass, StorePageDoc, StorePageKind } from "../gates/types";
import type { DesignGenome } from "../genome";
import type { NoveltyVerdict } from "../novelty.server";

export const FIXTURE_NOW = "2026-10-28T09:00:00.000Z";
/** every band ok (the novelty term of Q is 1) */
export const NOVELTY_OK: NoveltyVerdict = { key: "fixture", platform: "ok", niche: "ok", own: "ok", clone: false };

/** The fixture photos' metadata (no bytes). */
export const FIXTURE_META: ReadonlyMap<string, AssetMeta> = new Map(FIXTURE_ASSETS.map((a) => [a.id, { id: a.id, width: a.width, height: a.height, alpha: !!a.alpha }]));

/** A fixture's wizard input (its product, items, offers, photo palette and sizes). */
export function fixtureInput(name: FixtureName, locale: "ar" | "fr" | "en", seed: number, brandSeed = `store-${name}-${seed}`): GenerateInput {
  const doc: PageDoc = getFixture(name, { now: FIXTURE_NOW, locale }).doc;
  const asset = FIXTURE_ASSETS.find((a) => a.id === doc.product.images[0]?.id) ?? FIXTURE_ASSETS[0]!;
  return {
    product: { ...doc.product },
    items: doc.items,
    offers: doc.offers.bundles,
    palette: asset.palette,
    locale,
    market: doc.market,
    seedBase: seed,
    brandSeed,
    photos: doc.product.images.map((img) => {
      const a = FIXTURE_ASSETS.find((x) => x.id === img.id);
      return { id: img.id, width: a?.width ?? 1200, height: a?.height ?? 1500, alpha: !!a?.alpha };
    }),
  };
}

/** The product facts a document carries ("- fact" lines of the description) as the gates' copy facts. */
export function factsOf(doc: PageDoc): GateInput["facts"] {
  const facts = (doc.product.description ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());
  return { facts, productName: doc.product.name, price: doc.items[0]?.price ?? null };
}

/** The landing gate input of a document (the wizard context unless another is passed). */
export function gateInputOf(doc: PageDoc, over: Partial<GateInput> & { origin?: ReadonlyMap<string, OriginClass> } = {}): GateInput & { doc: PageDoc } {
  const base = gateInputFor(doc, {
    kind: "landing",
    theme: buildTheme(doc.theme, doc.locale),
    look: doc.theme.look ?? null,
    assets: FIXTURE_META,
    locale: doc.locale,
    context: "wizard",
    origin: over.origin ?? new Map(),
    facts: factsOf(doc),
    ownerProof: false,
    novelty: NOVELTY_OK,
  });
  return { ...base, ...over, doc } as GateInput & { doc: PageDoc };
}

/** The three engine directions of a fixture with their planned genomes. */
export function directionsOf(name: FixtureName, locale: "ar" | "fr", seed = 3): { doc: PageDoc; genome: DesignGenome | null }[] {
  return generateDirections(fixtureInput(name, locale, seed)).map((d) => ({ doc: d.doc, genome: d.genome ?? null }));
}

/** A generated direction after the wizard's automatic repair (3 rounds): the clean side of a TC-1 pair. */
export function cleanDoc(name: FixtureName = "parfum", locale: "ar" | "fr" = "fr", which = 0, seed = 3): PageDoc {
  const d = directionsOf(name, locale, seed)[which]!;
  return repairDoc(gateInputOf(d.doc)).doc;
}

/** A fixture default without look (the baseline-like page of design-baseline §3). */
export const baselineDoc = (name: FixtureName = "argan", locale: "ar" | "fr" = "fr"): PageDoc => getFixture(name, { now: FIXTURE_NOW, locale }).doc;

/** A sandbox copy of a document with one change. */
export function mutate(doc: PageDoc, f: (d: PageDoc) => void): PageDoc {
  const d = structuredClone(doc);
  f(d);
  return d;
}

const section = (id: string, type: string, variant: string, bg: SectionInstance["bg"], data: Record<string, unknown> = {}): SectionInstance => ({ id, type, variant, bg, divider: "auto", spacing: "normal", hidden: false, data });

/** Inserts sections after the hero (ids unique). */
export function insertAfterHero(doc: PageDoc, ...add: SectionInstance[]): void {
  const at = doc.sections.findIndex((s) => s.type === "hero");
  doc.sections.splice(at + 1, 0, ...add);
}

/**
 * The slop fixture of DES-§25.1: a clean page given a ghost word on a stage hero, the ring badge (the bold form), three
 * glass surfaces, two scrolling strips and a numbered eyebrow.
 */
export function slopDoc(locale: "ar" | "fr" = "fr"): PageDoc {
  return mutate(cleanDoc("argan", locale, 0), (d) => {
    const hero = d.sections.find((s) => s.type === "hero")!;
    hero.variant = "stage";
    hero.data = { ...hero.data, ghost: true, bigWord: "", kicker: "01 · Argan" };
    const form = d.sections.find((s) => s.type === "orderForm");
    if (form) form.variant = "bold";
    const ann = d.sections.find((s) => s.type === "announcement");
    if (ann) ann.variant = "ticker";
    insertAfterHero(
      d,
      section("tape1", "marquee", "tape", "surface", { items: ["Argan", "Huile", "Maroc"] }),
      section("bento1", "benefits", "zigzag", "base", { title: "Pourquoi l’argan", items: [] }),
      section("trust2", "trustBar", "chips", "soft", {}),
    );
  });
}

/**
 * A `defaultTemplate`-style store document of a gate kind (STO-§6.2 shape: sections, locale, title, seo). `policy` has
 * no page row (STO-§3.1): its document is a custom `page` the gates run under the `policy` row (R2 contract step C2-B1:
 * storefront's frozen `StorePageDoc` has no `market`; the gate context passes the store's, STORE_TEMPLATE_MARKET).
 */
export const STORE_TEMPLATE_MARKET = "MA" as const;
export function storeTemplate(kind: StorePageKind, locale: "ar" | "fr" = "fr"): StorePageDoc {
  return {
    v: 1,
    kind: kind === "policy" ? "page" : kind,
    locale,
    title: "",
    seo: { noindex: false },
    sections: [section("header", "header", "minimal", "base"), section("main", "faq", "accordion", "soft", { title: kind === "policy" ? "Livraison et retours" : "Questions", items: [] }), section("footer", "footer", "simple", "base")],
  };
}
