import "server-only";
/**
 * Legal documents and re-acceptance (P1 CONSOLE; platform.md PLA-§13.4, §13.6, §22.15; PD17, PD49; P0b: CCR P2-6).
 *
 *   await listLegal(ctx);                                            // legal.manage: kind × locale, versions, the red lines
 *   await saveLegalDraft(ctx, { kind, locale, title, body, ... });   // a new version when the current one is published
 *   await markLegalReviewed(ctx, { id, typed: "reviewed" });
 *   await publishLegal(ctx, { id, acknowledge: true, typed: "publish unreviewed" });   // the previous published one retires
 *   await retireLegal(ctx, { id });
 *   await pendingReacceptance(userId);                               // tenant-callable (P2's pulse and sheet)
 *   await recordReacceptance(ctx, documentIds, { ipHash, uaLabel }); // tenant-callable: the caller's own rows
 *
 * Versions are immutable once published: saving edits the working draft of a kind and locale, or starts version n + 1
 * when the newest one is published or retired. A draft whose text changes needs its legal review again. Publishing a
 * version still flagged `needs_legal_review` needs the acknowledgement and the typed words `publish unreviewed`, which
 * record `ack_unreviewed_by` / `_at` (PD17); the previous published version of that kind and locale becomes
 * `retired`, in the same transaction. A published version retires only while another one is published for its kind
 * and locale (so publishing never leaves a hole by hand); a draft can always be discarded (retired). Store templates
 * (`store_*`) may hold `{{field}}` placeholders, each one of P3's `POLICY_TEMPLATE_FIELDS`; platform documents hold
 * none. DPA is R2: no R1 row. Audit `platform.legal.saved|reviewed|published|retired`.
 *
 * Acceptance: signup (T2) and staff invites ask for the published ToS, Privacy and AUP in the person's locale, falling
 * back fr → en → ar; a kind with nothing published is not asked (signup never breaks) and the list shows the red line
 * "Sign-up runs without published <kind>". Re-acceptance: a published platform document with `requiresReacceptance`,
 * effective now, that the person has not accepted (`legal-reaccept` cache, 5 min per user, cleared by a publish and by
 * the person's acceptance).
 *
 * P0b stub signatures kept (src/lib/contracts/r1-p0b-platform.ts): `LegalDocSummary`, `pendingReacceptance`,
 * `recordReacceptance`. The pure rules are ./legal-rules.ts.
 */
import { and, count, desc, eq, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { audit, auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { legalAcceptances, legalDocuments, users } from "@/lib/db/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import type { PlatformCtx, UserCtx } from "@/lib/tenancy/types";
import {
  LEGAL_BODY_MAX,
  LEGAL_LOCALES,
  LEGAL_SUMMARY_MAX,
  LEGAL_TITLE_MAX,
  PLATFORM_KINDS,
  PUBLISH_UNREVIEWED_WORD,
  R1_LEGAL_KINDS,
  REVIEWED_WORD,
  diffStats,
  isLegalLocale,
  isPlatformKind,
  isR1LegalKind,
  isStoreKind,
  kindsWithoutPublished,
  lineDiff,
  pickAccepted,
  placeholderProblem,
  templateFields,
  typedMatches,
  type DiffOp,
  type LegalLocale,
  type PlatformKind,
  type R1LegalKind,
} from "./legal-rules";
import { cleanText, id26 } from "./queue-rules";

/** One document the viewer must accept again: its title and "What changed" summary, in the viewer's locale. */
export interface LegalDocSummary {
  id: string;
  kind: string;
  title: string;
  summary: string;
  version: number;
}

type DocRow = typeof legalDocuments.$inferSelect;
type Executor = Pick<typeof db, "insert">;

function requireLegal(ctx: PlatformCtx): void {
  if (!ctx.can("legal.manage")) throw new AuthRefusal("forbidden");
}

/* ------------------------------------------------------------------ */
/* Acceptance (signup, staff invites, re-acceptance)                   */
/* ------------------------------------------------------------------ */

/** The published platform documents, every locale (the few rows the acceptance picks from). */
async function publishedPlatformDocs(): Promise<Pick<DocRow, "id" | "kind" | "locale" | "version" | "title" | "summary" | "requiresReacceptance" | "effectiveAt">[]> {
  return db
    .select({
      id: legalDocuments.id,
      kind: legalDocuments.kind,
      locale: legalDocuments.locale,
      version: legalDocuments.version,
      title: legalDocuments.title,
      summary: legalDocuments.summary,
      requiresReacceptance: legalDocuments.requiresReacceptance,
      effectiveAt: legalDocuments.effectiveAt,
    })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.status, "published"), inArray(legalDocuments.kind, [...PLATFORM_KINDS])));
}

/**
 * The documents a person in `locale` accepts: per platform kind, the published version of the first locale of
 * locale → fr → en → ar (PLA-§13.4). A kind with nothing published is left out.
 */
export async function acceptanceDocsFor(locale: string | null | undefined): Promise<{ id: string; kind: PlatformKind }[]> {
  return pickAccepted(await publishedPlatformDocs(), locale).map((d) => ({ id: d.id, kind: d.kind as PlatformKind }));
}

/** A person's acceptance rows outside any store (staff invites, re-acceptance): `store_id` NULL. */
export async function insertUserAcceptances(executor: Executor, rows: readonly Omit<typeof legalAcceptances.$inferInsert, "storeId" | "id">[]): Promise<void> {
  if (!rows.length) return;
  // tenancy: platform a person's own acceptances outside any store (legal_acceptances is P, opt. store: store_id NULL, PLA-§2.1)
  await executor.insert(legalAcceptances).values(rows.map((r) => ({ ...r, storeId: null })));
}

/** `legal-reaccept` (PLA-§M.5): `"p"` : user id, 5 min, cleared by a publish and by the person's acceptance */
const reacceptCache = scopedCache<{ docs: LegalDocSummary[] } | null>({ name: "legal-reaccept", maxEntries: 4_000, ttlMs: 5 * 60_000 });
const PLATFORM = "p";

/** The pending re-acceptances of one person, read fresh. */
async function computePending(userId: string, now: Date): Promise<{ docs: LegalDocSummary[] } | null> {
  if (!/^[0-9A-Z]{26}$/.test(userId)) return null;
  const [user] = await db.select({ locale: users.locale, disabled: users.disabled }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.disabled) return null;
  const asked = pickAccepted(await publishedPlatformDocs(), user.locale).filter((d) => d.requiresReacceptance && (!d.effectiveAt || d.effectiveAt.getTime() <= now.getTime()));
  if (!asked.length) return null;
  // tenancy: platform a person's own acceptances of the asked documents (la_user_idx), ids only
  const accepted = await db
    .select({ documentId: legalAcceptances.documentId })
    .from(legalAcceptances)
    .where(and(eq(legalAcceptances.userId, userId), inArray(legalAcceptances.documentId, asked.map((d) => d.id))));
  const done = new Set(accepted.map((a) => a.documentId));
  const docs = asked.filter((d) => !done.has(d.id)).map((d) => ({ id: d.id, kind: d.kind, title: d.title, summary: d.summary ?? "", version: d.version }));
  return docs.length ? { docs } : null;
}

/** The effective published documents with `requiresReacceptance` the user has not accepted (cached 5 min per user); null = none. */
export async function pendingReacceptance(userId: string): Promise<{ docs: LegalDocSummary[] } | null> {
  return reacceptCache.getOrLoad(PLATFORM, String(userId).slice(0, 26), () => computePending(userId, new Date()));
}

/**
 * `acceptLegalAction` (userAction): one `legal_acceptances` row per document, `context = 'reaccept'`, with the IP
 * hash and UA label, for the caller only. Every id must be one the caller is asked to accept right now (else
 * `conflict`: the sheet reloads); audit `auth.legal.accepted`.
 */
export async function recordReacceptance(ctx: UserCtx, documentIds: readonly string[], meta: { ipHash: string | null; uaLabel: string }): Promise<void> {
  const ids = [...new Set(documentIds)];
  if (!ids.length || ids.length > PLATFORM_KINDS.length || !ids.every((id) => /^[0-9A-Z]{26}$/.test(id))) throw new AuthRefusal("invalid");
  const pending = await computePending(ctx.user.id, new Date());
  const asked = new Set((pending?.docs ?? []).map((d) => d.id));
  if (!ids.every((id) => asked.has(id))) throw new AuthRefusal("conflict");
  const ipHash = meta.ipHash && /^[0-9a-f]{64}$/.test(meta.ipHash) ? meta.ipHash : null;
  await insertUserAcceptances(db, ids.map((documentId) => ({ userId: ctx.user.id, documentId, ipHash, ua: String(meta.uaLabel ?? "").slice(0, 300) || null, context: "reaccept" as const })));
  reacceptCache.delete(PLATFORM, ctx.user.id);
  await audit("auth.legal.accepted", { userId: ctx.user.id, target: ctx.user.id, meta: { documents: ids, context: "reaccept" }, scope: { storeId: null, actorKind: "user" } });
}

/* ------------------------------------------------------------------ */
/* The console list (PLA-§13.4)                                        */
/* ------------------------------------------------------------------ */

export interface LegalVersionRow {
  id: string;
  version: number;
  status: DocRow["status"];
  title: string;
  needsLegalReview: boolean;
  effectiveAt: string | null;
  publishedAt: string | null;
  requiresReacceptance: boolean;
  /** platform kinds: the acceptances recorded for this version */
  acceptances: number | null;
  ackUnreviewed: boolean;
  updatedAt: string | null;
}

export interface LegalGroup {
  kind: R1LegalKind;
  locale: LegalLocale;
  /** newest first */
  versions: LegalVersionRow[];
  published: LegalVersionRow | null;
  draft: LegalVersionRow | null;
}

export interface LegalList {
  groups: LegalGroup[];
  /** the red lines: platform kinds with no published version in any locale ("Sign-up runs without published <kind>") */
  missing: PlatformKind[];
}

/** Acceptances per document (platform kinds), one annotated count. */
async function acceptanceCounts(documentIds: readonly string[]): Promise<Map<string, number>> {
  if (!documentIds.length) return new Map();
  // tenancy: platform the legal list's acceptance counts (la_doc_idx): a number per platform document, across people and stores
  const rows = await db
    .select({ documentId: legalAcceptances.documentId, n: count() })
    .from(legalAcceptances)
    .where(inArray(legalAcceptances.documentId, [...documentIds]))
    .groupBy(legalAcceptances.documentId);
  return new Map(rows.map((r) => [r.documentId, Number(r.n)]));
}

const versionRow = (r: DocRow, acceptances: Map<string, number>): LegalVersionRow => ({
  id: r.id,
  version: r.version,
  status: r.status,
  title: r.title,
  needsLegalReview: r.needsLegalReview,
  effectiveAt: r.effectiveAt?.toISOString() ?? null,
  publishedAt: r.publishedAt?.toISOString() ?? null,
  requiresReacceptance: r.requiresReacceptance,
  acceptances: isPlatformKind(r.kind) ? (acceptances.get(r.id) ?? 0) : null,
  ackUnreviewed: r.ackUnreviewedAt !== null,
  updatedAt: r.updatedAt?.toISOString() ?? null,
});

/** `legal.manage` (PLA-§13.4): every kind × locale of R1 with its versions (ld_kind_status_idx), and the red lines. */
export async function listLegal(ctx: PlatformCtx): Promise<LegalList> {
  requireLegal(ctx);
  const rows = await db
    .select()
    .from(legalDocuments)
    .where(inArray(legalDocuments.kind, [...R1_LEGAL_KINDS]))
    .orderBy(desc(legalDocuments.version));
  const counts = await acceptanceCounts(rows.filter((r) => isPlatformKind(r.kind) && r.status !== "draft").map((r) => r.id));
  const groups: LegalGroup[] = [];
  for (const kind of R1_LEGAL_KINDS) {
    for (const locale of LEGAL_LOCALES) {
      const versions = rows.filter((r) => r.kind === kind && r.locale === locale).map((r) => versionRow(r, counts));
      groups.push({ kind, locale, versions, published: versions.find((v) => v.status === "published") ?? null, draft: versions.find((v) => v.status === "draft") ?? null });
    }
  }
  return { groups, missing: kindsWithoutPublished(rows.filter((r) => r.status === "published")) };
}

export interface LegalVersionDetail {
  doc: LegalVersionRow & { kind: R1LegalKind; locale: LegalLocale; body: string; summary: string | null; reviewedAt: string | null };
  /** the version before it of the same kind and locale, and the line diff against it */
  previous: { id: string; version: number } | null;
  diff: DiffOp[];
  diffStats: { added: number; removed: number };
  /** store templates: the placeholders the body names (shown as chips) */
  placeholders: string[];
}

/** `legal.manage`: one version with its line diff against the previous version (the editor). */
export async function getLegalVersion(ctx: PlatformCtx, id: string): Promise<LegalVersionDetail> {
  requireLegal(ctx);
  const row = await docById(id);
  const [prev] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.kind, row.kind), eq(legalDocuments.locale, row.locale), lteVersion(row.version - 1)))
    .orderBy(desc(legalDocuments.version))
    .limit(1);
  const counts = await acceptanceCounts(isPlatformKind(row.kind) ? [row.id] : []);
  const diff = lineDiff(prev?.body ?? "", row.body);
  return {
    doc: { ...versionRow(row, counts), kind: row.kind as R1LegalKind, locale: row.locale as LegalLocale, body: row.body, summary: row.summary, reviewedAt: row.reviewedAt?.toISOString() ?? null },
    previous: prev ? { id: prev.id, version: prev.version } : null,
    diff,
    diffStats: diffStats(diff),
    placeholders: isStoreKind(row.kind) ? templateFields(row.body) : [],
  };
}

const lteVersion = (v: number) => lte(legalDocuments.version, v);

async function docById(id: unknown): Promise<DocRow> {
  if (typeof id !== "string" || !/^[0-9A-Z]{26}$/.test(id)) throw new AuthRefusal("not_found");
  const [row] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, id)).limit(1);
  if (!row || !isR1LegalKind(row.kind)) throw new AuthRefusal("not_found");
  return row;
}

/* ------------------------------------------------------------------ */
/* Save, review, publish, retire (PLA-§13.4)                           */
/* ------------------------------------------------------------------ */

const DraftInput = z.object({
  kind: z.string(),
  locale: z.string(),
  title: z.string().max(LEGAL_TITLE_MAX * 4),
  body: z.string().max(LEGAL_BODY_MAX + 1_000),
  summary: z.string().max(LEGAL_SUMMARY_MAX * 4).nullish(),
  effectiveAt: z.union([z.string(), z.date(), z.null()]).optional(),
  requiresReacceptance: z.boolean().optional(),
  /** the newest version the editor loaded: a save against a newer one answers `conflict` */
  baseVersion: z.number().int().min(0).nullish(),
});

/** The body as stored: CRLF normalised, trailing spaces of each line dropped, at most 200,000 characters. */
const cleanBody = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, "");

const isDuplicate = (err: unknown) => {
  const e = err as { errno?: number; cause?: { errno?: number } } | null;
  return e?.errno === 1062 || e?.cause?.errno === 1062;
};

/**
 * `legal.manage` (PLA-§13.4 "Save draft"): edits the working draft of a kind and locale, or starts the next version
 * when the newest one is published or retired (versions are immutable once published). A changed text needs its
 * legal review again. Refused: DPA (R2), placeholders in a platform document, a placeholder P3 does not export, a
 * newer version than the one the editor loaded (`conflict`). Audit `platform.legal.saved`.
 */
export async function saveLegalDraft(ctx: PlatformCtx, input: unknown): Promise<{ id: string; version: number; created: boolean }> {
  requireLegal(ctx);
  const v = DraftInput.parse(input);
  if (v.kind === "dpa") throw new AuthRefusal("invalid", "console.legal.dpa_later");
  if (!isR1LegalKind(v.kind)) throw new FieldsError({ kind: "console.legal.kind_invalid" });
  if (!isLegalLocale(v.locale)) throw new FieldsError({ locale: "console.legal.locale_invalid" });
  const title = cleanText(v.title);
  if (title.length < 1 || title.length > LEGAL_TITLE_MAX) throw new FieldsError({ title: "console.legal.title_invalid" });
  const body = cleanBody(v.body);
  if (body.length < 1 || body.length > LEGAL_BODY_MAX) throw new FieldsError({ body: "console.legal.body_invalid" });
  const summary = v.summary ? cleanText(v.summary) || null : null;
  if (summary && summary.length > LEGAL_SUMMARY_MAX) throw new FieldsError({ summary: "console.legal.summary_invalid" });
  const problem = placeholderProblem(v.kind, body);
  if (problem) throw new FieldsError({ body: `console.legal.${problem.code}` });
  const effectiveAt = v.effectiveAt ? new Date(v.effectiveAt) : null;
  if (effectiveAt && !Number.isFinite(effectiveAt.getTime())) throw new FieldsError({ effectiveAt: "console.legal.effective_invalid" });
  const requiresReacceptance = isPlatformKind(v.kind) ? v.requiresReacceptance === true : false;
  const kind = v.kind;
  const locale = v.locale;

  let out: { id: string; version: number; created: boolean };
  try {
    out = await db.transaction(async (tx) => {
      const [latest] = await tx
        .select()
        .from(legalDocuments)
        .where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.locale, locale)))
        .orderBy(desc(legalDocuments.version))
        .limit(1)
        .for("update");
      if (v.baseVersion !== undefined && v.baseVersion !== null && (latest?.version ?? 0) !== v.baseVersion) throw new AuthRefusal("conflict", "console.legal.changed");
      if (latest && latest.status === "draft") {
        const textChanged = latest.body !== body || latest.title !== title;
        await tx
          .update(legalDocuments)
          .set({ title, body, summary, effectiveAt, requiresReacceptance, ...(textChanged ? { needsLegalReview: true, reviewedAt: null, reviewedBy: null } : {}) })
          .where(and(eq(legalDocuments.id, latest.id), eq(legalDocuments.status, "draft")));
        return { id: latest.id, version: latest.version, created: false };
      }
      const id = newId();
      const version = (latest?.version ?? 0) + 1;
      await tx.insert(legalDocuments).values({ id, kind, locale, version, title, body, summary, effectiveAt, requiresReacceptance, status: "draft", needsLegalReview: true, createdBy: ctx.user.id });
      return { id, version, created: true };
    });
  } catch (err) {
    if (isDuplicate(err)) throw new AuthRefusal("conflict", "console.legal.changed");
    throw err;
  }
  await auditFrom(ctx, "platform.legal.saved", { target: out.id, meta: { id: out.id, kind, locale, version: out.version, created: out.created } });
  return out;
}

/**
 * `legal.manage` (PLA-§13.4 "Mark reviewed by a lawyer", typed `reviewed`): sets `reviewed_at` / `reviewed_by` and
 * clears `needs_legal_review` on a draft or a published version. Audit `platform.legal.reviewed`.
 */
export async function markLegalReviewed(ctx: PlatformCtx, input: unknown): Promise<{ changed: boolean }> {
  requireLegal(ctx);
  const v = z.object({ id: id26, typed: z.string().max(40) }).parse(input);
  if (!typedMatches(v.typed, REVIEWED_WORD)) throw new FieldsError({ typed: "console.legal.typed_reviewed" });
  const row = await docById(v.id);
  if (row.status === "retired") throw new AuthRefusal("invalid", "console.legal.retired");
  const [res] = await db
    .update(legalDocuments)
    .set({ needsLegalReview: false, reviewedAt: new Date(), reviewedBy: ctx.user.id })
    .where(and(eq(legalDocuments.id, row.id), eq(legalDocuments.needsLegalReview, true), ne(legalDocuments.status, "retired")));
  if (res.affectedRows !== 1) return { changed: false };
  await auditFrom(ctx, "platform.legal.reviewed", { target: row.id, meta: { id: row.id, kind: row.kind, locale: row.locale, version: row.version } });
  return { changed: true };
}

const PublishInput = z.object({ id: id26, acknowledge: z.boolean().optional(), typed: z.string().max(40).optional() });

/**
 * `legal.manage` (PLA-§13.4 "Publish", PD17): a draft becomes the published version of its kind and locale (effective
 * now unless dated), and the version published before it becomes `retired`, in one transaction. A version still
 * needing legal review needs `acknowledge: true` and the typed words `publish unreviewed`, recorded as
 * `ack_unreviewed_by` / `_at`. Audit `platform.legal.published { unreviewed, retired }`; re-acceptance caches cleared.
 */
export async function publishLegal(ctx: PlatformCtx, input: unknown): Promise<{ id: string; version: number; retired: number; unreviewed: boolean }> {
  requireLegal(ctx);
  const v = PublishInput.parse(input);
  const row = await docById(v.id);
  if (row.status !== "draft") throw new AuthRefusal("invalid", "console.legal.not_draft");
  const unreviewed = row.needsLegalReview;
  if (unreviewed) {
    if (v.acknowledge !== true) throw new FieldsError({ acknowledge: "console.legal.ack_required" });
    if (!typedMatches(v.typed, PUBLISH_UNREVIEWED_WORD)) throw new FieldsError({ typed: "console.legal.typed_publish_unreviewed" });
  }
  const problem = placeholderProblem(row.kind, row.body);
  if (problem) throw new FieldsError({ body: `console.legal.${problem.code}` });
  const now = new Date();
  const retired = await db.transaction(async (tx) => {
    const [won] = await tx
      .update(legalDocuments)
      .set({ status: "published", publishedAt: now, effectiveAt: row.effectiveAt ?? now, ...(unreviewed ? { ackUnreviewedBy: ctx.user.id, ackUnreviewedAt: now } : {}) })
      .where(and(eq(legalDocuments.id, row.id), eq(legalDocuments.status, "draft"), eq(legalDocuments.needsLegalReview, unreviewed)));
    if (won.affectedRows !== 1) throw new AuthRefusal("conflict", "console.legal.changed");
    const [res] = await tx
      .update(legalDocuments)
      .set({ status: "retired" })
      .where(and(eq(legalDocuments.kind, row.kind), eq(legalDocuments.locale, row.locale), eq(legalDocuments.status, "published"), ne(legalDocuments.id, row.id)));
    return res.affectedRows;
  });
  reacceptCache.clear();
  await auditFrom(ctx, "platform.legal.published", { target: row.id, meta: { id: row.id, kind: row.kind, locale: row.locale, version: row.version, unreviewed, retired, requiresReacceptance: row.requiresReacceptance } });
  return { id: row.id, version: row.version, retired, unreviewed };
}

/**
 * `legal.manage` (PLA-§13.4 "Retire"): a draft is discarded (retired); a published version retires only while another
 * version of its kind and locale is published, so retiring never leaves sign-up without a document by hand. Audit
 * `platform.legal.retired`.
 */
export async function retireLegal(ctx: PlatformCtx, input: unknown): Promise<{ retired: boolean }> {
  requireLegal(ctx);
  const { id } = z.object({ id: id26 }).parse(input);
  const row = await docById(id);
  if (row.status === "retired") return { retired: false };
  if (row.status === "published") {
    const [other] = await db
      .select({ id: legalDocuments.id })
      .from(legalDocuments)
      .where(and(eq(legalDocuments.kind, row.kind), eq(legalDocuments.locale, row.locale), eq(legalDocuments.status, "published"), ne(legalDocuments.id, row.id)))
      .limit(1);
    if (!other) throw new AuthRefusal("invalid", "console.legal.retire_last_published");
  }
  const [res] = await db.update(legalDocuments).set({ status: "retired" }).where(and(eq(legalDocuments.id, row.id), eq(legalDocuments.status, row.status)));
  if (res.affectedRows !== 1) return { retired: false };
  if (row.status === "published") reacceptCache.clear();
  await auditFrom(ctx, "platform.legal.retired", { target: row.id, meta: { id: row.id, kind: row.kind, locale: row.locale, version: row.version, from: row.status } });
  return { retired: true };
}
