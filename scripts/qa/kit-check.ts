// proves: LP-18, SF-01, LAN-§13.6, LAN-§13.3, LAN-§13.5, LAN-§18.4, LAN-§12.1
/**
 * test:kit (P3 LANDING, wave 2; landing.md LAN-§13.6, LAN-§25 row `test:kit`): the Campaign Kit.
 *
 *   npm run test:kit                 the offline cases, then the DB cases on a throwaway cod_test_p3_kit database
 *   npm run test:kit -- --offline    the offline cases only
 *
 * Offline (no database): P7's committed eval fixtures (the first 60 of the `copy.page` set) compiled on the template
 * path with Cloud AI off, each on a page built from the case's product over a fixture page: every brief text passes the
 * kit's `allowedNumbers` guard (0 invented numbers), 0 banned, medical or ad-rule words, 3 distinct structure tags,
 * hooks ≤ 12 words, a 6-beat UGC sheet, no em or en dash, < 300 ms per compile; `doNotSay` follows the page and the
 * policies; the pricing fingerprint (LAN-§18.4) moves with a price and not with a headline; the kit links' `/go`
 * query parity (presets first, an ad platform's own utm_ wins, click ids byte for byte).
 *
 * DB (the two-store harness of scripts/qa/tenancy-check.ts): a kit created on A's live page (one short link per
 * channel, tagged with the slug), Go live charges the `campaigns` gauge, pausing makes its links answer 410 and
 * resuming 308 with the presets, a share token opens the kit and answers nothing once revoked, a republish with
 * another fingerprint marks the kit "page changed since" (and the old prices clear it), ending refunds the gauge.
 */
import { createRequire } from "node:module";
import { compileKit, bannedIn, kitAllowedNumbers, type CompileKitInput, type Loc } from "@/lib/campaigns/compile";
import { pricingFingerprint } from "@/lib/campaigns/fingerprint";
import { kitLinkUtm, slugOf } from "@/lib/campaigns/types";
import { numbersIn } from "@/lib/ai/guard-numbers";
import { copyFamily, fill, frTemplate, libraryFor, lineTag, lineText, productRef } from "@/lib/ai/copy-library";
import { SET } from "@/lib/ai/eval/sets/copy.page/fixtures";
import { BUILTIN_SCRIPTS } from "@/lib/callcenter/script-builtins";
import { linkQuery } from "@/lib/links/query";
import { FIXTURE_NAMES, getFixture } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import { PoliciesSetting } from "@/lib/settings/keys/policies";
import type { StoreRow, WriteCtx } from "@/lib/tenancy/types";

process.env.TENANCY_DB ??= "cod_test_p3_kit";
const OFFLINE = process.argv.includes("--offline");
const VERBOSE = process.argv.includes("--verbose");
const FIXTURES = 60;
const BUDGET_MS = 300;

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fails.push(detail === undefined ? name : `${name}\n      ${JSON.stringify(detail)?.slice(0, 400)}`);
  if (VERBOSE || !ok) console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail !== undefined ? ` · ${JSON.stringify(detail)?.slice(0, 300)}` : ""}`);
}

const STORE = { id: "01JKITSTORE0000000000000000", name: "Boutique Atlas", handle: "atlas", mode: "landing", status: "active", defaultLocale: "fr", timezone: "Africa/Casablanca" } as unknown as StoreRow;
const ZONES: CompileKitInput["zones"] = [
  { id: "z1", name: "Casablanca", cities: ["casablanca" as never], feeCents: null, freeFromCents: null, etaMinDays: 1, etaMaxDays: 2, notServed: false, note: null, position: 0 },
  { id: "z2", name: "Reste du Maroc", cities: ["*"], feeCents: null, freeFromCents: null, etaMinDays: 2, etaMaxDays: 4, notServed: false, note: null, position: 1 },
];
const shopperLoc = (l: string): Loc => (l === "ar" || l === "fr" ? l : "en");

/** The case's product over a fixture page: its name, category, price (the lead item and the first offer) and currency. */
function pageFor(i: number): { doc: PageDoc; caseId: string } {
  const f = SET.fixtures[i]!;
  const input = f.input as { locale: string; product: { name: string; category: PageDoc["product"]["category"]; priceMinor: number; currency: string } };
  const { doc } = getFixture(FIXTURE_NAMES[i % FIXTURE_NAMES.length]!, { locale: shopperLoc(input.locale) });
  const next = structuredClone(doc);
  next.product.name = input.product.name.slice(0, 120) || doc.product.name;
  next.product.category = input.product.category;
  next.currency = input.product.currency;
  const price = Math.max(1, input.product.priceMinor) / 100;
  next.items[0]!.price = price;
  next.offers.bundles[0]!.price = price * next.offers.bundles[0]!.lines.reduce((n, l) => n + l.qty, 0);
  if (i % 3 === 0) next.offers.shippingFee = 30;
  // the titles a generated page carries: the family's library headlines, three structures rotated over the sections
  // (DES-§9.5: the copy step never gives two sections of one run the same title structure)
  const loc = shopperLoc(next.locale);
  const { family } = copyFamily({ category: next.product.category, productName: next.product.name });
  const ref = productRef(next.product.name, "fr");
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const line of libraryFor(loc).families[family]?.headline ?? []) {
    const tag = lineTag(line, loc).s;
    const src = loc === "fr" ? frTemplate(lineText(line), ref) : lineText(line);
    if (seen.has(tag) || !src || /\{(?:delivery|where|wa:)/.test(src)) continue;
    seen.add(tag);
    titles.push(fill(src, { product: next.product.name, delivery: "", where: "" }));
  }
  const targets = next.sections.filter((s) => ["hero", "problem", "benefits", "offer", "guarantee", "story"].includes(s.type) && typeof s.data.title === "string");
  targets.slice(0, titles.length).forEach((s, k) => (s.data.title = titles[k]!));
  return { doc: next, caseId: f.id };
}

function inputFor(doc: PageDoc, i: number, over: Partial<CompileKitInput> = {}): CompileKitInput {
  const slug = slugOf(`Campagne ${i}`);
  return {
    doc,
    version: { id: `01JKITVERSION${String(i).padStart(13, "0")}`, publishedAt: "2026-11-01T10:00:00.000Z" },
    store: STORE,
    locales: ["ar", "fr"],
    policies: PoliciesSetting.parse(i % 2 ? { inspection: "allowed", returns: { accepted: true, windowDays: 7 } } : {}),
    zones: ZONES,
    pixels: { pixels: [], canCreate: false },
    trigger: "order",
    templates: { confirm: { ar: "السلام {customer_first_name}، {order_id}.", fr: "Bonjour {customer_first_name}, commande {order_id}.", en: "Hello {customer_first_name}, order {order_id}." }, script: BUILTIN_SCRIPTS.fr },
    channels: ["meta", "whatsapp"],
    slug,
    links: (["meta", "whatsapp"] as const).map((channel, k) => ({ channel, url: `https://atlas.example/go/k${i}x${k}`, utm: kitLinkUtm(channel, slug), shortLinkId: `01JKITLINK${String(i * 2 + k).padStart(16, "0")}` })),
    now: new Date("2026-11-07T10:00:00.000Z"),
    ...over,
  };
}

function offline(): void {
  console.log("test:kit · offline");
  const count = Math.min(FIXTURES, SET.fixtures.length);
  check(`P7's eval set holds at least ${FIXTURES} fixtures`, SET.fixtures.length >= FIXTURES, SET.fixtures.length);
  let invented = 0;
  let bannedHits = 0;
  let slowest = 0;
  const bad: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const { doc, caseId } = pageFor(i);
    const input = inputFor(doc, i);
    const t0 = performance.now();
    const { kit, offersHash, problems } = compileKit(input);
    const ms = performance.now() - t0;
    slowest = Math.max(slowest, ms);
    const allowed = kitAllowedNumbers(input);
    const texts: [string, Loc, string][] = [];
    for (const a of kit.brief.angles) {
      for (const l of ["ar", "fr", "en"] as const) texts.push([`${a.id}.hook.${l}`, l, a.hook[l]], [`${a.id}.primary.${l}`, l, a.primary[l]], [`${a.id}.headline.${l}`, l, a.headline[l]]);
      const docLoc = shopperLoc(doc.locale);
      texts.push([`${a.id}.visual`, docLoc, a.visual], ...a.ugc15.map((u, k) => [`${a.id}.ugc.${k}`, docLoc, u] as [string, Loc, string]));
    }
    for (const [path, l, text] of texts) {
      const extra = numbersIn(text, l).filter((n) => !allowed.allows(n));
      if (extra.length) {
        invented++;
        bad.push({ caseId, path, text, extra: extra.map((n) => n.raw) });
      }
      if (bannedIn(text)) {
        bannedHits++;
        bad.push({ caseId, path, banned: text });
      }
      if (/[–—]/.test(text)) bad.push({ caseId, path, dash: text });
    }
    const tags = kit.brief.angles.map((a) => a.tag);
    if (tags.length !== 3 || new Set(tags).size !== 3) bad.push({ caseId, tags, problems });
    for (const a of kit.brief.angles) {
      for (const l of ["ar", "fr", "en"] as const) if (a.hook[l].split(/\s+/).filter(Boolean).length > 12) bad.push({ caseId, longHook: a.hook[l] });
      if (a.ugc15.length !== 6) bad.push({ caseId, ugc: a.ugc15.length });
    }
    if (!/^[0-9a-f]{16}$/.test(offersHash)) bad.push({ caseId, offersHash });
    const fee = input.doc.offers.shippingFee > 0;
    if (kit.brief.doNotSay.includes("free_delivery") !== fee) bad.push({ caseId, freeDelivery: kit.brief.doNotSay });
    if (kit.brief.doNotSay.includes("inspection") !== (input.policies.inspection !== "allowed")) bad.push({ caseId, inspection: kit.brief.doNotSay });
    if (!kit.brief.doNotSay.includes("medical")) bad.push({ caseId, medical: kit.brief.doNotSay });
    if (!problems.some((p) => p.code === "pixel_missing")) bad.push({ caseId, pixel: problems });
  }
  check(`${count} fixtures: 0 invented numbers in the briefs (the allowedNumbers guard)`, invented === 0, bad.filter((b) => (b as { extra?: unknown }).extra).slice(0, 5));
  check(`${count} fixtures: 0 banned, medical or ad-rule words`, bannedHits === 0, bad.filter((b) => (b as { banned?: unknown }).banned).slice(0, 5));
  check(`${count} fixtures: 3 distinct structure tags per brief, hooks ≤ 12 words, 6 UGC beats, no em or en dash, doNotSay follows the page and the policies`, bad.length === 0, bad.slice(0, 6));
  check(`every compile < ${BUDGET_MS} ms (slowest ${Math.round(slowest)} ms)`, slowest < BUDGET_MS, Math.round(slowest));

  // the template path never needs the Cloud: no cloud input, `source` library; a Cloud brief passed in is kept as is
  const { doc } = pageFor(0);
  const base = compileKit(inputFor(doc, 0));
  check("Cloud AI off: the brief is the library's", base.kit.brief.source === "library");
  const cloud = { ...base.kit.brief, source: "cloud" as const, promptVersion: "s1" };
  check("a Cloud brief passed in replaces the template's", compileKit(inputFor(doc, 0, { cloud: { brief: cloud } })).kit.brief.source === "cloud");
  check("no kit locale → no_locale and the page's language", (() => {
    const r = compileKit(inputFor(doc, 0, { locales: [] }));
    return r.problems.some((p) => p.code === "no_locale") && r.kit.locales.length === 1;
  })());
  check("the WhatsApp confirmation keeps its {placeholders}", base.kit.whatsappConfirm.fr.includes("{customer_first_name}"));
  const recap = base.kit.script.steps.find((s) => s.id === "recap");
  check("the call script carries the page's total and keeps the customer's variables", !!recap && /\d/.test(recap.text.fr) && base.kit.script.steps.some((s) => s.text.fr.includes("{customer_first_name}")), recap);
  check("the trust objection (parcel seen before paying) only when the store allows inspection", !base.kit.script.steps.some((s) => s.id === "obj_trust") && compileKit(inputFor(doc, 1)).kit.script.steps.some((s) => s.id === "obj_trust"));

  // LAN-§18.4: the fingerprint
  const moved = structuredClone(doc);
  moved.offers.bundles[0]!.price += 10;
  const retitled = structuredClone(doc);
  retitled.product.name = `${doc.product.name} nouveau`;
  retitled.sections.forEach((s) => typeof s.data.title === "string" && (s.data.title = `${s.data.title} !`));
  check("fingerprint: 16 hex, stable for the same doc", pricingFingerprint(doc) === pricingFingerprint(structuredClone(doc)) && /^[0-9a-f]{16}$/.test(pricingFingerprint(doc)));
  check("fingerprint: a price moves it", pricingFingerprint(moved) !== pricingFingerprint(doc));
  check("fingerprint: copy and names do not", pricingFingerprint(retitled) === pricingFingerprint(doc));
  const fee = structuredClone(doc);
  fee.offers.shippingFee = 45;
  check("fingerprint: the page fee moves it", pricingFingerprint(fee) !== pricingFingerprint(doc));

  // /go query parity of the kit's links (LAN-§12.1)
  for (const l of base.kit.links) {
    const q = linkQuery(l.utm, "fbclid=AbC%2F1");
    check(`/go parity (${l.channel}): the presets first with the campaign slug, then the click id byte for byte`, q.startsWith(`utm_source=${l.utm.source}&utm_medium=${l.utm.medium}&utm_campaign=${l.utm.campaign}`) && q.endsWith("&fbclid=AbC%2F1"), q);
    check(`/go parity (${l.channel}): an ad's own utm_content keeps the incoming query untouched`, linkQuery(l.utm, "utm_content=question&fbclid=z") === "utm_content=question&fbclid=z");
  }
}

/* ------------------------------------------------------------------ */
/* DB cases                                                            */
/* ------------------------------------------------------------------ */

async function db(): Promise<void> {
  console.log("test:kit · database");
  const req = createRequire(__filename);
  const T = req("./tenancy-check") as typeof import("./tenancy-check");
  const kit = await T.setup();
  const { fx } = kit;
  const load = T.load;
  const Sv = load<typeof import("@/lib/campaigns/service.server")>("@/lib/campaigns/service.server");
  const Sh = load<typeof import("@/lib/campaigns/share.server")>("@/lib/campaigns/share.server");
  const R = load<typeof import("@/lib/campaigns/read.server")>("@/lib/campaigns/read.server");
  const Go = load<typeof import("@/lib/links/serve.server")>("@/lib/links/serve.server");
  const U = load<typeof import("@/lib/tenancy/usage")>("@/lib/tenancy/usage");
  const { PageDoc: Doc } = load<typeof import("@/lib/page/schema")>("@/lib/page/schema");
  const { db: conn } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { byId } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
  const userId = fx.A.members.owner;
  const ctxA = {
    user: { id: userId, email: "owner-a@tenancy.test", name: "Owner A", totpEnabled: false, sessionId: "kit-check", platformRole: "none", locale: null, lastStoreId: fx.A.id },
    store: fx.rows.A,
    membership: { role: "owner", status: "active" },
    scope: T.writeScope(fx.A.id),
    actor: { kind: "user", userId, impersonatorId: null, ip: null },
    impersonation: null,
    stepUpUntil: null,
    can: () => true,
  } as unknown as WriteCtx;
  const GAUGE = { metric: "campaigns", period: "total" } as const;
  const host = new URL(T.PLATFORM).host;
  const go = async (code: string, query = "") => {
    const res = await Go.serveGo(new Request(`${T.PLATFORM}/s/${fx.A.handle}/go/${code}${query}`, { headers: { host, "user-agent": "kit-check" } }), fx.A.handle, code, { defer: () => undefined });
    return { status: res.status, location: res.headers.get("location") };
  };

  try {
    const made = await Sv.createCampaign(ctxA, { pageId: fx.A.page.live, channels: ["meta", "whatsapp"], name: "Ramadan argan" });
    check("create: the slug is the name's", made.slug === "ramadan-argan", made.slug);
    const detail = await R.campaignDetail(ctxA.scope, fx.rows.A, made.id);
    check("create: a draft kit with one tagged short link per channel", detail?.row.status === "draft" && detail.links.length === 2 && detail.kit.links.length === 2 && detail.kit.links.every((l) => l.utm.campaign === "ramadan-argan"), detail?.links);
    const again = await Sv.createCampaign(ctxA, { pageId: fx.A.page.live, channels: ["tiktok"], name: "Ramadan argan" });
    check("create: a second kit of the same name gets the next free slug", again.slug === "ramadan-argan-2", again.slug);
    await Sv.endCampaign(ctxA, again.id);

    const before = await U.usageValue(ctxA.scope, GAUGE);
    await Sv.setCampaignLive(ctxA, made.id);
    check("Go live charges the campaigns gauge once", (await U.usageValue(ctxA.scope, GAUGE)) === before + 1);
    const code = detail!.links[0]!.code;
    const live = await go(code, "?fbclid=AbC%2F1");
    check("a live kit's link redirects with its presets and the click id (308)", live.status === 308 && !!live.location?.includes("utm_campaign=ramadan-argan") && !!live.location.endsWith("fbclid=AbC%2F1"), live);

    await Sv.pauseCampaign(ctxA, made.id);
    check("pausing the kit: its links answer 410", (await go(code)).status === 410);
    check("pausing keeps the kit counted", (await U.usageValue(ctxA.scope, GAUGE)) === before + 1);
    await Sv.setCampaignLive(ctxA, made.id);
    check("resuming: the links answer 308 again, no second charge", (await go(code)).status === 308 && (await U.usageValue(ctxA.scope, GAUGE)) === before + 1);

    const { token } = await Sh.createShare(ctxA, made.id);
    const shared = await Sh.kitForShare(token);
    check("share: the token opens the kit read-only with its store", shared?.campaign.id === made.id && shared.store.id === fx.A.id);
    await Sh.revokeShare(ctxA, made.id);
    check("share: revoked → the token answers nothing (404)", (await Sh.kitForShare(token)) === null);

    // "page changed since" (LAN-§13.3): a republish with another fingerprint, then the old prices again
    const [v] = await conn.select({ doc: S.pageVersions.doc }).from(S.pageVersions).where(byId(S.pageVersions, ctxA.scope, detail!.pageVersionId!)).limit(1);
    const doc = Doc.parse(v!.doc);
    const moved = structuredClone(doc);
    moved.offers.bundles[0]!.price += 10;
    await Sv.markKitsStale(ctxA.scope, fx.A.page.live, moved);
    check("a republish with new prices marks the kit stale (the banner)", (await R.campaignDetail(ctxA.scope, fx.rows.A, made.id))?.row.stale === true);
    const ended = await R.campaignDetail(ctxA.scope, fx.rows.A, again.id);
    check("an ended kit is never marked", ended?.row.stale === false);
    await Sv.markKitsStale(ctxA.scope, fx.A.page.live, doc);
    check("the old prices again clear it", (await R.campaignDetail(ctxA.scope, fx.rows.A, made.id))?.row.stale === false);
    await Sv.markKitsStale(ctxA.scope, fx.A.page.live, moved);
    await Sv.recompileCampaign(ctxA, made.id);
    check("Recompile clears the banner (the kit takes the live version's fingerprint)", (await R.campaignDetail(ctxA.scope, fx.rows.A, made.id))?.row.stale === false);

    await Sv.endCampaign(ctxA, made.id);
    check("ending refunds the gauge and keeps the record and its links", (await U.usageValue(ctxA.scope, GAUGE)) === before && (await R.campaignDetail(ctxA.scope, fx.rows.A, made.id))?.links.length === 2);
    check("an ended kit's link still redirects (links kept)", (await go(code)).status === 308);
  } finally {
    const left = await T.dropDatabase().catch((e: unknown) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    console.log(`  database ${process.env.TENANCY_DB} dropped; cod_test_* left: ${left.length ? left.join(", ") : "none"}`);
  }
}

void (async () => {
  const started = Date.now();
  try {
    offline();
    if (!OFFLINE) await db();
  } catch (e) {
    check("the suite ran to the end", false, e instanceof Error ? e.stack : String(e));
  }
  console.log(`test:kit (LP-18): ${pass} passed, ${fails.length} failed · ${Math.round((Date.now() - started) / 1000)} s`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(fails.length ? 1 : 0);
})();
