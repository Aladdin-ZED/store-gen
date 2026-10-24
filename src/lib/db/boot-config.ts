import "server-only";
/**
 * The platform configuration lines of the boot (docs/STORE-SAAS.md §H.4 step 1), logged by src/instrumentation.ts
 * beside authConfigWarnings: addressing and the edge (§C.1, §H.7), the data directory (§G.2), env aliases, the
 * platform time zone, the test identity seam (§E.4) and the gate SHA (§H.10). Names and states only, never a value.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { edgeKeyPresent, platformUrl, storeRootDomain } from "@/lib/edge/env";

export interface ConfigLine {
  level: "error" | "warn" | "info";
  text: string;
}

/** Every line, in log order (the caller picks the console level). */
export async function platformConfigLines(): Promise<ConfigLine[]> {
  const env = process.env;
  const out: ConfigLine[] = [];
  const prod = env.NODE_ENV === "production";

  // addressing (§C.1, §H.7): PLATFORM_URL, with PUBLIC_URL as its alias for one release
  const platform = env.PLATFORM_URL?.trim();
  const alias = env.PUBLIC_URL?.trim();
  if (!platform && alias) out.push({ level: "warn", text: "PLATFORM_URL is not set; PUBLIC_URL is used as its alias (removed in R2). Set PLATFORM_URL to the same value." });
  else if (platform && alias && platform.replace(/\/+$/, "") !== alias.replace(/\/+$/, "")) out.push({ level: "warn", text: "PLATFORM_URL and PUBLIC_URL differ; PLATFORM_URL wins. Set both to the same value until PUBLIC_URL is removed." });
  if ((platform || alias) && !platformUrl()) out.push({ level: "error", text: "PLATFORM_URL is not an http(s) URL: links and the order origin check cannot be built." });
  else if (prod && !platform && !alias) out.push({ level: "error", text: "PLATFORM_URL is not set: links and the order origin check cannot be built." });

  // S mode (§C.1): STORE_ROOT_DOMAIN and EDGE_KEY together
  const root = env.STORE_ROOT_DOMAIN?.trim();
  if (root && !storeRootDomain()) out.push({ level: "warn", text: "STORE_ROOT_DOMAIN is not a domain (no port, no IP, at least one dot); store subdomains stay off." });
  if (!!root !== !!env.EDGE_KEY?.trim()) out.push({ level: "warn", text: "STORE_ROOT_DOMAIN and EDGE_KEY must be set together; store subdomains stay off (path mode /s/<handle>)." });
  else if (env.EDGE_KEY?.trim() && !edgeKeyPresent()) out.push({ level: "warn", text: "EDGE_KEY is shorter than 32 characters; store subdomains stay off." });

  // the data directory (§G.2): media still lives in the database until the filesystem backend arrives
  const dataDir = env.DATA_DIR?.trim();
  if (!dataDir) out.push({ level: prod ? "warn" : "info", text: "DATA_DIR is not set: media stays in the database." });
  else {
    const rel = relative(process.cwd(), resolve(dataDir));
    if (!isAbsolute(dataDir)) out.push({ level: "warn", text: "DATA_DIR must be an absolute path." });
    else if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) out.push({ level: "warn", text: "DATA_DIR is inside the app folder, which a deploy replaces; use a folder outside it." });
    else if (/[\\/]public_html([\\/]|$)/.test(dataDir)) out.push({ level: "warn", text: "DATA_DIR is under public_html, where the web server could serve it; use a folder outside it." });
  }

  // the platform default time zone (SET-08)
  const tz = env.APP_TIMEZONE?.trim();
  if (tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch {
      out.push({ level: "warn", text: "APP_TIMEZONE is not a time zone this server knows (e.g. Africa/Casablanca); new stores keep the default." });
    }
  }

  // the test identity seam (§E.4) is never honoured in production
  if (env.SG_TEST_CONTEXT === "1" && prod) out.push({ level: "error", text: "SG_TEST_CONTEXT=1 is set in production; it is ignored. Remove it." });

  // the gate this build was cleared by (§H.10: written by a green `npm run gate`)
  out.push(await gateLine());
  return out;
}

/** `qa/.gate-ok` names the commit `npm run gate` passed on; only the SHA is logged. */
async function gateLine(): Promise<ConfigLine> {
  try {
    const text = await readFile(join(process.cwd(), "qa", ".gate-ok"), "utf8");
    const sha = /\b[0-9a-f]{40}\b/.exec(text)?.[0];
    return sha ? { level: "info", text: `gate passed on ${sha}.` } : { level: "warn", text: "qa/.gate-ok names no commit." };
  } catch {
    return { level: process.env.NODE_ENV === "production" ? "warn" : "info", text: "no gate file (qa/.gate-ok): this build was not cleared by npm run gate." };
  }
}
