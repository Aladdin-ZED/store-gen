import "server-only";
/**
 * The approval queue's detail pane as one read (platform.md PLA-§3.5 items 1-6, §7.12): the review detail of
 * ./queue.ts and the store's notes (pinned first) when the staff member may read notes (`stores.notes`; analysts
 * may not, so their pane has no Notes block). The page renders the first pane on the server; the split view loads
 * the others through `loadReviewPaneAction` and keeps them while the list is open.
 *
 *   const pane = await reviewPane(ctx, reviewId);   // { detail, notes: NoteView[] | null }
 */
import { AuthRefusal } from "@/lib/auth/errors";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { recordPlatformError } from "./log";
import { listNotes, type NoteView } from "./notes";
import { getReviewDetail, id26, type ReviewDetail } from "./queue";

export interface ReviewPane {
  detail: ReviewDetail;
  /** null: this role reads no notes, or the notes failed to load (the pane says so) */
  notes: NoteView[] | null;
  at: string;
}

export async function reviewPane(ctx: PlatformCtx, reviewId: unknown): Promise<ReviewPane> {
  const id = id26.safeParse(reviewId);
  if (!id.success) throw new AuthRefusal("not_found");
  const detail = await getReviewDetail(ctx, id.data);
  let notes: NoteView[] | null = null;
  if (ctx.can("stores.notes")) {
    notes = await listNotes(ctx, { storeId: detail.store.id }).catch((err: unknown) => {
      recordPlatformError("queue pane notes", err, { storeId: detail.store.id });
      return null;
    });
  }
  return { detail, notes, at: new Date().toISOString() };
}
