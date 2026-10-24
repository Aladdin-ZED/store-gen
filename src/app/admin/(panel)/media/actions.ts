"use server";
/**
 * Media library actions of store #1 (the legacy panel, §K.1 T4) that aren't uploads (those go through
 * /api/app/<handle>/media): alt text, and the usage lookup shown before a file is deleted. The store's ctx comes from the
 * seam; the alt write audits inside the repository.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, fail, type ActionResult } from "@/lib/admin-data/action";
import { ALT_MAX, assetUsage, cleanAlt, setAssetAlt, type AssetUsage } from "@/lib/admin-data/assets";
import { legacyReadCtx, legacyWriteCtx } from "@/lib/admin-data/legacy-store";

const AssetId = z.string().regex(/^[a-f0-9]{16,64}$/, { error: "Unknown file." });
const Alt = z.string().max(ALT_MAX * 2, { error: `Keep the alt text under ${ALT_MAX} characters.` });

/** Pages (and the store logo) that use a file — shown before deleting it. */
export async function getAssetUsageAction(id: string): Promise<ActionResult<AssetUsage>> {
  return adminAction("pages.read", async () => {
    const { scope } = await legacyReadCtx("media.read");
    return assetUsage(scope, AssetId.parse(id));
  });
}

export async function setAssetAltAction(id: string, alt: string): Promise<ActionResult<{ alt: string }>> {
  return adminAction("media.write", async () => {
    const { scope, actor } = await legacyWriteCtx("media.write");
    const assetId = AssetId.parse(id);
    const value = cleanAlt(Alt.parse(alt));
    if (!(await setAssetAlt(scope, assetId, value, actor))) fail("This file no longer exists.");
    revalidatePath("/admin/media");
    return { alt: value };
  });
}
