"use server";
/**
 * Exported sites: revoke an export's key (its forms stop sending orders to this store). The store comes from the
 * signed request path (the seam); another store's export id answers like a missing one (EXP-04).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revokeExport } from "@/lib/admin-data/exports";
import { revalidateStore } from "@/lib/admin-data/shell";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const ExportId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown export." });

export async function revokeExportAction(id: string): Promise<ActionResult<null>> {
  return storeAction("export.create", async ({ scope, actor, store }) => {
    if (!(await revokeExport(scope, ExportId.parse(id), actor))) fail("This export is already revoked.");
    revalidateStore(store.handle, "/exports");
    return null;
  });
}
