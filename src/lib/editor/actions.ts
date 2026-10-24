"use server";
/**
 * Server actions of the page builder. Every action: requireUser (permission) → zod input →
 * persistence (./pages.server) → audit for meaningful changes → a plain ActionResult (never throws
 * to the client, except Next's own control-flow errors).
 *
 * Draft autosaves are audited only when they create an autosave version or overwrite a conflict —
 * auditing every 1.5 s keystroke burst would drown the log.
 */
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { ActionError } from "@/lib/admin-data/action";
import { legacyReadCtx, legacyWriteCtx } from "@/lib/admin-data/legacy-store";
import { unpublishPage as unpublishPageRow } from "@/lib/admin-data/pages";
import { auditIn } from "@/lib/admin-data/store-audit";
import { audit } from "@/lib/audit";
import { AuthError, getRequestContext, requireUser, type Permission, type SessionUser } from "@/lib/auth";
import { errorSummary } from "@/lib/orders/log";
import type { PageDoc } from "@/lib/page/schema";
import { publishPage, PublishError } from "@/lib/render/publish.server";
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

/** Auth + input parsing + uniform error mapping around one action body. */
async function run<S extends z.ZodType, T extends object>(
  permission: Permission,
  schema: S,
  raw: unknown,
  body: (user: SessionUser, input: z.output<S>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const user = await requireUser({ permission, throwOnFail: true });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail("invalid", first?.message ?? "Invalid request.", {
        issues: parsed.error.issues.slice(0, 8).map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
      });
    }
    return await body(user, parsed.data);
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AuthError) {
      return err.code === "forbidden"
        ? fail("forbidden", "You don't have permission to do this.")
        : fail("auth", "Your session has ended. Sign in again in a new tab, then retry.");
    }
    if (err instanceof EditorError) return fail(err.code, err.message, err.extra);
    // a refusal of store #1's seam (legacyWriteCtx: read-only store, plan, unavailable)
    if (err instanceof ActionError) return fail("forbidden", err.message);
    if (err instanceof PublishError) {
      if (err.code === "conflict") return changedElsewhere(err.serverUpdatedAt ?? 0);
      return fail(err.code === "not_found" ? "not_found" : "publish_failed", err.message, {
        issues: err.issues.filter((i) => i.level === "error").slice(0, 12).map((i) => ({ path: i.path, message: i.message, sectionId: i.sectionId })),
      });
    }
    console.error("[builder] action failed:", errorSummary(err));
    return fail("server", "Something went wrong on the server. Your changes are kept here — try again.");
  }
}

/** The saved draft is not the one this editor last saved (another tab, a teammate, a restore). */
function changedElsewhere(serverUpdatedAt: number): ActionFailure {
  return fail("conflict", "This page was changed somewhere else. Load the latest version or keep yours, then try again.", { serverUpdatedAt });
}

async function ip(): Promise<string> {
  return (await getRequestContext()).ip;
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

/** Fresh bootstrap of a page (reload after a conflict). */
export async function loadPage(raw: z.input<typeof PageRefInput>): Promise<ActionResult<{ boot: EditorBootstrap }>> {
  return run("pages.read", PageRefInput, raw, async (user, { pageId }) => {
    const { scope } = await legacyReadCtx("pages.read");
    const boot = await loadBootstrap(scope, pageId, user);
    return boot ? { ok: true, boot } : fail("not_found", "This page no longer exists.");
  });
}

/** Autosave / manual save of the draft with optimistic concurrency. */
export async function saveDraft(raw: z.input<typeof SaveDraftInput>): Promise<ActionResult<{ updatedAt: number; version: VersionSummary | null }>> {
  return run("pages.write", SaveDraftInput, raw, async (user, input) => {
    const res = await saveDraftRow(user, input);
    if (res.version || res.forced) {
      await audit(res.forced ? "page.draft_overwritten" : "page.autosaved", { userId: user.id, target: input.pageId, meta: res.version ? { versionId: res.version.id } : null, ip: await ip() });
    }
    return { ok: true, updatedAt: res.updatedAt, version: res.version };
  });
}

/** Named snapshot of the current (saved) draft (`reuse`: the newest version when it is identical). */
export async function createVersion(raw: z.input<typeof CreateVersionInput>): Promise<ActionResult<{ version: VersionSummary; created: boolean }>> {
  return run("pages.write", CreateVersionInput, raw, async (user, input) => {
    const { version, created } = await createVersionRow(user, input.pageId, input.kind, input.label ?? null, { reuse: input.reuse });
    if (created) await audit("page.version_created", { userId: user.id, target: input.pageId, meta: { versionId: version.id, kind: input.kind }, ip: await ip() });
    return { ok: true, version, created };
  });
}

export async function listVersions(raw: z.input<typeof ListVersionsInput>): Promise<ActionResult<{ versions: VersionSummary[]; hasMore: boolean }>> {
  return run("pages.read", ListVersionsInput, raw, async (_user, input) => {
    const res = await listVersionSummaries(input.pageId, { before: input.before, limit: input.limit });
    return { ok: true, versions: res.items, hasMore: res.hasMore };
  });
}

/** A version's document + its asset rows (versions drawer thumbnail). */
export async function getVersionPreview(raw: z.input<typeof VersionRefInput>): Promise<ActionResult<{ doc: PageDoc; assets: Record<string, EditorAsset> }>> {
  return run("pages.read", VersionRefInput, raw, async (_user, input) => {
    const { scope } = await legacyReadCtx("pages.read");
    const res = await versionPreview(scope, input.pageId, input.versionId);
    return res ? { ok: true, ...res } : fail("not_found", "This version cannot be previewed.");
  });
}

export async function restoreVersion(
  raw: z.input<typeof RestoreVersionInput>,
): Promise<ActionResult<{ doc: PageDoc; updatedAt: number; versions: VersionSummary[]; assets: Record<string, EditorAsset> }>> {
  return run("pages.write", RestoreVersionInput, raw, async (user, input) => {
    const { scope } = await legacyWriteCtx("pages.write");
    const res = await restoreVersionRow(scope, user, input);
    await audit("page.version_restored", { userId: user.id, target: input.pageId, meta: { versionId: input.versionId }, ip: await ip() });
    return { ok: true, ...res };
  });
}

export async function starVersion(raw: z.input<typeof StarVersionInput>): Promise<ActionResult> {
  return run("pages.write", StarVersionInput, raw, async (_user, input) => {
    await setVersionStar(input.pageId, input.versionId, input.starred);
    return { ok: true };
  });
}

export async function renameVersion(raw: z.input<typeof RenameVersionInput>): Promise<ActionResult> {
  return run("pages.write", RenameVersionInput, raw, async (user, input) => {
    await renameVersionRow(input.pageId, input.versionId, input.label);
    await audit("page.version_renamed", { userId: user.id, target: input.pageId, meta: { versionId: input.versionId }, ip: await ip() });
    return { ok: true };
  });
}

/** New draft page from this page (or one of its versions). */
export async function duplicatePage(raw: z.input<typeof DuplicatePageInput>): Promise<ActionResult<{ pageId: string; slug: string }>> {
  return run("pages.write", DuplicatePageInput, raw, async (_user, input) => {
    const { scope, actor } = await legacyWriteCtx("pages.write");
    const created = await duplicateAsPage(scope, actor, input);
    await auditIn(scope, actor, "page.duplicated", { target: created.id, meta: { from: input.pageId, versionId: input.versionId ?? null } });
    return { ok: true, pageId: created.id, slug: created.slug };
  });
}

/**
 * Rename / move a page. Moving a published page re-publishes it at once (the thank-you link and
 * canonical URL inside the published HTML depend on the address); if that fails the old address is
 * put back, so a live page never ends up half-moved.
 */
export async function updatePageMeta(raw: z.input<typeof UpdatePageMetaInput>): Promise<ActionResult<{ page: EditorPageMeta; republished: VersionSummary | null }>> {
  return run("pages.write", UpdatePageMetaInput, raw, async (user, input) => {
    if (input.name === undefined && input.slug === undefined) return fail("invalid", "Nothing to change.");
    const before = await currentMeta(input.pageId);
    if (!before) return fail("not_found", "This page no longer exists.");
    const moving = input.slug !== undefined && input.slug !== before.slug;
    if (moving && before.status === "published") {
      // re-publishing needs the publish permission too, and must not publish a draft saved elsewhere
      await requireUser({ permission: "pages.publish", throwOnFail: true });
      if (input.baseUpdatedAt !== undefined && input.baseUpdatedAt !== before.updatedAt) return changedElsewhere(before.updatedAt);
    }
    const res = await updateMeta(input.pageId, { name: input.name, slug: input.slug });
    let republished: VersionSummary | null = null;
    if (res.slugChanged && before.status === "published") {
      try {
        const pub = await publishPage(input.pageId, user.id);
        republished = (await versionsByIds([pub.versionId]))[0] ?? null;
      } catch (err) {
        await revertSlug(input.pageId, res.previousSlug);
        throw err;
      }
    }
    await audit("page.meta_updated", {
      userId: user.id,
      target: input.pageId,
      meta: { name: input.name !== undefined, slug: res.slugChanged ? { from: res.previousSlug, to: input.slug } : null, republished: !!republished },
      ip: await ip(),
    });
    const page = (await currentMeta(input.pageId)) ?? res.page;
    return { ok: true, page, republished };
  });
}

/** Publish the saved draft (the client flushes its autosave first). */
export async function publish(raw: z.input<typeof PublishInput>): Promise<
  ActionResult<{ page: EditorPageMeta; version: VersionSummary | null; warnings: number; skippedSections: string[] }>
> {
  return run("pages.publish", PublishInput, raw, async (user, { pageId, baseUpdatedAt }) => {
    // publishPage checks the stamp before rendering and again under a row lock when it writes
    // (PublishError "conflict" → changedElsewhere), so only the draft this editor saved goes live
    const res = await publishPage(pageId, user.id, { expectedUpdatedAt: baseUpdatedAt });
    const [page, version] = await Promise.all([currentMeta(pageId), versionsByIds([res.versionId])]);
    if (!page) return fail("not_found", "This page no longer exists.");
    return {
      ok: true,
      page,
      version: version[0] ?? null,
      warnings: res.issues.filter((i) => i.level === "warning").length,
      skippedSections: res.renderIssues.map((i) => i.sectionId),
    };
  });
}

/**
 * Take the page offline (the address and every version are kept). Unpublishing leaves the draft
 * stamp (updatedAt) alone; `draftChangedElsewhere` tells the editor whether the stamp it gets back
 * is its own (adopt it) or another save's (keep its own, so the next save reports the conflict).
 */
export async function unpublish(raw: z.input<typeof UnpublishInput>): Promise<ActionResult<{ page: EditorPageMeta; draftChangedElsewhere: boolean }>> {
  return run("pages.publish", UnpublishInput, raw, async (_user, { pageId, baseUpdatedAt }) => {
    const { scope, actor } = await legacyWriteCtx("pages.publish");
    const before = await currentMeta(pageId);
    if (!before) return fail("not_found", "This page no longer exists.");
    // unpublishPageRow (store-scoped) invalidates the serving cache and writes the audit entry
    await unpublishPageRow(scope, pageId, actor);
    const page = await currentMeta(pageId);
    if (!page) return fail("not_found", "This page no longer exists.");
    return { ok: true, page, draftChangedElsewhere: baseUpdatedAt !== undefined && baseUpdatedAt !== before.updatedAt };
  });
}
