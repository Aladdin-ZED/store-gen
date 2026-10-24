/**
 * Host configuration files of an export:
 *   .htaccess (+ merci/.htaccess, legal/.htaccess)  Apache / LiteSpeed — Hostinger, cPanel hosts
 *   _headers                                       Netlify, Cloudflare Pages
 *   vercel.json                                    Vercel
 *
 * Every document also carries its own CSP in a <meta> tag; the header policies here repeat it
 * (scoped per folder / path so two documents never share a wrong policy). A header policy also
 * allows the 404 page's stylesheet, because hosts serve 404.html at any missing path.
 * Never put a CSP on a catch-all path: Netlify and Cloudflare merge matching rules, and two
 * policies would both be enforced.
 */
import { PERMISSIONS_POLICY } from "@/lib/security/headers";

export interface HostPolicies {
  /** landing page (index.html) — the root folder default */
  landing: string;
  /** thank-you page (merci/) */
  thanks: string;
  /** legal documents (legal/) */
  legal: string;
  /** 404.html on its own */
  notFound: string;
}

export interface HostConfigInput {
  policies: HostPolicies;
  /** site root path on its host ("/" or "/promo/") — ErrorDocument needs it */
  basePath: string;
  php: boolean;
}

const SECURITY_HEADERS: [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", PERMISSIONS_POLICY],
  // the WhatsApp hand-off opens a new tab: keep popups working
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  // ignored by browsers over plain http; no includeSubDomains (merchants' other subdomains)
  ["Strict-Transport-Security", "max-age=31536000"],
];

const IMMUTABLE = "public, max-age=31536000, immutable";

function headerValue(v: string): string {
  if (/["\r\n]/.test(v)) throw new Error("export: header values cannot contain quotes or line breaks");
  return v;
}

/* ------------------------------------------------------------------ */
/* Apache / LiteSpeed                                                  */
/* ------------------------------------------------------------------ */

const deny = (indent: string) =>
  [
    `${indent}<IfModule mod_authz_core.c>`,
    `${indent}  Require all denied`,
    `${indent}</IfModule>`,
    `${indent}<IfModule !mod_authz_core.c>`,
    `${indent}  Order allow,deny`,
    `${indent}  Deny from all`,
    `${indent}</IfModule>`,
  ].join("\n");

export function rootHtaccess(input: HostConfigInput): string {
  const base = /^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(input.basePath) ? input.basePath : "/";
  const lines = [
    "# Landing page export — Apache / LiteSpeed (Hostinger, cPanel…)",
    "# Each page also carries its Content-Security-Policy in a <meta> tag. If you add your own scripts",
    "# (chat widget, analytics…), remove that tag AND the Content-Security-Policy lines below.",
    "",
    "Options -Indexes",
    `DirectoryIndex index.html${input.php ? " index.php" : ""}`,
    `ErrorDocument 404 ${base}404.html`,
    "AddDefaultCharset utf-8",
    "",
    "<IfModule mod_mime.c>",
    "  AddType image/avif .avif",
    "  AddType image/webp .webp",
    "  AddType font/woff2 .woff2",
    "  AddType video/mp4 .mp4",
    "  AddType video/webm .webm",
    "  AddType application/manifest+json .webmanifest",
    "  AddCharset utf-8 .html .css .js .json .webmanifest .xml .txt",
    "</IfModule>",
    "",
    "# HTTPS everywhere (also behind Hostinger's / Cloudflare's proxy)",
    "<IfModule mod_rewrite.c>",
    "  RewriteEngine On",
    "  RewriteCond %{HTTPS} !=on",
    "  RewriteCond %{HTTP:X-Forwarded-Proto} !=https",
    "  RewriteCond %{HTTP_HOST} !^(localhost|127\\.0\\.0\\.1)(:[0-9]+)?$ [NC]",
    "  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]",
    "",
    "  # hidden files and folders are never served (except /.well-known for certificates)",
    "  RewriteRule (^|/)\\.(?!well-known/) - [F,L]",
    "</IfModule>",
    '<FilesMatch "^\\.|^(config\\.php|README\\.md)$|\\.(jsonl|log|ini|bak|sql|sh)$">',
    deny("  "),
    "</FilesMatch>",
    "",
    "<IfModule mod_headers.c>",
    ...SECURITY_HEADERS.map(([k, v]) => `  Header always set ${k} "${headerValue(v)}"`),
    "",
    "  # Landing page policy (merci/ and legal/ have their own .htaccess)",
    `  Header set Content-Security-Policy "${headerValue(input.policies.landing)}"`,
    "",
    "  # pages revalidate on every visit; icons for a day (assets/ and fonts/ have their own .htaccess)",
    '  <FilesMatch "\\.(html|webmanifest|xml|txt)$">',
    '    Header set Cache-Control "no-cache"',
    "  </FilesMatch>",
    '  <FilesMatch "^(favicon\\.ico|apple-touch-icon\\.png|icon-[a-z0-9-]+\\.png)$">',
    '    Header set Cache-Control "public, max-age=86400"',
    "  </FilesMatch>",
    ...(input.php ? ['  <Files "order.php">', '    Header set Cache-Control "no-store"', "  </Files>"] : []),
    "</IfModule>",
    "",
    "<IfModule mod_deflate.c>",
    "  AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml application/javascript application/json application/manifest+json application/xml image/svg+xml",
    "</IfModule>",
    "",
  ];
  return lines.join("\n");
}

/** merci/.htaccess and legal/.htaccess: the folder's own policy replaces the root one. */
export function folderHtaccess(label: string, policy: string): string {
  return [
    `# ${label} — replaces the landing page policy set by ../.htaccess`,
    "<IfModule mod_headers.c>",
    `  Header set Content-Security-Policy "${headerValue(policy)}"`,
    "</IfModule>",
    "",
  ].join("\n");
}

/** assets/.htaccess and fonts/.htaccess: content-addressed file names, cached for a year. */
export function immutableHtaccess(): string {
  return ["# File names change with their content: cache for a year", "<IfModule mod_headers.c>", `  Header set Cache-Control "${IMMUTABLE}"`, "</IfModule>", ""].join("\n");
}

/* ------------------------------------------------------------------ */
/* Netlify / Cloudflare Pages                                          */
/* ------------------------------------------------------------------ */

export function headersFile(input: HostConfigInput): string {
  const p = input.policies;
  const block = (paths: string[], headers: [string, string][]) =>
    paths.map((path) => [path, ...headers.map(([k, v]) => `  ${k}: ${headerValue(v)}`)].join("\n")).join("\n");
  const csp = (v: string): [string, string][] => [["Content-Security-Policy", v]];
  return (
    [
      "# Netlify / Cloudflare Pages headers. Each page also carries its CSP in a <meta> tag.",
      block(["/*"], SECURITY_HEADERS),
      block(["/", "/index.html"], csp(p.landing)),
      block(["/merci/", "/merci/index.html"], csp(p.thanks)),
      block(["/legal/*"], csp(p.legal)),
      block(["/404.html"], csp(p.notFound)),
      block(["/assets/*", "/fonts/*"], [["Cache-Control", IMMUTABLE]]),
    ].join("\n\n") + "\n"
  );
}

/* ------------------------------------------------------------------ */
/* Vercel                                                              */
/* ------------------------------------------------------------------ */

export function vercelJson(input: HostConfigInput): string {
  const p = input.policies;
  const h = (pairs: [string, string][]) => pairs.map(([key, value]) => ({ key, value: headerValue(value) }));
  const csp = (v: string) => h([["Content-Security-Policy", v]]);
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    cleanUrls: false,
    headers: [
      { source: "/(.*)", headers: h(SECURITY_HEADERS) },
      { source: "/", headers: csp(p.landing) },
      { source: "/index.html", headers: csp(p.landing) },
      { source: "/merci/(.*)", headers: csp(p.thanks) },
      { source: "/legal/(.*)", headers: csp(p.legal) },
      { source: "/404.html", headers: csp(p.notFound) },
      { source: "/(assets|fonts)/(.*)", headers: h([["Cache-Control", IMMUTABLE]]) },
    ],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
