import "server-only";
/**
 * The one outbound fetch of the integrations (P5 INTEGRATIONS; operations.md OPE-§O.3, docs/STORE-SAAS.md §H.7, P0b CCR
 * P5-6): Google OAuth and Sheets now (src/lib/sheets/client.ts), the Conversions API and Events API (step 6) and the
 * Telegram Bot API (step 7) next.
 *
 *   const res = await integrationFetch("https://sheets.googleapis.com/v4/spreadsheets/<id>/values:batchGet?…", { headers });
 *
 * It is plain `fetch`, except while the guarded `e2e-mocks` seam is on (src/lib/security/test-seams.ts: SG_E2E=1, a
 * loopback http SG_E2E_MOCK_ORIGIN and a `cod_test_*` database, all checked on every call, production builds
 * included). Then the origin of a known integration host is swapped for the mock recorder's, the path and the query
 * kept as they are, and the request carries `x-sg-e2e-host: <the real host>` so one recorder tells the platforms
 * apart. Any other host keeps its URL. A seam variable set but refused is ignored, and `testSeam` logs that once per
 * process (`[security] test seam e2e-mocks refused: <guard>`, never a value).
 *
 * Nothing here logs: a URL can carry a Telegram bot token, a body carries customer data, headers carry tokens. Callers
 * log cause codes only.
 */
import { testSeam } from "@/lib/security/test-seams";

/** The hosts the e2e recorder stands in for (exact host names, https only). */
export const INTEGRATION_HOSTS: readonly string[] = [
  "oauth2.googleapis.com",
  "sheets.googleapis.com",
  "www.googleapis.com",
  "graph.facebook.com",
  "business-api.tiktok.com",
  "api.telegram.org",
];

/** The header that names the real host of a rerouted call (the mock recorder reads it). */
export const E2E_HOST_HEADER = "x-sg-e2e-host";

/**
 * Where a call goes: `url` itself, or the same path and query on `mockOrigin` when its host is an integration host
 * (`host` = the real host the recorder is told). Pure: the tests and the e2e recorder call it.
 */
export function routeIntegrationUrl(url: string, mockOrigin: string | null): { url: string; host: string | null } {
  if (!mockOrigin) return { url, host: null };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url, host: null };
  }
  if (u.protocol !== "https:" || !INTEGRATION_HOSTS.includes(u.hostname)) return { url, host: null };
  return { url: `${mockOrigin.replace(/\/+$/, "")}${u.pathname}${u.search}`, host: u.hostname };
}

/** `fetch` for an integration call (see the header). Redirects are refused and nothing is cached unless `init` says so. */
export function integrationFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const route = routeIntegrationUrl(url, testSeam("e2e-mocks")?.origin ?? null);
  if (route.host === null) return fetch(url, { redirect: "error", cache: "no-store", ...init });
  const headers = new Headers(init.headers);
  headers.set(E2E_HOST_HEADER, route.host);
  return fetch(route.url, { redirect: "error", cache: "no-store", ...init, headers });
}
