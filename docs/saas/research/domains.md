# Research: domains, subdomains and hosting (Store Gen SaaS)

Area owner input for the architect of `docs/STORE-SAAS.md`. Written 2026-10-23.
Scope: how the platform (main domain) and every store (subdomain now, custom domain later) are addressed, routed,
secured and migrated on Hostinger Business. Facts are cited by URL (web) or `path:line` (code). Anything not
proven is in **Unverified** blocks. Hostinger facts marked **[MCP]** were read live through the Hostinger API
(read-only operations only, user `u641677794`, 2026-10-23).

---

## 0. TL;DR (the recommendation)

1. **Hostinger cannot serve `*.maindomain` to one Node.js app by itself.** Wildcard subdomains are not supported
   in hPanel, second-level subdomains are not supported, there is no wildcard SSL on shared hosting, and every
   extra hostname probably costs another Node process (Hostinger says `domain.tld` and `www.domain.tld` "each run
   a separate process", and a Next.js app uses about 10–11 threads against a plan-wide NPROC of 120). One hostname
   per store on Hostinger is a dead end.
2. **Recommended architecture:** buy a real domain. Move its DNS to **Cloudflare (Free plan)**. Add a proxied
   wildcard record `*.maindomain`. A **~60-line Cloudflare Worker** on the route `*.maindomain/*` forwards every store request to
   the **one hostname Hostinger knows** (the apex). It sends the original host in a header (`x-sg-host`) signed with a shared
   secret (`x-sg-edge`). The Next.js `proxy.ts` trusts that header only when the secret matches, then rewrites
   `<handle>.maindomain/<path>` → `/s/<handle>/<path>` internally. Result: one Hostinger hostname = one Node
   process, a free wildcard edge certificate, and stores on separate browser origins.
3. **Three addressing modes, one route tree:** path `/s/<handle>/…` (works today on the temporary domain and stays
   as a permanent fallback), subdomain `<handle>.maindomain`, custom domain `shop.brand.ma` (P1, via Cloudflare
   for SaaS custom hostnames: 100 free, then $0.10 each per month). The canonical address is the best enabled
   mode. The others answer 308 and keep the query string (UTM, `fbclid`, `ttclid`).
4. **Platform on the apex** (`maindomain`): marketing, signup, login, the tenant dashboard `/app/<handle>/…` and
   the gated console `/admin/**`. Session cookies stay `__Host-` and host-only on the apex. Store hosts never
   receive a session cookie, never serve `/admin`, `/app`, `/api/app` or Server Actions, and the edge refuses
   those paths too.
5. **What the owner buys/configures:** a domain (.com recommended for Morocco + Europe), a free Cloudflare
   account, nameserver change at the registrar, one Worker, the env keys `PLATFORM_URL`/`STORE_ROOT_DOMAIN`/
   `EDGE_KEY`, then the migration runbook in §8. Everything works on the temporary domain in path mode until then.

---

## 1. Hostinger facts (evidence)

### 1.1 What the account has today [MCP]

| Fact | Evidence |
|---|---|
| Plan `hostinger_business_v3`, order 1009401030, created 2026-05-25 | `hosting_orders_list` |
| 7 websites on the account, **5 of them Node.js** (lightgreen-hippopotamus = Store Gen, myrizq.shop = COD Studio, lightgray-hedgehog = abandoned copy, gold-squirrel, lime-otter). All are `vhost_type: addon` | `hosting_websites_list` |
| Store Gen site: no subdomains, no parked domains | `hosting_domains_list-website-subdomains`, `hosting_domains_list-website-parked` → `[]` |
| Store Gen SSL `active`, platform-managed (free subdomain), HTTPS redirect on | `hosting_ssl_status` |
| **Hostinger CDN is enabled** on the Store Gen temp domain and on myrizq.shop | `hosting_cdn_status` → `is_enabled: true` |
| With the Hostinger CDN on, Hostinger DNS points the apex with an **ALIAS** record to `<domain>.cdn.hstgr.net` and `www` with a CNAME (myrizq.shop zone). Hostinger DNS supports ALIAS at the apex, which matters for custom domains (§5) | `dns_records_list myrizq.shop` |
| Domains in the portfolio: healthnutriva.com, myrizq.shop. No domain bought for Store Gen yet | `domains_portfolio_list` |

### 1.2 Plan limits (web)

| Limit (Business) | Value | Source |
|---|---|---|
| Node.js websites | **5** (the account is already **at the cap**) | https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/ (updated 2026-10-21) |
| NPROC (all processes and threads, plan-wide) | 120 | same |
| Entry processes | 60 | same |
| Next.js threads per app | "about 10–11 threads", and "`domain.tld` and `www.domain.tld` each run a separate process" | same |
| Request timeout | 120 s; no inbound WebSockets; no always-on workers; no Redis | same |
| Websites / RAM / CPU (v3 plans, bought from 2025-12-17) | 50 websites, 3 GB RAM, 2 cores, 50 GB disk, 150 DBs | https://www.hostinger.com/support/10717644-new-web-and-cloud-hosting-limits-at-hostinger/ (updated 2026-10-19) |
| Inodes (Business) | 600,000 (newer table) | https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/ |

**Consequences**
- A separate Hostinger website (or a separate Node app) per store is impossible: the 5-app cap is already used.
  A separate "admin app" would also need a slot. Deleting the abandoned `lightgray-hedgehog` frees one, with the owner's OK (HANDOFF §6).
- Every hostname Hostinger serves is probably another Node process (see 1.4). NPROC 120 ÷ ~11 threads ≈ 10 Next
  processes for the **whole account**, COD Studio included. So the SaaS must reach Hostinger through **one hostname**.

### 1.3 Subdomains, parked/alias domains, wildcards, SSL

| Question | Answer | Source |
|---|---|---|
| Wildcard subdomains (`*.domain`) in hPanel? | **Not supported** ("creating wildcard subdomains is not supported at the moment", per the search summary of an older Hostinger article. The current article does not mention wildcards.) | https://www.hostinger.com/support/1583405-how-to-create-and-delete-subdomains-in-hpanel/ (updated 2026-09-15) and search summary |
| Nested subdomains (`a.b.domain`)? | "Second-level subdomains … are not supported on web, cloud and Agency hosting" | same |
| Subdomain types | Standalone website (counts as a website, and for Node it would need one of the 5 app slots) **or** "part of an existing website" (a subfolder). That second option is allowed when the main domain is a PHP/HTML site **or a Node.js application** | same |
| Create subdomains by API? | Yes: `hosting_domains_create-website-subdomain` {username, domain, subdomain, directory?, is_using_public_directory?} (write op, **not called**) | [MCP] search |
| Parked/alias domains | "Parked" = "alias": another name that serves the same site, and the address bar keeps the parked name. API: `hosting_domains_create-website-parked` (write, not called) | https://www.hostinger.com/support/1583424-what-are-the-differences-between-subdomain-parked-domain-and-add-on-domain/ ; [MCP] |
| Ownership check before using a domain | `hosting_domains_verify-ownership` returns a TXT record to add (skipped for `*.hostingersite.com`) | [MCP] |
| SSL | Free Lifetime SSL (Let's Encrypt-based) per website domain: `hosting_ssl_install` / `hosting_ssl_status`. A custom uploaded certificate is supported ("when an uploaded custom certificate is installed"). The Agency API also shows a limit of **3 certificate setups per domain per 7 days** | [MCP] operation descriptions |
| Wildcard SSL on shared hosting | **Not offered** as far as any source shows. Let's Encrypt HTTP-01 "cannot be used to issue wildcard certificates"; wildcards need DNS-01 ("Keeping API credentials on your web server is risky") | https://letsencrypt.org/docs/challenge-types/ |
| Number of subdomains / parked domains | No figure for hPanel web plans. A cPanel section says subdomains are unlimited, and subdomains count toward inodes | https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/ (search summary) |
| Hostinger CDN | "Works for the main domain, parked domains and subdomains of the account", and enabling it changes DNS records | [MCP] `hosting_cdn_enable` description |

### 1.4 Unverified (needs a probe on the real domain)

- **U1.** Does a subdomain "part of an existing website", or a parked domain, attached to the **Node.js** site reach
  the same Node app (the same `.next` build and env)? The docs say a parked domain "serves the same content". For
  Node they don't say.
- **U2.** Does each extra hostname spawn its own Node process like `www` does? This is inferred from the `www`
  sentence, not stated for subdomains or aliases.
- **U3.** Does Hostinger keep serving the temp domain after a real domain is connected to the website, and as
  what (alias or redirect)?
- **U4.** Do Hostinger's Let's Encrypt issuance/renewal work while the domain is proxied by Cloudflare (HTTP-01
  through the proxy)? Alternative: upload a Cloudflare Origin CA certificate as a custom SSL (§4.4).
- Probe plan: §9 V2/V3. Neither probe blocks the recommendation. Both only decide whether a Hostinger-native
  option exists for 1–3 special hostnames.

---

## 2. Options compared

| | A. Hostinger-native subdomain per store (API) | **B. Cloudflare wildcard + Worker → one Hostinger hostname (recommended)** | C. Hostinger VPS + Caddy/nginx |
|---|---|---|---|
| Wildcard | No: one API call per store, DNS + SSL per store | Yes: one `*` proxied record ("customers on all plans can create and proxy wildcard DNS records", https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/) | Yes |
| TLS | One LE cert per store (async, rate-limited) | Universal SSL covers the apex and **all first-level subdomains**, free; deeper names are not covered (https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/) | DNS-01 wildcard + on-demand TLS |
| Node processes | +1 process (~11 threads) per hostname (U2) → about 5–8 stores max | **1** for everything | Your own server |
| Store live time | Minutes (DNS + SSL) | Instant (the handle exists in the DB) | Instant |
| Custom domains | Parked domain per store (same process issue) | Cloudflare for SaaS custom hostnames (P1) | On-demand TLS |
| Cost | 0 | 0 at launch; Workers Free = 100,000 requests/day, Paid = $5/month incl. 10M requests (https://developers.cloudflare.com/workers/platform/pricing/) | VPS price + ops work (not researched: no price quoted) |
| Ops | Many moving parts in hPanel | One DNS zone + one Worker + one env secret | Root server, patching, backups, Node/DB ops |
| Verdict | Only for 1–2 special names, if at all | **Launch architecture** | P2 scale path when Hostinger's 3 GB RAM / NPROC become the limit |

**Why a Worker and not just a proxied wildcard record:** with a plain proxied `*` record, Cloudflare forwards
`Host: store.maindomain` to Hostinger. Hostinger's shared server only accepts hostnames registered on the
account, and wildcards can't be registered (1.3). Rewriting the Host header at Cloudflare without code needs Origin
Rules "Host header override", which is **Enterprise-only** (Free/Pro/Business: "No",
https://developers.cloudflare.com/rules/origin-rules/). Snippets can't do it on Free (Snippets: "Free: No",
https://developers.cloudflare.com/rules/snippets/). A Worker can: it `fetch()`es `https://maindomain/<path>`. A
same-zone subrequest is not routed to Workers again and goes to the origin ("Routes cannot be the target of a
same-zone fetch() call", https://developers.cloudflare.com/workers/configuration/routing/routes/, and a Cloudflare staff
answer: https://community.cloudflare.com/t/issue-with-worker-to-worker-https-request/94472). Cloudflare Tunnel is not an
option: it needs a resident `cloudflared` daemon, and Hostinger kills always-on workers (Node limits page).

---

## 3. Recommended topology

```
                         Cloudflare zone  maindomain   (DNS + Universal SSL apex + *.maindomain)
 visitor ─► maindomain            ──(proxied A → Hostinger IP)──────────────────────────► Hostinger vhost "maindomain"
 visitor ─► www.maindomain        ──(Redirect Rule 301 → apex; never reaches Hostinger)          │  (ONE Node process)
 visitor ─► <handle>.maindomain   ──(proxied * record)──► Worker "sg-edge"                        │
                                       fetch("https://maindomain"+path,                          │
                                         headers + x-sg-host:<handle>.maindomain                 │
                                                   + x-sg-edge:<EDGE_KEY>                        │
                                                   + x-sg-ip:<CF-Connecting-IP>)  ───────────────┘
 (P1) visitor ─► shop.brand.ma ──CNAME→ stores.maindomain (Cloudflare for SaaS custom hostname, route */*) ─► same Worker
```

- **Worker responsibilities (keep it dumb; the app decides):**
  - Forward the method, path, query, body and headers.
  - Add `x-sg-host` (the lower-cased `request.headers.get('host')`), `x-sg-edge` (a Worker secret) and `x-sg-ip`.
  - Refuse `/admin*`, `/app*`, `/api/app*`, `/api/admin*`, requests with a `Next-Action` header, and the gate
    path class (defense in depth; the app 404s them too).
  - Never forward a client-sent `x-sg-*` header.
  - Optional (P1): cache published HTML in the Cache API, keyed by host+path, honouring the origin `s-maxage=60`, and purge on publish.
- **The apex is not behind the Worker.** Use a route `*.maindomain/*` only. (Unverified detail: in Cloudflare route patterns `*.example.com/*` matches subdomains and not the apex, while `*example.com/*` matches both. Confirm when creating the route; §9 V3.) The dashboard therefore talks to Hostinger directly, and Next's Server Action origin check (Origin host vs `x-forwarded-host`/`host`, `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:13,40`) keeps working with no `allowedOrigins` change.
- **www:** one Cloudflare Redirect Rule `www.maindomain/*` → `https://maindomain/$1` (301). Hostinger never sees
  `www`, which also **saves the second Node process** Hostinger runs for `www` (Node limits page).
- **Hostinger CDN off** for the real domain (DNS moves to Cloudflare anyway; two CDNs in series confuse the IP
  hops and the caches). The app's IP logic already supports Cloudflare: `BEHIND_CLOUDFLARE=1` trusts
  `CF-Connecting-IP` only when the hop is a Cloudflare address (`src/lib/security/ip.ts:18,222-223`, tests
  `src/lib/security/selftest.ts:107-114`). On Worker subrequests the app must instead take `x-sg-ip`, and only
  when `x-sg-edge` is valid. Unverified: what CF-Connecting-IP / X-Forwarded-For look like on a same-zone Worker subrequest (§9 V9).
- **Media and static assets:** in subdomain/custom modes, publish absolute **platform-origin** media URLs
  (`https://maindomain/media/<key>`, content-addressed and immutable, `src/app/media/[key]/route.ts`) and add a Cloudflare
  Cache Rule "cache everything" for `/media/*`. Image requests then never count against the Worker quota and are
  served from the edge. Root-relative `/media/` also works through the Worker but costs one Worker request per image.
  The landing CSP `img-src`/`media-src` (`src/lib/render/csp.ts:157-160`) must then list the platform origin.

---

## 4. App design (Next.js 16 proxy + routes)

### 4.1 Proxy conventions that matter (local Next docs)

- Proxy defaults to the **Node.js runtime**, and setting `runtime` in the proxy file throws
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:253-255`).
- "you should not attempt relying on shared modules or globals" (`proxy.md:19`). **Host → store resolution with
  DB access belongs in route handlers, not in the proxy.** The proxy only parses the host and rewrites.
- `NextResponse.rewrite()` propagates RSC headers automatically (`proxy.md:472-476`).
- Matcher values must be constants (`proxy.md:136`). The current broad matcher
  (`src/proxy.ts:133`) already sees every path except static/media.
- Server Functions are POSTs to the route that uses them, and a matcher that excludes a path also skips them
  (`proxy.md:249-251`). So the store-host rule "404 any `Next-Action` POST" must sit in the proxy **and** in a
  server-side guard.
- Next's own multi-tenant guide only points to the Vercel Platforms starter (`node_modules/next/dist/docs/01-app/02-guides/multi-tenant.md`).
  Its subdomain-rewrite pattern is the same idea, but it assumes Vercel's wildcard domains, which Hostinger lacks.

### 4.2 Effective host (the one value everything keys on)

Today `requestHost()` prefers `Host`, then the right-most `X-Forwarded-Host` (`src/lib/auth/gate.ts:122-131`), and
the order-API `selfHosts()` accepts **any** `Host`/`X-Forwarded-Host` (`src/lib/orders/origin.ts:94-110`). Add
one function, `effectiveHost(headers)`:

1. If `x-sg-edge` is present and `timingSafeEqual(x-sg-edge, EDGE_KEY)` → `normalizeHost(x-sg-host)`
   (`src/lib/auth/config.ts:134-148`), and the request is tagged `via=edge`.
2. Otherwise → `requestHost()` (Hostinger direct: the apex or the temp domain), tagged `via=direct`.
3. The proxy **always** deletes client-sent `x-sg-*`, plus internal headers (extend `INTERNAL_HEADERS`,
   `src/proxy.ts:34`), and forwards its own verified `x-sg-eff-host` / `x-sg-mode` request headers to the app.
   This is the same pattern as the nonce header (`src/proxy.ts:112-116`).

`EDGE_KEY`: 32+ random bytes, stored as a Worker secret and a Hostinger env var. Rotation: accept `EDGE_KEY` and
`EDGE_KEY_PREV` for 24 h.

### 4.3 Host classes and the proxy decision table

| Effective host | Class | Proxy action |
|---|---|---|
| `PLATFORM_HOST` (apex; the temp domain today) | platform | Today's behaviour: `/`, marketing, `/login`, `/signup`, `/invite/*`, `/app/**`, gated `/admin/**`, `/api/public/*`, `/media/*`, and path-mode stores `/s/<h>/**` |
| `ADMIN_HOST` (optional, e.g. `console.maindomain` via the Worker) | console | Existing ADMIN_HOST logic (`src/proxy.ts:75-104`, `src/lib/auth/config.ts:179-212`), evaluated on the effective host |
| `<label>.STORE_ROOT_DOMAIN`, `label` matches the handle rules and is not reserved | store (subdomain) | Path starts with `/s/`, `/_d/`, `/app`, `/admin`, `/api/app`, `/api/admin`, or carries `Next-Action` → neutral 404 (`src/lib/auth/unknown-page.ts`). `/api/public/*` and `/media/*` pass through unchanged. Anything else → `rewrite('/s/<label>' + path)` |
| `<reserved>.STORE_ROOT_DOMAIN` (www, app, api, mail…) | reserved | 404 (or the www redirect if it ever gets here) |
| deeper (`a.b.maindomain`) | invalid | 404 (no TLS for it at Cloudflare anyway) |
| anything else via edge | custom domain (P1) | Same as a store, but `rewrite('/_d/<host>' + path)`. The handler resolves host → store with `store_domains` (verified only) and an LRU |
| anything else direct | foreign | Neutral 404 + the existing once-per-host log (`src/lib/render/serve.server.ts:74-83`) |

Internal prefixes `/_d/` and `/s/` on a store host are always 404, so `storeA.maindomain/s/storeB/x` cannot
address another store. On the platform host `/_d/*` is 404 unless the proxy set the verified internal header.

### 4.4 Addressing modes and canonical URLs

| Mode | URL | Available | Notes |
|---|---|---|---|
| **P (path)** | `https://<PLATFORM_HOST>/s/<handle>/<slug>` | Always (only mode on the temp domain) | Every store shares one origin, so its web storage is shared too. Namespace the storage keys (TENANCY-MAP LND-12..14) and forbid tenant JS (TENANCY-MAP §7.8) |
| **S (subdomain)** | `https://<handle>.<STORE_ROOT_DOMAIN>/<slug>` | When `STORE_ROOT_DOMAIN` and `EDGE_KEY` are set | Each store has its own origin |
| **C (custom)** | `https://shop.brand.ma/<slug>` | P1, per verified `store_domains` row | Its own registrable domain, so Meta domain verification and pixel cookies belong to the seller |

- **Canonical** = C if a primary verified domain exists, else S if enabled, else P. All other addresses of a live
  store answer **308 on GET/HEAD** to the canonical, keeping the path and **the full query string** (ads carry
  `fbclid`/`ttclid`/UTM). POSTs to `/api/public/*` are accepted from every address the store owns: old HTML keeps
  working through the transition, because the runtime posts to relative URLs.
- **URL builders** (TENANCY-MAP §6.2): `storeOrigin(store)`, `storeUrl(store, path)`, `adminHref(store, path)`.
  Used by publish (canonical, og:url, JSON-LD: TENANCY-MAP PUB-11, `src/lib/render/publish.server.ts:68-78`), CAPI
  `event_source_url` (TENANCY-MAP PIX-02), sitemaps, admin "view live" links (TENANCY-MAP ADM-39) and emails.
- **In-page links:** generate them at render time from a `base` value (`/s/<h>/` in P, `/` in S/C) and do not rely on
  document-relative links. A page at `/s/h/slug` that links `merci` resolves to `/s/h/merci`, not
  `/s/h/slug/merci`. On an address change, re-render live versions in cron batches (TENANCY-MAP §11.1
  "Static publish vs store chrome").
- **`PUBLIC_URL`** (`src/lib/auth/config.ts:158-167`, used by CSP, CSRF, origin, canonical and HTTPS detection,
  TENANCY-MAP §5 row PUBLIC_URL) becomes **`PLATFORM_URL`** (the platform origin; keep `PUBLIC_URL` as an alias for
  one release). Per-store origins come from the DB, never from env.

### 4.5 Cookies and storage isolation

| Item | Rule | Why |
|---|---|---|
| Platform session + gate cookies | Stay `__Host-cs` / `__Host-csg` (`src/lib/auth/config.ts:9-10`): Secure, `Path=/`, **no `Domain`**. Set only on the platform/console host. **Never `Domain=.maindomain`** | `__Host-` cookies "must not have a Domain attribute" (MDN). A store subdomain can set `Domain=maindomain` cookies on the parent ("a response from api.example.com can set … Domain=example.com"), but it can't create or overwrite a `__Host-` cookie that way. This blocks cookie tossing from pixel scripts on store hosts. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie |
| Store hosts | Never set or read session cookies. The proxy strips the `Cookie` header before rewriting store-host requests to the store routes; storefront features that need state use store-scoped localStorage | A store page's third-party scripts must never ride the owner's session |
| Same-site, not same-origin | `store.maindomain` and `maindomain` are **same-site**, so `SameSite=Lax/Strict` gives **no** protection between them. The dashboard's mutation check already requires `Sec-Fetch-Site: same-origin` and an exact Origin host (`src/lib/security/csrf.ts:48-56`). Keep it strict, never widen it to "same-site", and never accept store hosts as admin origins (TENANCY-MAP AUTH-24) | Fetch Metadata separates same-site from same-origin |
| Visitor storage | S/C modes: localStorage/sessionStorage are per origin, so they are isolated automatically. P mode: one origin for every store, so the keys must be store-prefixed | TENANCY-MAP LND-12..14, §7.8 |
| Ad cookies (`_fbp`, `_fbc`, `_ttp`) | In S mode, pixel scripts may write them on the registrable domain, so they would be **shared across all stores** (one browser id across sellers). Custom domains fix this | Meta documents `_fbp` "subdomainIndex" (domain level), https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc. **Unverified:** the pixel's default cookie domain level |
| HSTS | Keep `max-age=63072000` without `includeSubDomains` (`src/lib/security/headers.ts:43-45`). P2 option: `includeSubDomains` on the platform apex only, once every subdomain the platform uses is proven HTTPS (mail/webmail records go to Hostinger) | Safety first |

**Public Suffix List (P2).** Listing `STORE_ROOT_DOMAIN` in the PSL private section makes each store its own
"site" (cookie and same-site boundary, Meta eTLD+1), the way `myshopify.com` works. Requirements: a `_psl` TXT
record, more than 2 years of registration left, no SLA on timing, and "projects serving only a few thousand users are
quite likely to be declined" (https://github.com/publicsuffix/list/wiki/Guidelines). Listing would also stop cookies
at the platform apex if the apex itself were inside the listed suffix. That is a strong reason to make
`STORE_ROOT_DOMAIN` a **separate config value** now, so stores can later move to a dedicated storefront domain
(for example `maindomain-stores.shop`) without code changes. The owner asked for `store.maindomain`: launch with
`STORE_ROOT_DOMAIN = maindomain`, and keep the door open.

### 4.6 CSP, CORS and the order API per host

- **Document CSP:** `documentOrigins()` today allows `PUBLIC_URL` plus its www twin and never reflects other
  hosts, because responses are cached (`src/lib/render/serve.server.ts:100-127`). New rule: add
  `https://<effective host>` **only when** `via=edge` and the host maps to the served store (subdomain label = the
  store's handle, or a verified domain of that store). Cloudflare's cache key includes the host, so a per-host CSP
  is cache-safe. Keep the Hostinger CDN off so no second cache mixes hosts.
- **Order/lead/event/upsell API** (`src/lib/orders/origin.ts:122-134`): replace `selfHosts()` with
  `storeHosts(storeOfPageKey)` = {platform host (P mode), `<handle>.STORE_ROOT_DOMAIN`, verified custom domains}.
  An Origin from store A posting store B's pageKey is refused. Keep "no Origin ⇒ allowed + flagged" for non-browser
  clients, and keep `Sec-Fetch-Site` cross-site ⇒ refused. Export CORS (`originAllowed`, `sharedSuffix`,
  `src/lib/orders/origin.ts:55-91`) is unchanged. Add `STORE_ROOT_DOMAIN` to the shared-suffix set so a tenant can
  never allow-list `*.maindomain` (every store) as an export origin.
- **Turnstile:** one platform widget whose hostname is the apex covers every store subdomain ("adding a hostname
  automatically authorizes all of its subdomains"). Free widgets allow **10 hostnames** and no wildcards
  (https://developers.cloudflare.com/turnstile/concepts/hostname-management/). Custom domains therefore need
  per-store widgets (the seller's own keys, existing per-store override, TENANCY-MAP §5 turnstile row) or a
  rotating pool of platform widgets (10 domains each).

### 4.7 SEO files per store

| Host | `/robots.txt` | `/sitemap.xml` |
|---|---|---|
| Platform | Marketing pages indexable (override the root layout `noindex`, TENANCY-MAP C8); disallow `/app`, `/admin`, `/s/` once S mode is on (canonical points to subdomains) | Marketing pages only |
| Store (S/C) | Rewritten to `/s/<h>/robots.txt`: `Sitemap: https://<canonical host>/sitemap.xml`; suspended/draft stores `Disallow: /` | Store pages at the canonical origin only |
| Store in P mode | `/s/<h>/robots.txt` is not read by crawlers (robots is per host), so put the per-page robots meta and canonical in the HTML; the platform `robots.txt` lists `Sitemap:` lines for each indexable P-mode store | `/s/<h>/sitemap.xml` |

### 4.8 Store handles = subdomain labels

- **Format:** `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$` (3–30 chars; DNS allows 63). No `--` at positions 3–4 (this
  blocks `xn--` punycode and look-alike IDNs). ASCII only. Same pattern family as `SLUG_RE`
  (`src/lib/render/publish.server.ts:47`).
- **Reserved (never a store):**
  - infrastructure: `www, app, admin, api, console, dashboard, platform, mail, webmail, smtp, imap, pop, pop3, mx, ns1, ns2, ftp, sftp, cpanel, hpanel, autodiscover, autoconfig, cdn, static, assets, media, img, images, files, uploads, status, health, docs, help, support, blog, news, login, signin, signup, register, auth, sso, oauth, id, account, accounts, billing, pay, payment, checkout, secure, wallet, stores, store, shop, s, go, link, links, l, preview, staging, dev, test, demo, sandbox, beta, partners, affiliates, legal, terms, privacy, security, abuse, postmaster, hostmaster, webmaster, root, system, internal, edge, origin`
  - the TENANCY-MAP C4 list and the `ADMIN_GATE` value
- **Brand-protection deny list** (anti-phishing on a shared domain): `meta, facebook, instagram, whatsapp, tiktok, snapchat, google, youtube, apple, paypal, stripe, visa, mastercard, amazon, shopify, youcan, jumia, avito, cmi, cashplus, wafacash, barid, poste, amana, cih, attijari, bmce, bank*, gov, police, douane, dgi, cnss`, plus offensive terms. Platform admins can override this list case by case.
- **Lifecycle:**
  - Rename: the old label 308s for 12 months, because ads and printed QR codes outlive renames.
  - Delete: the label is **quarantined for 180 days**. A quarantined or unknown label answers a neutral platform "store unavailable" page (410 for deleted, 404 for unknown, no tenant content). With wildcard DNS there is never dangling per-store DNS, so this classic takeover vector doesn't exist; the risk is handle *re-registration*, which the quarantine covers.
  - Suspended store: 503 with `Retry-After`, neutral page, orders API refused.

---

## 5. Custom domains (P1): Cloudflare for SaaS

**Facts.**
- Custom hostnames: **100 included** on Free/Pro/Business, **$0.10** per extra hostname, up to 50,000; wildcard custom hostnames and apex proxying (BYOIP) are Enterprise-only (https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/).
- Setup:
  - a **fallback origin** (a proxied record in the SaaS zone)
  - a CNAME target (for example `stores.maindomain`)
  - the customer adds a CNAME to it
  - a hostname is ready when `status` and `ssl.status` are both `active`
  - an A record at the apex "is not a supported setup" by default

  (https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/)
- Ownership pre-validation: a TXT record `_cf-custom-hostname.<host>` = UUID, or an HTTP token at `/.well-known/cf-custom-hostname-challenge/<id>` (https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/).
- Workers: a `*/*` route on the SaaS zone catches all custom hostnames; a Worker can be the origin (https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/).

**Flow:**
1. The tenant types `shop.brand.ma` in Settings → Domains.
2. The server validates it: `normalizeHost`, not `sharedSuffix()` (`src/lib/orders/origin.ts:55`), not the platform/admin/store-root domain or a subdomain of it, and not already active on another store.
3. The server creates a `store_domains` row (TENANCY-MAP §4 row `store_domains`, plus `status`, `cf_hostname_id`, `last_checked_at`, `dns_lost_at`).
4. The server calls the Cloudflare API: create a custom hostname with `ssl.method=http`.
5. The UI shows two records: CNAME `shop → stores.maindomain` and TXT `_cf-custom-hostname.shop` (pre-validation, so TLS is ready before cutover).
6. Cron (5 min) polls the status, and the UI shows a live timeline: DNS seen → ownership → certificate → live.
7. On `active`, the tenant clicks "Make primary": canonical switches, older addresses 308, live pages re-render in batches.

**Apex domains (`brand.ma`):** they need CNAME flattening/ALIAS at the customer's DNS. Hostinger DNS has ALIAS
([MCP], §1.1) and Cloudflare DNS flattens CNAMEs. Otherwise use `www.brand.ma` plus registrar forwarding for the apex.
The wizard detects the registrar from NS records and shows the matching steps.

**Takeover and abuse prevention:**
- A domain is bound to a store only after ownership proof, using Cloudflare's TXT/HTTP pre-validation or our own TXT `_storegen.<host>` with a per-store token.
- A daily re-check: if the CNAME no longer points to us, mark `dns_lost`, stop treating the host as an allowed origin, and release it after 30 days.
- Another tenant can never claim an active or quarantined host.
- Show IDN hosts in punycode next to the Unicode form.
- Refuse platform-reserved hosts.
- Store the Cloudflare API token (scoped to the one zone with custom-hostname/SSL permissions; confirm exact permission names in the dashboard) as a platform secret, never per tenant.

**Unverified:** whether `x-sg-host` on a SaaS custom hostname request equals the customer hostname. It should, since the Worker reads the incoming `Host` (§9 V12).

---

## 6. Feature ideas, ranked

| # | Feature | P | Effort | Why it matters to a COD seller |
|---|---|---|---|---|
| 1 | Host router in `proxy.ts` + `effectiveHost` + internal rewrite to `/s/<h>` (§4.2–4.3) | P0 | M | Their own `brand.maindomain` from day one looks professional in ads and WhatsApp, with no DNS work for them |
| 2 | Path mode `/s/<handle>` on the temp domain, kept forever as a fallback | P0 | S | The SaaS launches now, before any domain is bought |
| 3 | URL builders + canonical 308 keeping the full query (§4.4) | P0 | M | Ad links never break and `fbclid`/UTM attribution survives moves |
| 4 | Handle rules, reserved + brand-protection lists, rename redirects, 180-day quarantine (§4.8) | P0 | S | Stops phishing look-alikes on the shared domain that could get it blocked by Meta/Google |
| 5 | Cookie/CSRF/CSP/order-API per-host rules (§4.5–4.6) + cross-tenant tests | P0 | M | One store's pixel script can never touch another store or the owner's dashboard |
| 6 | Per-store robots/sitemap + canonical (§4.7) | P0 | S | Organic traffic per store without duplicates across modes |
| 7 | Cloudflare edge setup kit: zone, wildcard, www redirect, Worker source in repo (`edge/worker.js`), runbook (§8) | P0 | M | One evening of owner work, then every new store is instant |
| 8 | Platform console "Domains" view: per store, all addresses, mode, canonical, TLS state, last check, 308 hits | P0 | S | The owner sees and controls every store's address from the main domain (brief item 13) |
| 9 | "Live address" card in the store dashboard: copy link, QR code, WhatsApp share, a test-order link | P1 | S | Sellers paste the link into ads/WhatsApp in seconds |
| 10 | Custom domains via Cloudflare for SaaS + DNS wizard with live status timeline (§5) | P1 | L | Serious advertisers need their own domain (Meta domain verification at eTLD+1, their own cookies, trust) |
| 11 | Edge HTML caching in the Worker + purge on publish | P1 | M | Faster first paint on 3G/4G in Morocco; less load on Hostinger's shared 3 GB RAM |
| 12 | Domain health alerts (DNS lost, cert failing, CNAME changed) to the dashboard + WhatsApp/email | P1 | S | Prevents silent downtime during a running ad campaign |
| 13 | Turnstile hostname pool / per-store keys for custom domains (§4.6) | P1 | S | Anti-spam keeps working on custom domains (fake COD orders cost delivery fees) |
| 14 | Separate storefront root domain (`STORE_ROOT_DOMAIN` ≠ platform) | P1 | S | Clean security boundary; prerequisite for PSL |
| 15 | Per-landing custom path aliases and short links (`go.maindomain/x` → store page + UTM preset) | P2 | M | Clean links per ad set, tracked by campaign |
| 16 | PSL listing of the storefront domain | P2 | L (slow, external) | Each store becomes its own site for cookies and Meta |
| 17 | Domain search/buy assistance (availability via registrar API, deep links to buy) | P2 | M | Fewer drop-offs at "get a domain" |
| 18 | Preview hosts `p-<token>.maindomain` for builder previews on their own origin | P2 | S | Shareable previews for clients/partners without exposing the dashboard origin |
| 19 | VPS / dedicated origin migration path (Caddy on-demand TLS, no Worker) | P2 | L | When Hostinger's NPROC/RAM ceiling is hit |

---

## 7. Decisions for the architect

| Topic | Recommendation | Confidence |
|---|---|---|
| Wildcard delivery | Cloudflare wildcard + Worker forwarding to the single Hostinger hostname | High |
| Hostinger-native subdomain per store | Don't (5-app cap reached; probably a Node process per hostname; no wildcard; per-store SSL) | High |
| Dashboard location | Apex `/app/<handle>/…`; console `/admin/**` gated on the apex (or on `console.` via ADMIN_HOST later) | Medium |
| Store root domain | Config value `STORE_ROOT_DOMAIN`, = apex at launch (owner's wish), separable later | High |
| Proxy role | Pure host parsing + rewrite; DB resolution in handlers | High |
| Edge trust | Shared-secret header, constant-time compare, stripped otherwise; rotation with PREV key | High |
| Media in S/C modes | Absolute platform-origin `/media/` URLs + Cloudflare cache rule | Medium |
| Custom domains | Cloudflare for SaaS in P1, not Hostinger parked domains | Medium-high |
| Canonical policy | C > S > P, 308 on GET/HEAD with the query, POST API accepted on all owned addresses | High |
| Handle lifecycle | 12-month rename redirects, 180-day delete quarantine, brand deny list | Medium |

---

## 8. What the owner buys and does, and the migration

**Buy:**
1. A domain. A `.com` (or `.shop`/`.store`) works for Morocco and Europe. It can be bought at Hostinger (the MCP
   `domains_availability_check` is read-only and can check names). Prices are not researched here.
2. A free Cloudflare account. The Workers Free tier is enough to start; Workers Paid is $5/month when traffic passes
   100,000 store requests/day.

**Steps (about 1–2 hours, after the app ships the P0 router):**
1. In hPanel, connect the new domain to the **Store Gen** website (lightgreen-hippopotamus) as its domain. Never
   touch myrizq.shop. Check U3: what happens to the temp domain.
2. In Cloudflare, add the zone. Cloudflare imports the DNS. Then:
   - check the apex A record points to the Hostinger server IP (shown in hPanel; the `ftp` A record of the myrizq zone shows the account IP, 92.113.28.252, but confirm it for the new site)
   - copy Hostinger mail records (MX/SPF/DKIM) if mailboxes are used
   - add `*` as a proxied record (any target; the Worker answers)
3. At the registrar, switch the nameservers to Cloudflare's pair. With a Hostinger-registered domain, the owner does this in hPanel (an API write: the owner's action, not an agent's).
4. Turn the Hostinger CDN off for this domain (hPanel). Choose the TLS route:
   - **Hostinger SSL:** confirm it is active for the apex (U4). Cloudflare SSL mode is then **Full (strict)**.
   - **or Cloudflare Origin CA:** upload a Cloudflare Origin CA certificate as a custom SSL in hPanel (Full strict).
5. In Cloudflare, add the Redirect Rule `www` → apex, the Cache Rule for `/media/*` and the Worker `sg-edge` (code from the repo, pasted in the dashboard editor or deployed with wrangler). Set the secret `EDGE_KEY` and the route `*.<domain>/*`.
6. In Hostinger env (full replace of all keys, HANDOFF §4), set:
   - `PLATFORM_URL=https://<domain>` (and `PUBLIC_URL` to the same value during the alias release)
   - `STORE_ROOT_DOMAIN=<domain>`
   - `EDGE_KEY`
   - `BEHIND_CLOUDFLARE=1`
   - `TRUSTED_PROXY_HOPS` as the Visitor IP check says

   Then rebuild (PUBLIC_URL is read at build time, HANDOFF §4).
7. Re-render all live pages (cron batch).
8. Turn on temp-domain → new-domain 308s: `/s/<h>/<path>` → `https://<h>.<domain>/<path>` and `/` → `https://<domain>/`.
   Keep them **forever**, because ads and old WhatsApp messages keep the temp links.
9. Update the cron URL in hPanel, the Meta/TikTok domain settings, Turnstile hostnames and Google Sheets links.
10. Run the verification plan (§9), then the live smoke test (HANDOFF §4 step 7) on both hosts.

---

## 9. Verification plan

| # | Check | Pass condition |
|---|---|---|
| V1 | `host-selftest.ts` (TENANCY-MAP §10): table tests of the §4.3 decision table, forged `x-sg-*` without the key, `/s/` and `/_d/` on store hosts, reserved/deep labels, `Next-Action` POST on a store host | All 404s and rewrites as specified |
| V2 | Probe U1/U2 (optional, on the real domain): add one Hostinger subdomain alias to the Node site; does it serve the app? Do hPanel resource-usage processes grow by about 11 threads? Remove it afterwards | Recorded in HANDOFF; it decides whether Hostinger-native is ever usable |
| V3 | `curl -sI https://probe.<domain>/` → the app's neutral 404 with `x-sg-mode: subdomain`; `curl -sI https://<domain>/` does not run the Worker; `www` 301s | As stated |
| V4 | Direct-origin forgery: `curl --resolve <domain>:443:<hostinger-ip> -H 'x-sg-host: victim.<domain>' -H 'x-sg-edge: wrong' https://<domain>/` | Treated as the platform host; the header is ignored |
| V5 | Playwright (msedge): log in on the apex, open a store subdomain; no `Cookie` reaches store routes; `document.cookie="__Host-cs=x; Domain=<domain>; Secure; Path=/"` from the store page is rejected; the dashboard POST with `Sec-Fetch-Site: same-site` is refused | As stated |
| V6 | Order API: a page on store A posting store B's pageKey → `invalid/forbidden`; a correct post from `a.<domain>` succeeds; one from the P-mode URL succeeds during the transition | As stated |
| V7 | Redirects: temp `/s/h/x?fbclid=1&utm_source=fb` → `https://h.<domain>/x?fbclid=1&utm_source=fb` (308); renamed handle → new handle (308) | Query preserved byte for byte |
| V8 | TLS: `openssl s_client -servername h.<domain>` shows a Cloudflare edge cert covering `*.<domain>`; `a.b.<domain>` fails (expected) | As stated |
| V9 | Settings → Security → Visitor IP check on a store host and on the apex shows the tester's real IP (through `x-sg-ip` / CF-Connecting-IP) | Real IP both ways |
| V10 | Turnstile on a store subdomain with the apex-hostname widget | Token verifies |
| V11 | Load: 200 concurrent store requests through the Worker; Hostinger NPROC stays flat (one process); Worker analytics shows the request count vs the 100k/day free quota | No 503s |
| V12 | (P1) A custom hostname test (`shop.<second-test-domain>`): pre-validation TXT → active; `x-sg-host` = the customer host; the CSP allows only it + the platform | Active, isolated |

---

## 10. Risks

- **The Worker is a hard dependency.** If it is misconfigured or over quota (Free: 100k requests/day), every subdomain store goes down. Mitigation: alert on Worker errors; move to Workers Paid before ad scale; path mode stays reachable as an emergency address.
- **Cloudflare free-tier policy changes** (Origin Rules, Snippets and SaaS pricing have all moved over time) can change the economics. Keep the Worker trivial so a VPS/Caddy fallback (P2) is a weekend's work.
- **Shared registrable domain:**
  - every store is same-site with the dashboard; isolation rests on origin checks, `__Host-` cookies and Fetch Metadata
  - one phishing store can get the whole domain flagged by Safe Browsing or ad platforms (mitigations: brand deny list, account approval before go-live per brief item 13, abuse takedown in the console)
- **Meta/TikTok attribution on subdomains:** domain verification is at eTLD+1, and "subdomains … cannot be verified for use in Aggregated Event Measurement" (Meta guidance via the search summary). So sellers can't verify `store.maindomain` in their own Business portfolio. Pixel cookies may be shared across stores. Push custom domains for serious advertisers.
- **One Node process for everything:** Hostinger's 3 GB RAM / 2 cores / NPROC 120 are shared with COD Studio and the other sites on the account. The Worker-cached HTML and Cloudflare-cached media are essential, not optional.
- **Hostinger SSL behind the Cloudflare proxy** may fail to renew (U4). The Origin CA certificate avoids it but must be re-uploaded before expiry.
- **Turnstile hostname limit** (10 per free widget, no wildcards) caps custom domains per widget.
- **Wrong `TRUSTED_PROXY_HOPS`/`BEHIND_CLOUDFLARE`** after the DNS move breaks rate limits and the risk score (IP-based). Run V9 immediately.
- **Baked absolute URLs** in published HTML (HANDOFF §4 "PUBLIC_URL must equal the live domain") mean a forgotten re-render serves CSPs that block orders on the new host. The migration must re-render before the 308s go live.
- **Deleting a store** that still has running ads: quarantine plus a neutral 410 page, never another tenant's content.

## 11. Unverified (summary)

- U1–U4 (§1.4): how Hostinger's Node app behaves with aliases/subdomains, process count per hostname, the temp-domain behaviour after connecting a domain, and LE renewal behind Cloudflare.
- The current hPanel wildcard ban rests on a search summary of an older Hostinger article. The current page is silent.
- Cloudflare route pattern semantics for apex vs `*.`. CF-Connecting-IP/X-Forwarded-For contents on same-zone Worker subrequests. Whether Redirect Rules run before Worker routes for `www` (the Worker can also redirect `www` itself).
- The Meta pixel's default `_fbp` cookie domain level, and whether one domain can be verified by several Meta business portfolios.
- The exact Cloudflare API token permission names for custom hostnames.
- The Hostinger server IP for the new site (92.113.28.252 is the `ftp` A record of the myrizq.shop zone, the same account).
