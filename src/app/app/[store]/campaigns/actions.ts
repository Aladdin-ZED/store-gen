"use server";
/**
 * Campaign Kit mutations of the store on screen (P3 LANDING, wave 2; landing.md LAN-§13.1, §13.4, §13.5; core §I.1
 * `/app/<h>/campaigns`, edit `campaigns.write`). Each one is `storeAction(permission)` (the seam: the signed request
 * path's store, the member's grant) around the service (src/lib/campaigns/*.server.ts), which checks every id inside
 * the store (another store's id answers `not_found`), charges and refunds the gauges and writes the audit rows. A
 * refused charge answers `quota` (the screen opens the limit sheet).
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { refineKitWithCloud, type CloudKitResult } from "@/lib/campaigns/cloud.server";
import { createCampaign, endCampaign, pauseCampaign, recompileCampaign, setCampaignLive, type CreateCampaignInput } from "@/lib/campaigns/service.server";
import { createShare, revokeShare } from "@/lib/campaigns/share.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { platformOrigin } from "@/lib/urls";

const refresh = (handle: string, id?: string) => (id ? revalidateStore(handle, "/campaigns", `/campaigns/${id}`) : revalidateStore(handle, "/campaigns"));

export async function createCampaignAction(input: CreateCampaignInput): Promise<ActionResult<{ id: string; slug: string }>> {
  return storeAction("campaigns.write", async (ctx) => {
    const made = await createCampaign(ctx, input);
    refresh(ctx.store.handle);
    return { id: made.id, slug: made.slug };
  });
}

export async function recompileCampaignAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await recompileCampaign(ctx, String(id));
    refresh(ctx.store.handle, String(id));
    return null;
  });
}

export async function goLiveAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await setCampaignLive(ctx, String(id));
    refresh(ctx.store.handle, String(id));
    return null;
  });
}

export async function pauseCampaignAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await pauseCampaign(ctx, String(id));
    refresh(ctx.store.handle, String(id));
    return null;
  });
}

export async function endCampaignAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await endCampaign(ctx, String(id));
    refresh(ctx.store.handle, String(id));
    return null;
  });
}

/** A new read-only link `/kit/<token>` on the platform host; the token is answered once and never stored. */
export async function shareCampaignAction(id: string): Promise<ActionResult<{ url: string }>> {
  return storeAction("campaigns.write", async (ctx) => {
    const { token } = await createShare(ctx, String(id));
    refresh(ctx.store.handle, String(id));
    return { url: `${platformOrigin()}/kit/${token}` };
  });
}

export async function revokeShareAction(id: string): Promise<ActionResult<null>> {
  return storeAction("campaigns.write", async (ctx) => {
    await revokeShare(ctx, String(id));
    refresh(ctx.store.handle, String(id));
    return null;
  });
}

/** The Cloud brief and objection answers (pattern A); answers the template when Cloud AI is off or refuses. */
export async function refineKitAction(id: string): Promise<ActionResult<CloudKitResult>> {
  return storeAction("campaigns.write", async (ctx) => refineKitWithCloud(ctx, String(id)));
}
