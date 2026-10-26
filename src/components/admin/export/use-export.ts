"use client";
/**
 * Data hooks of the export dialog: the page's export context, the debounced size estimate, the
 * streamed download (with progress) and revocation. Every request is same-origin JSON (or the ZIP).
 */
import { useEffect, useState } from "react";
import type { ExportMode } from "@/lib/export/options";
import { EXPORT_HEADERS, type ExportContextResponse, type ExportErrorResponse, type ExportEstimateResponse, type ExportRecordJson } from "@/lib/export/types";
import { apiHref } from "@/lib/urls";
import { requireStoreHandle } from "../shell/store-handle";

async function readJson<T>(res: Response): Promise<T | ExportErrorResponse> {
  try {
    return (await res.json()) as T | ExportErrorResponse;
  } catch {
    return { ok: false, error: res.status === 404 ? "not_found" : "server", message: `Request failed (${res.status}).` };
  }
}

const networkError = (): ExportErrorResponse => ({ ok: false, error: "server", message: "Network error — check your connection and try again." });

/* ------------------------------------------------------------------ */
/* context                                                             */
/* ------------------------------------------------------------------ */

interface Loaded<T> {
  key: string;
  data?: T;
  error?: ExportErrorResponse;
}

/**
 * The page's export context; `versionId` is listed even when older than the recent versions.
 * Every opening starts from fresh data (the builder saves a new snapshot version right before
 * opening, so the previous opening's list would miss it); `reload()` refreshes in the background
 * and keeps the current data on screen. `opening` changes on each opening (key the form with it).
 */
export function useExportContext(pageId: string, open: boolean, versionId?: string) {
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }
  const [round, setRound] = useState(0);
  const [state, setState] = useState<(Loaded<ExportContextResponse> & { scope: string }) | null>(null);
  const scope = `${pageId}#${versionId ?? ""}#${opening}`;
  const key = `${scope}#${round}`;
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const query = new URLSearchParams({ pageId, ...(versionId ? { versionId } : {}) });
    // a failed background refresh keeps what is on screen
    const settle = (body: ExportContextResponse | ExportErrorResponse) =>
      setState((prev) => ({
        scope,
        key,
        data: body.ok ? body : prev?.scope === scope ? prev.data : undefined,
        error: body.ok ? undefined : body,
      }));
    fetch(`${apiHref(requireStoreHandle(), "/export")}?${query.toString()}`, { signal: ctl.signal, cache: "no-store" })
      .then((res) => readJson<ExportContextResponse>(res))
      .then(settle)
      .catch(() => {
        if (!ctl.signal.aborted) settle(networkError());
      });
    return () => ctl.abort();
  }, [pageId, open, scope, key, versionId]);
  const current = state?.scope === scope ? state : null;
  return {
    data: current?.data,
    error: current?.key === key ? current.error : undefined,
    loading: open && state?.key !== key,
    opening,
    reload: () => setRound((r) => r + 1),
  };
}

/* ------------------------------------------------------------------ */
/* estimate                                                            */
/* ------------------------------------------------------------------ */

export interface EstimateParams {
  versionId: string;
  mode: ExportMode;
  hostConfigs: boolean;
  siteUrl: string;
  whatsapp: string;
}

/** Size estimate of the current choices — debounced, the previous value stays visible while refreshing. */
export function useEstimate(params: EstimateParams | null) {
  const query = params
    ? new URLSearchParams({
        versionId: params.versionId,
        mode: params.mode,
        hostConfigs: params.hostConfigs ? "1" : "0",
        ...(params.siteUrl.trim() ? { siteUrl: params.siteUrl.trim() } : {}),
        ...(params.mode === "whatsapp" && params.whatsapp.trim() ? { whatsapp: params.whatsapp.trim() } : {}),
      }).toString()
    : "";
  const [state, setState] = useState<Loaded<ExportEstimateResponse> | null>(null);
  useEffect(() => {
    if (!query) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${apiHref(requireStoreHandle(), "/export/estimate")}?${query}`, { signal: ctl.signal, cache: "no-store" })
        .then((res) => readJson<ExportEstimateResponse>(res))
        .then((body) => setState(body.ok ? { key: query, data: body } : { key: query, error: body }))
        .catch(() => {
          if (!ctl.signal.aborted) setState({ key: query, error: networkError() });
        });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);
  const fresh = state?.key === query;
  return {
    data: state?.data,
    error: fresh ? state?.error : undefined,
    loading: !!query && !fresh,
  };
}

/* ------------------------------------------------------------------ */
/* download                                                            */
/* ------------------------------------------------------------------ */

export interface DownloadRequest {
  versionId: string;
  mode: ExportMode;
  allowedOrigins: string[];
  options: { hostConfigs: boolean; siteUrl?: string; whatsappNumber?: string; embedServiceAccount: boolean };
}

export type DownloadResult = { ok: true; fileName: string; exportId: string; bytes: number } | ExportErrorResponse;

/** POSTs the export, streams the ZIP (progress 0..1 against the server's estimate) and saves it. */
export async function downloadExport(req: DownloadRequest, onProgress: (p: number) => void, signal?: AbortSignal): Promise<DownloadResult> {
  let res: Response;
  try {
    res = await fetch(apiHref(requireStoreHandle(), "/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    return networkError();
  }
  if (!res.ok || !res.body) return (await readJson<never>(res)) as ExportErrorResponse;

  const estimate = Number(res.headers.get(EXPORT_HEADERS.estimate)) || 0;
  const exportId = res.headers.get(EXPORT_HEADERS.id) ?? "";
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "landing-export.zip";
  const reader = res.body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      received += value.length;
      onProgress(estimate > 0 ? Math.min(0.97, received / estimate) : 0.5);
    }
  } catch {
    return { ok: false, error: "server", message: "The download was interrupted — try again." };
  }
  onProgress(1);
  const url = URL.createObjectURL(new Blob(parts, { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { ok: true, fileName: name, exportId, bytes: received };
}

export async function revokeExportRequest(exportId: string): Promise<{ ok: true; export: ExportRecordJson } | ExportErrorResponse> {
  try {
    const res = await fetch(apiHref(requireStoreHandle(), `/export/${encodeURIComponent(exportId)}`), { method: "DELETE" });
    return await readJson<{ ok: true; export: ExportRecordJson }>(res);
  } catch {
    return networkError();
  }
}
