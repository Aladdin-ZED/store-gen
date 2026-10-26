/**
 * Attribution: UTM + ad click ids captured from the landing URL and persisted for the session
 * (so they survive internal navigation), ad-platform browser ids from cookies, anonymous visitor id.
 * Storage names per store on the shared origin (core skey: "lp:<handle>:utm" / ":vid" under /s/<handle>).
 */
import type { Ctx, W } from "./core";
import { sget, skey, sset } from "./core";
import { randomId } from "./ids";

/** [url param, max length (contract)]; the payload key is the param without "utm_", lower-cased ("ScCid" → "sccid") */
const PARAMS: [string, number][] = [
  ["utm_source", 120],
  ["utm_medium", 120],
  ["utm_campaign", 200],
  ["utm_content", 200],
  ["utm_term", 200],
  ["fbclid", 500],
  ["ttclid", 500],
  ["ScCid", 500],
  ["gclid", 500],
];

/** The non-empty values `get` answers per parameter, trimmed and bounded, under their payload keys. */
function collect(get: (param: string, key: string) => unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [param, max] of PARAMS) {
    const key = param.replace("utm_", "").toLowerCase();
    const v = get(param, key);
    const t = typeof v === "string" ? v.trim() : "";
    if (t) out[key] = t.slice(0, max);
  }
  return out;
}

/** The landing URL's attribution, else the session's (a later page of the visit carries none). */
export function captureUtm(win: W): Record<string, string> {
  const name = skey(win, "utm");
  let out: Record<string, string> = {};
  try {
    const q = new URLSearchParams(win.location.search);
    out = collect((param) => q.get(param) || q.get(param.toLowerCase()));
  } catch {
    /* malformed URL */
  }
  if (Object.keys(out).length) {
    sset(win, "sessionStorage", name, JSON.stringify(out));
    return out;
  }
  try {
    const saved = JSON.parse(sget(win, "sessionStorage", name) || "null") as Record<string, unknown> | null;
    if (saved && typeof saved === "object") out = collect((_, key) => saved[key]);
  } catch {
    /* corrupted storage */
  }
  return out;
}

export function cookie(doc: Document, name: string): string {
  try {
    for (const part of doc.cookie.split(";")) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
  } catch {
    /* cookies blocked / malformed */
  }
  return "";
}

/** Meta _fbp/_fbc and TikTok _ttp for server-side event matching (fbc rebuilt from fbclid if needed). */
export function adIds(c: Ctx): { fbp?: string; fbc?: string; ttp?: string } {
  const o: { fbp?: string; fbc?: string; ttp?: string } = {};
  const click = c.st.utm.fbclid;
  for (const [k, max] of [["fbp", 200], ["fbc", 500], ["ttp", 200]] as const) {
    const v = cookie(c.doc, "_" + k) || (k === "fbc" && click ? "fb.1." + Date.now() + "." + click : "");
    if (v) o[k] = v.slice(0, max);
  }
  return o;
}

/** Anonymous random visitor id (no PII) kept in localStorage; per-load id when storage is blocked. */
export function visitorId(c: Ctx): string {
  const name = skey(c.win, "vid");
  const saved = sget(c.win, "localStorage", name);
  if (saved && /^[a-zA-Z0-9_-]{8,40}$/.test(saved)) return saved;
  const id = randomId(22, c.win.crypto);
  sset(c.win, "localStorage", name, id);
  return id;
}
