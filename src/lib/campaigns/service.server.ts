import "server-only";
/**
 * The Campaign Kit service (P3 LANDING, wave 2; landing.md LAN-§13.1-§13.3, LP-18 = SF-01, LD40): the one writer of
 * `campaigns`. Every call takes the seam's `WriteCtx` (the request's store, actor and audit rows); another store's id
 * answers `not_found` like a missing one.
 *
 *   createCampaign(ctx, input)   a published page of the store, 1-6 kit channels, a name (→ the `utm_campaign` slug,
 *                                unique in the store: "-2", "-3" … on a clash). One short link per channel through
 *                                the links service (its `short_links` gauge, its target checks), then the template
 *                                kit (`compileKit`), stored as `draft`. A refused link gives back the links already
 *                                made. Audit `campaign.created`.
 *   recompileCampaign            the page's current published version, the kit's own links: a new template kit and
 *                                a new `offers_hash` (the "page changed since" banner goes). Audit `campaign.recompiled`.
 *   setCampaignLive              `live` needs the page published; from `draft` the `campaigns` gauge is charged
 *                                (`campaigns_max`; `QuotaError` opens the limit sheet), from `paused` the kit's links
 *                                answer again. Audit `campaign.live`.
 *   pauseCampaign                every link of the kit pauses (410); the kit still counts. Audit `campaign.paused`.
 *   endCampaign                  the gauge is refunded when the kit counted; the record and its links stay for the
 *                                results. Audit `campaign.ended`.
 *   saveCloudBrief               the merged Cloud brief of `ad.brief` (./cloud.server.ts) replaces the template's.
 *
 * `markKitsStale(scope, pageId, doc)` is the publish listener's half (src/lib/render/prepublish/landing.ts): every kit of
 * the page that is not ended learns whether the published pricing fingerprint still equals its `offers_hash`.
 */
import { and, eq, like, ne } from "drizzle-orm";
import { z } from "zod";
import { affected, auditIn } from "@/lib/admin-data/store-audit";
import { FieldsError } from "@/lib/auth/errors";
import { BUILTIN_SCRIPTS } from "@/lib/callcenter/script-builtins";
import { ScriptDoc } from "@/lib/callcenter/script";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { campaigns, messageTemplates, pages, pageVersions, shortLinks, type CampaignKit } from "@/lib/db/schema";
import { listZones } from "@/lib/delivery/zones.server";
import { builtinTemplate } from "@/lib/integrations/whatsapp/builtins";
import { createShortLink, deleteShortLink, pauseShortLink, resumeShortLink } from "@/lib/links/service.server";
import { triggerFor } from "@/lib/orders/conversions-core";
import { PageDoc } from "@/lib/page/schema";
import { pixelLibraryView } from "@/lib/pixels/library.server";
import { getStoreSettings } from "@/lib/settings";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import { chargeUsage, refundUsage } from "@/lib/tenancy/usage";
import { storeUrl } from "@/lib/urls";
import { compileKit, type CompileKitInput, type CompileKitResult, type Loc } from "./compile";
import { pricingFingerprint } from "./fingerprint";
import { CAMPAIGN_NAME_MAX, KIT_CHANNELS, kitLinkUtm, slugOf, SLUG_MAX, type AdBrief, type CampaignStatus, type KitChannel } from "./types";
import { isLandingDoc } from "@/storefront/schema";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const GAUGE = { metric: "campaigns", period: "total" } as const;
/** live and paused kits count against `campaigns_max` (LAN-§13.1) */
const COUNTED: ReadonlySet<CampaignStatus> = new Set(["live", "paused"]);

export const CreateCampaignInput = z.object({
  pageId: z.string().regex(ID_RE),
  channels: z
    .array(z.enum(KIT_CHANNELS))
    .min(1)
    .max(KIT_CHANNELS.length)
    .transform((c) => [...new Set(c)]),
  name: z.string().trim().min(1).max(CAMPAIGN_NAME_MAX),
});
export type CreateCampaignInput = z.input<typeof CreateCampaignInput>;

/* ------------------------------------------------------------------ */
/* reads shared by the writes                                          */
/* ------------------------------------------------------------------ */

interface LivePage {
  id: string;
  versionId: string;
  doc: PageDoc;
  publishedAt: string;
}

/** The store's page and its published version; `not_found` for another store's id, a field error when it is not live. */
async function livePage(scope: StoreScope, pageId: string): Promise<LivePage> {
  if (!ID_RE.test(pageId)) throw new SeamError("not_found");
  const [page] = await db.select({ id: pages.id, status: pages.status, versionId: pages.publishedVersionId }).from(pages).where(byId(pages, scope, pageId)).limit(1);
  if (!page) throw new SeamError("not_found");
  if (page.status !== "published" || !page.versionId) throw new FieldsError({ pageId: "landing.campaigns.error.unpublished" });
  const [version] = await db.select({ doc: pageVersions.doc, createdAt: pageVersions.createdAt }).from(pageVersions).where(byId(pageVersions, scope, page.versionId)).limit(1);
  const parsed = version && isLandingDoc(version.doc) ? PageDoc.safeParse(version.doc) : null;
  if (!version || !parsed?.success) throw new FieldsError({ pageId: "landing.campaigns.error.unpublished" });
  return { id: page.id, versionId: page.versionId, doc: parsed.data, publishedAt: new Date(version.createdAt).toISOString() };
}

/** The kit's languages: the page's, the store's default, and Darija + French for a Moroccan page (the ad tabs). */
function kitLocales(doc: PageDoc, storeDefault: string | null | undefined): Loc[] {
  const isLoc = (v: unknown): v is Loc => v === "ar" || v === "fr" || v === "en";
  const out: Loc[] = [];
  const add = (v: unknown) => isLoc(v) && !out.includes(v) && out.push(v);
  add(doc.locale);
  if (doc.market === "MA") ["ar", "fr"].forEach(add);
  add(storeDefault);
  return out;
}

/** The store's active templates of one channel and kind, the page's row first, per language. */
async function templateRows(scope: StoreScope, channel: "whatsapp" | "call_script", kind: string | null, pageId: string) {
  return db
    .select({ locale: messageTemplates.locale, pageId: messageTemplates.pageId, body: messageTemplates.body })
    .from(messageTemplates)
    .where(whereStore(messageTemplates, scope, eq(messageTemplates.channel, channel), kind ? eq(messageTemplates.kind, kind) : undefined, eq(messageTemplates.status, "active")))
    .orderBy(messageTemplates.position)
    .limit(60)
    .then((rows) => rows.filter((r) => r.pageId === null || r.pageId === pageId).sort((a, b) => Number(b.pageId === pageId) - Number(a.pageId === pageId)));
}

const LOCS: readonly Loc[] = ["ar", "fr", "en"];

/** Everything `compileKit` reads for a page of the store (the links are the caller's). */
async function compileInputs(ctx: WriteCtx, page: LivePage, slug: string, channels: KitChannel[], links: CompileKitInput["links"]): Promise<CompileKitInput> {
  const { scope, store } = ctx;
  const [settings, zones, pixels, window, confirmRows, scriptRows] = await Promise.all([
    getStoreSettings(scope, ["policies", "conversions", "checkout"]),
    listZones(scope),
    pixelLibraryView(scope, { canCreate: false }),
    callingWindowFor(scope).catch(() => null),
    templateRows(scope, "whatsapp", "confirm", page.id),
    templateRows(scope, "call_script", null, page.id).catch(() => []),
  ]);
  const confirm = Object.fromEntries(LOCS.map((l) => [l, confirmRows.find((r) => r.locale === l)?.body ?? builtinTemplate("confirm", l)?.body ?? ""])) as Record<Loc, string>;
  const scripts: Partial<Record<Loc, ScriptDoc>> = {};
  for (const l of LOCS) {
    for (const r of scriptRows.filter((x) => x.locale === l)) {
      try {
        const parsed = ScriptDoc.safeParse(JSON.parse(r.body));
        if (parsed.success) {
          scripts[l] = parsed.data;
          break;
        }
      } catch {
        // a body that no longer parses is skipped, never shown half-valid (P4's selection rule)
      }
    }
  }
  const docLoc: Loc = page.doc.locale === "ar" || page.doc.locale === "fr" ? page.doc.locale : "en";
  return {
    doc: page.doc,
    version: { id: page.versionId, publishedAt: page.publishedAt },
    store,
    locales: kitLocales(page.doc, store.defaultLocale),
    policies: settings.policies,
    zones,
    pixels,
    trigger: triggerFor(settings.conversions, page.id),
    templates: { confirm, script: scripts[docLoc] ?? BUILTIN_SCRIPTS[docLoc] },
    channels,
    slug,
    links,
    scripts,
    window,
    now: new Date(),
    leadDays: settings.checkout.calendar.confirmationLeadDays ?? 0,
  };
}

/** A free slug for the store: the name's, else "kit", with "-2", "-3" … on a clash. */
async function freeSlug(scope: StoreScope, name: string): Promise<string> {
  const base = (slugOf(name) || "kit").slice(0, SLUG_MAX - 4).replace(/-+$/g, "") || "kit";
  const taken = new Set(
    (await db.select({ slug: campaigns.slug }).from(campaigns).where(whereStore(campaigns, scope, like(campaigns.slug, `${base}%`))).limit(500)).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  throw new FieldsError({ name: "landing.campaigns.error.slug" });
}

interface CampaignState {
  id: string;
  status: CampaignStatus;
  pageId: string;
  slug: string;
  channels: KitChannel[];
  kit: CampaignKit;
}

async function campaignOf(scope: StoreScope, id: string): Promise<CampaignState> {
  if (!ID_RE.test(String(id))) throw new SeamError("not_found");
  const [row] = await db
    .select({ id: campaigns.id, status: campaigns.status, pageId: campaigns.pageId, slug: campaigns.slug, channels: campaigns.channels, kit: campaigns.kit })
    .from(campaigns)
    .where(byId(campaigns, scope, id))
    .limit(1);
  if (!row) throw new SeamError("not_found");
  return { ...row, channels: row.channels.filter((c): c is KitChannel => (KIT_CHANNELS as readonly string[]).includes(c)) };
}

/** The kit's links as `compileKit` takes them (url built by the links service's own rule, SEC-6). */
async function kitLinks(ctx: WriteCtx, campaignId: string): Promise<CompileKitInput["links"]> {
  const rows = await db
    .select({ id: shortLinks.id, code: shortLinks.code, channel: shortLinks.channel, utm: shortLinks.utm })
    .from(shortLinks)
    .where(whereStore(shortLinks, ctx.scope, eq(shortLinks.campaignId, campaignId)))
    .orderBy(shortLinks.createdAt);
  return rows.flatMap((r) => (r.channel ? [{ channel: r.channel, url: storeUrl(ctx.store, `/go/${r.code}`), utm: r.utm ?? {}, shortLinkId: r.id }] : []));
}

/* ------------------------------------------------------------------ */
/* writes                                                              */
/* ------------------------------------------------------------------ */

export interface CreatedCampaign {
  id: string;
  slug: string;
  problems: CompileKitResult["problems"];
}

/** Creates a draft kit (see the module comment). Throws SeamError, FieldsError or QuotaError. */
export async function createCampaign(ctx: WriteCtx, raw: CreateCampaignInput): Promise<CreatedCampaign> {
  const input = CreateCampaignInput.parse(raw);
  const { scope } = ctx;
  const page = await livePage(scope, input.pageId);
  const slug = await freeSlug(scope, input.name);
  const id = newId();
  const links: CompileKitInput["links"] = [];
  try {
    for (const channel of input.channels) {
      const utm = kitLinkUtm(channel, slug);
      const made = await createShortLink(ctx, { target: { kind: "page", pageId: page.id }, channel, utm, campaignId: id });
      links.push({ channel, url: storeUrl(ctx.store, `/go/${made.code}`), utm, shortLinkId: made.id });
    }
  } catch (err) {
    // a refused link (the short_links limit, a page that just left) gives back the ones already made
    for (const l of links) await deleteShortLink(ctx, l.shortLinkId).catch(() => undefined);
    throw err;
  }
  const result = compileKit(await compileInputs(ctx, page, slug, input.channels, links));
  await db.insert(campaigns).values(
    storeValues(scope, {
      id,
      name: input.name,
      slug,
      pageId: page.id,
      pageVersionId: page.versionId,
      productRef: { kind: "landing_items" as const, id: page.id },
      channels: input.channels,
      kit: result.kit,
      kitSource: "library" as const,
      offersHash: result.offersHash,
      status: "draft" as const,
      createdBy: ctx.actor.userId,
    }),
  );
  await auditIn(scope, ctx.actor, "campaign.created", { target: id, meta: { pageId: page.id, slug, channels: input.channels, problems: result.problems.map((p) => p.code) } });
  return { id, slug, problems: result.problems };
}

/** A new template kit from the page's current published version (the "changed since" banner's Recompile). */
export async function recompileCampaign(ctx: WriteCtx, id: string): Promise<{ problems: CompileKitResult["problems"] }> {
  const c = await campaignOf(ctx.scope, id);
  if (c.status === "ended") throw new FieldsError({ status: "landing.campaigns.error.ended" });
  const page = await livePage(ctx.scope, c.pageId);
  const result = compileKit(await compileInputs(ctx, page, c.slug, c.channels, await kitLinks(ctx, c.id)));
  await db
    .update(campaigns)
    .set({ kit: result.kit, kitSource: "library", offersHash: result.offersHash, pageVersionId: page.versionId })
    .where(byId(campaigns, ctx.scope, c.id));
  await auditIn(ctx.scope, ctx.actor, "campaign.recompiled", { target: c.id, meta: { versionId: page.versionId } });
  return { problems: result.problems };
}

async function setStatus(scope: WriteScope, id: string, from: CampaignStatus, to: CampaignStatus): Promise<boolean> {
  const res = await db.update(campaigns).set({ status: to, ...(to === "live" && from === "draft" ? { startsAt: new Date() } : {}), ...(to === "ended" ? { endsAt: new Date() } : {}) }).where(and(byId(campaigns, scope, id), eq(campaigns.status, from)));
  return affected(res) > 0;
}

async function linkIds(scope: StoreScope, campaignId: string): Promise<string[]> {
  return (await db.select({ id: shortLinks.id }).from(shortLinks).where(whereStore(shortLinks, scope, eq(shortLinks.campaignId, campaignId)))).map((r) => r.id);
}

/** draft → live (charges the gauge) or paused → live (the links answer again). */
export async function setCampaignLive(ctx: WriteCtx, id: string): Promise<void> {
  const c = await campaignOf(ctx.scope, id);
  if (c.status === "live") return;
  if (c.status === "ended") throw new FieldsError({ status: "landing.campaigns.error.ended" });
  await livePage(ctx.scope, c.pageId);
  if (c.status === "draft") {
    await chargeUsage(ctx.scope, GAUGE, 1);
    if (!(await setStatus(ctx.scope, c.id, "draft", "live"))) {
      await refundUsage(ctx.scope, GAUGE, 1);
      return;
    }
  } else {
    if (!(await setStatus(ctx.scope, c.id, "paused", "live"))) return;
    for (const linkId of await linkIds(ctx.scope, c.id)) await resumeShortLink(ctx, linkId);
  }
  await auditIn(ctx.scope, ctx.actor, "campaign.live", { target: c.id, meta: { from: c.status } });
}

/** live → paused: every link of the kit answers 410 until the kit goes live again. */
export async function pauseCampaign(ctx: WriteCtx, id: string): Promise<void> {
  const c = await campaignOf(ctx.scope, id);
  if (c.status !== "live") throw new FieldsError({ status: "landing.campaigns.error.notLive" });
  if (!(await setStatus(ctx.scope, c.id, "live", "paused"))) return;
  for (const linkId of await linkIds(ctx.scope, c.id)) await pauseShortLink(ctx, linkId);
  await auditIn(ctx.scope, ctx.actor, "campaign.paused", { target: c.id });
}

/** → ended: the record and its links stay for the results; a kit that counted gives its unit back. */
export async function endCampaign(ctx: WriteCtx, id: string): Promise<void> {
  const c = await campaignOf(ctx.scope, id);
  if (c.status === "ended") return;
  if (!(await setStatus(ctx.scope, c.id, c.status, "ended"))) return;
  if (COUNTED.has(c.status)) await refundUsage(ctx.scope, GAUGE, 1);
  await auditIn(ctx.scope, ctx.actor, "campaign.ended", { target: c.id, meta: { from: c.status } });
}

/** The merged Cloud brief (and objection answers) replace the template's, only on the kit they were written for. */
export async function saveCloudBrief(ctx: WriteCtx, id: string, brief: AdBrief, versionId: string, script?: CampaignKit["script"]): Promise<boolean> {
  const c = await campaignOf(ctx.scope, id);
  const [row] = await db.select({ versionId: campaigns.pageVersionId }).from(campaigns).where(byId(campaigns, ctx.scope, c.id)).limit(1);
  if (!row || row.versionId !== versionId || c.status === "ended") return false;
  await db
    .update(campaigns)
    .set({ kit: { ...c.kit, brief, ...(script ? { script } : {}) }, kitSource: brief.source })
    .where(byId(campaigns, ctx.scope, c.id));
  return true;
}

/* ------------------------------------------------------------------ */
/* the publish listener's half                                         */
/* ------------------------------------------------------------------ */

/**
 * LAN-§13.3: after a publish of `pageId`, every kit of the page that is not ended is told whether the published pricing
 * fingerprint moved since its compile (`kit.stale`). One read and at most one write per kit; no job.
 */
export async function markKitsStale(scope: WriteScope, pageId: string, doc: PageDoc): Promise<number> {
  const fp = pricingFingerprint(doc);
  const rows = await db
    .select({ id: campaigns.id, hash: campaigns.offersHash, kit: campaigns.kit })
    .from(campaigns)
    .where(whereStore(campaigns, scope, eq(campaigns.pageId, pageId), ne(campaigns.status, "ended")))
    .limit(200);
  let changed = 0;
  for (const r of rows) {
    const stale = r.hash !== fp;
    if (Boolean(r.kit.stale) === stale) continue;
    const kit: CampaignKit = { ...r.kit };
    if (stale) kit.stale = true;
    else delete kit.stale;
    await db.update(campaigns).set({ kit }).where(byId(campaigns, scope, r.id));
    changed++;
  }
  return changed;
}
