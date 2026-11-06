"use server";
/**
 * Short-link mutations of the store on screen (P3 LANDING; landing.md LAN-§12.2, LD40; core §I.1 `/app/<h>/links`,
 * edit `campaigns.write`). Each one is `storeAction(permission)` (the seam: the signed request path's store, the
 * member's grant) around the service (src/lib/links/service.server.ts), which checks every id inside the store
 * (another store's id answers `not_found` like a missing one), charges and refunds the `short_links` gauge and writes
 * the audit rows. A refused charge answers `quota` (the screen opens the limit sheet).
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { createShortLink, deleteShortLink, editTarget, pauseShortLink, resumeShortLink, type CreateLinkInput, type LinkTargetInput } from "@/lib/links/service.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import type { z } from "zod";

const refresh = (handle: string) => revalidateStore(handle, "/links");

export async function createLinkAction(input: CreateLinkInput): Promise<ActionResult<{ id: string; code: string; url: string }>> {
  return storeAction("campaigns.write", async (ctx) => {
    const created = await createShortLink(ctx, input);
    refresh(ctx.store.handle);
    return { ...created, url: storeUrl(ctx.store, `/go/${created.code}`) };
  });
}

export async function pauseLinkAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await pauseShortLink(ctx, String(id));
    refresh(ctx.store.handle);
    return null;
  });
}

export async function resumeLinkAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await resumeShortLink(ctx, String(id));
    refresh(ctx.store.handle);
    return null;
  });
}

export async function deleteLinkAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await deleteShortLink(ctx, String(id));
    refresh(ctx.store.handle);
    return null;
  });
}

export async function editLinkTargetAction(id: string, target: z.input<typeof LinkTargetInput>): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await editTarget(ctx, String(id), target);
    refresh(ctx.store.handle);
    return null;
  });
}
