"use client";
/**
 * Browser helpers for the store's Google Sheets API (/api/app/<handle>/sheets/*, the dashboard on screen):
 * plain-language toasts, the server's French explanations passed through as-is.
 */
import { toast } from "sonner";
import { apiHref } from "@/lib/urls";
import { requireStoreHandle } from "../shell/store-handle";
import { int } from "./format";

interface SyncResponse {
  ok: boolean;
  error?: string;
  push?: { status: string; appended: number; updated: number; failed: number; error?: string };
  pull?: { status: string; updated: number; error?: string } | null;
}

/** Run "Sync now" against the sheets API and report in plain words. */
export async function runSheetSync(): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(apiHref(requireStoreHandle(), "/sheets/sync"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } catch {
    toast.error("Network problem — the sync didn't start.");
    return false;
  }
  const body = (await res.json().catch(() => ({ ok: false }))) as SyncResponse;
  if (res.status === 429) {
    toast.error("Too many syncs in a row — wait a few minutes.");
    return false;
  }
  if (!body.push) {
    toast.error("Sync failed. Check the Google Sheets settings.");
    return false;
  }
  if (body.push.status === "not_configured") {
    toast.error("Google Sheets isn't connected yet.");
    return false;
  }
  const sent = body.push.appended + body.push.updated;
  const pulled = body.pull?.updated ?? 0;
  if (body.push.error || body.pull?.error) {
    toast.error(body.push.error ?? body.pull?.error ?? "Sync failed.");
    return false;
  }
  toast.success(
    sent || pulled
      ? `${sent ? `${int(sent)} order${sent === 1 ? "" : "s"} sent` : "Nothing new to send"}${pulled ? ` · ${int(pulled)} status update${pulled === 1 ? "" : "s"} pulled` : ""}`
      : "Everything is already in sync.",
  );
  return true;
}
