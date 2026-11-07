import "server-only";
/**
 * The Cloud half of the Campaign Kit (P3 LANDING, wave 2; landing.md LAN-§13.3 "Cloud brief"; ai.md AI-§A.2 `ad.brief`
 * and `callcenter.script`, core §H.12 pattern A). The template kit is stored and shown first; this runs after, behind
 * the Cloud AI flag (`aiPolicyFor(ctx).cloud.available`) and `ai.use`, and never blocks the kit:
 *
 *   ad.brief            P7's `runAi` with the published version's id, the kit's languages, the product's facts (the
 *                       offers' names and prices, the fee, the ETA range) and the page's sections with their structure
 *                       tags. The guarded fields cross-fade in through P7's `mergeAdBrief` (the template kept per
 *                       rejected field); the merged brief is stored only on the kit it was written for.
 *   callcenter.script   the objection answers of the page's language: each answer that restates only the page's facts
 *                       replaces the template's (`kitText`, the customer's variables kept as {placeholders}).
 *
 * The inputs are product facts, structure tags and the store's own words: never a customer datum (ra §9.14). A refusal,
 * a timeout or Cloud AI off keeps the template ("library" on the chip).
 */
import { mergeAdBrief, type AdBriefInput } from "@/lib/ai/schema/tasks/ad-brief";
import type { CallScriptInput } from "@/lib/ai/schema/tasks/callcenter-script";
import type { AiFallbackNote } from "@/lib/ai/provider/types";
import type { AiProviderId } from "@/lib/ai/tasks";
import { aiPolicyFor, runAi } from "@/lib/ai/router/server";
import { db } from "@/lib/db/client";
import { campaigns, pageVersions, type CampaignKit } from "@/lib/db/schema";
import { toCents } from "@/lib/page/pricing";
import { PageDoc } from "@/lib/page/schema";
import { SeamError } from "@/lib/tenancy/seam";
import { byId } from "@/lib/tenancy/sql";
import type { WriteCtx } from "@/lib/tenancy/types";
import { kitText, taggedSections, distinctTags, type Loc } from "./compile";
import { saveCloudBrief } from "./service.server";
import type { AdBrief } from "./types";
import { isLandingDoc } from "@/storefront/schema";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export interface CloudKitResult {
  brief: AdBrief;
  script: CampaignKit["script"];
  provider: AiProviderId;
  notes: AiFallbackNote[];
}

/** The kit's facts as the product's fact lines (owner-typed prices and offers only). */
function factLines(kit: CampaignKit): string[] {
  return [...kit.facts.offers.map((o) => `${o.label}: ${o.price}`), kit.facts.fee ?? "", kit.facts.eta?.fr ?? kit.facts.eta?.en ?? ""].filter(Boolean).slice(0, 6);
}

/** Runs the two pattern-A calls for one kit (see the module comment); answers the kit's brief and script as they stand after. */
export async function refineKitWithCloud(ctx: WriteCtx, id: string): Promise<CloudKitResult> {
  if (!ID_RE.test(String(id))) throw new SeamError("not_found");
  const [row] = await db.select({ id: campaigns.id, kit: campaigns.kit, versionId: campaigns.pageVersionId, status: campaigns.status }).from(campaigns).where(byId(campaigns, ctx.scope, id)).limit(1);
  if (!row) throw new SeamError("not_found");
  const library: CloudKitResult = { brief: row.kit.brief, script: row.kit.script, provider: row.kit.brief.source === "cloud" ? "server" : "library", notes: [] };
  if (row.status === "ended" || !row.versionId || !ctx.can("ai.use")) return library;
  const policy = await aiPolicyFor(ctx);
  if (!policy.cloud.available || policy.mode === "local") return library;

  const [v] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(byId(pageVersions, ctx.scope, row.versionId)).limit(1);
  const parsed = v && isLandingDoc(v.doc) ? PageDoc.safeParse(v.doc) : null;
  if (!parsed?.success) return library;
  const doc = parsed.data;
  const docLoc: Loc = doc.locale === "ar" || doc.locale === "fr" ? doc.locale : "en";
  const lead = doc.offers.bundles.find((b) => !b.soldOut) ?? doc.offers.bundles[0]!;
  const product = { name: doc.product.name, category: doc.product.category, priceMinor: toCents(lead.price), currency: doc.currency, facts: factLines(row.kit) };

  const briefIn: AdBriefInput = {
    basedOnVersionId: row.versionId,
    locales: row.kit.locales,
    product,
    sections: distinctTags(taggedSections(doc)).map((s) => ({ id: s.sectionId, tag: s.tag, headline: s.title, lead: "" })),
  };
  const scriptIn: CallScriptInput = {
    locale: docLoc,
    product,
    packs: doc.offers.bundles.filter((b) => !b.soldOut).map((b, i) => ({ label: row.kit.facts.offers[i]?.label ?? b.title ?? b.id, qty: b.lines.reduce((n, l) => n + l.qty, 0), priceMinor: toCents(b.price) })),
    upsell: doc.offers.upsell?.enabled ? { title: doc.offers.upsell.title, priceMinor: toCents(doc.offers.upsell.price) } : null,
    darija: "light",
    addressMode: null,
  };
  const opts = { surface: "builder" as const, actor: ctx.actor };
  const [brief, script] = await Promise.all([runAi(ctx.scope, "ad.brief", briefIn, opts), runAi(ctx.scope, "callcenter.script", scriptIn, opts)]);

  let next = row.kit.brief;
  const notes: AiFallbackNote[] = [];
  let provider: AiProviderId = library.provider;
  if (brief.ok) {
    notes.push(...brief.notes);
    if (brief.provider === "server") {
      next = mergeAdBrief(row.kit.brief, brief.value, brief.rejected, brief.promptVersion);
      provider = next.source === "cloud" ? "server" : "library";
    }
  } else notes.push({ from: "server", to: "library", code: brief.code });

  let nextScript = row.kit.script;
  if (script.ok && script.provider === "server") {
    const values = { product: row.kit.facts.product, store_name: ctx.store.name, eta_text: row.kit.facts.eta?.[docLoc] ?? "", offer_label: row.kit.facts.offers[0]?.label ?? "" };
    const steps = row.kit.script.steps.map((s) => {
      if (!s.id.startsWith("obj_")) return s;
      const o = script.value.objections.find((x) => `obj_${x.id}` === s.id);
      const text = o ? kitText(o.say, values) : "";
      return text && !/\{(?:total|units_text|qty|shipping_text|upsell_title|upsell_price)\}/.test(o!.say) ? { ...s, text: { ...s.text, [docLoc]: text } } : s;
    });
    nextScript = { steps };
  }
  if (next !== row.kit.brief || nextScript !== row.kit.script) {
    await saveCloudBrief(ctx, row.id, next, row.versionId, nextScript);
  }
  return { brief: next, script: nextScript, provider, notes };
}
