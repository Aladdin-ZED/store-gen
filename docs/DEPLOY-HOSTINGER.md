# Deploying COD Studio on Hostinger Business

Hostinger **Business** ("Unlimited") web hosting runs Node.js web apps (Next.js in full server mode) next to a
managed **MariaDB** database. This guide takes you from zero to a live, private admin and public landing pages.

> Plan check: Premium does **not** run Node.js. Business/Unlimited and every Cloud plan do.

---

## 0. What you need
- Your domain added to Hostinger (e.g. `mystore.ma`) with SSL active (free and automatic).
- A GitHub account (the recommended deploy method), or a `.zip` of the project.
- 20 minutes.

## 1. Create the database
hPanel → **Websites → (your site) → Databases → MySQL Databases**
1. Create a database, a user and a strong password. Note the three values.
2. The host for Node.js apps is **`127.0.0.1`**: not `localhost` (it can resolve to IPv6 `::1`, which the
   database user may not be allowed from) and not the `srvNNNN.hstgr.io` name hPanel shows (that one is for
   remote connections only).
3. Your `DATABASE_URL` becomes:
   `mysql://DB_USER:DB_PASSWORD@127.0.0.1:3306/DB_NAME`
   (URL-encode special characters in the password, e.g. `@` → `%40`, `#` → `%23`).

Tables are created automatically on the first start. Migrations from `drizzle/` run at boot, and a database
lock serialises them, so a restart during a deploy is safe.

## 2. Create the Node.js app
hPanel → **Websites → Add website → Node.js Apps** (or *Deploy Node.js app*)
1. Source: **GitHub** (auto-deploys on every push) or **Upload** a project zip. Leave `node_modules`, `.next`,
   `qa` and **`.env.local`** out of the zip: your local secrets must never be uploaded.
2. Framework: **Next.js** (auto-detected). Node version: **22** (`package.json` asks for `22.x`).
3. Build command: `npm run build`. It first compiles the landing CSS kit and runtime and the admin's
   Tailwind CSS (`prebuild`), then runs `next build`; if Turbopack fails on the build machine it retries
   once with webpack. Turbopack gets no loaders (Hostinger kills the Node workers they need: "node
   process exited before we could connect to it"), so never add a `postcss.config` or `turbopack.rules`.
   Hostinger handles the start command and applies standalone output itself, so `next.config.ts` stays a
   plain object without `output`. Output directory: `.next`.
4. Attach it to your domain (e.g. `mystore.ma`).

> The repository's `.npmrc` stops `onnxruntime-node` (a dependency of the in-browser AI) from downloading
> ~270 MB of CUDA libraries from nuget.org during `npm install` on Linux: the server never uses them. On your
> own computer, npm 11 prints `Unknown project config "onnxruntime-node-install"` for it: harmless. If a
> Hostinger build log ever shows a download from `api.nuget.org` again, add the environment variable
> `ONNXRUNTIME_NODE_INSTALL=skip` (environment variables apply to the build too).

> Do **not** add a `NODE_ENV` variable. The build needs the devDependencies (TypeScript, Tailwind, esbuild,
> lightningcss), and `NODE_ENV=production` during `npm install` would skip them. Next.js sets the production
> mode itself.

## 3. Environment variables
In the app's **Environment variables** panel, add the variables below. [`.env.example`](../.env.example) has the
same list with comments. Saving the variables redeploys the app.

**Required**

| Name | Value |
|---|---|
| `DATABASE_URL` | from step 1 |
| `APP_SECRET` | 64 random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. At least 32 chars: shorter, or a template value, and the admin is unreachable **and every order fails with HTTP 500** (visitor IPs are hashed with it). 48+ recommended. |
| `ADMIN_GATE` | your private door to the admin, e.g. `studio-k29fx81q4mz7w2pd`. **20+ random chars** of `A-Z a-z 0-9 _ -`. It cannot be a route name (`admin`, `api`, `media`, `fonts`, `login`, `setup`). |
| `SETUP_TOKEN` | a one-time token (8–128 chars of `A-Z a-z 0-9 _ -`) to create the first owner. Remove it after setup. |
| `PUBLIC_URL` | `https://mystore.ma`: canonical links, exports and server-side tracking. Must be `https://` for *Connected* exports. Live pages take orders **only on this domain** (and its `www.` twin): their security policy names no other. It is written into every published page: after changing it, see §12. |
| `CRON_KEY` | a random string, **at least 8 chars** (32 recommended). Without it the cron endpoint stays disabled (404). |
| `TRUSTED_PROXY_HOPS` | `1` to start, then **check it after the first deploy** in *Settings → Security → Visitor IP check* (§6): a CDN that adds a public hop needs `2`. |
| `BEHIND_CLOUDFLARE` | `0`, or `1` only when the domain is proxied by Cloudflare (see §6). |

**Optional**

| Name | Value |
|---|---|
| `GOOGLE_SA_JSON_B64` | Google service-account key, base64 on one line: see [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile keys (both or neither). These are defaults only: keys saved in *Settings → Anti-spam* take over (see §7). |
| `ADMIN_HOST` | **Recommended.** A host name of its own for the admin, e.g. `studio.mystore.ma` (see §4a). |
| `ADMIN_IP_ALLOWLIST` | comma-separated IPs allowed to reach the admin. Leave empty to allow all (see §6). |
| `APP_TIMEZONE` | the store time zone for dashboard days and Sheets dates. Default `Africa/Casablanca`. |
| `DB_QUOTA_MB` | your plan's size limit per database, in MB. Default `3072` (3 GB, Business). The admin warns at 70 % and pauses uploads at 85 % (§12). |

The server prints a `[boot]` line for every missing or weak value (never the value itself). Check the app's
logs after the first deploy: a line starting with `[boot] ERROR` must be fixed before the site takes orders.

> **`APP_SECRET` must never change after launch.** It signs sessions and the admin gate cookie, and it
> encrypts the 2FA secrets and the secret settings (Turnstile secret key, pixel API tokens). Changing it signs
> everyone out, closes the gate, breaks two-step sign-in (recovery codes still work) and makes those
> settings unreadable until they are entered again.

## 4. First login (private admin)
1. Open `https://mystore.ma/<ADMIN_GATE>` once (with `ADMIN_HOST` set: `https://studio.mystore.ma/<ADMIN_GATE>`;
   the gate does nothing on the public domain then). This unlocks the admin for this browser and redirects to
   `/admin`. Access slides with use: it expires after 30 days without a visit. Without the gate cookie, every
   `/admin` and `/api/admin` URL answers **404**, so the admin is invisible to the public.
2. Go to `/admin/setup`, enter `SETUP_TOKEN`, and create the owner account (email + strong password).
3. Enable **two-factor authentication** in *Settings → Security* (strongly recommended). Store the 10
   recovery codes somewhere safe.
4. Remove `SETUP_TOKEN` from the environment variables. Setup also closes for good once an owner exists.
5. Fill in *Settings → Store & legal* and *Settings → Market defaults*. Add teammates in *Settings → Team*
   (roles: owner, editor, agent).

## 4a. Admin on its own host (recommended)
Your live pages load the ad platforms' scripts (Meta, TikTok, Snap, Google). On a shared domain, every one of
those scripts runs on the same origin as the admin. If one were ever compromised, it could use your signed-in
browser to export orders or add users. `ADMIN_HOST` gives the admin an origin of its own:
1. Create a subdomain such as `studio.mystore.ma` and make it reach **this same Node.js app** (add it to the
   app as an extra domain or alias in hPanel), with SSL active.
2. Set `ADMIN_HOST=studio.mystore.ma` and keep `PUBLIC_URL=https://mystore.ma`. They must differ.
3. Unlock the admin at `https://studio.mystore.ma/<ADMIN_GATE>`. Setting or changing `ADMIN_HOST` closes the
   gate for every browser, and older admin cookies on the public domain stop working.

The admin host then serves only the admin. Landing pages, `/legal`, `/api/public` and `/api/cron` answer 404
there; only a browser that has unlocked the gate is sent on to the same page on `PUBLIC_URL`, so the
admin's "view live" links keep working. Keep the cron (§5) and every shared link on `https://mystore.ma`.
The public domain answers 404 for `/admin`, `/api/admin` and the gate. If your plan cannot route a second host name to the app, leave
`ADMIN_HOST` empty and open live pages only in a browser profile where you are not signed in to the admin.

## 5. Cron (Google Sheets sync + housekeeping)
1. First test the endpoint in a browser: `https://mystore.ma/api/cron/tick?key=YOUR_CRON_KEY` must answer
   `{"ok":true,…}`. A **404** means a wrong key, `CRON_KEY` not set, or the app not running yet.
2. hPanel → **Websites** → your site → **Dashboard** → **Advanced → Cron Jobs** (or type "Cron" in the
   sidebar search) → **Create Cron Job**.
3. Type **Custom**, schedule **every 5 minutes** (`*/5 * * * *`), command (one line):
   ```
   curl -fsS --max-time 110 -o /dev/null -H "X-Cron-Key: YOUR_CRON_KEY" "https://mystore.ma/api/cron/tick" || date >> "$HOME/cron-tick-failures.log"
   ```
   The header keeps the key out of web access logs. Never put a `%` in the command: cron turns it into a
   new line (so no `curl -w "%{http_code}"`). A failing run appends its time to `cron-tick-failures.log`
   in your home folder (File Manager): an empty or missing file means every run worked.
4. **Save**. When `PUBLIC_URL` moves to another domain, change the URL here too.

Always call the public `https://` address. `http://127.0.0.1` or `localhost` do not reach the app: Hostinger
runs it on an internal port behind its web server. The job runs on the same server as the app, so the app may
see it coming from the server's own or an internal address; that is fine, only the key lets it in.

Each run:
- pushes orders still queued for Google Sheets (up to 100 per run; new orders are normally sent within
  seconds, so this is the retry path) and pulls the statuses your team set in the sheet;
- purges expired sessions, old rate-limit buckets, visitor markers older than 2 days, and **abandoned
  leads older than 30 days**;
- keeps the Node.js process warm. Hostinger stops idle apps, so without the cron the first visitor after a
  quiet period waits for a cold start.

A missing or wrong key answers the same **404** page as any unknown address, and repeated guesses are
rate-limited per IP. With a valid key you get a small JSON report (`{"ok":true,…}`), which is handy for a first
manual test in the browser.

## 6. Proxies, real visitor IPs and Cloudflare
Rate limits, the duplicate-order guard, the IP blocklist and the risk score work per visitor IP (always
stored hashed). The app reads `X-Forwarded-For` from the right, where the proxies in front of it wrote, and
never the entries a visitor can send themselves:
- **internal** addresses (`10.x`, `172.16–31.x`, `192.168.x`, `100.64–127.x`, `127.x` and their IPv6
  equivalents) are skipped: they are Hostinger's own machines talking to each other;
- `TRUSTED_PROXY_HOPS` says how many **public** proxy addresses come after the visitor's. With `1`, the
  right-most public entry is the visitor.

On Hostinger a request passes the **Hostinger CDN** (response header `Server: hcdn`; hPanel →
**Performance → CDN**) and the web server before it reaches the app. Hostinger does not document what they
write into `X-Forwarded-For`, so the value has to be **checked on the live site**. A value that is too low
makes every visitor share one address: one shared rate limit (orders start failing with "too many requests"
at busy times) and "block IP" on one order blocks everyone.

**Check it right after the first successful deploy, and again whenever the CDN is turned on or off:**
1. Sign in to the admin on the live domain and open *Settings → Security* → **Visitor IP check** (owners
   only). It shows the IP the app reads from your own request, and the whole `X-Forwarded-For` chain.
2. Compare **Your IP as the app sees it** with your own public IP (search "what is my IP" from the same
   device and network).
   - Same address: the value is right. Nothing to do.
   - Your IP appears in the chain as **hop 2** (and hop 1 is another public address, the CDN's): set
     `TRUSTED_PROXY_HOPS=2` (saving redeploys), reload the page and check again.
3. Do the check from a normal connection (not a VPN), and once from your phone's mobile data.

| Setup | `TRUSTED_PROXY_HOPS` | `BEHIND_CLOUDFLARE` | `ADMIN_IP_ALLOWLIST` |
|---|---|---|---|
| Your IP is the last public entry (hop 1) | `1` | `0` | works only if your IP is also the **last** entry of the chain (no internal hop after it) |
| Your IP is hop 2 (a CDN with public addresses in front) | `2` | `0` | **leave empty**: it checks the last entry, the CDN's address, and would lock everyone out |
| Cloudflare proxy (orange cloud) → Hostinger | as checked above | `1` | **leave empty**: the app sees Cloudflare's address, so an allowlist would lock everyone out |

- `BEHIND_CLOUDFLARE=1` trusts the `CF-Connecting-IP` header, but only on requests that really come from a
  Cloudflare address. Set it only if **every** request goes through Cloudflare.
- Never set `TRUSTED_PROXY_HOPS` higher than the check shows: one hop too many lets a visitor choose the
  address the app sees (by sending their own `X-Forwarded-For`) and dodge the rate limits.
- Public endpoints also have a short in-memory limit per address in front of the database (beacons,
  abandoned-cart leads, upsells, cron). It sits far above what real shoppers send, even many shoppers on
  one mobile network.

## 7. Anti-spam (Cloudflare Turnstile, optional)
Every order already goes through a honeypot, rate limits, a duplicate guard, a blocklist and a risk score.
If fake orders still get through, add Turnstile:
1. Cloudflare dashboard → **Turnstile → Add widget** → your domain, mode *Managed* → copy the site key and
   the secret key.
2. Admin → *Settings → Anti-spam* → paste both keys → **Save**. (Or set `TURNSTILE_SITE_KEY` /
   `TURNSTILE_SECRET_KEY`. Keys saved in the admin override the variables.)
3. **Re-publish** your pages. The widget is part of the published HTML. It stays invisible until a visitor
   starts filling in the form, and it loads nothing before that.

Pages published before the keys existed (and exported pages) keep taking orders, which are flagged
*captcha missing*, until they are re-published. A Cloudflare outage never blocks a sale.

## 8. Pixels and server-side tracking
*Settings → Pixels*: enter the pixel IDs once, then use **Apply to pages**. New pages start with them (the
Generate wizard's *Ad tracking* step lets you untick any of them for that page). Live pages pick them up
when you re-publish them.
- **Up to 3 Meta pixels and 3 TikTok pixels**, plus one Snap pixel and one Google tag (GA4). Every pixel
  of a platform receives the same events.
- Browser events: **ViewContent** (page view), **AddToCart** (first offer chosen), **InitiateCheckout**
  (form started), **Lead** (TikTok: *SubmitForm*) and **Purchase** (order confirmed). The TikTok purchase
  event is **Purchase** (not *CompletePayment*).
- The **Purchase event id is the order id**, in the browser pixel and in the server event alike, so each
  platform counts an order once.

Purchases are also sent **server to server** for each Meta and TikTok pixel that has its own token:
- **Meta Conversions API**: Events Manager → your pixel → Settings → *Generate access token*.
- **TikTok Events API**: Events Manager → your pixel → Settings → *Generate access token*.
- Each pixel has its own **access token** and optional **test event code**. With a test code set, that
  pixel's server events land in the platform's *Test events* screen only. **Send test event** next to the
  pixel sends one test Purchase and shows the platform's own answer. Remove the test code after testing.
- The customer's phone and name (email and city when given) are sent **hashed (SHA-256)**, never in
  clear; the privacy policy says so on pages with a Meta or TikTok pixel.
- Snap and GA4 Measurement Protocol secrets can be stored, but purchases on those platforms are tracked by
  the browser tag only.

These tokens are stored encrypted with `APP_SECRET`. They are not environment variables.

## 9. Publish your first page
Admin → **Generate** → drop product photos → pick a direction → edit → **Publish**.
Set it as **home page** in *Pages* so `https://mystore.ma/` shows it. Without a chosen home page, `/` shows
the most recently published page. Every page is also reachable at `https://mystore.ma/<slug>`, and its
thank-you page at `/<slug>/merci`.

The local AI in the generator runs in **your** browser (Chrome/Edge with WebGPU), not on Hostinger. See the
README's *Local AI* section.

## 10. Smoke test after each deploy
Open these in a private window (or use `curl -I`):

| URL | Expected |
|---|---|
| `https://mystore.ma/` | your home page (or a plain 404 page before the first publish) |
| `https://mystore.ma/admin` | **404** (the gate is closed in a fresh browser) |
| `https://mystore.ma/<ADMIN_GATE>` | **303** to `/admin`, which sends you to `/admin/login` |
| `https://mystore.ma/admin/setup` (after the owner exists) | **404** |
| `https://mystore.ma/api/cron/tick?key=YOUR_CRON_KEY` | `{"ok":true,…}` (a wrong or missing key: the plain **404** page) |
| `https://mystore.ma/api/public/order` (GET) | **405** (the endpoint only accepts POST) |
| `curl -X POST -H "Content-Type: application/json" -d "{}" https://mystore.ma/api/public/order` | **422** `{"ok":false,"error":"invalid","fields":{…}}` (a body that is not JSON: **400**) |
| `https://mystore.ma/legal/privacy` | your privacy page, once a page is published (**404** before) |
| `curl -i -X OPTIONS https://mystore.ma/api/admin/media` | **404** (no `Allow` header: the admin API stays invisible) |
| `https://mystore.ma/admin/login` and `https://mystore.ma/no/such/page` | the **same** plain 404 page (an admin address looks like any unknown one) |

With `ADMIN_HOST` set, the gate row becomes `https://studio.mystore.ma/<ADMIN_GATE>` → `/admin/login`.
Also check `https://mystore.ma/<ADMIN_GATE>` → **404** and `https://studio.mystore.ma/<slug>` → **404**.

Then:
- hPanel → your site → **Runtime logs** (or *Deployments → logs*): the start shows `[boot] applied N
  migration(s)` or `[boot] database schema up to date`, and no line starting with `[boot] ERROR`. A
  `[landing] a page was opened on …, which is not PUBLIC_URL` line means visitors reach your pages on a
  domain `PUBLIC_URL` does not name, where orders are blocked: fix `PUBLIC_URL` (§12).
- *Settings → Security → Visitor IP check*: **Your IP as the app sees it** is your own IP (§6).
- *Media*: upload one photo. It must appear in the library (this also checks that uploads pass the
  Hostinger proxies).
- Place one real test order on a published page and check that it shows up in *Orders* and in the sheet.

## 11. Security checklist
- [ ] 2FA enabled for every admin user
- [ ] `ADMIN_GATE` is 20+ random characters and not shared publicly
- [ ] `ADMIN_HOST` set to a subdomain of its own (§4a), or live pages opened only in a browser profile without an admin session
- [ ] `APP_SECRET` is 48+ random characters, saved in your password manager
- [ ] `SETUP_TOKEN` removed
- [ ] `TRUSTED_PROXY_HOPS` checked on the live site (*Settings → Security → Visitor IP check*, §6), and again after any CDN change
- [ ] Optional: `ADMIN_IP_ALLOWLIST` with your office/home IPs (only when your IP is the last entry of the chain, see §6)
- [ ] `BEHIND_CLOUDFLARE=1` only if all traffic is proxied by Cloudflare
- [ ] Google service-account JSON key stored only in the env var (never in Git or a zip)
- [ ] Cron job runs every 5 minutes (*Settings → Google Sheets* shows no orders left pending for long)
- [ ] Turnstile keys set in *Settings → Anti-spam* if you get fake orders

## 12. Updating and backups
**Updating the live site.** The live app was created from a repository URL, so Hostinger deploys its own
GitHub copy (a snapshot) in the owner's `aladdinzed35` account, not the `Aladdin-ZED` repository you push
to. Pushing to `Aladdin-ZED` therefore does **not** update the live site. Two ways to ship an update:
- **Upload an archive** of the new version through the Hostinger connector/API (a fresh build of the
  uploaded code; environment variables and the database are kept); or
- give the `Aladdin-ZED` account **push access** to the `aladdinzed35` copy and push there: every push to
  its connected branch then deploys automatically.

**Never click Redeploy while the site is linked to the old snapshot**: it rebuilds that old copy and replaces
the newer version you uploaded.

**Ship a new version.** With a GitHub-connected app, every push to the connected branch (`main`) starts a
new deployment of **that latest commit**: Hostinger pulls the code fresh each time, it never rebuilds an old
copy. To rebuild without a new commit (after a failed build, or to retry), use **Redeploy** on the site
dashboard or the **Deployments** page: it also pulls the latest code of the connected branch. Saving the
environment variables redeploys too. Each deployment lists its commit hash in *Deployments*: check that it
matches your latest commit on GitHub. If it does not:
- the status must read **Connected with GitHub** (fix access with the button it shows otherwise);
- the connected **branch** must be the one you push to;
- an app created by pasting a public repository URL deploys Hostinger's own copy of that repository, which
  does not follow your pushes: connect the app to your repository instead (*Disconnect from repository*,
  then connect yours), or create a new Node.js app from it and move the domain.

A failed build never replaces the live version: the site keeps running the last good deployment.

Uploaded images and videos, pages, versions, orders and settings all live in the database, so redeploys
never lose data (Hostinger replaces the app folder on every deploy). New migrations apply automatically at
boot. Hostinger keeps database backups, and you can also export from phpMyAdmin.

**Database size.** Business allows 3 GB per database, and past it Hostinger suspends writes until the size
drops: orders and sign-ins would fail too. Images and videos are most of it. The *Media* screen shows the
current size; from 70 % the dashboard warns, and from 85 % new uploads are paused so orders keep the rest.
Prefer short, compressed clips, delete files you no longer use, and keep an eye on hPanel → **Databases**.
The figure follows deletions with a delay of a few minutes.

**Moving to another domain** (e.g. from the temporary `…hostingersite.com` address to your own):
1. Update `PUBLIC_URL` (saving redeploys) and, if you use one, `ADMIN_HOST` (§4a).
2. **Re-publish every live page**: canonical and social-preview links are written into each published page.
3. Re-create *Connected* exports: old ZIPs keep sending orders to the old address.
4. Change the URL in the cron job (§5).

## Static exports (optional)
Any published version can be exported as a ZIP (Admin → page → **Export**) and uploaded to any host,
including Hostinger Premium (File Manager → `public_html`). Orders from exported pages either flow into
this app (*Connected*: needs an `https://` `PUBLIC_URL`; only the domains you allow can post), go through the
bundled `order.php` to Google Sheets (*PHP*), or open a WhatsApp message (*WhatsApp*). Connected exports can
be revoked from *Exports*. See the README inside the ZIP.
