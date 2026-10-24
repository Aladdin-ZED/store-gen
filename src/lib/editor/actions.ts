"use server";
/**
 * Server actions of the page builder (`/app/<handle>/pages/<id>/edit`). Every action goes through the store's seam
 * with its permission key (`storeAction`, docs/STORE-SAAS.md §E.2; LND-23): the store is the signed request path's,
 * never the browser's, and every page or version id is looked up in that store (another store's id answers like a
 * missing one). Then zod input → persistence (./pages.server, scoped) → audit in the store for meaningful changes →
 * a plain builder ActionResult (never throws to the client, except Next's own control-flow errors).
 *
 * Draft autosaves are audited only when they create an autosave version or overwrite a conflict —
 * auditing every 1.5 s keystroke burst would drown the log.
 */
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { unpublishPage as unpublishPageRow } from "@/lib/admin-data/pages";
import { auditIn } from "@/lib/admin-data/store-audit";
import { errorSummary } from "@/lib/orders/log";
import type { PageDoc } from "@/lib/page/schema";
import { publishPage, PublishError } from "@/lib/render/publish.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult as SeamResult, GateItem, StoreCtx, WriteCtx } from "@/lib/tenancy/types";
import {
  createVersion as createVersionRow,
  currentMeta,
  duplicateAsPage,
  EditorError,
  loadBootstrap,
  renameVersion as renameVersionRow,
  restoreVersion as restoreVersionRow,
  revertSlug,
  saveDraft as saveDraftRow,
  setVersionStar,
  updateMeta,
  versionPreview,
  versionsByIds,
  listVersionSummaries,
} from "./pages.server";
import {
  CreateVersionInput,
  DuplicatePageInput,
  ListVersionsInput,
  PageRefInput,
  PublishInput,
  RenameVersionInput,
  RestoreVersionInput,
  SaveDraftInput,
  StarVersionInput,
  UnpublishInput,
  UpdatePageMetaInput,
  VersionRefInput,
} from "./schemas";
import type { ActionFailure, ActionResult, EditorAsset, EditorBootstrap, EditorPageMeta, VersionSummary } from "./types";

/* ------------------------------------------------------------------ */
/* plumbing                                                            */
/* ------------------------------------------------------------------ */

function fail(error: ActionFailure["error"], message: string, extra: Partial<ActionFailure> = {}): ActionFailure {
  return { ok: false, error, message, ...extra };
}

/** The saved draft is not the one this editor last saved (another tab, a teammate, a restore). */
function changedElsewhere(serverUpdatedAt: number): ActionFailure {
  return fail("conflict", "This page was changed somewhere else. Load the latest version or keep yours, then try again.", { serverUpdatedAt });
}

/** What a refusal of the seam tells the builder (the store's state, the role, the plan, the session). */
const REFUSED: Record<string, string> = {
  read_only: "This store is read-only right now: nothing can be changed.",
  impersonation_read_only: "This is a read-only view of the store.",
  feature_off: "This isn't included in the store's plan.",
  quota: "You've reached a limit of your plan.",
  step_up: "Confirm it's you, then try again.",
};

/** The publish gates' refusal codes (§M.1): their result carries `items`, listed one per row by the publish dialog. */
const GATE_CODES = new Set<string>(["budget_blocked", "honesty_blocked", "design_blocked"]);
type GateCode = "budget_blocked" | "honesty_blocked" | "design_blocked";

const GATE_MESSAGE: Record<GateCode, string> = {
  budget_blocked: "This page is too heavy to publish yet. Fix the items below, then publish again.",
  honesty_blocked: "Some content can't go live as it is. Fix the items below, then publish again.",
  design_blocked: "The design needs a change before it goes live. Fix the items below, then publish again.",
};

const isGateItems = (v: unknown): v is GateItem[] =>
  Array.isArray(v) && v.every((i) => !!i && typeof (i as GateItem).id === "string" && ((i as GateItem).level === "hard" || (i as GateItem).level === "soft"));

/** A gate refusal as the builder's failure (from the seam's result, or thrown by the publisher inside the body). */
function gateFailure(code: GateCode, items: unknown): ActionFailure {
  return fail(code, GATE_MESSAGE[code], { items: isGateItems(items) ? items.slice(0, 40) : [] });
}

/** A refusal thrown by `publishPage` (T3): any error with a gate `code` and its `items` (CCR r1.0-t4-12). */
function thrownGate(err: unknown): ActionFailure | null {
  if (!err || typeof err !== "object") return null;
  const { code, items } = err as { code?: unknown; items?: unknown };
  return typeof code === "string" && GATE_CODES.has(code) ? gateFailure(code as GateCode, items) : null;
}

/** The builder's answer for a failed seam call (the body never reached, or a mapped error). */
function seamFailure(res: Extract<SeamResult<unknown>, { ok: false }>): ActionFailure {
  if (GATE_CODES.has(res.error)) return gateFailure(res.error as GateCode, res.items);
  if (res.message === "error.session_ended") return fail("auth", "Your session has ended. Sign in again in a new tab, then retry.");
  if (res.error === "forbidden") return fail("forbidden", "You don't have permission to do this.");
  if (res.error === "not_found") return fail("not_found", "This page isn't available in this store.");
  if (res.error === "invalid") return fail("invalid", res.message ?? "Invalid request.");
  const refused = REFUSED[res.error];
  return refused ? fail("forbidden", refused) : fail("server", "Something went wrong on the server. Your changes are kept here — try again.");
}

/** Errors of the body as builder failures (inside the seam call, so they never reach its generic mapping). */
function bodyFailure(err: unknown): ActionFailure {
  if (err instanceof EditorError) return fail(err.code, err.message, err.extra);
  const gate = thrownGate(err);
  if (gate) return gate;
  if (err instanceof PublishError) {
    if (err.code === "conflict") return changedElsewhere(err.serverUpdatedAt ?? 0);
    return fail(err.code === "not_found" ? "not_found" : "publish_failed", err.message, {
      issues: err.issues.filter((i) => i.level === "error").slice(0, 12).map((i) => ({ path: i.path, message: i.message, sectionId: i.sectionId })),
    });
  }
  console.error("[builder] action failed:", errorSummary(err));
  return fail("server", "Something went wrong on the server. Your changes are kept here — try again.");
}

function invalidInput(error: z.ZodError): ActionFailure {
  const first = error.issues[0];
  return fail("invalid", first?.message ?? "Invalid request.", {
    issues: error.issues.slice(0, 8).map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
  });
}

/** The body under the seam: input parsing, then the work, its errors turned into builder failures. */
function guarded<S extends z.ZodType, T extends object, C extends StoreCtx>(schema: S, raw: unknown, body: (ctx: C, input: z.output<S>) => Promise<ActionResult<T>>) {
  return async (ctx: C): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return invalidInput(parsed.error);
    try {
      return await body(ctx, parsed.data);
    } catch (err) {
      // Next's control flow (redirect, notFound) must reach the seam's own rethrow
      unstable_rethrow(err);
      return bodyFailure(err);
    }
  };
}

const answer = <T extends object>(res: SeamResult<ActionResult<T>>): ActionResult<T> => (res.ok ? res.data : seamFailure(res));

/*
 * Every action reads `return storeAction(<key>, reads|writes(schema, raw, body)).then(answer)`: the seam call opens
 * the body (lint L9, AUTH-31), `reads` types the ctx a read key gives (StoreCtx), `writes` the one a write key gives
 * (WriteCtx: a read-only view can never reach the body), `answer` turns a refusal into the builder's failure.
 */

/** The body of a builder action that only reads. */
const reads = <S extends z.ZodType, T extends object>(schema: S, raw: unknown, body: (ctx: StoreCtx, input: z.output<S>) => Promise<ActionResult<T>>) =>
  guarded<S, T, StoreCtx>(schema, raw, body);

/** The body of a builder action that writes. */
const writes = <S extends z.ZodType, T extends object>(schema: S, raw: unknown, body: (ctx: WriteCtx, input: z.output<S>) => Promise<ActionResult<T>>) =>
  guarded<S, T, WriteCtx>(schema, raw, body);

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

/** Fresh bootstrap of a page (reload after a conflict). */
export async function loadPage(raw: z.input<typeof PageRefInput>): Promise<ActionResult<{ boot: EditorBootstrap }>> {
  return storeAction("pages.read", reads(PageRefInput, raw, async (ctx, { pageId }) => {
    const boot = await loadBootstrap(ctx, pageId);
    return boot ? { ok: true, boot } : fail("not_found", "This page no longer exists.");
  })).then(answer);
}

/** Autosave / manual save of the draft with optimistic concurrency. */
export async function saveDraft(raw: z.input<typeof SaveDraftInput>): Promise<ActionResult<{ updatedAt: number; version: VersionSummary | null }>> {
  return storeAction("pages.write", writes(SaveDraftInput, raw, async ({ scope, user, actor }, input) => {
    const res = await saveDraftRow(scope, user, input);
    if (res.version || res.forced) {
      await auditIn(scope, actor, res.forced ? "page.draft_overwritten" : "page.autosaved", { target: input.pageId, meta: res.version ? { versionId: res.version.id } : null });
    }
    return { ok: true, updatedAt: res.updatedAt, version: res.version };
  })).then(answer);
}

/** Named snapshot of the current (saved) draft (`reuse`: the newest version when it is identical). */
export async function createVersion(raw: z.input<typeof CreateVersionInput>): Promise<ActionResult<{ version: VersionSummary; created: boolean }>> {
  return storeAction("pages.write", writes(CreateVersionInput, raw, async ({ scope, user, actor }, input) => {
    const { version, created } = await createVersionRow(scope, user, input.pageId, input.kind, input.label ?? null, { reuse: input.reuse });
    if (created) await auditIn(scope, actor, "page.version_created", { target: input.pageId, meta: { versionId: version.id, kind: input.kind } });
    return { ok: true, version, created };
  })).then(answer);
}

export async function listVersions(raw: z.input<typeof ListVersionsInput>): Promise<ActionResult<{ versions: VersionSummary[]; hasMore: boolean }>> {
  return storeAction("pages.read", reads(ListVersionsInput, raw, async ({ scope }, input) => {
    const res = await listVersionSummaries(scope, input.pageId, { before: input.before, limit: input.limit });
    return { ok: true, versions: res.items, hasMore: res.hasMore };
  })).then(answer);
}

/** A version's document + its asset rows (versions drawer thumbnail). */
export async function getVersionPreview(raw: z.input<typeof VersionRefInput>): Promise<ActionResult<{ doc: PageDoc; assets: Record<string, EditorAsset> }>> {
  return storeAction("pages.read", reads(VersionRefInput, raw, async ({ scope }, input) => {
    const res = await versionPreview(scope, input.pageId, input.versionId);
    return res ? { ok: true, ...res } : fail("not_found", "This version cannot be previewed.");
  })).then(answer);
}

export async function restoreVersion(
  raw: z.input<typeof RestoreVersionInput>,
): Promise<ActionResult<{ doc: PageDoc; updatedAt: number; versions: VersionSummary[]; assets: Record<string, EditorAsset> }>> {
  return storeAction("pages.write", writes(RestoreVersionInput, raw, async ({ scope, user, actor }, input) => {
    const res = await restoreVersionRow(scope, user, input);
    await auditIn(scope, actor, "page.version_restored", { target: input.pageId, meta: { versionId: input.versionId } });
    return { ok: true, ...res };
  })).then(answer);
}

export async function starVersion(raw: z.input<typeof StarVersionInput>): Promise<ActionResult> {
  return storeAction("pages.write", writes(StarVersionInput, raw, async ({ scope }, input) => {
    await setVersionStar(scope, input.pageId, input.versionId, input.starred);
    return { ok: true };
  })).then(answer);
}

export async function renameVersion(raw: z.input<typeof RenameVersionInput>): Promise<ActionResult> {
  return storeAction("pages.write", writes(RenameVersionInput, raw, async ({ scope, actor }, input) => {
    await renameVersionRow(scope, input.pageId, input.versionId, input.label);
    await auditIn(scope, actor, "page.version_renamed", { target: input.pageId, meta: { versionId: input.versionId } });
    return { ok: true };
  })).then(answer);
}

/** New draft page of the store from this page (or one of its versions). */
export async function duplicatePage(raw: z.input<typeof DuplicatePageInput>): Promise<ActionResult<{ pageId: string; slug: string }>> {
  return storeAction("pages.write", writes(DuplicatePageInput, raw, async ({ scope, actor }, input) => {
    const created = await duplicateAsPage(scope, actor, input);
    await auditIn(scope, actor, "page.duplicated", { target: created.id, meta: { from: input.pageId, versionId: input.versionId ?? null } });
    return { ok: true, pageId: created.id, slug: created.slug };
  })).then(answer);
}

/**
 * Rename / move a page. Moving a published page re-publishes it at once (the thank-you link and
 * canonical URL inside the published HTML depend on the address); if that fails the old address is
 * put back, so a live page never ends up half-moved.
 */
export async function updatePageMeta(raw: z.input<typeof UpdatePageMetaInput>): Promise<ActionResult<{ page: EditorPageMeta; republished: VersionSummary | null }>> {
  return storeAction("pages.write", writes(UpdatePageMetaInput, raw, async (ctx, input) => {
    const { scope, actor } = ctx;
    if (input.name === undefined && input.slug === undefined) return fail("invalid", "Nothing to change.");
    const before = await currentMeta(scope, input.pageId);
    if (!before) return fail("not_found", "This page no longer exists.");
    const moving = input.slug !== undefined && input.slug !== before.slug;
    if (moving && before.status === "published") {
      // re-publishing needs the publish permission too, and must not publish a draft saved elsewhere
      if (!ctx.can("pages.publish")) return fail("forbidden", "Your role can't move a live page: it would publish it again.");
      if (input.baseUpdatedAt !== undefined && input.baseUpdatedAt !== before.updatedAt) return changedElsewhere(before.updatedAt);
    }
    const res = await updateMeta(scope, input.pageId, { name: input.name, slug: input.slug });
    let republished: VersionSummary | null = null;
    if (res.slugChanged && before.status === "published") {
      try {
        const pub = await publishPage(scope, input.pageId, { actor });
        republished = (await versionsByIds(scope, [pub.versionId]))[0] ?? null;
      } catch (err) {
        await revertSlug(scope, input.pageId, res.previousSlug);
        throw err;
      }
    }
    await auditIn(scope, actor, "page.meta_updated", {
      target: input.pageId,
      meta: { name: input.name !== undefined, slug: res.slugChanged ? { from: res.previousSlug, to: input.slug } : null, republished: !!republished },
    });
    // the old address keeps answering (308) for 12 months (LAN-§15.1, LAN-§23.6)
    if (res.historyKept) await auditIn(scope, actor, "page.slug_moved", { target: input.pageId, meta: { from: res.previousSlug, to: input.slug } });
    const page = (await currentMeta(scope, input.pageId)) ?? res.page;
    return { ok: true, page, republished };
  })).then(answer);
}

/**
 * Publish the saved draft (the client flushes its autosave first). A refusal of the publish gates (§M.1) answers its
 * code with every item, which the publish dialog lists with one fix each.
 */
export async function publish(raw: z.input<typeof PublishInput>): Promise<
  ActionResult<{ page: EditorPageMeta; version: VersionSummary | null; warnings: number; skippedSections: string[] }>
> {
  return storeAction("pages.publish", writes(PublishInput, raw, async ({ scope, actor }, { pageId, baseUpdatedAt }) => {
    // the store's publish (T3) checks the stamp before rendering and again under a row lock when it writes
    // (PublishError "conflict" → changedElsewhere), so only the draft this editor saved goes live
    const res = await publishPage(scope, pageId, { actor, expectedUpdatedAt: baseUpdatedAt });
    const [page, version] = await Promise.all([currentMeta(scope, pageId), versionsByIds(scope, [res.versionId])]);
    if (!page) return fail("not_found", "This page no longer exists.");
    return {
      ok: true,
      page,
      version: version[0] ?? null,
      warnings: res.issues.filter((i) => i.level === "warning").length,
      skippedSections: res.renderIssues.map((i) => i.sectionId),
    };
  })).then(answer);
}

/**
 * Take the page offline (the address and every version are kept). Unpublishing leaves the draft
 * stamp (updatedAt) alone; `draftChangedElsewhere` tells the editor whether the stamp it gets back
 * is its own (adopt it) or another save's (keep its own, so the next save reports the conflict).
 */
export async function unpublish(raw: z.input<typeof UnpublishInput>): Promise<ActionResult<{ page: EditorPageMeta; draftChangedElsewhere: boolean }>> {
  return storeAction("pages.publish", writes(UnpublishInput, raw, async ({ scope, actor }, { pageId, baseUpdatedAt }) => {
    const before = await currentMeta(scope, pageId);
    if (!before) return fail("not_found", "This page no longer exists.");
    // unpublishPageRow (store-scoped) invalidates the serving cache and writes the audit entry
    await unpublishPageRow(scope, pageId, actor);
    const page = await currentMeta(scope, pageId);
    if (!page) return fail("not_found", "This page no longer exists.");
    return { ok: true, page, draftChangedElsewhere: baseUpdatedAt !== undefined && baseUpdatedAt !== before.updatedAt };
  })).then(answer);
}
