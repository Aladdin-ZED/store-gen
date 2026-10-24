/**
 * Pre-publish checklist: blocking errors (the page would be broken or misleading) and warnings
 * (quality and honesty), each with a "fix" target in the builder. Pure and isomorphic.
 *
 * Offers v2 (docs/OFFERS.md §H.4): every product priced and, with 2+ products, named; every offer
 * priced; a product customers choose in a "choice" line has a photo of its own (else crop it from
 * the group photo — a publish error, §B.4); options nobody could order (every combination out, a
 * required field with a price); the page's option photos within the publish cap (page_too_large);
 * a product sold in no offer; delivery fee > 0 with every offer free (warning, via offerWarnings).
 */
import { getSection } from "@/landing/registry";
import { isLegacyOffer, itemShort, itemVisual, offerName, offerUnits } from "@/lib/page/catalog";
import { bundleMath, offerWarnings } from "@/lib/page/pricing";
import { isChoicePick, isFixedPick, LIMITS, optionPhotoCount, type PageDoc } from "@/lib/page/schema";
import { variantIssues } from "@/lib/page/variant-presets";
import { pixelChecks, type PixelCheckContext } from "@/lib/pixels/checklist";
import { validateDoc } from "@/lib/page/validate";
import type { LandingCheckContext } from "./check-context";
import { assetRefsIn, fieldLabel, sectionIssues, valuesOfKind } from "./fields";
import type { LeftTab } from "./store";

export interface CheckFix {
  tab?: LeftTab;
  sectionId?: string;
  /** an admin screen outside the builder (opened in a new tab so the editor stays as it is) */
  href?: string;
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
}

export interface Checklist {
  errors: CheckItem[];
  warnings: CheckItem[];
  /** visible sections still flagged as sample content (needs the merchant's confirmation) */
  sampleSectionIds: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const NO_PIXEL_CONTEXT: PixelCheckContext = { library: null, health: {}, live: false };

/** Live countdowns further away than this read as invented (LAN-§3.2 `urgency:far`). */
const FAR_COUNTDOWN_MS = 30 * 86_400_000;
/** A live stock figure untouched for longer than this reads as stale (LAN-§3.2 `urgency:stock-stale`, LD36). */
const STALE_STOCK_MS = 14 * 86_400_000;

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
      add({ id: `doc:${i.path}`, level: "error", title: "Page settings are invalid", detail: `${i.path || "page"} — ${i.message}` });
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
        title: `${label(s.type)}: ${first.path ? fieldLabel(def.fields, first.path) : "content"} — ${first.message}`,
        detail: list.length > 1 ? `${plural(list.length - 1, "more problem")} in this section.` : undefined,
        fix: { sectionId: s.id },
      });
    }
    if (!def.variants.some((v) => v.id === s.variant)) {
      add({ id: `variant:${s.id}`, level: "warning", title: `${label(s.type)}: unknown style "${s.variant}"`, detail: "The first style will be used.", fix: { sectionId: s.id } });
    }
  }

  /* ---- honesty: sample content ---- */
  const sampleSectionIds = visible.filter((s) => (s.data as Record<string, unknown>)?.sample === true).map((s) => s.id);
  for (const id of sampleSectionIds) {
    const s = doc.sections.find((x) => x.id === id)!;
    add({
      id: `sample:${id}`,
      level: "warning",
      title: `The ${label(s.type)} section still shows example content`,
      detail: "Replace the examples with real customer reviews, chats or numbers.",
      fix: { sectionId: id },
    });
  }

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
    add({ id: "urgency:past", level: "warning", title: "The countdown has already ended", detail: "It hides itself — set a new real end date or remove it.", fix: { tab: "offers" } });
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

  /* ---- honest time and stock against the live page (LP-21, LD18, LD36) ---- */
  const live = ctx.published;
  const liveEnd = live?.countdownEnd ? Date.parse(live.countdownEnd) : NaN;
  const draftEnd = end ? Date.parse(end) : NaN;
  if (Number.isFinite(liveEnd) && Number.isFinite(draftEnd) && draftEnd > liveEnd) {
    if (liveEnd <= now) {
      add({
        id: "honesty:countdown_reset",
        level: "error",
        title: "The countdown already ended on the live page",
        detail: "Starting it again would tell shoppers the offer ends when it already did. Remove the countdown, or keep the ended date.",
        fix: { tab: "offers" },
      });
    } else {
      add({ id: "urgency:extended", level: "warning", title: "The countdown ends later than on the live page", detail: "Shoppers who saw the earlier end will see it move. Publishing records the change.", fix: { tab: "offers" } });
    }
  }
  if (Number.isFinite(draftEnd) && draftEnd - now > FAR_COUNTDOWN_MS) {
    add({ id: "urgency:far", level: "warning", title: "The countdown ends more than 30 days from now", detail: "A countdown this long rarely reads as real. Use the real end date of the offer.", fix: { tab: "offers" } });
  }
  const liveStock = live?.stockLeft;
  const stockSince = live?.stockChangedAt ? Date.parse(live.stockChangedAt) : NaN;
  if (liveStock !== undefined && liveStock > 0 && doc.offers.urgency.stockLeft === liveStock && Number.isFinite(stockSince) && now - stockSince > STALE_STOCK_MS) {
    add({
      id: "urgency:stock-stale",
      level: "warning",
      title: `“${liveStock} left” hasn't changed in over 14 days`,
      detail: "Update the stock to what you really have, or remove it.",
      fix: { tab: "offers" },
    });
  }

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
