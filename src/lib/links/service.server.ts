import "server-only";
/**
 * The short-link service (P3 LANDING; landing.md LAN-§2.1 `createShortLink`, §12.1, §12.2, §23.2, LD14, LD40): the
 * one writer of `short_links`, called by the links screen's actions and by the Campaign Kit (wave 2). Every call takes
 * the seam's `WriteCtx`, so the store, the actor and the audit rows are the request's.
 *
 *   createShortLink(ctx, input)   the target is a reference checked inside the store: another store's page answers
 *                                 `not_found`, an unpublished page or a kind the store's mode hides `invalid`. The
 *                                 `short_links` gauge is charged (`chargeUsage`, limit `short_links_max`) BEFORE the
 *                                 insert and refunded when the insert fails; `QuotaError` reaches the action, which
 *                                 opens the limit sheet. A generated code retries on a collision; a chosen one that
 *                                 is taken answers the field error. Audit `link.created`.
 *   pauseShortLink / resumeShortLink   status only (a paused link answers 410); audit `link.paused` on pause.
 *   deleteShortLink               deletes the row and refunds the gauge.
 *   editTarget                    the same pickers as create, nothing typed.
 * Each write drops the store's entry of `scopedCache("links")` (the route's 60 s lookup by code).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { affected, auditIn } from "@/lib/admin-data/store-audit";
import { FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages, shortLinks } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { chargeUsage, refundUsage } from "@/lib/tenancy/usage";
import { codeProblem, generateCode, normaliseCode } from "./codes";
import { kindServed } from "./target";
import { POLICY_KINDS, SHORT_LINK_CHANNELS, UTM_KEYS, type LinkTarget, type ShortLinkUtm } from "./types";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const GAUGE = { metric: "short_links", period: "total" } as const;
const CODE_ATTEMPTS = 6;

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export const LinkTargetInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), pageId: z.string().regex(ID_RE, { error: "landing.links.error.target" }) }),
  z.object({ kind: z.literal("home") }),
  z.object({ kind: z.literal("policy"), policy: z.enum(POLICY_KINDS) }),
]);

const utmValue = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "landing.links.error.utm_long" })
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), { error: "landing.links.error.utm_chars" })
    .optional();

export const LinkUtmInput = z
  .object({ source: utmValue(120), medium: utmValue(120), campaign: utmValue(200), content: utmValue(200), term: utmValue(200) })
  .partial()
  .default({});

export const CreateLinkInput = z.object({
  target: LinkTargetInput,
  channel: z.enum(SHORT_LINK_CHANNELS).nullable().default(null),
  utm: LinkUtmInput,
  /** an owner-chosen code; empty or left out: a generated one */
  code: z.string().max(40).nullish(),
  /** the Campaign Kit's campaign (wave 2) */
  campaignId: z.string().regex(ID_RE).nullish(),
});
export type CreateLinkInput = z.input<typeof CreateLinkInput>;

/** Only the set UTM values, trimmed (an empty field is "not set"). */
function cleanUtm(utm: z.output<typeof LinkUtmInput>): ShortLinkUtm {
  const out: ShortLinkUtm = {};
  for (const key of UTM_KEYS) {
    const v = utm[key];
    if (v) out[key] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The route's lookup cache                                            */
/* ------------------------------------------------------------------ */

/** What `/go/<code>` needs of a row. */
export interface LinkLookup {
  id: string;
  status: "active" | "paused";
  targetKind: (typeof shortLinks.$inferSelect)["targetKind"];
  pageId: string | null;
  targetRef: string | null;
  utm: ShortLinkUtm;
}

export const LINKS_TTL_MS = 60_000;
const linksCache = scopedCache<LinkLookup | null>({ name: "links", maxEntries: 10_000, ttlMs: LINKS_TTL_MS });

/** The link of this store with `code` (cached 60 s per store, dropped by every write here); null when none. */
export function linkByCode(scope: StoreScope, code: string): Promise<LinkLookup | null> {
  return linksCache.getOrLoad(scope.storeId, code, async () => {
    const [row] = await db
      .select({ id: shortLinks.id, status: shortLinks.status, targetKind: shortLinks.targetKind, pageId: shortLinks.pageId, targetRef: shortLinks.targetRef, utm: shortLinks.utm })
      .from(shortLinks)
      .where(whereStore(shortLinks, scope, eq(shortLinks.code, code)))
      .limit(1);
    return row ? { ...row, utm: row.utm ?? {} } : null;
  });
}

/** Drops the route's lookup cache of a store (every write here; the selftest). */
export const dropLinksCache = (scope: StoreScope) => linksCache.delete(scope.storeId);

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

type Columns = { targetKind: "page" | "home" | "policy"; pageId: string | null; targetRef: string | null };

/**
 * The columns of a target after its checks inside the store: another store's (or an unknown) page id answers
 * `not_found` exactly like a missing one; an unpublished page, or a kind the store's mode hides, `invalid`.
 */
async function targetColumns(ctx: WriteCtx, target: LinkTarget): Promise<Columns> {
  if (target.kind === "home") return { targetKind: "home", pageId: null, targetRef: null };
  if (target.kind === "policy") return { targetKind: "policy", pageId: null, targetRef: target.policy };
  const [page] = await db
    .select({ id: pages.id, kind: pages.kind, status: pages.status, versionId: pages.publishedVersionId })
    .from(pages)
    .where(byId(pages, ctx.scope, target.pageId))
    .limit(1);
  if (!page) throw new SeamError("not_found");
  if (page.status !== "published" || !page.versionId) throw new FieldsError({ target: "landing.links.error.unpublished" });
  const inStore = ctx.store.mode === "store" ? (await getStoreSetting(ctx.scope, "landing")).inStoreMode : false;
  if (!kindServed(page.kind, ctx.store.mode, inStore)) throw new FieldsError({ target: "landing.links.error.hidden" });
  return { targetKind: "page", pageId: page.id, targetRef: null };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/** mysql2's error code, looking through drizzle's wrapping (`cause`). */
function dbErrorCode(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
const isDuplicate = (err: unknown) => dbErrorCode(err) === "ER_DUP_ENTRY";

export interface CreatedLink {
  id: string;
  code: string;
}

/** Creates a link (see the module comment). Throws SeamError, FieldsError or QuotaError. */
export async function createShortLink(ctx: WriteCtx, raw: CreateLinkInput): Promise<CreatedLink> {
  const input = CreateLinkInput.parse(raw);
  const chosen = normaliseCode(input.code);
  if (chosen) {
    const problem = codeProblem(chosen);
    if (problem) throw new FieldsError({ code: problem === "reserved" ? "landing.links.error.code_reserved" : "landing.links.error.code_format" });
  }
  const columns = await targetColumns(ctx, input.target);
  const utm = cleanUtm(input.utm);
  const { scope } = ctx;

  // the gauge first (§D.7): a refused charge writes nothing; a failed insert gives the unit back
  await chargeUsage(scope, GAUGE, 1);
  let created: CreatedLink | null = null;
  try {
    const id = newId();
    for (let attempt = 0; attempt < (chosen ? 1 : CODE_ATTEMPTS) && !created; attempt++) {
      const code = chosen ?? generateCode();
      try {
        await db.insert(shortLinks).values(
          storeValues(scope, {
            id,
            code,
            ...columns,
            campaignId: input.campaignId ?? null,
            utm,
            channel: input.channel,
            status: "active" as const,
            createdBy: ctx.actor.userId,
          }),
        );
        created = { id, code };
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        if (chosen) throw new FieldsError({ code: "landing.links.error.code_taken" });
      }
    }
    if (!created) throw new Error("links: no free code after retries");
  } finally {
    if (!created) await refundUsage(scope, GAUGE, 1).catch(() => undefined);
  }
  dropLinksCache(scope);
  await auditIn(scope, ctx.actor, "link.created", { target: created.id, meta: { code: created.code, targetKind: columns.targetKind, channel: input.channel, campaignId: input.campaignId ?? null } });
  return created;
}

async function setStatus(ctx: WriteCtx, id: string, status: "active" | "paused"): Promise<boolean> {
  if (!ID_RE.test(id)) throw new SeamError("not_found");
  const [row] = await db.select({ status: shortLinks.status }).from(shortLinks).where(byId(shortLinks, ctx.scope, id)).limit(1);
  if (!row) throw new SeamError("not_found");
  if (row.status === status) return false;
  await db.update(shortLinks).set({ status }).where(byId(shortLinks, ctx.scope, id));
  dropLinksCache(ctx.scope);
  return true;
}

/** Pauses a link (its address answers 410 until resumed); audit `link.paused`. Another store's id answers not_found. */
export async function pauseShortLink(ctx: WriteCtx, id: string): Promise<void> {
  if (await setStatus(ctx, id, "paused")) await auditIn(ctx.scope, ctx.actor, "link.paused", { target: id, meta: { paused: true } });
}

/** Resumes a paused link (audited as `link.paused` with `paused: false`: the action list has no resume of its own). */
export async function resumeShortLink(ctx: WriteCtx, id: string): Promise<void> {
  if (await setStatus(ctx, id, "active")) await auditIn(ctx.scope, ctx.actor, "link.paused", { target: id, meta: { paused: false } });
}

/** Deletes a link and refunds the `short_links` gauge. Another store's id answers not_found. */
export async function deleteShortLink(ctx: WriteCtx, id: string): Promise<void> {
  if (!ID_RE.test(id)) throw new SeamError("not_found");
  const res = await db.delete(shortLinks).where(byId(shortLinks, ctx.scope, id));
  if (!affected(res)) throw new SeamError("not_found");
  dropLinksCache(ctx.scope);
  await refundUsage(ctx.scope, GAUGE, 1);
}

/** Points a link at another target (the same pickers as create); answers like create for the target's checks. */
export async function editTarget(ctx: WriteCtx, id: string, rawTarget: z.input<typeof LinkTargetInput>): Promise<void> {
  if (!ID_RE.test(id)) throw new SeamError("not_found");
  const target = LinkTargetInput.parse(rawTarget);
  const [row] = await db.select({ id: shortLinks.id }).from(shortLinks).where(byId(shortLinks, ctx.scope, id)).limit(1);
  if (!row) throw new SeamError("not_found");
  const columns = await targetColumns(ctx, target);
  await db.update(shortLinks).set(columns).where(byId(shortLinks, ctx.scope, id));
  dropLinksCache(ctx.scope);
}
