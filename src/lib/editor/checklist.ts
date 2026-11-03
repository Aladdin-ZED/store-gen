/**
 * Pre-publish checklist: blocking errors (the page would be broken or misleading) and warnings
 * (quality and honesty), each with a "fix" target in the builder. Pure and isomorphic.
 *
 * Offers v2 (docs/OFFERS.md §H.4): every product priced and, with 2+ products, named; every offer
 * priced; a product customers choose in a "choice" line has a photo of its own (else crop it from
 * the group photo — a publish error, §B.4); options nobody could order (every combination out, a
 * required field with a price); the page's option photos within the publish cap (page_too_large);
 * a product sold in no offer; delivery fee > 0 with every offer free (warning, via offerWarnings).
 *
 * The honesty and store-fact rows (landing.md LAN-§3.2: LP-02, LP-21, the delivery / policies / thank-you / WhatsApp
 * rows and the order form's F1-F3) are the publish gate's own evaluator (src/lib/landing/honesty/gate.ts), run over
 * this context: the same ids and levels as the dialog's server items (an `error` is a gate `hard`, core §M.5), the
 * titles from the gate's message catalog. With the preload's gate facts (`ctx.gate`, CCR docs/saas/ccr/r1-p3-3.md)
 * every row runs as on the server; without them the rows that need a fact the frozen context does not carry stay
 * silent (nothing is guessed, so the panel never shows an error the server would not).
 */
import { getSection } from "@/landing/registry";
import { t, type MessageKey, type MessageVars } from "@/lib/i18n/admin";
import { foldOrigin, formHeightOf, honestyContextOf, honestyItems, settingsPathOf, type GateFacts, type HonestyContext } from "@/lib/landing/honesty/gate";
import { PROOF_SECTIONS } from "@/lib/landing/honesty/numbers";
import { isLegacyOffer, itemShort, itemVisual, offerName, offerUnits } from "@/lib/page/catalog";
import { bundleMath, offerWarnings } from "@/lib/page/pricing";
import { isChoicePick, isFixedPick, LIMITS, optionPhotoCount, type PageDoc } from "@/lib/page/schema";
import { variantIssues } from "@/lib/page/variant-presets";
import { pixelChecks, type PixelCheckContext } from "@/lib/pixels/checklist";
import { validateDoc } from "@/lib/page/validate";
import { buildTheme } from "@/lib/theme";
import type { GateItem } from "@/lib/tenancy/types";
import type { LandingCheckContext } from "./check-context";
import { assetRefsIn, fieldLabel, sectionIssues, valuesOfKind } from "./fields";
import type { LeftTab } from "./store";

export interface CheckFix {
  tab?: LeftTab;
  sectionId?: string;
  /** an admin screen outside the builder (opened in a new tab so the editor stays as it is) */
  href?: string;
  /** a builder sheet the fix opens (`landing:attest-proof`, `landing:attest-fact`, `landing:attest-rating`, LAN-§6.1, §6.4) */
  actionId?: string;
}

/** Store-relative fix link, made absolute under /app/<handle> by `ctx.appHref`. */
const STORE_SETTINGS = "/settings/general" as const;

/** A checklist entry (spec name: ChecklistItem). */
export type ChecklistItem = CheckItem;

export interface CheckItem {
  id: string;
  level: "error" | "warning";
  title: string;
  detail?: string;
  fix?: CheckFix;
  /** a gate row's message keys and values: the panel renders them in the admin's locale (`title` is the English) */
  message?: { title: MessageKey; detail?: MessageKey; vars?: MessageVars };
  field?: string;
}

export interface Checklist {
  errors: CheckItem[];
  warnings: CheckItem[];
  /**
   * visible sections other than proof still flagged as sample content (product words: the dialog's "these are
   * right" confirmation clears them); a proof section flagged sample is the error `honesty:sample`, cleared only by
   * the attestation sheet (LAN-§6.1)
   */
  sampleSectionIds: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const NO_PIXEL_CONTEXT: PixelCheckContext = { library: null, health: {}, live: false };

const LEFT_TABS: readonly string[] = ["sections", "theme", "product", "offers", "form", "seo"] satisfies readonly LeftTab[];

/** The CCR r1-p3-3 field of the preload: the gate's own facts, when the server shipped them. */
type WithGate = LandingCheckContext & { gate?: GateFacts };

/** The built theme's tokens of the last theme the panel judged (`form:F3`): one build per theme change. */
let lastTheme: { key: string; tokens: Readonly<Record<string, string>> | null } | null = null;
function themeTokens(doc: PageDoc): Readonly<Record<string, string>> | null {
  const key = JSON.stringify([doc.theme, doc.locale]);
  if (lastTheme?.key !== key) {
    let tokens: Readonly<Record<string, string>> | null = null;
    try {
      tokens = buildTheme(doc.theme, doc.locale).tokens;
    } catch {
      // a theme the builder cannot build yet (mid-edit): F3 waits for the next one
    }
    lastTheme = { key, tokens };
  }
  return lastTheme.tokens;
}

/**
 * The gate's context from the checklist's: the preload's gate facts when present, else the frozen T4 fields. In the
 * second form `policies`, the confirmation-call switch, the thank-you expectation, the attested proof, the generated
 * snapshot and `leadDays` (T4 folds "never answered" into 0) are unknown, so their rows stay silent, and so is the
 * numbers audit while the context lists no number at all (`emptyCheckData`: no preload); T4's preload
 * reports `zones.count: 0` whatever the table holds, so a zone count is only trusted while zones are off.
 */
function gateContextOf(doc: PageDoc, ctx: WithGate, now: number): HonestyContext {
  const tokens = themeTokens(doc);
  if (ctx.gate) return honestyContextOf(doc, ctx.gate, { now, tokens, formHeightPx: formHeightOf(doc, ctx.gate.addressMode) });
  const c = ctx.confirmation;
  // T4's preload always lists the prices: an empty list is a context without facts (fixtures, a failed preload)
  const known = ctx.facts.allowed.length > 0 || Object.keys(ctx.facts.byClass).length > 0;
  return {
    now,
    store: {
      zones: null,
      zonesEnabled: ctx.zones.enabled,
      zoneCount: ctx.zones.enabled ? Math.max(1, ctx.zones.count) : 0,
      hasMarketList: ctx.zones.hasMarketList,
      feesByTopCity: ctx.zones.feesByTopCity,
      cityNames: {},
      policies: null,
      policiesReviewed: ctx.policiesReviewed,
      confirmationCall: null,
      withinHours: null,
      callerPhone: c.callerPhone,
      whatsapp: c.whatsapp,
      callWindow: { configured: c.callingWindowSaved, empty: c.callingWindowSaved && !c.callingWindow, ranges: [] },
      expectation: null,
      waOrder: ctx.waOrder,
      leadDays: undefined,
    },
    allowed: known ? { byClass: ctx.facts.byClass, all: new Set([...ctx.facts.allowed, ...ctx.attestedFacts]) } : null,
    origin: foldOrigin(new Map(Object.entries(ctx.origin))),
    attested: null,
    generated: undefined,
    live: ctx.published,
    formHeightPx: formHeightOf(doc, ctx.addressMode),
    tokens,
  };
}

/** A gate item as a checklist row: hard → error, soft → warning, the English message, the fix in the builder. */
function rowOf(item: GateItem, appHref: LandingCheckContext["appHref"]): CheckItem {
  const fix: CheckFix = {};
  const sectionId = item.fix?.sectionId ?? item.sectionId;
  if (sectionId) fix.sectionId = sectionId;
  else if (item.fix?.tab && LEFT_TABS.includes(item.fix.tab)) fix.tab = item.fix.tab as LeftTab;
  const path = settingsPathOf(item);
  if (path) fix.href = appHref(path);
  if (item.fix?.actionId?.startsWith("landing:attest-")) fix.actionId = item.fix.actionId;
  return {
    id: item.id,
    level: item.level === "hard" ? "error" : "warning",
    title: t(item.title, item.vars, "en"),
    ...(item.detail ? { detail: t(item.detail, item.vars, "en") } : {}),
    ...(Object.keys(fix).length ? { fix } : {}),
    message: { title: item.title, ...(item.detail ? { detail: item.detail } : {}), ...(item.vars ? { vars: item.vars } : {}) },
    ...(item.field ? { field: item.field } : {}),
  };
}

/**
 * The checklist of `doc` in its store (LAN Q15): the page's own checks over `ctx.store`, `ctx.now` and `ctx.pixels`,
 * and the store-fact rules over the rest of the context (the live version's countdown and stock, LP-21). Item ids
 * equal the publish gate's, so the dialog never shows an item for the first time (§M.5).
 */
export function buildChecklist(doc: PageDoc, ctx: LandingCheckContext): Checklist {
  const store = ctx.store;
  const now = ctx.now ?? Date.now();
  const pixels = ctx.pixels ?? NO_PIXEL_CONTEXT;
  const storeSettings = ctx.appHref(STORE_SETTINGS);
  const errors: CheckItem[] = [];
  const warnings: CheckItem[] = [];
  const add = (item: CheckItem) => (item.level === "error" ? errors : warnings).push(item);
  const visible = doc.sections.filter((s) => !s.hidden);
  const label = (type: string) => getSection(type)?.label ?? type;

  /* ---- page-level validity (what publish will refuse) ---- */
  const { doc: valid, issues } = validateDoc(doc);
  if (!valid) {
    for (const i of issues.filter((x) => x.level === "error").slice(0, 4)) {
      add({ id: `doc:${i.path}`, level: "error", title: "Page settings are invalid", detail: `${i.path || "page"}: ${i.message}` });
    }
  }

  /* ---- product & offer ---- */
  if (!doc.product.name.trim()) add({ id: "product:name", level: "error", title: "Name your product", fix: { tab: "product" } });
  doc.items.forEach((it, i) => {
    if (it.price > 0) return;
    if (i === 0) add({ id: "product:price", level: "error", title: "Set the product price", fix: { tab: "product" } });
    else add({ id: `item:${it.id}:price`, level: "error", title: `Set the price of ${itemShort(doc, it)}`, fix: { tab: "product" } });
  });
  const offerLabel = (b: PageDoc["offers"]["bundles"][number], i: number) => (isLegacyOffer(doc, b) ? `Pack ${i + 1} (x${offerUnits(b)})` : `Offer “${offerName({ doc }, b)}”`);
  doc.offers.bundles.forEach((b, i) => {
    if (!(b.price > 0)) add({ id: `bundle:${b.id}:price`, level: "error", title: `${offerLabel(b, i)} has no price`, fix: { tab: "offers" } });
  });

  /* ---- items (Offers v2) ---- */
  const several = doc.items.length > 1;
  doc.items.forEach((it, i) => {
    if (several && !it.name.trim()) add({ id: `item:${it.id}:name`, level: "error", title: `Name product ${i + 1}`, detail: "With two products or more, customers choose by name.", fix: { tab: "product" } });
    for (const x of variantIssues(it.groups)) {
      if (x.level !== "error") continue;
      add({ id: `item:${it.id}:options:${x.groupId}`, level: "error", title: `${itemShort(doc, it)}: ${x.message}`, fix: { tab: "product" } });
      break;
    }
    if (i > 0 && it.compareAt !== undefined && it.compareAt <= it.price) {
      add({ id: `item:${it.id}:compare`, level: "warning", title: `${itemShort(doc, it)}: “compare at” is not higher than the price`, fix: { tab: "product" } });
    }
  });
  const chosen = new Set(doc.offers.bundles.flatMap((b) => b.lines.flatMap((l) => (isChoicePick(l.pick) ? l.pick.choice : []))));
  for (const it of doc.items) {
    if (!several || !chosen.has(it.id)) continue;
    const own = itemVisual(doc, it, { asset: (r) => (r ? ({ id: r.id } as never) : null) });
    if (!own.asset) {
      add({
        id: `item:${it.id}:photo`,
        level: "error",
        title: `${itemShort(doc, it)} has no photo of its own`,
        detail: "Customers choose it in an offer: crop it from the group photo (Product & items → its photos).",
        fix: { tab: "product" },
      });
    }
  }
  if (several) {
    const sold = new Set(doc.offers.bundles.flatMap((b) => b.lines.flatMap((l) => (isFixedPick(l.pick) ? [l.pick.item] : l.pick.choice))));
    if (doc.offers.orderBump?.enabled && doc.offers.orderBump.item) sold.add(doc.offers.orderBump.item);
    for (const it of doc.items) if (!sold.has(it.id)) add({ id: `item:${it.id}:unsold`, level: "warning", title: `${itemShort(doc, it)} is not sold in any offer`, detail: "Add it to an offer, or delete it.", fix: { tab: "offers" } });
  }
  const photos = optionPhotoCount(doc);
  if (photos > LIMITS.pagePhotos) {
    add({ id: "page:too-large", level: "error", title: `${photos} option photos: at most ${LIMITS.pagePhotos} per page`, detail: "The page would be too heavy to publish. Remove some option or combination photos.", fix: { tab: "product" } });
  }

  /* ---- order form ---- */
  const form = doc.sections.find((s) => getSection(s.type)?.required);
  if (!form) add({ id: "form:missing", level: "error", title: "The order form is missing", detail: "Add the Order form section so visitors can order.", fix: { tab: "sections" } });
  else if (form.hidden) add({ id: "form:hidden", level: "error", title: "The order form is hidden", detail: "Visitors could not order from this page.", fix: { sectionId: form.id } });

  /* ---- section data ---- */
  for (const s of visible) {
    const def = getSection(s.type);
    if (!def) continue;
    const list = sectionIssues(def, s.data);
    if (list.length) {
      const first = list[0]!;
      add({
        id: `section:${s.id}`,
        level: "error",
        title: `${label(s.type)}: ${first.path ? fieldLabel(def.fields, first.path) : "content"}: ${first.message}`,
        detail: list.length > 1 ? `${plural(list.length - 1, "more problem")} in this section.` : undefined,
        fix: { sectionId: s.id },
      });
    }
    if (!def.variants.some((v) => v.id === s.variant)) {
      add({ id: `variant:${s.id}`, level: "warning", title: `${label(s.type)}: unknown style "${s.variant}"`, detail: "The first style will be used.", fix: { sectionId: s.id } });
    }
  }

  /* ---- honesty and the store's facts: the publish gate's rows (LAN-§3.2, §3.2.1) ---- */
  // sample content of any section is `honesty:sample` there; only the product-word sections can be confirmed here
  const sampleSectionIds = visible.filter((s) => (s.data as Record<string, unknown>)?.sample === true && !PROOF_SECTIONS.has(s.type)).map((s) => s.id);
  for (const item of honestyItems(doc, gateContextOf(doc, ctx as WithGate, now))) add(rowOf(item, ctx.appHref));

  /* ---- prices ---- */
  const lead = doc.items[0]!;
  if (lead.compareAt !== undefined && lead.compareAt <= lead.price) {
    add({ id: "product:compare", level: "warning", title: "“Compare at” is not higher than the price", detail: "No saving is shown; remove it or enter the real previous price.", fix: { tab: "product" } });
  }
  doc.offers.bundles.forEach((b, i) => {
    const m = bundleMath(doc, b);
    if (b.compareAt !== undefined && !m.showReference) {
      add({ id: `bundle:${b.id}:compare`, level: "warning", title: `${isLegacyOffer(doc, b) ? `Pack x${m.qty}` : offerLabel(b, i)}: “compare at” shows no real saving`, fix: { tab: "offers" } });
    }
  });
  offerWarnings(doc)
    .filter((w) => w.level === "warning")
    .forEach((w, i) => add({ id: `bundles:${i}`, level: "warning", title: w.message, fix: { tab: "offers" } }));

  /* ---- extras: an offer shoppers can accept must say what it is ---- */
  const bump = doc.offers.orderBump;
  if (bump?.enabled) {
    if (!bump.title.trim()) add({ id: "bump:title", level: "error", title: "The order bump has no title", detail: "Shoppers would tick an extra without knowing what it is.", fix: { tab: "offers" } });
    if (!(bump.price > 0)) add({ id: "bump:price", level: "warning", title: "The order bump is free", detail: "Set its price, or keep it free on purpose.", fix: { tab: "offers" } });
  }
  const upsell = doc.offers.upsell;
  if (upsell?.enabled) {
    if (!upsell.title.trim()) add({ id: "upsell:title", level: "error", title: "The thank-you upsell has no title", detail: "Shoppers would add an item without knowing what it is.", fix: { tab: "offers" } });
    if (!(upsell.price > 0)) add({ id: "upsell:price", level: "warning", title: "The thank-you upsell is free", detail: "Set its price, or keep it free on purpose.", fix: { tab: "offers" } });
    if (upsell.compareAt !== undefined && upsell.compareAt <= upsell.price) {
      add({ id: "upsell:compare", level: "warning", title: "Upsell “compare at” is not higher than its price", detail: "No saving is shown; remove it or enter the real previous price.", fix: { tab: "offers" } });
    }
  }

  /* ---- time ---- */
  const end = doc.offers.urgency.countdownEnd;
  if (end && Date.parse(end) <= now) {
    add({ id: "urgency:past", level: "warning", title: "The countdown has already ended", detail: "It hides itself. Set a new real end date or remove it.", fix: { tab: "offers" } });
  }
  for (const s of visible) {
    const def = getSection(s.type);
    if (!def) continue;
    for (const v of valuesOfKind(def.fields, s.data, ["datetime"])) {
      if (typeof v.value === "string" && v.value && Date.parse(v.value) <= now) {
        add({ id: `time:${s.id}:${v.path}`, level: "warning", title: `${label(s.type)}: “${v.label}” is in the past`, fix: { sectionId: s.id } });
      }
    }
  }
  if (doc.offers.urgency.stockLeft === 0) add({ id: "urgency:stock", level: "warning", title: "Stock left is set to 0", fix: { tab: "offers" } });

  /* ---- store identity (legal & contact pages) ---- */
  if (!store.hasPhone && !store.hasEmail) {
    add({ id: "store:contact", level: "warning", title: "No contact phone or email", detail: "Add them in Settings → Store: shoppers and the legal pages need a way to reach you.", fix: { href: storeSettings } });
  }
  if (!store.hasLegalName || !store.hasAddress) {
    add({ id: "store:legal", level: "warning", title: "Legal pages are incomplete", detail: "Add your legal name and address in Settings → Store.", fix: { href: storeSettings } });
  }

  /* ---- media & SEO ---- */
  if (!doc.product.images.length && !doc.product.cutout) add({ id: "product:images", level: "warning", title: "No product photos yet", fix: { tab: "product" } });
  const productRefs = [...doc.product.images, ...(doc.product.cutout ? [doc.product.cutout] : [])];
  const sectionRefs = visible.map((s) => ({ id: s.id, refs: assetRefsIn(s.data) }));
  const missing = (r: { alt?: string }) => !r.alt?.trim();
  const noAlt = new Set([...productRefs, ...sectionRefs.flatMap((s) => s.refs)].filter(missing).map((r) => r.id)).size;
  if (noAlt) {
    // fix where the first one is: the product photos, else the first section holding one
    const where = productRefs.some(missing) ? undefined : sectionRefs.find((s) => s.refs.some(missing))?.id;
    add({
      id: "media:alt",
      level: "warning",
      title: `${plural(noAlt, "image")} without alt text`,
      detail: "Describe each photo in a few words (accessibility and search).",
      fix: where ? { sectionId: where } : { tab: "product" },
    });
  }
  if (!doc.seo.title?.trim()) add({ id: "seo:title", level: "warning", title: "No SEO title", detail: "The product name is used in search results.", fix: { tab: "seo" } });
  if (!doc.seo.description?.trim()) add({ id: "seo:description", level: "warning", title: "No meta description", fix: { tab: "seo" } });

  /* ---- ad pixels (PX) ---- */
  for (const item of pixelChecks(doc, pixels)) add(item);

  return { errors, warnings, sampleSectionIds };
}
