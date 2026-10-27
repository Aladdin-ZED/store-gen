# Store Gen: project handoff

> **This repo is Store Gen** (`Aladdin-ZED/store-gen`). It was cloned on 2026-10-23 from COD Studio
> (`Aladdin-ZED/Landing-page-gen`, live at myrizq.shop) to grow into a **multi-tenant store-generator SaaS**.
> Read **docs/STORE-GEN-BRIEF.md** for the goals. The two projects are separate: different repo, local folder,
> Hostinger website, database and secrets. **Never deploy Store Gen to myrizq.shop.** Everything below about
> COD Studio's code and lessons still applies, but the deployment target is the Store Gen site in §4.

Everything a new session (or a new engineer) needs to continue this project without the original chat.
Last updated 2026-10-23, at commit `b995a48` plus this document; §4 (the R1.0 deploy method) rewritten 2026-10-27 at the R1.0 integration.

## 1. What this is

COD Studio has two parts:

- **Public product landing pages** for cash-on-delivery (COD) sales. They are art-directed per product vibe,
  rendered to static HTML at publish, and sell through an order form, bundles/offers, pixels and Google Sheets.
- **A private admin.** It generates the page design from product photos, using a local in-browser AI with a
  rule-based fallback, and a full builder to edit, version, publish and export pages.

| | |
|---|---|
| Owner | COD seller, Morocco first (Arabic/Darija + French, MAD), Europe later. Writes in non-native English: answer plainly. |
| Live site | **https://lightgreen-hippopotamus-140853.hostingersite.com** (Store Gen, temporary Hostinger domain only). COD Studio itself stays on myrizq.shop. |
| Repo | **https://github.com/Aladdin-ZED/store-gen** (`main`; this PC pushes as `Aladdin-ZED`). Local folder `C:\Users\SICO\store-gen`. |
| Stack | Next.js 16.4 (App Router, Turbopack), React 19.3, TS strict, Zod v4, Drizzle + mysql2 on MariaDB 10.4, Tailwind v4 (admin, precompiled), shadcn/ui |
| Docs | `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/SECTIONS.md`, **`docs/OFFERS.md`** (Offers v2 spec, the contract for offers/items/options/pixels), `docs/DEPLOY-HOSTINGER.md`, `docs/GOOGLE-SHEETS-SETUP.md`, `README.md` |

## 2. Owner rules (always apply)

1. **No orange, ever,** in the admin or the landing pages: no colour with OKLCH hue 25–75° and chroma > 0.06
   (red-orange, coral, terracotta, amber, ochre). Beige/sand neutrals are fine. Crimson (< 25°) and yellow/gold
   (> 75°) are fine. New colour mixes must be registered with the blend guard (`src/lib/theme/blend.ts`).
   Checks: `qa/verify/orange-check.mjs` and `qa/admin-visual/shoot.mjs --scan-only`.
2. **Design must be maximally modern, smooth and precise,** with no vintage/craft motifs and no generic AI look:
   precise spacing and alignment, intentional compositions, premium states, perfect RTL. See `docs/DESIGN.md`
   (§1.3 banned list, §11 precision checklist, §1.1 budgets).
3. **Autonomy:** once a direction is approved, keep going and make the decisions yourself. Report them at the end.
   For big architecture changes, write a spec first (see `docs/OFFERS.md`, which went through a 3-lens review).
4. Natural Arabic copy (Darija-friendly for Morocco), French and English. Never invent prices, ratings, stock
   or reviews.
5. Secrets: never print, commit or paste `.env.local`, `.env.hostinger*` or tokens. Never type passwords or
   tokens into web forms for the owner: tell them where to paste them.

## 3. Local development (Windows PC)

- `npm run dev` runs `scripts/dev.mjs`: next dev on **port 3450** for Store Gen (COD Studio's own dev server uses
  3400; don't kill either) plus the admin Tailwind watcher. Use ports 3451+ for test servers.
- Database: XAMPP MariaDB 10.4 at 127.0.0.1:3306, user `root`, no password, `max_allowed_packet` 1 MB.
  `CREATE USER` crashes it, so use root. Start it detached:
  `Start-Process C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini --standalone`.
  The local dev database is `cod_studio`. Migrations run automatically at boot (`src/instrumentation.ts`).
- PHP CLI (export parity tests): `C:\xampp\php\php.exe`.
- Playwright: launch with `channel: "msedge"`, because the Chromium download fails on this network.
- npm installs are very slow here. Avoid adding packages.
- `.env.local` holds local dev env and E2E owner credentials. It is git-ignored, so copy it by hand to clones.
- `qa/` is **git-ignored** (≈600 MB: harnesses plus screenshots), so copy it by hand to clones. It contains the
  e2e harness (`qa/e2e/run.mjs`, 17 steps), `qa/verify/*` (render matrix, orange, pixel, bidi checks),
  `qa/final-verify/geom-check.ts` and `qa/admin-visual/shoot.mjs`.
- Main checks: `npx tsc --noEmit -p .` · `npm test` (theme, runtime selftests + parity, generator, render-check
  with runtime budgets, money parity, conversions, offers-check, orders) · `npm run test:pixels` ·
  `npm run test:php` · `npm run build` (Turbopack; `|| next build --webpack` fallback).
- Landing assets: `node scripts/build-landing-assets.mjs` writes `src/landing/generated/*` (committed). Admin
  CSS: `node scripts/build-admin-css.mjs` writes `src/app/globals.compiled.css` (committed). Both run in
  prebuild/predev.

## 4. Production on Hostinger

| | |
|---|---|
| Website | `lightgreen-hippopotamus-140853.hostingersite.com`, created 2026-10-23 through the Hostinger API. Use only the temporary domain until the owner says otherwise. |
| hPanel user | `u641677794` (same hosting account as COD Studio) · Node **22** · build `npm run build` · output `.next` |
| Database | `u641677794_storegen` / user `u641677794_storegen` (created by `hosting_databases_setup-website`). On 2026-10-23 Claude reset its password through the API (`hosting_databases_change-password`) so the full env set could be written in one call: all 6 DB keys (host 127.0.0.1) are now also in the local `.env.hostinger`. |
| Env vars | **16 keys from the R1.0 deploy on** (below). All values are in the local git-ignored `.env.hostinger` of this folder (comments at its top give the admin link and the cron line); never print or paste them. |
| Local dev | `.env.local` points at the local database `cod_storegen` (XAMPP), with its own secrets. |
| Console | Hidden: `/admin` answers 404 until the owner opens `<site>/<ADMIN_GATE>`. Sellers use `/login` and `/app/<handle>`. |
| Cron | Header form (below). |

### Environment (R1.0: 16 keys; names only, values stay in `.env.hostinger`)

`hosting_nodejs_replace-environment-variables` is a **full replace**: always send all 16 keys from `.env.hostinger`.

| Key | Note |
|---|---|
| `DATABASE_URL` | `mysql://…@127.0.0.1:3306/u641677794_storegen` (Node uses 127.0.0.1, never `localhost`) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Hostinger's own DB keys, unused by the code; kept because the replace is full |
| `APP_SECRET` | **never changes after launch** (it seals every stored secret) |
| `ADMIN_GATE` | the console's hidden path |
| `SETUP_TOKEN` | first super_admin only (`/admin/setup`) |
| `PUBLIC_URL` | alias of `PLATFORM_URL` for R1 (same value); removed in R2 |
| `PLATFORM_URL` | **new in R1.0**: the site URL, `https://lightgreen-hippopotamus-140853.hostingersite.com`. Read at runtime: a change needs a restart, not a rebuild |
| `TRUSTED_PROXY_HOPS` | `1` |
| `BEHIND_CLOUDFLARE` | `0` (`1` after the domain move) |
| `CRON_KEY` | the cron header's value |
| `APP_TIMEZONE` | the platform default timezone (stores have their own) |
| `DATA_DIR` | **new in R1.0**: `/home/u641677794/storegen-data` (decision below) |

Optional, only when needed: `DATA_DIR_BUDGET_BYTES` (default 20 GiB), `SMTP_URL` + `MAIL_FROM` (mail off without them),
`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `GOOGLE_SA_JSON_B64` (Sheets), `ANTHROPIC_API_KEY`. The domain move adds
`STORE_ROOT_DOMAIN`, `EDGE_KEY`, `LEGACY_PLATFORM_HOSTS`, `ADMIN_HOST` and flips `BEHIND_CLOUDFLARE` (20 keys,
STORE-SAAS §H.7). Never set `NODE_ENV` (the build needs the devDependencies) or `SG_TEST_CONTEXT`.

### `DATA_DIR`: the path decision and the persistence probe

- **Decision:** `DATA_DIR=/home/u641677794/storegen-data`: outside every `domains/*/public_html` (the web server never
  serves it), outside the build folder an archive deploy replaces, and its own folder on the hosting user COD Studio
  shares (STORE-SAAS §G.2). Create nothing else by hand: from P8 the boot check writes the `.sg-owner` marker and its
  subfolders when the parent is writable. In R1.0 media still live in the database; the boot log only checks the path
  (`[boot]` warnings for a relative path, a path inside the app folder or under `public_html`).
- **Persistence probe (§H.10, ENGC-14):** the path stays **[unverified]** until a probe file survives **two** archive
  deploys. Before the first R1.0 deploy, create `/home/u641677794/storegen-data/.sg-probe` holding the commit being
  deployed (hPanel File Manager, or a one-off hPanel cron command
  `mkdir -p /home/u641677794/storegen-data && echo <sha7> > /home/u641677794/storegen-data/.sg-probe`). After that
  deploy and after the next one, open the file: it must still be there with the same content. Record the date and the
  two build ids in §6; only then drop `[unverified]`.

### Cron (header form)

hPanel → Advanced → Cron Jobs, every 5 minutes (the R1.0 deploy changes the old `?key=` line to this one; `?key=` still
works in R1 and goes in R2):

`curl -fsS --max-time 110 -H "X-Cron-Key: <CRON_KEY>" "<PLATFORM_URL>/api/cron/tick" > /dev/null`

### Why git pushes do not deploy

Hostinger's GitHub app is installed on another GitHub account, **aladdinzed35**, which can't see
`Aladdin-ZED/store-gen`. The Store Gen site has no git link: it is deployed only by archive builds (below).
(COD Studio's site has an old snapshot link to `aladdinzed35/landingPage-gen`.)

### How to deploy (R1.0 method: gate → archive → upload → build)

This needs the **Hostinger MCP connector** connected in Claude. If it says "sign in again", the owner reconnects it in
the Claude connector settings. Nothing is deployed from a build that never saw the gate (STORE-SAAS §H.10, SEC-10).

1. **Commit and push** to `origin main` (a push does not deploy). The tree must be clean except
   `docs/saas/PROGRESS.md`.
2. **Gate:** `npm run gate` (typecheck, lint, `npm test`, `test:slow`, `test:db` on throwaway `cod_test_*` databases,
   build, `test:e2e`, the secrets check). Only when every step is green does its last step (`scripts/qa/gate-ok.ts`)
   write `qa/.gate-ok` = `{ sha: <HEAD>, at: <time> }`; it refuses a dirty tree. Before an R1 deploy also run the upgrade
   dry run on the XAMPP DB and on a fresh dump of production imported into XAMPP:
   `npm run qa:upgrade-dry-run -- --db <url>` must report 0 problems in its tenancy section.
3. **Archive:** `node scripts/deploy/archive.mjs ../storegen-<sha7>.zip` (outside the repo). It refuses unless
   `qa/.gate-ok` names the current `git rev-parse HEAD`, is younger than 24 h and the tree is clean; then it writes
   `git archive --format=zip HEAD` (tracked files only, so no secrets) plus `qa/.gate-ok` (the boot log then names the
   gate commit) and prints the size and sha256. It never uploads.
4. **Upload:** Hostinger MCP `hosting_files_generate-upload-url` {username `u641677794`, domain
   `lightgreen-hippopotamus-140853.hostingersite.com`} returns url, auth_key and rest_auth_key; then
   `UP_URL=… UP_AUTH=… UP_REST=… bash scripts/deploy/hostinger-upload.sh ../storegen-<sha7>.zip .sg-<12 random hex>.zip`
   uploads over TUS into public_html. **The name must start with a dot** (lesson of 2026-10-27): public_html files
   are served by the web server until the build's "Syncing public_html" removes them, and a failed build never gets
   there, so `sg-….zip` was publicly downloadable (200 application/zip) after build 01a17e99 failed. The web server
   refuses dotfiles (403, like `/.env`). Check `curl -sI <site>/.sg-….zip` answers 403 before starting the build.
   **If a build fails, delete the archive at once:** `curl -X DELETE <url without /api/tus/public_html>/api/resources/
   public_html/<name> -H "X-Auth: <auth_key>" -H "X-Auth-Rest: <rest_auth_key>"` (expect 204, then 404 on the site).
5. **Env** (whenever the key set changed; the first R1.0 deploy adds `PLATFORM_URL` and `DATA_DIR`):
   `hosting_nodejs_replace-environment-variables` with all 16 keys of `.env.hostinger`.
6. **Build:** Hostinger MCP `hosting_nodejs_start-build` {node_version 22, app_type next, root_directory "",
   output_directory .next, build_script build, package_manager npm, source_type archive,
   source_options {archive_path: "<that name>"}}. Poll `hosting_nodejs_build` / `hosting_nodejs_build-logs`. A build
   takes about 80 s plus `gate:offline` (about 40 s here). `prebuild` runs `gate:offline` first: the log shows
   `tenancy-lint: 0 violation(s)`, `ownership-check: no .git (an archive build)…`, then the permissions, hosts,
   envelope and security selftests passing; a red one fails the build. The log must also show
   `[admin-css] COD Studio build: admin Tailwind precompiled…`. "Syncing public_html" removes the archive. A failed
   build keeps the previous version live. `next.config.ts` caps the build at `experimental.cpus: 4` workers: the
   default (CPUs - 1 = 63 on Hostinger's build host) exhausted its thread limit during "Collecting page data"
   ("OS can't spawn worker thread", SIGABRT in Turbopack and the webpack fallback, build 01a17e99, 2026-10-27).
7. **First boot** of an R1.0 build runs migration 0004 (and the store #1 conversion when the old single-tenant setup
   was used); the boot log names `gate passed on <sha>`. The Store Gen database booted once on 3598537 and setup was
   never run, so expect `tenancy: empty install, no store #1 to convert (marker written, the pre-tenancy boot's empty
   pixel_library row removed)` and `[tenancy-check] OK` (rehearsed on a copy of that state, R1.0 finale F4). There is
   no store #1: `/<ADMIN_GATE>` → `/admin/setup` with `SETUP_TOKEN` makes the first super_admin, its TOTP and the
   first store.
8. **Smoke test** (STORE-SAAS §H.10):
   - `/` returns 200 (the marketing page)
   - `/admin` returns 404; `/<ADMIN_GATE>` returns 303 to `/admin`
   - `/login` returns 200
   - `/s/<handle of the store setup created>` returns 200 or the store's neutral page
   - `POST /api/public/order {}` answers `{"ok":false,"error":"invalid",…}`
   - cron with the `X-Cron-Key` header answers `{"ok":true…}`
   - `/api/health` answers with `app: "store-gen"`
   - every 404 carries the security headers (STORE-SAAS §F.6)
   - no client bundle (`/_next/static/**.js` of `/` and `/login`) contains the `PLATFORM_URL` value
   - record `SHOW VARIABLES LIKE 'max_user_connections'` in §6: Store Gen holds up to 10 connections per process (query
     pool 6, lock pool 2, media read pool 2) next to COD Studio's pool on the same account; if the limit is lower, stop
     and decide before sign-ups open (the pool sizes are fixed in code in R1.0)
   - the `DATA_DIR` probe above.
9. **Rollback = fix forward.** A failed build keeps the previous version live, but once an R1.0 build has booted, 0004
   has changed constraints the old build writes against (the global `pages_slug_uq` and `block_uq`, NOT NULL `store_id`):
   redeploying an older archive is not a rollback. Fix on `main`, gate, archive and deploy again. Export the database
   (hPanel → Databases → phpMyAdmin) before the first R1.0 deploy.

hPanel "Redeploy" reuses the source of the **last** build. After an archive deploy it rebuilds that archive,
so it's safe. It would rebuild the old snapshot only if the last build came from git.

### Hard-won lessons

- **Turbopack's CSS loaders run in spawned Node workers, which Hostinger kills** ("node process exited before we
  could connect"). So: no `postcss.config`, no `turbopack.rules`. Admin Tailwind is precompiled by
  `scripts/build-admin-css.mjs`.
- **PUBLIC_URL must equal the live domain.** The order API origin check, admin CSRF, the landing CSP
  (connect-src/form-action) and absolute media/canonical URLs all use it. After a domain change: update the env
  var, **restart** (no rebuild: `PUBLIC_URL` / `PLATFORM_URL` and the other domain keys are server-side runtime
  reads), then **republish every live page** (published HTML is static and embeds the old domain). The one env key
  that needs a **rebuild** is `NEXT_PUBLIC_OFFERS_FEATURES` (`src/lib/page/features.ts:36`: Next inlines it into the
  client bundles at build time); any future `NEXT_PUBLIC_*` key behaves the same (STORE-SAAS §C.10 step 1, §H.7).
- MariaDB `max_allowed_packet`: publish splits the version row into three statements and refuses with
  `page_too_large` when it's still too big (Hostinger allows 16 MB, XAMPP 1 MB).
- `onnxruntime-node` CUDA download is skipped through `.npmrc` (`onnxruntime-node-install=skip`).
- Client IP: X-Forwarded-For is walked from the right and internal hops are skipped. The owner can verify in
  Settings → Security → "Visitor IP check" and set TRUSTED_PROXY_HOPS=2 if their IP shows as hop 2.

## 5. Feature map (where things live)

- **Theme engine:** `src/lib/theme`. 11 archetypes, OKLCH palettes, contrast guarantees, no-orange guard,
  calm-mood logic.
- **Landing:** `src/landing/**`. 27 section types, ~88 variants, per-variant CSS chunks. Runtime in
  `src/landing/runtime` (hashed chunks: core, thanks, pixels, turnstile, feature chunks). Budgets are enforced
  by render-check: landing 24,200 B gz, thanks 6,650 B, page cap 32,000 B. They sit at the limit.
- **Offers v2** (`docs/OFFERS.md`):
  - Items: 1–8 per page, with photos cropped from group photos (`AssetRef.box`).
  - Line-based offers: fixed item or customer's choice, free lines, lock/allow/preset rules, perks, gifts,
    composed or custom visuals.
  - Options: choice, matrix (color × size) and typed fields, with price deltas and Latin codes.
  - Display axes: picker stack/tiers/ticket/pills/visual, fill inline/rows/steps/box/auto, selection
    soft/solid/outline.
  - Integer-cent pricing shared by server, runtime and the PHP export.
  - Order payload v2 with version + shown total, and a stale flow.
- **Per-page pixels** (Meta ×3, TikTok ×3, Snap, GA4): Settings → Pixels is a library (ids, labels, tokens,
  test codes, health, usage). Every page answers explicitly (pixels or "No pixel").
  - Browser funnel: PageView, ViewContent, AddToCart (first pack choice / form interaction),
    InitiateCheckout, Lead (valid phone), **Purchase on the thank-you page** (event id = order id).
  - Server Purchase goes through the Meta Conversions API and the TikTok Events API (`src/lib/orders/conversions*`).
  - **Server events are skipped when the order risk score ≥ 70** (`src/lib/orders/risk.ts`: duplicate phone,
    repeated IP, cancelled history, too fast…), so owner test orders often don't reach Meta.
  - Brave and ad blockers block the browser pixel.
- **Orders:** `src/lib/orders` (contract, validate, resolve, create, text v2, risk), Google Sheets sync
  (`src/lib/sheets`), admin orders (`src/components/admin/orders`), exports (`src/lib/export`: connected / PHP
  / WhatsApp).
- **Admin:** generate wizard (`src/components/generate`: Photos → Analysis → Details → Offers → Directions with
  the pixel gate), builder (`src/components/builder`, panels Product & items / Offers / SEO + pixels / …),
  settings, security (TOTP 2FA, sessions, rate limits, AES-GCM secret settings, hidden gate).
- **Local AI:** `@huggingface/transformers`, Qwen-class VLM + SigLIP + background removal in the browser, with a
  rule-based copy library fallback (`src/lib/ai`).

## 6. Status and open items (2026-10-23)

Store Gen: **first version deployed 2026-10-23** (commit `3598537`: the cloned code + next 16.4.3 / zod 4.6.6 security
patches; build 01a16abd, Turbopack, live smoke test green). `/` answers 404 until a page is published (by design).
Owner steps left: open `<site>/<ADMIN_GATE>` → /admin/setup with SETUP_TOKEN to create the owner account, and add the
cron job (both in the `.env.hostinger` comments). Next: the SaaS upgrade in docs/STORE-GEN-BRIEF.md (spec: docs/STORE-SAAS.md).

COD Studio (myrizq.shop, separate project). Live and verified: Offers v2, per-page pixels, order outputs,
PHP/WhatsApp exports. The owner still has to do these on myrizq.shop:
- **Republish the live page** in the admin. Its HTML still has 9 links to the old maroon-kangaroo domain
  (canonical, og/twitter image, JSON-LD).
- Verify the Meta **Conversions API token** with "Send test event" (Settings → Pixels → RIZQ), then **remove the
  test code**.
- Place one real order from Chrome or the Facebook app (not Brave), with a never-used phone and ≥ 10 s filling
  the form, so **Achat / Purchase** shows in Events Manager. Then pick it as the ad set's conversion event.
- Verify the domain `myrizq.shop` in Meta Business (Brand safety → Domains). Update the cron URL. Check the
  Visitor IP check.
- Connect Google Sheets (`docs/GOOGLE-SHEETS-SETUP.md`). Optional: admin on `studio.myrizq.shop` + `ADMIN_HOST`.

**R1.0 integration hazard (CCR r1.0-t1-3 item 7, from the T1 merge on 2026-10-24):** main now contains 0004 and the
store #1 conversion. The first boot of this tree on a database with data migrates it and deletes the moved legacy
`settings` keys (`store`, `defaults`, `sheets`, `pixel_library`, `pixel_health`, `tracking_secrets`, `turnstile`, `ai`,
`home`, `pixels`); single-tenant `getSetting(<moved key>)` readers then get defaults until T3 / T4 are merged. Until
then: do not start the 3450 dev server on a database with real data (use a copy), and do not deploy main to Hostinger.
The tenancy dry run (`scripts/qa/upgrade-dry-run.ts`) reports leftover legacy keys once the marker exists.
**Resolved at the R1.0 integration (2026-10-27):** T3 and T4 are merged and every reader is store-scoped. main deploys
only through §4 (green `npm run gate`, `scripts/deploy/archive.mjs`), after the upgrade dry run on a production dump.

**Domain move checklist (R1, RESEARCH §5.2 / STORE-SAAS §C.10):** after "Worker + secret + route", add the Cloudflare
route exclusion `console.<domain>/*` with Worker **None** (the console never runs through `edge/worker.js`, CCR
r1.0-t3-8), and run V3 with its cache check (CCR r1.0-t3-9) before sign-ups open.

Suggested next engineering items:
- Show "Sent to Meta ✓ / skipped (risk N)" per order in the admin order drawer.
- Don't write a kept default no-cost extra ("Sans emballage") into the Sheets Variante or thank-you text.
  This needs an idle marker with parity across `text.ts`, `order.php` and the runtime.
- Runtime budget headroom: the landing chunk is within 4 bytes of its budget (24,196 / 24,200 B, R1.0 integration).
- Run the `scripts/qa/upgrade-dry-run.ts` gate against a production DB dump.
- Make published HTML domain-independent (relative media URLs; re-render live pages automatically when
  PUBLIC_URL changes).
- Leave the other Hostinger sites alone: `gold-squirrel-622612` and `lime-otter-714875` are other projects.
  `lightgray-hedgehog-192293` is an abandoned failed copy of this one and can be deleted when the owner agrees.

## 7. Working method that worked

- Big work goes through multi-agent workflows: spec → 3-lens review → parallel tracks with strict file
  ownership (see `docs/OFFERS.md` §I.6) → adversarial verification → fix loop.
- Network outages here kill agents (ENOTFOUND). Wrap agents with retries and resume from the working tree.
- Before deploying: typecheck, `npm test`, a build, a production smoke test on a throwaway DB (port ≥ 3401),
  then the archive deploy above, then a live smoke test.
