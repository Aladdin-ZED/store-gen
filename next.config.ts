import type { NextConfig } from "next";

/**
 * Hostinger Business (managed Node.js) notes:
 *  - must export a plain object (not a function)
 *  - Hostinger forces `output: "standalone"` itself; we don't set it here
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // landing pages are served by route handlers; admin uses plain <img> — no image optimizer surface
  images: { unoptimized: true },
  serverExternalPackages: ["mysql2"],
  experimental: {
    // Next clones every non-GET body that proxy.ts matches into memory, up to this size, and holds it
    // until the client finishes sending. Media uploads (≤ 25 MB) bypass the proxy (see its matcher);
    // every other body is ≤ 16 KB and server actions are capped at 1 MB, so keep the clone small.
    proxyClientMaxBodySize: "1mb",
    // Hostinger builds in a fresh folder it deletes afterwards: a build cache (~900 MB) is never read.
    turbopackFileSystemCacheForBuild: false,
    // Only the Pages Router reads this filter (the app has none); left on, the build publishes a bloom
    // filter of every route (/admin/…, /api/cron/…) in the public _buildManifest.js.
    clientRouterFilter: false,
    // Build workers ("Collecting page data"). Next defaults to os.cpus() - 1: 63 on Hostinger's 64-CPU
    // build host, each loading the native binding with its own thread pool, which hit the host's thread
    // limit ("OS can't spawn worker thread", SIGABRT, build 01a17e99 on 2026-10-27; 52 had fit before).
    // Build-time only; 4 is ample for this app's ~40 routes.
    cpus: 4,
  },
  /*
   * Any path no route matches is answered by the /[slug] route as an unknown slug ("-" is never a
   * slug), i.e. with the same static 404 (src/lib/auth/unknown-page.ts) as an un-gated /admin/… URL.
   * Without it, an unknown path of two or more segments got Next's own not-found page (other bytes,
   * other headers) while /admin/login got the static one: the admin's paths stood out.
   * `fallback` rewrites run only after every page, route and static file has been checked.
   */
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: "/:path+", destination: "/-" }] };
  },
  // files read at runtime from disk must be traced into the standalone output.
  // @img: sharp's native binding is traced but not the libvips libraries it links against
  // (libvips-cpp .so/.dll), which made every route that loads sharp answer 500 in standalone mode.
  outputFileTracingIncludes: {
    "/**": [
      "./drizzle/**/*",
      "./public/fonts/**/*",
      "./src/lib/export/templates/**/*",
      "./php/gsheets.php",
      "./node_modules/@img/**/*",
    ],
  },
  // No Turbopack loaders on purpose: Turbopack runs loaders in spawned Node workers, which Hostinger's
  // build machines kill. The admin's Tailwind CSS is precompiled by scripts/build-admin-css.mjs.
};

export default nextConfig;
