/**
 * /app/<handle>/pages/new → the store's generator: new pages are always born there. A route handler, not a page,
 * so the answer is one 307; /app/<handle>/generate checks the member.
 *
 * LAN-§4 fallback: in a `store`-mode shop, asking for a new landing page turns `landing.inStoreMode` on first
 * (audited `store.landing_settings.updated`, reason `page_created`), so the generator and the page it saves are not
 * hidden. Only a navigation of the member's own (`Sec-Fetch-Site` same-origin or none) writes; `landing` and `both`
 * modes write nothing.
 */
import type { NextRequest } from "next/server";
import { storeAliasRedirect } from "@/lib/admin-data/shell";
import { ensureLandingInStoreMode } from "@/lib/landing/in-store-mode.server";
import { errorSummary } from "@/lib/orders/log";
import { storeGuard } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const handle = (await params).store;
  const res = storeAliasRedirect(handle, "/generate");
  if (res.status !== 307) return res;
  const read = await storeGuard(req, handle, "pages.read");
  // a member without pages.read is refused here; signed out, /generate answers with the sign-in
  if (!read.ok) return read.response.status === 401 ? res : read.response;
  const site = req.headers.get("sec-fetch-site");
  if ((site !== "same-origin" && site !== "none") || read.ctx.store.mode !== "store" || !read.ctx.can("pages.write")) return res;
  const write = await storeGuard(req, handle, "pages.write");
  if (write.ok) {
    await ensureLandingInStoreMode(write.ctx, "page_created").catch((err: unknown) => {
      console.error("[pages/new] in-store mode not set:", errorSummary(err));
    });
  }
  return res;
}
