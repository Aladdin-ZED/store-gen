"use client";
/**
 * A file the store's API streams (the orders and leads CSV): fetched, so a refusal can answer in the panel instead of
 * a download of its JSON, then saved under the server's file name. A `step_up` answer (orders.export is a §B.7 key)
 * opens the shell's step-up sheet and the request runs once more after the proof.
 *
 *   await downloadFile(store.api("/orders/export?status=new"), stepUp, "orders.csv");
 */
import { toast } from "sonner";
import { actionMessage } from "./action-result";
import { isStepUpAnswer, type StoreStepUp } from "../shell/step-up";

const nameOf = (res: Response): string | null => /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? null;

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** True when the file was saved; a refusal or a network problem is reported as a toast. */
export async function downloadFile(url: string, stepUp: StoreStepUp, fallbackName: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    } catch {
      toast.error("Network problem. Check your connection and try again.");
      return false;
    }
    if (res.ok) {
      try {
        save(await res.blob(), nameOf(res) ?? fallbackName);
        return true;
      } catch {
        toast.error("The download was interrupted. Try again.");
        return false;
      }
    }
    const body = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
    if (attempt === 0 && isStepUpAnswer(res.status, body)) {
      if (await stepUp.request()) continue;
      return false;
    }
    const error = typeof body?.error === "string" ? body.error : res.status === 429 ? "rate_limited" : "server";
    toast.error(actionMessage({ ok: false, error, ...(typeof body?.message === "string" ? { message: body.message } : {}) }));
    return false;
  }
  return false;
}
