"use server";
/**
 * The calling window's server action (P4 CALL CENTER; operations.md OD57, OD63, OPS-11, OPS-28; core D73; P0b P3-14).
 * `CallingWindowEditor` saves through it from `/team/callcenter` and from P3's "After the order" card, so both write
 * one key the same way: `ops.callingWindow` with `savedAt = now` (the "Use these hours" confirmation that lets a
 * shopper be promised an hour) and nothing else, Store Health marked dirty, audit `callcenter.settings.updated`.
 * Every live page shows the hours (the thank-you `{when}`, the FAQ promise), so the save re-renders them in `after()`
 * (`enqueueRenders(scope, "all-live", "store_info")`, P8; until P8 merges the render queue is unavailable and the
 * pages pick the hours up at their next publish).
 */
import { after } from "next/server";
import { enqueueRenders } from "@/lib/jobs/renders";
import { logError } from "@/lib/orders/log";
import { storeAction } from "@/lib/tenancy/seam";
import { saveCallingWindow } from "./settings.server";

/** callcenter.configure: the window (ISO weekdays 1-7, ≤ 3 ranges a day, ≤ 60 closed dates) and `savedAt`. */
export async function saveCallingWindowAction(input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await saveCallingWindow(ctx, input);
    if (res.ok) {
      after(async () => {
        try {
          await enqueueRenders(ctx.scope, "all-live", "store_info");
        } catch (err) {
          if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError("ops:window-renders", err);
        }
      });
    }
    return res;
  });
}
