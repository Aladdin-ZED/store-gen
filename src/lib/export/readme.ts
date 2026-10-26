/**
 * README.md of an export — deploy steps (Hostinger File Manager, Netlify Drop, Vercel, Cloudflare
 * Pages), how orders flow in the chosen mode, how to revoke, and a launch checklist. The tool is named by
 * the platform's brand (`platform.brand.name`, EXP-07); the store's name is the one the page shows.
 */
import type { ExportMode, SiteUrl } from "./options";

/** The tool's name when the caller gives none (`platform.brand.name`'s default). */
const DEFAULT_BRAND = "Store Gen";

export interface ReadmeInput {
  mode: ExportMode;
  /** the platform's name ("Store Gen"): where orders go, where to revoke */
  brand?: string;
  pageName: string;
  storeName: string;
  exportId: string;
  createdAt: Date;
  site: SiteUrl | null;
  hostConfigs: boolean;
  /** connected: app origin + allow-list */
  apiOrigin?: string;
  allowedOrigins: string[];
  /** whatsapp: "+212 612345678"-style display */
  whatsapp?: string;
  /** php: what config.php already contains */
  php?: { spreadsheet: boolean; serviceAccount: boolean; /** client_email of the embedded key */ serviceAccountEmail?: string };
  /** folder names inside the zip */
  root: string;
  privateDir?: string;
  /** missing store details / images, shown as a checklist */
  warnings: string[];
}

const MODE_TITLE: Record<ExportMode, (brand: string) => string> = {
  connected: (brand) => `Connected — orders go to ${brand}`,
  php: () => "PHP — orders handled by order.php on your hosting",
  whatsapp: () => "WhatsApp — orders arrive as WhatsApp messages",
};

const md = (s: string) => s.replace(/([\\`*_[\]<>|])/g, "\\$1");

const brandOf = (i: ReadmeInput) => md(i.brand?.trim() || DEFAULT_BRAND);

function ordersSection(i: ReadmeInput): string[] {
  const brand = brandOf(i);
  if (i.mode === "connected") {
    return [
      "## How orders work",
      "",
      `The page sends every order to your ${brand} store (\`${i.apiOrigin ?? "PUBLIC_URL"}\`). Prices, packs and stock rules are`,
      "checked again on the server, the order appears in **Orders**, and it is pushed to your Google Sheet like",
      "orders from your live pages. Abandoned forms, analytics and the thank-you upsell work too.",
      "",
      "Orders are accepted **only from these domains** (the browser's origin is checked on every request):",
      "",
      ...i.allowedOrigins.map((o) => `- \`${o}\``),
      "",
      "`shop.ma` matches `https://shop.ma` and `http://shop.ma`; `www.shop.ma` is a different domain — add it",
      "(or `*.shop.ma`) if visitors can reach the page there. To use another domain, make a new export.",
    ];
  }
  if (i.mode === "php") {
    const p = i.php ?? { spreadsheet: false, serviceAccount: false };
    return [
      "## How orders work",
      "",
      "The page posts orders to **`order.php`** on the same hosting (PHP 8.1+). It re-checks every field, the",
      "pack and the prices (from a price table baked into `order.php` — the browser's totals are never used),",
      "limits abuse (honeypot, timing, per-IP / per-phone limits, duplicate detection) and then:",
      "",
      `1. appends the order to \`${i.privateDir}/data/orders.jsonl\` — your private backup, one JSON line per order;`,
      `2. adds it to your Google Sheet (the orders tab of ${brand} — same columns and statuses), when configured;`,
      "3. sends a Telegram message, when configured.",
      "",
      "Orders that cannot reach Google stay queued and are retried with the next orders (or open",
      `\`https://your-domain/order.php?sync=1\`). These orders do **not** appear in ${brand}.`,
      "",
      `### Configure \`${i.privateDir}/config.php\``,
      "",
      `- \`spreadsheet_id\`: ${p.spreadsheet ? `already set to the sheet connected in ${brand}.` : "the link or id of your Google Sheet."}`,
      `- \`service_account\`: ${
        p.serviceAccount
          ? `already contains the key of your export service account${p.serviceAccountEmail ? ` (\`${p.serviceAccountEmail}\`)` : ""}, not the platform's own key. It can read and change **every row** of the orders sheet (every page's customers, not only this page's): treat this ZIP and \`${i.privateDir}/\` like a password.`
          : `upload the JSON key of a service account used only by this site (never the platform's own key, nor one another site or app needs) into \`${i.privateDir}/data/\` (create the folder if needed) and write its path here: \`'data/service-account.json'\`.`
      }`,
      "- Share the spreadsheet with the service account's e-mail (`client_email` in the key) as **Editor**.",
      "- Optional: `telegram_bot_token` (from @BotFather) and `telegram_chat_id`.",
      "- Behind Cloudflare: set `trusted_ip_header` to `'HTTP_CF_CONNECTING_IP'`. order.php believes that header only",
      "  on requests that come from Cloudflare's own addresses (built in), so nobody can fake it by calling your",
      "  server directly. Behind another proxy, use its header and list the proxy's addresses in `trusted_proxies`.",
      "",
      "Then open `https://your-domain/order.php?check=1` — every value must be `true` (`sheets`/`telegram` only",
      "if you configured them) and `privateFolderIssue` must be `null`. `\"in_web_root\"` means the private folder",
      "sits where a web server can show it: move it as described under **Deploy**.",
    ];
  }
  return [
    "## How orders work",
    "",
    `There is no server: when a shopper confirms the form, WhatsApp opens with the order already written —`,
    `pack, options, total, name, phone, city and address — addressed to **${md(i.whatsapp ?? "your number")}**. The order`,
    "reaches you when the shopper taps send. The thank-you page keeps a one-tap “Open WhatsApp” button until then.",
    "In in-app browsers (Facebook, Instagram, TikTok) WhatsApp opens from that button, which they always allow.",
    "",
    `These orders do **not** appear in ${brand} or your Google Sheet. To change the number, make a new export.`,
  ];
}

function deploySection(i: ReadmeInput): string[] {
  const r = i.root;
  const hostinger = [
    "### Hostinger (File Manager)",
    "",
    "1. hPanel → **Websites** → your site → **File Manager**.",
    `2. Open \`domains/<your-domain>/\` — the folder that contains \`public_html\`.`,
    "3. Upload this ZIP there, right-click it → **Extract** into the current folder.",
    `   \`${r}/\` merges into your existing \`public_html\`${i.privateDir ? `, and \`${i.privateDir}/\` lands next to it — outside the web root, where it must stay` : ""}.`,
    "4. Delete Hostinger's placeholder `default.php` / `index.php` from `public_html` if there is one.",
    "5. hPanel → **Security → SSL**: install the free certificate (the site redirects to https).",
    "6. Open `https://your-domain/` and place a test order.",
  ];
  if (i.mode === "php") {
    return [
      "## Deploy",
      "",
      "PHP mode needs PHP hosting (Hostinger, any cPanel host). Netlify, Vercel and Cloudflare Pages do not run",
      "PHP — use a **Connected** or **WhatsApp** export there.",
      "",
      ...hostinger,
      "",
      "### On a subdomain or in a subfolder",
      "",
      "Upload the contents of `public_html/` into the subdomain's (or subfolder's) own folder — on Hostinger a",
      "subdomain usually lives inside the main site's folder, e.g. `public_html/promo/`. The private folder still",
      `goes in \`domains/<your-domain>/\`, next to the main \`public_html\`: a \`${i.privateDir}/\` placed inside any`,
      "`public_html` is served by the main site, so order.php refuses it. If another export already uses that",
      `folder, give this one its own name (e.g. \`${i.privateDir}-promo\`) and write its full path in \`COD_PRIVATE_DIR\``,
      `at the top of \`order.php\` (File Manager shows it, e.g. \`/home/u123456789/domains/shop.ma/${i.privateDir}-promo\`).`,
      "",
      "On another cPanel host: upload the contents of `public_html/` into the site's document root and",
      `\`${i.privateDir}/\` next to the folder that holds your sites (\`public_html\`, \`htdocs\`…) — never inside one.`,
    ];
  }
  return [
    "## Deploy",
    "",
    `Everything the site needs is in \`${r}/\`: upload that folder's **contents** to any static host.`,
    "",
    ...hostinger,
    "",
    "### Netlify (Drop)",
    "",
    `1. Open https://app.netlify.com/drop and drag the \`${r}\` folder onto the page.`,
    "2. Site configuration → **Domain management** → add your domain. `_headers` sets the security headers.",
    "",
    "### Vercel",
    "",
    "```bash",
    `cd ${r}`,
    "npx vercel deploy --prod",
    "```",
    "Then Project → **Settings → Domains** → add your domain. `vercel.json` sets the headers.",
    "",
    "### Cloudflare Pages",
    "",
    "1. Dashboard → **Workers & Pages** → Create → **Pages** → **Upload assets**.",
    `2. Upload the \`${r}\` folder, deploy, then **Custom domains** → add your domain. \`_headers\` sets the headers.`,
  ];
}

function revokeSection(i: ReadmeInput): string[] {
  const brand = brandOf(i);
  if (i.mode === "connected") {
    return [
      "## Stop or replace this export",
      "",
      `${brand} → the page → **Export** → *Recent exports* → **Revoke**. From that moment the API refuses orders,`,
      "leads and analytics from this copy (shoppers see an error instead of a false confirmation) — remove the",
      "files from your host too. After publishing changes, make a new export, upload it, then revoke the old one.",
    ];
  }
  if (i.mode === "php") {
    return [
      "## Stop or replace this export",
      "",
      `This copy runs entirely on your hosting: revoking it in ${brand} only marks it as retired. To stop it,`,
      `delete \`order.php\` (or the whole site). Then delete \`${i.privateDir}/\` after downloading`,
      "`data/orders.jsonl`.",
      "",
      ...(i.php?.serviceAccount
        ? [
            "**If this ZIP or your hosting may have leaked**, delete the key in Google Cloud right away: **IAM & Admin →",
            `Service accounts** → ${i.php.serviceAccountEmail ? `\`${i.php.serviceAccountEmail}\`` : "your export service account"} → **Keys** → delete the key. Removing the files`,
            `is not enough: whoever copied \`config.php\` can keep reading and rewriting your orders sheet with it. ${brand}`,
            "syncs with another account and keeps working. Other PHP exports that carry the same key stop writing to the",
            "sheet too: add a new export key in Settings → Google Sheets, then export and upload the pages you keep.",
          ]
        : [
            "If this ZIP or your hosting may have leaked, delete the key you uploaded in Google Cloud (**IAM & Admin →",
            "Service accounts** → the account → **Keys**). Removing the files is not enough: whoever copied it can keep",
            "reading and rewriting your orders sheet. Use a key no other site or app needs, so you can always delete it.",
          ]),
    ];
  }
  return [
    "## Stop or replace this export",
    "",
    `This copy needs no server: revoking it in ${brand} only marks it as retired. Remove the files from your`,
    "host to take it offline.",
  ];
}

export function readmeMd(i: ReadmeInput): string {
  const files = [
    `${i.root}/`,
    "  index.html              product page",
    "  merci/index.html        thank-you page",
    "  legal/                  privacy, terms, shipping & returns, contact",
    "  404.html                not-found page",
    "  assets/  fonts/         images, videos and web fonts",
    "  favicon.ico, apple-touch-icon.png, icon-*.png, site.webmanifest",
    `  robots.txt${i.site ? ", sitemap.xml" : ""}`,
    ...(i.hostConfigs
      ? [i.mode === "php" ? "  .htaccess               host configuration (security headers, caching)" : "  .htaccess, _headers, vercel.json   host configuration (security headers, caching)"]
      : []),
    ...(i.mode === "php" ? ["  order.php               order endpoint"] : []),
    ...(i.privateDir ? [`${i.privateDir}/`, "  config.php              private settings (secret, Google Sheets, Telegram)", "  lib/gsheets.php         Google Sheets client"] : []),
  ];
  const lines = [
    `# ${md(i.pageName)} — static export`,
    "",
    `**${MODE_TITLE[i.mode](brandOf(i))}** · ${md(i.storeName)} · export \`${i.exportId}\` · ${i.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "```",
    ...files,
    "```",
    "",
    ...ordersSection(i),
    "",
    ...deploySection(i),
    "",
    "## Security",
    "",
    `- Every page carries a strict Content-Security-Policy (a \`<meta>\` tag${i.hostConfigs ? ", repeated by the host files" : ""}). It only`,
    "  allows the page's own code. If you add scripts (chat widget, extra analytics), remove the `<meta",
    i.hostConfigs
      ? `  http-equiv="Content-Security-Policy">\` tag and the \`Content-Security-Policy\` lines of ${i.mode === "php" ? "`.htaccess`" : "`.htaccess`, `_headers` and `vercel.json`"}, or add the script's hash to them.`
      : '  http-equiv="Content-Security-Policy">` tag, or add the script\'s hash to it.',
    i.hostConfigs
      ? "- Images and fonts have content-based names and are cached for a year; pages always revalidate."
      : "- Images and fonts have content-based names: your host can cache `assets/` and `fonts/` for a year (export with the host files to get this, HTTPS and the security headers ready-made).",
    ...(i.mode === "php" ? ["- Secrets live only in the private folder, outside the web root. Never upload it into `public_html`."] : []),
    ...(i.site ? [] : ["- No site address was given: canonical URL, social preview image and sitemap are left out. Export again with the address to add them."]),
    "",
    ...revokeSection(i),
    "",
    "## Before you run ads",
    "",
    "- [ ] Place a real test order from your phone and check it arrives.",
    "- [ ] Check the page on mobile data, not only on Wi-Fi.",
    ...i.warnings.map((w) => `- [ ] ${md(w)}`),
    "",
  ];
  return lines.join("\n");
}
