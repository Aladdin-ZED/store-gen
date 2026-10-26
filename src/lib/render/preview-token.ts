import "server-only";
/**
 * Private preview links (docs/STORE-SAAS.md §E.2, D20, PLA Q.6, rev 3 SEC-7: store-bound and revocable).
 *
 *   const { url } = await mintPreviewToken(ctx.scope, { pageId, ttlSec: 86_400, audience: "seller", actor: ctx.actor });
 *   await revokePreviewToken(ctx.scope, tokenId);
 *   const opened = await openPreviewToken(token);       // /preview/<token>: null for anything not valid right now
 *
 * Mint checks the page in the scope's store first (another store's page id → `not_found`, the check
 * `assertOwned(scope, "page", [pageId])` makes, done here by the store-scoped page read the mint needs anyway),
 * inserts a `preview_tokens` row and seals `{ v: 1, jti, storeId, pageId, audience, staffUserId?, exp }` with the
 * platform envelope (purpose "preview:v1", T1's `seal`). `openPreviewToken` opens it, loads the row by jti in the
 * token's store (not revoked, not expired, the same page), and bumps `opened` (a leaked seller link shows in
 * Activity as a counter, no PII). Audit `store.preview_link.created` / `.revoked` in the page's store. Accepted
 * scopes: member and platform (staff mint with `platformScope`); a revoked or expired link answers the 404.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages, previewTokens } from "@/lib/db/schema";
import { open, seal } from "@/lib/security/crypto";
import { SeamError } from "@/lib/tenancy/seam";
import { inStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope } from "@/lib/tenancy/types";
import { previewUrl } from "@/lib/urls";

/** The longest a preview link may live: 3 days. */
export const PREVIEW_TTL_MAX_SEC = 259_200;
/** The shortest: a minute (a link that expires before it is opened helps no one). */
const PREVIEW_TTL_MIN_SEC = 60;
const PURPOSE = "preview:v1";
/** a sealed payload is ~200 chars; anything far longer is not one of ours */
const TOKEN_MAX = 1_024;

const Id26 = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

const MintInput = z
  .object({
    pageId: Id26,
    ttlSec: z.number().int().min(PREVIEW_TTL_MIN_SEC).max(PREVIEW_TTL_MAX_SEC),
    audience: z.enum(["staff", "seller"]),
    staffUserId: Id26.optional(),
  })
  .refine((v) => (v.audience === "staff") === !!v.staffUserId, { error: "A staff link names its staff member; a seller link names none." });

const Payload = z
  .object({
    v: z.literal(1),
    jti: Id26,
    storeId: Id26,
    pageId: Id26,
    audience: z.enum(["staff", "seller"]),
    staffUserId: Id26.optional(),
    exp: z.number().int().positive(),
  })
  .strict();
export type PreviewPayload = z.output<typeof Payload>;

const auditScope = (scope: StoreScope, actor?: Actor) => ({
  storeId: scope.storeId,
  actorKind: actor?.kind ?? (scope.kind === "platform" ? ("platform" as const) : ("user" as const)),
  impersonatorId: actor?.impersonatorId ?? null,
});

export async function mintPreviewToken(
  scope: StoreScope,
  input: { pageId: string; ttlSec: number /* ≤ 259200 */; audience: "staff" | "seller"; staffUserId?: string; /** who mints (created_by, audit) */ actor?: Actor },
): Promise<{ url: string; expiresAt: Date; tokenId: string }> {
  // a member of the store, or staff through platformScope; impersonation is read-only, jobs and public paths never mint
  if (scope.kind !== "member" && scope.kind !== "platform") throw new SeamError("forbidden");
  const v = MintInput.parse({ pageId: input.pageId, ttlSec: input.ttlSec, audience: input.audience, staffUserId: input.staffUserId });
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(inStore(pages, scope), eq(pages.id, v.pageId)))
    .limit(1);
  if (!page) throw new SeamError("not_found");

  const jti = newId();
  const expiresAt = new Date(Date.now() + v.ttlSec * 1000);
  const payload: PreviewPayload = {
    v: 1,
    jti,
    storeId: scope.storeId,
    pageId: page.id,
    audience: v.audience,
    ...(v.staffUserId ? { staffUserId: v.staffUserId } : {}),
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  // sealed before the row is written: a sealing failure leaves no orphan row
  const token = seal(JSON.stringify(payload), "platform", PURPOSE);
  await db.insert(previewTokens).values({
    id: jti,
    storeId: scope.storeId,
    pageId: page.id,
    audience: v.audience,
    staffUserId: v.staffUserId ?? null,
    createdBy: input.actor?.userId ?? v.staffUserId ?? null,
    expiresAt,
  });
  await audit("store.preview_link.created", {
    userId: input.actor?.userId ?? null,
    ip: input.actor?.ip ?? null,
    target: page.id,
    meta: { tokenId: jti, audience: v.audience, ttlSec: v.ttlSec },
    scope: auditScope(scope, input.actor),
  });
  return { url: previewUrl(token), expiresAt, tokenId: jti };
}

/** "Share a private preview" → "Revoke": the link answers the 404 from now on; audit store.preview_link.revoked. */
export async function revokePreviewToken(scope: StoreScope, tokenId: string, actor?: Actor): Promise<void> {
  if (scope.kind !== "member" && scope.kind !== "platform") throw new SeamError("forbidden");
  if (!Id26.safeParse(tokenId).success) throw new SeamError("not_found");
  const res = await db
    .update(previewTokens)
    .set({ revokedAt: new Date() })
    .where(and(inStore(previewTokens, scope), eq(previewTokens.id, tokenId), isNull(previewTokens.revokedAt)));
  const n = (Array.isArray(res) ? (res[0] as { affectedRows?: number }) : (res as { affectedRows?: number }))?.affectedRows ?? 0;
  if (n !== 1) throw new SeamError("not_found");
  await audit("store.preview_link.revoked", { userId: actor?.userId ?? null, ip: actor?.ip ?? null, target: tokenId, scope: auditScope(scope, actor) });
}

/**
 * The payload of a preview token that is valid right now: it opens with the platform envelope, its row exists in
 * its store for its page, is not revoked and not expired. Bumps the row's `opened` counter. Null otherwise (the
 * route's 404: forged, foreign-store, revoked, expired and malformed tokens are indistinguishable).
 */
export async function openPreviewToken(token: string, now = new Date()): Promise<PreviewPayload | null> {
  if (!token || token.length > TOKEN_MAX) return null;
  let payload: PreviewPayload;
  try {
    const parsed = Payload.safeParse(JSON.parse(open(token, "platform", PURPOSE)));
    if (!parsed.success) return null;
    payload = parsed.data;
  } catch {
    return null;
  }
  if (payload.exp * 1000 <= now.getTime()) return null;
  // the envelope authenticated the store id: this read is in the token's store
  const live = and(
    eq(previewTokens.storeId, payload.storeId),
    eq(previewTokens.id, payload.jti),
    eq(previewTokens.pageId, payload.pageId),
    isNull(previewTokens.revokedAt),
    gt(previewTokens.expiresAt, now),
  );
  const res = await db.update(previewTokens).set({ opened: sql`${previewTokens.opened} + 1`, lastOpenedAt: now }).where(live);
  const n = (Array.isArray(res) ? (res[0] as { affectedRows?: number }) : (res as { affectedRows?: number }))?.affectedRows ?? 0;
  return n === 1 ? payload : null;
}
