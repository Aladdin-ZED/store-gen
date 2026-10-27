import "server-only";
/**
 * The member ctx of this request's store, one seam pass shared by the `[store]` layout, its metadata and the pages'
 * metadata that name the store (React `cache`, per request). Every page still calls `requireStoreMember` with its own
 * permission (AUTH-31): this pass only asks for `store.read`.
 */
import { cache } from "react";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const memberCtx = cache((handle: string) => requireStoreMember({ handle, permission: "store.read" }));
