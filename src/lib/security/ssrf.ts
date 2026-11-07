/**
 * The SSRF guard for tenant-supplied URLs (operations.md IN-07 webhooks; core §K.4 S5 row "SSRF guard library"; R2,
 * S5 INTEGRATIONS 2 owns this file). No 'server-only' marker (S5's offline selftest runs under plain tsx); the node:*
 * imports keep it out of client bundles. The contract step (C2-C) froze the two calls S4 LOGISTICS (and D2 in R3) use
 * for any tenant-supplied URL (carrier APIs, label fetches):
 *   - `resolvePublic(host, deps?)`: every resolved address must be public (private, loopback, link-local, CGNAT,
 *     documentation, multicast ranges and embedded IPv4 forms are blocked), else the whole host is refused
 *     (`ssrf_blocked`); IPv4 first;
 *   - `ssrfRequest(url, opts, deps?)`: https only, the connection pinned to a checked address (SNI and Host = the
 *     hostname), redirects refused (`redirect_refused`, never followed), at most `maxResponseBytes` (default 4,096)
 *     read, one total deadline covering DNS, an external `signal` also cuts it.
 * The resolver and the request function are injectable for offline tests. Stubs until S5 merges: throw
 * `NotBuiltYet("S5", …)`. No R1 path calls them.
 */
import type { request as httpsRequest } from "node:https";
import { notBuiltYet } from "@/lib/contracts/not-built";

export type SsrfFailure = "ssrf_blocked" | "dns_failed" | "timeout" | "tls_error" | "network" | "redirect_refused";

export interface SsrfDeps {
  lookup?(host: string): Promise<{ address: string; family: 4 | 6 }[]>;
  request?: typeof httpsRequest;
}

export interface SsrfRequestOptions {
  method: "GET" | "POST" | "PUT";
  headers: Record<string, string>;
  body?: string | Uint8Array;
  timeoutMs: number;
  /** default 4,096 */
  maxResponseBytes?: number;
  signal?: AbortSignal;
}

/** The host's addresses when every one is public. S5 (stub: NotBuiltYet). */
export async function resolvePublic(host: string, deps?: SsrfDeps): Promise<{ ok: true; addresses: string[] } | { ok: false; error: "ssrf_blocked" | "dns_failed" }> {
  void host;
  void deps;
  return notBuiltYet("S5", "resolvePublic");
}

/** One guarded HTTPS request: the status, or the failure code, with the elapsed time. S5 (stub: NotBuiltYet). */
export async function ssrfRequest(url: string, opts: SsrfRequestOptions, deps?: SsrfDeps): Promise<{ status: number; ms: number } | { error: SsrfFailure; ms: number }> {
  void url;
  void opts;
  void deps;
  return notBuiltYet("S5", "ssrfRequest");
}
