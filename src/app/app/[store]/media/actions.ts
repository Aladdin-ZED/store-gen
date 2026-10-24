"use server";
/**
 * Media library actions of the store on screen that aren't uploads (those go through /api/app/<handle>/media): alt
 * text, and the usage lookup shown before a file is deleted. The store's ctx comes from the seam (the signed request
 * path); the alt write audits inside the repository, and another store's asset id answers like a missing one.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { ALT_MAX, assetUsage, cleanAlt, setAssetAlt, type AssetUsage } from "@/lib/admin-data/assets";
import { revalidateStore } from "@/lib/admin-data/shell";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const AssetId = z.string().regex(/^[a-f0-9]{16,64}$/, { error: "Unknown file." });
const Alt = z.string().max(ALT_MAX * 2, { error: `Keep the alt text under ${ALT_MAX} characters.` });

/** Pages (and the store logo) that use a file — shown before deleting it. */
export async function getAssetUsageAction(id: string): Promise<ActionResult<AssetUsage>> {
  return storeAction("media.read", async ({ scope }) => assetUsage(scope, AssetId.parse(id)));
}

export async function setAssetAltAction(id: string, alt: string): Promise<ActionResult<{ alt: string }>> {
  return storeAction("media.write", async ({ scope, actor, store }) => {
    const assetId = AssetId.parse(id);
    const value = cleanAlt(Alt.parse(alt));
    if (!(await setAssetAlt(scope, assetId, value, actor))) fail("This file no longer exists.");
    revalidateStore(store.handle, "/media");
    return { alt: value };
  });
}
