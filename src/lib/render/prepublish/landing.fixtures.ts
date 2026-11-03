// proves: LP-01, LP-02, LP-21, LAN-§3.2.1
/**
 * The honesty gate's fixtures (P3 LANDING; landing.md LAN-§3.2.1 `test:prepublish` list, LAN-§6.1, LAN-§6.2, LAN-§6.3,
 * LAN-§3.5 OF2 / OF4): every page, its store and the exact items `landingGateItems` answers. The core harness
 * (src/lib/render/selftest-prepublish.ts) imports this file at the P3 merge; until then `test:honesty`
 * (src/lib/landing/honesty/selftest.ts) runs it. Pure, no database:
 *
 *   for (const fx of landingGateFixtures()) {
 *     const items = landingGateItems(fx.ctx, fx.inputs);
 *     assert.deepEqual(landingFixtureProblems(fx, items), []);
 *   }
 *
 * The pages come from src/lib/landing/honesty/fixtures.ts (compact reproductions of the design-baseline findings);
 * each store is complete (policies reviewed, a caller number, saved calling hours, the confirmation lead typed) so the
 * store's own notes stay silent and a fixture shows exactly the rows it is about. `expect.items` is the exact multiset
 * of `{ id, level, sectionId?, field? }`; `expect.none` lists ids that must not appear (the form sweep). A fixture
 * with `integrationOnly` is asserted only once design's height model is real (`estimateHeights` is the P0 stub).
 *
 * Who wrote each field comes the way it does in production: a generation record (`inputs.gen`, the generator's
 * hashes of the fields it wrote) folded through the core's `originFrom` (`inputs.origin`), so the builder checklist,
 * which refolds `gen` as the owner edits, reads every fixture exactly as the gate does.
 */
import { getFixture, FIXTURE_NAMES } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import type { EffectiveWindow, IsoWeekday } from "@/lib/callcenter/window";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import { CheckoutSetting } from "@/lib/settings/keys/checkout";
import { LandingSetting } from "@/lib/settings/keys/landing";
import { PoliciesSetting, type StorePolicyFacts } from "@/lib/settings/keys/policies";
import { StoreSetting } from "@/lib/settings/keys/store";
import type { BuiltTheme } from "@/lib/theme/types";
import type { GateItem } from "@/lib/tenancy/types";
import { basePage, fixtureSource, generated, honestyFixtures, HONESTY_NOW, setText, singleOffer, zoneRow, type FixtureSource, type HonestyFixture } from "@/lib/landing/honesty/fixtures";
import { foldOrigin, type GeneratedSnapshot, type LiveFacts } from "@/lib/landing/honesty/gate";
import { hash16, originFrom, textFieldsOf, type GenerationRecord } from "../origin";
import type { PrePublishCtx } from "../prepublish";
import type { LandingGateInputs } from "./landing";

/** Every fixture is judged at this instant. */
export const LANDING_GATE_NOW = HONESTY_NOW;
const NOW = Date.parse(LANDING_GATE_NOW);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export interface ExpectedGateItem {
  id: string;
  level: "hard" | "soft";
  sectionId?: string;
  field?: string;
}

/**
 * A fixture's publish context without the publisher: the gate reads only the document, the live version, the clock,
 * the theme, the rendered HTML and the assets. A harness adds its own scope, store, actor and page id (selftests mint
 * them; this file never casts a scope, lint L6).
 */
export type GateFixtureCtx = Omit<PrePublishCtx, "scope" | "store" | "actor" | "pageId">;

export interface LandingGateFixture {
  name: string;
  /** what the case proves (LAN-§3.2.1 list, the rev 3 must-pass cases, LP-21) */
  about: string;
  ctx: GateFixtureCtx;
  inputs: LandingGateInputs;
  expect: {
    /** the check's answer: refused (`honesty_blocked`) or published with notes; absent = not compared (the sweep) */
    ok?: boolean;
    /** exactly these items (any order); absent = not compared */
    items?: ExpectedGateItem[];
    /** ids that never appear */
    none?: string[];
    /** at most this many hard items (the keep-list pages: 0) */
    maxHard?: number;
    /** items that must be among the answer (a page whose other items are not this fixture's subject) */
    has?: ExpectedGateItem[];
  };
  /**
   * Ids left out of the comparison, with the reason. Every fixture that is not about the form ignores `form:F1`: its
   * page keeps the offers its numbers come from (three offers and a bump estimate 1,325 px, a soft note), and the
   * form's own fixtures and the sweep prove the row.
   */
  ignore?: readonly string[];
  /** asserted only once `estimateHeights` is design's real model (the reason) */
  integrationOnly?: string;
}

const NOT_ABOUT_THE_FORM = ["form:F1"] as const;

/* ------------------------------------------------------------------ */
/* a complete store                                                    */
/* ------------------------------------------------------------------ */

const week = (r: { from: string; to: string }[]): Record<IsoWeekday, { from: string; to: string }[]> => ({ 1: r, 2: r, 3: r, 4: r, 5: r, 6: r, 7: [] });

/** Calling hours the owner saved: Monday to Saturday, 09:00 to 19:00. */
export function savedWindow(over: Partial<EffectiveWindow> = {}): EffectiveWindow {
  return { tz: "Africa/Casablanca", days: week([{ from: "09:00", to: "19:00" }]), closedDates: [], overrides: [], openOverrideUntil: null, configured: true, ...over };
}

/**
 * Reviewed policies: inspection before paying allowed (the library's trust lines say "Vérifiez avant de payer"), every
 * other answer unset, so a claim about one of them is "unset", never "allowed".
 */
export function reviewedPolicies(over: Record<string, unknown> = {}): StorePolicyFacts {
  return PoliciesSetting.parse({ inspection: "allowed", reviewedAt: iso(NOW - 30 * DAY), ...over });
}

/**
 * The inputs of a store whose own notes are all silent: policies reviewed, a caller number, saved calling hours, the
 * confirmation lead typed, no market city list (no `delivery:zones-empty`), no WhatsApp order button.
 */
export function gateInputs(over: Partial<LandingGateInputs> = {}): LandingGateInputs {
  const checkout = CheckoutSetting.parse({ calendar: { confirmationLeadDays: 1 } });
  return {
    zones: [],
    policies: reviewedPolicies(),
    confirmation: StoreSetting.parse({}).confirmation,
    checkout,
    landing: LandingSetting.parse({}),
    callingWindow: savedWindow(),
    attested: new Set(),
    attestedFacts: new Set(),
    origin: new Map(),
    product: null,
    facts: [],
    gen: null,
    generated: null,
    live: null,
    storeWhatsapp: false,
    hasMarketList: false,
    feesByTopCity: {},
    cityNames: {},
    ...over,
    // the caller number is part of every complete store (`thanks:no-caller` silent)
    ...(over.confirmation ? {} : { confirmation: { ...StoreSetting.parse({}).confirmation, callerPhone: "+212522000000" } }),
  };
}

/** `checkout` with zones on or off and the lead typed. */
const checkoutWith = (zonesEnabled: boolean, over: Record<string, unknown> = {}) => CheckoutSetting.parse({ zonesEnabled, calendar: { confirmationLeadDays: 1 }, ...over });

/** The publish context of a fixture page, its theme built by the fixture source. */
export function gateCtx(src: FixtureSource, doc: PageDoc, o: { prev?: PageDoc | null; html?: string; theme?: BuiltTheme; mode?: "block" | "warn"; now?: number } = {}): GateFixtureCtx {
  return {
    doc,
    prev: o.prev ?? null,
    theme: o.theme ?? src.theme(doc),
    assets: new Map(),
    now: new Date(o.now ?? NOW),
    mode: o.mode ?? "block",
    ...(o.html !== undefined ? { html: o.html } : {}),
  };
}

/** The inputs of an honesty fixture's store (its policies, zones, facts and confirmation; reviewed and complete). */
function inputsOf(fx: HonestyFixture, over: Partial<LandingGateInputs> = {}): LandingGateInputs {
  const s = fx.store;
  return gateInputs({
    zones: [...s.zones],
    policies: { ...s.policies, inspection: s.policies.inspection === "unset" ? "allowed" : s.policies.inspection, reviewedAt: s.policies.reviewedAt ?? iso(NOW - 30 * DAY) },
    checkout: checkoutWith(s.zonesEnabled ?? s.zones.length > 0),
    confirmation: { callerPhone: "+212522000000", ...s.confirmation },
    facts: [...s.facts],
    origin: fx.origin,
    attested: new Set([...(fx.attestedSections ?? []), ...(s.ratingAttested ? ["rating"] : [])]),
    ...over,
  });
}

const item = (id: string, level: "hard" | "soft", at: { sectionId?: string; field?: string } = {}): ExpectedGateItem => ({ id, level, ...at });

/**
 * The generation record of a page whose `generated` paths the generator wrote (every other field is the owner's: a
 * record that is present names only the generator's fields), and the origin the core folds from it.
 */
export function provenanceOf(doc: PageDoc, generatedPaths: Iterable<string>): { gen: GenerationRecord; origin: Map<string, "generated" | "owner"> } {
  const text = textFieldsOf(doc);
  const gen: GenerationRecord = {};
  for (const path of generatedPaths) {
    const t = text.get(path);
    if (t !== undefined) gen[path] = { h: hash16(t), o: "cloud" };
  }
  return { gen, origin: foldOrigin(originFrom(null, doc, gen)) };
}

/** A fixture with its origin rebuilt from a generation record (see the file's header). */
function withProvenance(fx: LandingGateFixture): LandingGateFixture {
  const generatedPaths = [...fx.inputs.origin].filter(([, o]) => o === "generated").map(([path]) => path);
  const { gen, origin } = provenanceOf(fx.ctx.doc, generatedPaths);
  return { ...fx, inputs: { ...fx.inputs, gen, origin } };
}
const sectionOf = (doc: PageDoc, type: string) => doc.sections.find((s) => s.type === type)!;

/* ------------------------------------------------------------------ */
/* LAN-§3.2.1: the refused pages                                        */
/* ------------------------------------------------------------------ */

function fromHonesty(src: FixtureSource): LandingGateFixture[] {
  const all = new Map(honestyFixtures(src).map((f) => [f.name, f]));
  const fx = (name: string) => {
    const f = all.get(name);
    if (!f) throw new Error(`landing fixture: no honesty fixture ${name}`);
    return f;
  };
  const out: LandingGateFixture[] = [];
  const add = (f: HonestyFixture, about: string, expect: LandingGateFixture["expect"], over: Partial<LandingGateInputs> = {}) =>
    out.push({ name: f.name, about, ctx: gateCtx(src, f.doc), inputs: inputsOf(f, over), expect });

  {
    const f = fx("sample-reviews");
    add(f, "a visible reviews section still flagged sample (LD17)", { ok: false, items: [item("honesty:sample", "hard", { sectionId: sectionOf(f.doc, "reviews").id })] });
  }
  {
    const f = fx("one-image-before-after");
    add(f, "a before/after with one photo used twice (DB I4)", { ok: false, items: [item("honesty:I4", "hard", { sectionId: sectionOf(f.doc, "beforeAfter").id })] });
  }
  {
    const f = fx("still-video");
    add(f, "a video section with a poster and no video (DB I4)", { ok: false, items: [item("honesty:I4", "hard", { sectionId: sectionOf(f.doc, "video").id })] });
  }
  {
    const f = fx("two-asset-gallery");
    add(f, "a gallery with two distinct photos and no fill (DB I4)", { ok: false, items: [item("honesty:I4", "hard", { sectionId: sectionOf(f.doc, "gallery").id })] });
  }
  {
    const f = fx("blender-30s-40s");
    add(f, "the blender: the wizard said 30 s, a generated benefit says 40 s (DB D1)", { ok: false, items: [item("honesty:D1", "hard", { sectionId: "benefits", field: "benefits.items.0.text" })] });
  }
  {
    const f = fx("blender-conflict");
    add(f, "the blender once both values are facts: one number class, two values (DB D1 conflict)", { ok: false, items: [item("honesty:D1", "hard", { field: "product.description" })] });
  }
  {
    const f = fx("tshirt-counters");
    add(f, "the t-shirt counters nobody typed (DB D1)", {
      ok: false,
      items: [item("honesty:D1", "hard", { sectionId: "hero", field: "hero.subtitle" }), item("honesty:D1", "hard", { sectionId: "benefits", field: "benefits.items.1.text" })],
    });
  }
  {
    const f = fx("library-rating");
    add(f, "the library hero text \"4,7 (312 avis)\" (DB D1, two numerals)", {
      ok: false,
      items: [item("honesty:D1", "hard", { sectionId: "hero", field: "hero.subtitle" }), item("honesty:D1", "hard", { sectionId: "hero", field: "hero.subtitle" })],
    });
  }
  {
    const f = fx("library-stats");
    const id = sectionOf(f.doc, "stats").id;
    add(f, "the library stats \"94 %\" still flagged sample (LD17 + DB D2; the section's numbers are judged once it is real)", {
      ok: false,
      items: [item("honesty:sample", "hard", { sectionId: id }), item("honesty:D2", "hard", { sectionId: id })],
    });
  }
  {
    const f = fx("generated-fact");
    add(f, "a generated \"3 couleurs\": a number the model wrote (rev 3, ENGP-8)", { ok: false, items: [item("honesty:D1", "hard", { sectionId: "benefits", field: "benefits.items.0.text" })] });
  }
  {
    const f = fx("owner-facts");
    add(f, "owner-typed \"3 couleurs\", \"2 en 1\", \"100 % coton\", \"50 ml\", \"XL 2024\": one soft D1 each, published (rev 3 must-pass)", {
      ok: true,
      items: ["benefits.items.0.text", "benefits.items.1.text", "benefits.items.2.text", "benefits.items.3.text", "faq.items.0.a"].map((field) => item("honesty:D1", "soft", { sectionId: field.split(".")[0]!, field })),
    });
  }
  {
    const f = fx("owner-facts-attested");
    add(f, "the same page after the five attestations: nothing left", { ok: true, items: [] });
  }
  {
    const f = fx("sensitive-fields");
    add(f, "the four labels a COD page never asks for, as an option field and as order extras (SEC-18)", {
      ok: false,
      items: [item("honesty:password_field", "hard", { field: `items.0.groups.${f.doc.items[0]!.groups.length - 1}` }), ...[0, 1, 2].map((i) => item("honesty:password_field", "hard", { field: `offers.extras.${i}` }))],
    });
  }
  for (const name of ["keep-list-fr", "keep-list-ar"]) {
    const f = fx(name);
    add(f, `${name}: every number backed (design-baseline §6)`, { ok: true, items: [], maxHard: 0 });
  }
  for (const name of ["ar-digits-indic", "ar-digits-latin"]) {
    const f = fx(name);
    add(f, `${name}: the two digit systems answer the same items`, {
      ok: false,
      items: [
        item("honesty:D1", "hard", { sectionId: "hero", field: "hero.subtitle" }),
        item("honesty:D1", "soft", { sectionId: "benefits", field: "benefits.items.0.text" }),
        item("honesty:D1", "soft", { sectionId: "benefits", field: "benefits.items.1.text" }),
        item("honesty:D1", "hard", { sectionId: "benefits", field: "benefits.items.2.text" }),
      ],
    });
  }
  return out;
}

/** The product's rating from the library ("4,7 (312)"), never attested (DB D2 on `product.rating`). */
function libraryProductRating(src: FixtureSource): LandingGateFixture[] {
  const doc = basePage(src, "argan", "fr");
  doc.product.rating = { value: 4.7, count: 312 };
  return [
    { name: "library-product-rating", about: "product.rating 4,7 (312) from the library, never attested (DB D2)", ctx: gateCtx(src, doc), inputs: gateInputs(), expect: { ok: false, items: [item("honesty:D2", "hard", { field: "product.rating" })] } },
    { name: "attested-product-rating", about: "the same rating once the owner attested it", ctx: gateCtx(src, doc), inputs: gateInputs({ attested: new Set(["rating"]) }), expect: { ok: true, items: [] } },
  ];
}

/** A fields option labelled "Mot de passe" (SEC-18), alone on the page. */
function passwordOption(src: FixtureSource): LandingGateFixture {
  const doc = basePage(src, "tshirt", "fr");
  const it = doc.items[0]!;
  const i = it.groups.findIndex((g) => g.kind === "field");
  if (i < 0) throw new Error("landing fixture: the tshirt has no field group");
  it.groups[i] = { ...it.groups[i]!, name: "Mot de passe" } as (typeof it.groups)[number];
  return { name: "password-option", about: "a fields option labelled \"Mot de passe\"", ctx: gateCtx(src, doc), inputs: gateInputs(), expect: { ok: false, items: [item("honesty:password_field", "hard", { field: `items.0.groups.${i}` })] } };
}

/** The rendered document asks for a password and a card number (`input[type=password]`, `autocomplete="cc-number"`). */
function passwordHtml(src: FixtureSource): LandingGateFixture {
  const doc = basePage(src, "argan", "fr");
  const html = '<form><input name="p" type="password"><input name="c" autocomplete="cc-number"><input autocomplete="postal-code"></form>';
  return {
    name: "password-html",
    about: "a rendered control of type password and one with autocomplete cc-number",
    ctx: gateCtx(src, doc, { html }),
    inputs: gateInputs(),
    expect: { ok: false, items: [item("honesty:password_field", "hard", { field: "html" }), item("honesty:password_field", "hard", { field: "html" })] },
  };
}

/* ------------------------------------------------------------------ */
/* time and stock (LP-21, LAN-§6.2)                                    */
/* ------------------------------------------------------------------ */

const withUrgency = (doc: PageDoc, u: PageDoc["offers"]["urgency"]): PageDoc => ({ ...doc, offers: { ...doc.offers, urgency: u } });

function timeAndStock(src: FixtureSource): LandingGateFixture[] {
  const doc = basePage(src, "argan", "fr");
  const ended = withUrgency(doc, { countdownEnd: iso(NOW - 2 * DAY) });
  const running = withUrgency(doc, { countdownEnd: iso(NOW + DAY) });
  const later = withUrgency(doc, { countdownEnd: iso(NOW + 3 * DAY) });
  const twice = basePage(src, "argan", "fr", ["header", "announcement", "hero", "benefits", "urgency", "offer", "orderForm", "faq", "footer"]);
  const ann = sectionOf(twice, "announcement");
  ann.data = { ...ann.data, countdown: true };
  const urg = sectionOf(twice, "urgency");
  urg.variant = "countdown";
  const gen: GeneratedSnapshot = { stockLeft: 12, points: {} };
  const live = (l: LiveFacts) => ({ live: l });
  return [
    {
      name: "countdown-moved-back",
      about: "the live countdown ended two days ago and the draft restarts it (LD18)",
      ctx: gateCtx(src, later, { prev: ended }),
      inputs: gateInputs(),
      expect: { ok: false, items: [item("honesty:countdown_reset", "hard")] },
    },
    {
      name: "countdown-extended",
      about: "the live countdown still runs and the draft ends later: a note, audited on publish",
      ctx: gateCtx(src, later, { prev: running }),
      inputs: gateInputs(),
      expect: { ok: true, items: [item("urgency:extended", "soft")] },
    },
    {
      name: "countdown-far",
      about: "a countdown more than 30 days ahead",
      ctx: gateCtx(src, withUrgency(doc, { countdownEnd: iso(NOW + 31 * DAY) })),
      inputs: gateInputs(),
      expect: { ok: true, items: [item("urgency:far", "soft")] },
    },
    {
      name: "countdown-twice",
      about: "the countdown in the announcement ticker and in an urgency section (DB R3)",
      ctx: gateCtx(src, withUrgency(twice, { countdownEnd: iso(NOW + 3 * DAY) })),
      inputs: gateInputs(),
      expect: { ok: false, items: [item("honesty:countdown_twice", "hard", { sectionId: urg.id })] },
    },
    {
      name: "stock-untyped",
      about: "the stock the generator wrote, published as is",
      ctx: gateCtx(src, withUrgency(doc, { stockLeft: 12 })),
      inputs: gateInputs({ generated: gen }),
      expect: { ok: false, items: [item("honesty:stock_untyped", "hard", { field: "offers.urgency.stockLeft" })] },
    },
    {
      name: "stock-typed",
      about: "the owner typed another stock: nothing",
      ctx: gateCtx(src, withUrgency(doc, { stockLeft: 9 })),
      inputs: gateInputs({ generated: gen }),
      expect: { ok: true, items: [] },
    },
    {
      name: "stock-stale",
      about: "the live page says 7 left since 20 days and the draft keeps it",
      ctx: gateCtx(src, withUrgency(doc, { stockLeft: 7 }), { prev: withUrgency(doc, { stockLeft: 7 }) }),
      inputs: gateInputs(live({ stockLeft: 7, stockChangedAt: iso(NOW - 20 * DAY) })),
      expect: { ok: true, items: [item("urgency:stock-stale", "soft")] },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* promises (LAN-§6.3)                                                 */
/* ------------------------------------------------------------------ */

function promises(src: FixtureSource): LandingGateFixture[] {
  const free = basePage(src, "argan", "fr");
  setText(free, "benefits.items.0.text", "Livraison gratuite partout au Maroc.");
  free.offers.shippingFee = 29;
  for (const b of free.offers.bundles) b.freeShipping = false;
  const back = (text: string) => setText(singleOffer(basePage(src, "argan", "fr")), "benefits.items.0.text", text);
  const field = "benefits.items.0.text";
  return [
    {
      name: "generated-free-delivery",
      about: "generated \"livraison gratuite\" on a page with a 29 DH fee and no free offer",
      ctx: gateCtx(src, free),
      inputs: gateInputs({ origin: generated(field) }),
      expect: { ok: false, items: [item("honesty:promise", "hard", { sectionId: "benefits", field })] },
    },
    {
      name: "owner-retour-en-force",
      about: "owner-typed \"retour en force\" is no claim",
      ctx: gateCtx(src, back("Le cuir est de retour en force cette saison.")),
      inputs: gateInputs(),
      expect: { ok: true, items: [] },
    },
    {
      name: "owner-return-unset",
      about: "owner-typed \"retour sous 7 jours\" with returns unset: soft, one tap to Policies",
      ctx: gateCtx(src, back("Retour sous 7 jours si la taille ne va pas.")),
      inputs: gateInputs(),
      expect: { ok: true, items: [item("honesty:promise", "soft", { sectionId: "benefits", field }), item("honesty:D1", "soft", { sectionId: "benefits", field })] },
    },
    {
      name: "owner-return-refused",
      about: "owner-typed \"retour sous 7 jours\" while returns are refused: hard",
      ctx: gateCtx(src, back("Retour sous 7 jours si la taille ne va pas.")),
      inputs: gateInputs({ policies: reviewedPolicies({ returns: { accepted: false } }) }),
      expect: { ok: false, items: [item("honesty:promise", "hard", { sectionId: "benefits", field }), item("honesty:D1", "soft", { sectionId: "benefits", field })] },
    },
    {
      name: "owner-return-backed",
      about: "owner-typed \"retour sous 7 jours\" with 7-day returns set: nothing",
      ctx: gateCtx(src, back("Retour sous 7 jours si la taille ne va pas.")),
      inputs: gateInputs({ policies: reviewedPolicies({ returns: { accepted: true, windowDays: 7 } }) }),
      expect: { ok: true, items: [] },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* proof placement, the store's side and the form                      */
/* ------------------------------------------------------------------ */

function hotspots(src: FixtureSource): LandingGateFixture[] {
  const doc = basePage(src, "argan", "fr", ["header", "hero", "showcase", "offer", "orderForm", "footer"]);
  const s = sectionOf(doc, "showcase");
  s.variant = "hotspots";
  const points = ((s.data.points as { x?: number; y?: number }[] | undefined) ?? []).map((p) => ({ x: p.x ?? 50, y: p.y ?? 50 }));
  const moved = structuredClone(doc);
  const ms = sectionOf(moved, "showcase");
  ms.data = { ...ms.data, points: (ms.data.points as { x?: number; y?: number }[]).map((p) => ({ ...p, x: Math.min(100, (p.x ?? 50) + 7) })) };
  const gen = (pts: { x: number; y: number }[]): GeneratedSnapshot => ({ points: { [s.id]: pts } });
  return [
    { name: "hotspots-generated", about: "callouts where the generator put them (DB I5)", ctx: gateCtx(src, doc), inputs: gateInputs({ generated: gen(points) }), expect: { ok: false, items: [item("honesty:I5", "hard", { sectionId: s.id })] } },
    { name: "hotspots-placed", about: "the owner moved every pin in the focal editor: nothing", ctx: gateCtx(src, moved), inputs: gateInputs({ generated: gen(points) }), expect: { ok: true, items: [] } },
  ];
}

function storeSide(src: FixtureSource): LandingGateFixture[] {
  const doc = basePage(src, "argan", "fr");
  const fee = { ...doc, offers: { ...doc.offers, shippingFee: 29 } };
  const zones: DeliveryZoneRow[] = [{ ...zoneRow(["casablanca"], [1, 2]), feeCents: 2_900 }, { ...zoneRow(["*"], [2, 4], 1), feeCents: 3_900 }];
  const wa = { ...doc, form: { ...doc.form, whatsapp: undefined } } as PageDoc;
  return [
    {
      name: "store-notes",
      about: "unreviewed policies, no caller number, hours never saved, zones off in a market with a city list: notes, published",
      ctx: gateCtx(src, doc),
      inputs: gateInputs({
        policies: PoliciesSetting.parse({ inspection: "allowed" }),
        confirmation: StoreSetting.parse({}).confirmation,
        callingWindow: savedWindow({ configured: false }),
        hasMarketList: true,
      }),
      expect: { ok: true, items: [item("delivery:zones-empty", "soft"), item("policies:unreviewed", "soft"), item("thanks:no-caller", "soft"), item("thanks:no-window", "soft")] },
    },
    {
      name: "store-closed-window",
      about: "calling hours saved but closed every day: the thank-you page can't say when",
      ctx: gateCtx(src, doc),
      inputs: gateInputs({ callingWindow: savedWindow({ days: week([]) }) }),
      expect: { ok: true, items: [item("thanks:no-window", "soft")] },
    },
    {
      name: "fee-mismatch",
      about: "a flat 29 DH fee while the zone of Rabat charges 39 DH (rev 3, OPS-13)",
      ctx: gateCtx(src, fee),
      inputs: gateInputs({ zones, checkout: checkoutWith(true), feesByTopCity: { casablanca: 2_900, rabat: 3_900 }, cityNames: { casablanca: "Casablanca", rabat: "Rabat" } }),
      expect: { ok: true, items: [item("delivery:fee_mismatch", "soft", { field: "offers.shippingFee" })] },
    },
    {
      name: "lead-unset",
      about: "zones on with ETA days and the confirmation lead never typed (rev 3, OPS-12)",
      ctx: gateCtx(src, doc),
      inputs: gateInputs({ zones, checkout: CheckoutSetting.parse({ zonesEnabled: true }) }),
      expect: { ok: true, items: [item("delivery:lead-unset", "soft")] },
    },
    {
      name: "wa-no-number",
      about: "Order on WhatsApp is on and no number to open",
      ctx: gateCtx(src, wa),
      inputs: gateInputs({ landing: LandingSetting.parse({ waOrder: { enabled: true } }) }),
      expect: { ok: false, items: [item("wa:no-number", "hard")] },
    },
  ];
}

function form(src: FixtureSource): LandingGateFixture[] {
  const doc = basePage(src, "tshirt", "fr");
  // the argan oil's size picker ("text", two values) left with one value
  const one = basePage(src, "argan", "fr");
  const it = one.items[0]!;
  const gi = it.groups.findIndex((g) => g.kind === "text" || g.kind === "swatch" || g.kind === "image");
  if (gi < 0) throw new Error("landing fixture: the argan oil has no choice group");
  const picker = it.groups[gi]! as { options: unknown[] };
  picker.options = picker.options.slice(0, 1);
  const theme = src.theme(doc);
  const formId = sectionOf(doc, "orderForm").id;
  const bg = sectionOf(doc, "orderForm").bg;
  const card = theme.tokens[`${bg}:sec-card`] ?? theme.tokens["sec-card"] ?? "#ffffff";
  const faint: BuiltTheme = { ...theme, tokens: { ...theme.tokens, [`${bg}:sec-line-strong`]: card, "sec-line-strong": card, "lp-line-strong": card } };
  const long = basePage(src, "argan", "fr");
  return [
    { name: "one-value-option", about: "an option group with one value (DB F2)", ctx: gateCtx(src, one), inputs: gateInputs(), expect: { ok: true, items: [item("form:F2", "soft", { field: `items.0.groups.${gi}` })] }, ignore: NOT_ABOUT_THE_FORM },
    { name: "faint-fields", about: "field borders the colour of the panel (DB F3, OF4)", ctx: gateCtx(src, doc, { theme: faint }), inputs: gateInputs(), expect: { ok: false, items: [item("form:F3", "hard", { sectionId: formId })] }, ignore: NOT_ABOUT_THE_FORM },
    {
      name: "form-long",
      about: "three offers, a per-piece option and the bump: about 1,325 px estimated, a note (soft above 1,100 px)",
      ctx: gateCtx(src, long),
      inputs: gateInputs(),
      expect: { ok: true, items: [item("form:F1", "soft", { sectionId: sectionOf(long, "orderForm").id })] },
    },
    {
      name: "argan-default-ar-2840",
      about: "the 2,840 px baseline form (argan-default-ar) refused by form:F1",
      ctx: gateCtx(src, getFixture("argan", { locale: "ar", now: LANDING_GATE_NOW }).doc),
      inputs: gateInputs(),
      expect: { ok: false, has: [item("form:F1", "hard", { sectionId: "orderForm" })] },
      integrationOnly: "design's height model is the P0 stub (every section 600 px): the 2,840 px estimate exists only once P6 merges",
    },
  ];
}

/**
 * Every form variant × airy / balanced / dense × ar / fr in the default state answers no `form:F1` (LAN-§3.5 OF2:
 * the form's height entry is multiplier-free, so density never pushes it over the line). The default state is the
 * form OF2 budgets: offer → name → phone → city → address → submit, two offer rows, no bump, no per-piece rows.
 */
export function formSweepFixtures(src: FixtureSource = fixtureSource()): LandingGateFixture[] {
  const out: LandingGateFixture[] = [];
  for (const name of FIXTURE_NAMES) {
    for (const lang of ["ar", "fr"] as const) {
      const base = src.doc(name, lang);
      for (const variant of ["card", "split", "minimal", "bold"]) {
        for (const dens of ["airy", "balanced", "dense"] as const) {
          const doc = structuredClone(base);
          doc.offers = { ...doc.offers, bundles: doc.offers.bundles.slice(0, 2), orderBump: undefined };
          doc.items = doc.items.map((it) => ({ ...it, groups: it.groups.filter((g) => !g.perUnit) }));
          const f = doc.sections.find((s) => s.type === "orderForm");
          if (!f) continue;
          f.variant = variant;
          if (doc.theme.look) doc.theme.look = { ...doc.theme.look, dens };
          out.push(withProvenance({ name: `form-sweep-${name}-${lang}-${variant}-${dens}`, about: "the default-state form fits, its fields keep visible borders", ctx: gateCtx(src, doc), inputs: gateInputs(), expect: { none: ["form:F1", "form:F3"] } }));
        }
      }
    }
  }
  return out;
}

/** Every fixture of LAN-§3.2.1 (the form sweep is `formSweepFixtures`). */
export function landingGateFixtures(src: FixtureSource = fixtureSource()): LandingGateFixture[] {
  const rest = [...fromHonesty(src), ...libraryProductRating(src), passwordOption(src), passwordHtml(src), ...timeAndStock(src), ...promises(src), ...hotspots(src), ...storeSide(src)];
  return [...rest.map((fx) => ({ ...fx, ignore: fx.ignore ?? NOT_ABOUT_THE_FORM })), ...form(src)].map(withProvenance);
}

/**
 * Runs `fn` with the "landing" publish check passed through, then registers the gate again (CCR r1-p3-4): for the
 * DB harnesses that publish the library's fixture pages to prove something else (tenancy, files, pixels,
 * migrations), which the honesty gate refuses by design (sample proof, library figures, generated claims). Test code
 * only: production never imports this file, and it throws under NODE_ENV=production.
 */
export async function withoutLandingGate<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === "production") throw new Error("withoutLandingGate: never in production");
  const [{ registerPrePublishCheck }, { landingCheck }] = await Promise.all([import("../prepublish"), import("./landing")]);
  registerPrePublishCheck("landing", async () => ({ ok: true }));
  try {
    return await fn();
  } finally {
    registerPrePublishCheck("landing", landingCheck);
  }
}

/** What differs between a fixture's expectation and the items the gate answered (empty = it passes). */
export function landingFixtureProblems(fx: LandingGateFixture, items: readonly GateItem[]): string[] {
  const problems: string[] = [];
  const ok = !items.some((i) => i.level === "hard");
  if (fx.expect.ok !== undefined && ok !== fx.expect.ok) problems.push(`answered ${ok ? "ok" : "honesty_blocked"}, expected ${fx.expect.ok ? "ok" : "honesty_blocked"}`);
  const ignored = new Set(fx.ignore ?? []);
  const compared = items.filter((i) => !ignored.has(i.id));
  const key = (i: ExpectedGateItem | GateItem) => `${i.id} ${i.level}${i.sectionId ? ` §${i.sectionId}` : ""}${i.field ? ` @${i.field}` : ""}`;
  if (fx.expect.items) {
    const want = fx.expect.items.map(key).sort();
    const have = compared.map(key).sort();
    if (JSON.stringify(want) !== JSON.stringify(have)) problems.push(`items ${JSON.stringify(have)}, expected ${JSON.stringify(want)}`);
  }
  for (const id of fx.expect.none ?? []) if (items.some((i) => i.id === id)) problems.push(`has ${id}`);
  for (const w of fx.expect.has ?? []) if (!items.some((i) => key(i) === key(w))) problems.push(`lacks ${key(w)}`);
  const hard = items.filter((i) => i.level === "hard").length;
  if (fx.expect.maxHard !== undefined && hard > fx.expect.maxHard) problems.push(`${hard} hard items, at most ${fx.expect.maxHard}`);
  // every item is a message key pair of the landing catalog
  for (const i of items) if (!i.title.startsWith("landing.gate.") || (i.detail !== undefined && !i.detail.startsWith("landing.gate."))) problems.push(`${i.id}: title ${i.title} is not a landing.gate key`);
  return problems;
}
