import "server-only";
/**
 * Read-only kit shares (P3 LANDING, wave 2; landing.md LAN-§13.5, core §E.2 `resolveKitShare`, §H.11): a member with
 * `campaigns.write` makes a link `/kit/<token>` for a media buyer or a partner. The token is `newToken(32)`, shown
 * once; only its sha256 is stored (`campaigns.share_token_hash`, unique), so a new share replaces the previous link.
 * Revoking sets the hash NULL: the page answers the neutral 404 at once (the resolver is never cached).
 *
 *   createShare(ctx, id)   → { token }   audit `campaign.shared`
 *   revokeShare(ctx, id)                 audit `campaign.share_revoked`
 *   expireShares(scope, actor, now)      the nightly `campaigns.share_expiry` (core §H.11, CCR r1-p3-15 item 2): the
 *                                        links of kits ended more than 90 days ago, audit `campaign.share_revoked`
 *                                        with `meta.reason = "expired"`
 *   kitForShare(token)                   the public page's read: the shared kit, its store and the page's live doc for
 *                                        the thumbnail, through `resolveKitShare`'s public scope; null for anything
 *                                        else (malformed, unknown, revoked, a store that is not servable)
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { newToken } from "@/lib/db/ids";
import { campaigns, pages, pageVersions, type CampaignKit } from "@/lib/db/schema";
import { PageDoc } from "@/lib/page/schema";
import { resolveKitShare } from "@/lib/tenancy/public";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreRow, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import type { CampaignStatus } from "./types";
import { isLandingDoc } from "@/storefront/schema";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function own(ctx: WriteCtx, id: string): Promise<string> {
  if (!ID_RE.test(String(id))) throw new SeamError("not_found");
  const [row] = await db.select({ id: campaigns.id }).from(campaigns).where(byId(campaigns, ctx.scope, id)).limit(1);
  if (!row) throw new SeamError("not_found");
  return row.id;
}

/** A new read-only link (the previous one stops working); the token is returned once and never stored. */
export async function createShare(ctx: WriteCtx, id: string): Promise<{ token: string }> {
  const cid = await own(ctx, id);
  const token = newToken(32);
  await db.update(campaigns).set({ shareTokenHash: sha256(token) }).where(byId(campaigns, ctx.scope, cid));
  await auditIn(ctx.scope, ctx.actor, "campaign.shared", { target: cid });
  return { token };
}

export async function revokeShare(ctx: WriteCtx, id: string): Promise<void> {
  const cid = await own(ctx, id);
  await db.update(campaigns).set({ shareTokenHash: null }).where(byId(campaigns, ctx.scope, cid));
  await auditIn(ctx.scope, ctx.actor, "campaign.share_revoked", { target: cid });
}

const SHARE_TTL_AFTER_END_MS = 90 * 86_400_000;

/** Revokes the share links of this store's kits that ended more than 90 days before `now`; answers how many. */
export async function expireShares(scope: WriteScope, actor: Actor, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SHARE_TTL_AFTER_END_MS);
  const due = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(whereStore(campaigns, scope, and(eq(campaigns.status, "ended"), lt(campaigns.endsAt, cutoff), isNotNull(campaigns.shareTokenHash))));
  if (!due.length) return 0;
  const ids = due.map((r) => r.id);
  await db.update(campaigns).set({ shareTokenHash: null }).where(whereStore(campaigns, scope, inArray(campaigns.id, ids)));
  for (const id of ids) await auditIn(scope, actor, "campaign.share_revoked", { target: id, meta: { reason: "expired" } });
  return ids.length;
}

export interface SharedKit {
  store: StoreRow;
  scope: StoreScope;
  campaign: { id: string; name: string; status: CampaignStatus; kit: CampaignKit };
  /** the page's live document (the thumbnail), null when it is no longer published */
  doc: PageDoc | null;
}

/** The shared campaign and its page's live document, read inside the store's (public) scope. */
async function sharedKitOf(scope: StoreScope, campaignId: string): Promise<Omit<SharedKit, "store" | "scope"> | null> {
  const [row] = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, kit: campaigns.kit, pageId: campaigns.pageId })
    .from(campaigns)
    .where(byId(campaigns, scope, campaignId))
    .limit(1);
  if (!row) return null;
  const [page] = await db.select({ versionId: pages.publishedVersionId, status: pages.status }).from(pages).where(byId(pages, scope, row.pageId)).limit(1);
  let doc: PageDoc | null = null;
  if (page?.status === "published" && page.versionId) {
    const [v] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(byId(pageVersions, scope, page.versionId)).limit(1);
    const parsed = v && isLandingDoc(v.doc) ? PageDoc.safeParse(v.doc) : null;
    doc = parsed?.success ? parsed.data : null;
  }
  return { campaign: { id: row.id, name: row.name, status: row.status, kit: row.kit }, doc };
}

/** The share page's read (see the module comment). */
export async function kitForShare(token: string): Promise<SharedKit | null> {
  const target = await resolveKitShare(token);
  if (!target) return null;
  const found = await sharedKitOf(target.scope, target.campaignId);
  return found ? { store: target.store, scope: target.scope, ...found } : null;
}

/** Is the campaign shared right now (the detail screen's "Revoke" state)? */
export const isShared = (hash: string | null | undefined) => typeof hash === "string" && hash.length === 64;
