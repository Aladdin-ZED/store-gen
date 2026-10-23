# Research: platform administration (main domain) and SaaS-level features

Area owner: research phase 1b. Input for the architect of `docs/STORE-SAAS.md`.
Date: 2026-10-23. Scope: the **platform console** (approve accounts, store profiles, lifecycle, plans, impersonation,
communications, support, global analytics, health, flags, platform settings, security, backups) and the **tenant-side
SaaS UX** (onboarding, command palette, realtime, notifications, PWA).

Conventions:
- `path:line` = a fact about this repo, checked on 2026-10-23 at commit `8c5a4bb`.
- `[S#]` = an external source, listed in §23 with its URL.
- **UNVERIFIED** = an assumption or a vendor detail I could not confirm. The architect must check it before relying on it.
- Ranks: **P0** = launch (the platform can't onboard a second store without it), **P1** = next, **P2** = later.
  Effort: **S** ≤ 1 day, **M** 2–5 days, **L** > 1 week for one engineer agent with the current codebase.

---

## 1. The 10 conclusions that matter most

1. **Run three surfaces on one app.** (a) The platform console `/admin/**`, kept behind today's gate, IP allowlist and
   `ADMIN_HOST` (`src/proxy.ts:82-122`, `src/lib/auth/gate.ts:99-161`, `src/lib/auth/config.ts:176-205`), with 2FA
   mandatory. (b) The tenant dashboard `/app/<handle>/**`. (c) Public stores. On a real domain the console moves to its
   own host (`admin.<domain>`, the `ADMIN_HOST` mechanism already exists), tenants use `app.<domain>`, and stores use
   `<handle>.<domain>`. The domains research owns the details.
2. **Approval comes with a sandbox, not a wall.** A new account gets a "pending review" store at once. It can generate,
   design and preview, so it gets its wow moment in the first minutes, but it **cannot publish or take orders** until a
   platform admin approves it. This removes the conversion cost of manual approval (the seller is busy building while
   they wait) and keeps phishing and scam stores from ever going live.
3. **Every application arrives scored, with the reasons shown.** Approval is a triage queue, like Stripe Radar's review
   queue [S9]. Each signup gets a 0–100 risk score with explainable flags, the same pattern as `scoreRisk`
   (`src/lib/orders/risk.ts:42`). The signals: disposable email (CC0 list [S5]), no MX record, brand impersonation
   (UTS #39 confusable skeleton of the store name, handle and email against a protected-brand list [S7]), duplicate
   device/network/phone, signup velocity, Turnstile result [S12], and VPN/hosting network. Shopify shows "account age and
   possible VPN" on collaborator requests for the same reason [S2].
4. **The store profile is the console's centre of gravity.** One page per store, with tabs: Overview (KPIs, health
   score), Orders, Catalog & pages, Team, Activity (audit timeline), Usage & plan, Integrations health, Domains, AI usage,
   Risk & abuse, Notes, Support. Customer PII is **masked by default**. Revealing it is a deliberate, reasoned, audited
   action ("break-glass"). The owner asked to see "every little detail". Masking keeps that possible without turning
   every console screen into a PII leak.
5. **Lifecycle is a state machine:** `pending → active ⇄ restricted ⇄ suspended → closed → scheduled_deletion → purged`,
   plus `rejected`. Each state has exact public, dashboard and cron behaviour (§7). Deletion is a soft close, then a
   retention window, then a batched purge job, never a cascade (TENANCY-MAP §2.3). Shopify keeps a deactivated store's
   data for about 2 years (third-party sources, **UNVERIFIED** [S3]). Recommendation: 30 days restorable, then purge,
   with order records kept longer only if Morocco law 09-08 / CNDP or tax rules require it (**UNVERIFIED** [S13]).
6. **Impersonation is read-only by default, time-boxed, needs a reason, and the store sees it.** This copies the
   WorkOS (mandatory reason, 60-minute expiry, `act` claim [S10]) and GitHub (reason dropdown, the user is emailed, one
   hour, logged in both audit logs [S11]) patterns. Write access needs a **grant from the store owner**, the model of
   Shopify's collaborator request code [S2]. Support never sees secrets, passwords, 2FA, tokens or bulk PII exports.
7. **Plans and entitlements come before billing.** Launch with `plans` + `store_entitlements` (limits and features) +
   usage counters + per-store overrides. Every gate in code calls one `entitlement(store, key)`. Payments plug in later
   with no refactor. Manual billing (bank transfer / cash) is recorded by an admin (P2).
8. **Realtime on Hostinger means short polling or capped streams.** Hostinger stops every request after **120 s** and
   accepts **no inbound WebSockets** [S4]. Dashboards use 10–20 s visibility-aware polling, or SSE that reconnects
   before 110 s. The "live" feel comes from optimistic UI, animated counters (already in `animated-number.tsx`) and a
   notification centre backed by the DB.
9. **Health is observable through the 5-minute cron.** Record every cron tick and every job step in a `job_runs`
   table. The tick already returns per-step results (`src/app/api/cron/tick/route.ts:56-72`) but stores none. Add an
   in-DB error ring buffer, DB size per table and per store (extending `src/lib/db/usage.ts:44-60`), and per-store
   backlog for Sheets, CAPI and renders. Note: MariaDB 10.4 reached community end-of-life on 18 June 2024 [S14]. The
   Hostinger database version is outside our control. Treat it as a platform risk and keep SQL portable.
10. **Reuse is high.** The admin kit already has premium primitives: KPI tiles with sparklines and rolling numbers, a
    recharts plot that is code-split, a day-grouped audit timeline, health tiles, a setup ring, a cmdk palette, a confirm
    dialog, status chips, a keyset pager, a device/session list, TOTP + recovery codes, encrypted settings and DB rate
    limits (§2). The console is mostly **new data functions and new screens built from existing components**, not a new
    design system.

---

## 2. What exists today and what to reuse (code facts)

| Capability | Where | Reuse for the console |
|---|---|---|
| Hidden admin gate (secret path cookie), IP allowlist, dedicated admin host | `src/proxy.ts:82-122`; `src/lib/auth/gate.ts:99-161`; `src/lib/auth/config.ts:176-205` (`ADMIN_HOST`, refuses PUBLIC_URL's host) | **As is** for the platform console only (TENANCY-MAP AUTH-01/14/16). `ADMIN_HOST` becomes `admin.<domain>` later. |
| Sessions: sha256 token ids, hashed IPs, UA, idle/absolute TTL, revoke all/one, purge | `src/lib/auth/session.ts:57-224` (IP hashed at :65-73) | Session list per user in the console; "sign out everywhere" on ban; impersonation sessions as a session kind. |
| TOTP 2FA + recovery codes, enrolment UI | `src/lib/auth/mfa.ts:79-221`; `src/app/admin/(auth)/two-factor/*` | Mandatory for platform staff. Console "reset 2FA" for a tenant user (platform-only, AUTH-09). |
| Device labels without fingerprinting | `src/lib/admin-data/security.ts:27-46` (`describeUserAgent`), `:48-65` | Device column in the approval queue and on user profiles. |
| Audit log with redaction, keyset paging, 4 KB meta cap | `src/lib/audit.ts:14-40` (action union), `:57-84` (sanitize), `:86-108` (write never throws), `:110-134` (list) | Add `store_id`, `actor_kind` (`user`/`platform`/`impersonation`/`system`), `impersonator_id`. Same API. |
| Audit timeline UI (day groups, area filter, load older) | `src/components/admin/settings/audit-log.tsx` (297 lines) | Store-profile "Activity" tab and the platform audit page, nearly as is. |
| Team UI (members, roles, 2FA, last sign-in, actions menu) | `src/components/admin/settings/team-panel.tsx` (431 lines) | Store-profile "Team" tab (read-only plus platform actions). The tenant version is reworked for invites (AUTH-07). |
| Role → permission matrix, pure and isomorphic | `src/lib/auth/permissions.ts:6-61` | Same shape for `PLATFORM_ROLES × PLATFORM_PERMISSIONS` (§15). |
| Server-action wrapper with typed errors and no raw DB messages | `src/lib/admin-data/action.ts:27-49` | Clone as `platformAction(permission, fn)`, with step-up re-auth for dangerous permissions. |
| KPI tile (rolling number, delta, sparkline, aurora hero) | `src/components/admin/dashboard/kpi-card.tsx` (129 lines); `common/animated-number.tsx` | Console overview and store-profile KPIs. |
| Orders/revenue chart, recharts code-split, SSR-sized | `src/components/admin/dashboard/orders-chart-plot.tsx` | GMV/orders/signups charts. |
| Health tile pattern (state chip, counters, one action) | `src/components/admin/dashboard/sheet-health.tsx` | Integrations-health and system-health tiles. |
| Setup ring checklist | `src/components/admin/dashboard/setup-checklist.tsx` | Tenant onboarding progress; the console "activation" column. |
| DB size vs 3 GB quota, warn 70 % / block 85 % | `src/lib/db/usage.ts:16-60`; `common/storage-notice.tsx` | Console only (ADM-06), extended to per-table and per-store figures. |
| Cron tick with isolated steps and error summaries (no PII) | `src/app/api/cron/tick/route.ts:30-73` | Becomes a job runner that writes `job_runs` and loops over stores. |
| DB rate limiter, in-memory burst limiter | `src/lib/security/rate-limit.ts:17-43`; `src/lib/security/burst-limit.ts` | Signup, approval and impersonation buckets `p:…` (TENANCY-MAP §7.6). |
| AES-GCM envelopes by purpose, HMAC, `hashIp` (IPv4 or /64) | `src/lib/security/crypto.ts:16-66` | Platform secrets (SMTP, Web Risk key); network clustering of signups with `hashIp`. |
| Explainable risk score | `src/lib/orders/risk.ts:42-60` | Template for `scoreSignup()` (same `{score, flags}` contract). |
| Command palette (cmdk, lazy chunk, prefetched when idle) | `src/components/admin/shell/command-palette*.tsx`; `cmdk` in `package.json` | Console palette: jump to a store, user, order id; actions (approve, suspend…). |
| Confirm dialog that stays open while the action runs | `src/components/admin/common/confirm-dialog.tsx` | Dangerous lifecycle actions, with a typed confirmation ("type the handle"). |
| Status chip, pager, search field, segmented, empty states with custom illustrations, relative time | `src/components/admin/common/*` | Every console list. |
| Nav config shared by sidebar, palette and breadcrumbs | `src/components/admin/shell/nav.ts:28-73` | `CONSOLE_NAV` with the same type. |
| Libraries already installed | `package.json:37-80`: `cmdk`, `recharts`, `motion`, `sonner`, `radix-ui`, `qrcode`, `libphonenumber-js`, `zod`, `zustand` | Enough for the console. **Not installed:** an SMTP client and a web-push library (§11, §17). npm installs are slow here (HANDOFF §3). |

**Gaps in today's code that the console needs:**
- `users.failed_logins` / `locked_until` are written but never read (`src/lib/db/schema.ts:74-75`, AUTH-27).
- There is no email anywhere (no SMTP dependency in `package.json`), so there is no verification mail, no
  reset-by-email and no notifications by email.
- No job/health persistence and no error store: errors only go to `console.error` (`src/lib/audit.ts:104`,
  `action.ts:45`).
- `resetUserPasswordAction` / `resetUserTwoFactorAction` are cross-tenant takeover paths (AUTH-08/09). They move into the
  console as platform-only actions.

---

## 3. How top platforms run their back office (benchmarks and lessons)

| Platform | What they do | Lesson for Store Gen |
|---|---|---|
| **Shopify collaborators** [S1][S2] | A partner asks for access to a store and chooses the permission sections. Requests expire after 7 days. The merchant can require a **4-digit request code**. The request shows **partner account age and "possible VPN"**. Access is removed after 90 days without login. Removal is permanent and the name stays in the activity logs. Collaborators don't count toward the staff limit. | (a) Support write access = a store-owner grant, scoped and expiring. (b) Show risk context (account age, VPN) next to every access decision. (c) Removed people stay in the audit history by name. |
| **Shopify 2FA** [S15] | Requiring 2FA for all users is an organization (Plus) setting. On standard plans the owner can't force it on staff. | Platform staff: 2FA **always mandatory**. Tenants: a store-level "require 2FA for members" toggle as a premium feature (P1). It is cheap here because TOTP exists. |
| **Shopify pause / deactivate** [S3] | Pause and Build: checkout off, storefront visible, admin works, reduced fee. Deactivated: admin and storefront closed. Data kept about 2 years (third-party, **UNVERIFIED**). | Model "restricted" (no new orders, store visible, dashboard works) apart from "suspended" (store offline). Reactivation means choosing a plan again. |
| **Stripe Connect dashboard** [S8] | A list of connected accounts with status and balance, filter/sort ("restricted accounts that need help"), **"View Dashboard As"** from a ⋯ menu, compliance requirements. Some verifications are paused after 540 days of inactivity. | The stores list: filters for "needs attention" (risk, quota, sync errors, pending approval). "View as store" from a ⋯ menu = read-only impersonation. Dormant stores are flagged automatically. |
| **Stripe Radar reviews** [S9] | A prioritised review queue with a risk level per item and a detail view. Actions: approve / refund / mark fraudulent. Items enter through ML or custom rules ("email from an unusual domain"…). | The approval queue: risk-sorted, with the reasons in the row, one-key actions, and custom rules (e.g. "auto-hold if the handle contains a protected brand"). |
| **WorkOS impersonation** [S10] | Off by default, only admins can enable it, a mandatory reason, auto-expiry after 60 min, the session is marked as impersonated, and the token carries an `act` claim with the impersonator. | Copy the whole pattern: `sessions.impersonator_id`, reason, a 30-min default (max 60), a visible banner, and audit rows carrying both identities. |
| **GitHub Enterprise impersonation** [S11] | A reason from a dropdown (Other → notes), **the user is always emailed**, a one-hour limit, logged in both the enterprise audit log and the user's security log. | The store sees every support session in its own Activity tab and in the notification centre (email when SMTP exists). |
| **YouCan** (Moroccan, the closest competitor) [S6] | Staff invited by email, then they set their own password. Permissions per person. One staff member can work on several stores, and staff can create stores. The dashboard leads with Sales, Orders, Customers, Visitors. | Multi-store membership is expected in this market. Lead the tenant overview with the COD numbers sellers know, then go beyond them (confirmation rate, delivery rate, net cash, §10). |
| **Wix roles** [S16] | The owner role can't be edited or duplicated and moves only by transfer. Custom roles. Collaborators can never delete or transfer the site or change roles. | Ownership transfer is its own audited flow (P1). Hard rules that no role can break: no delete/transfer below the owner, and no role editing by non-owners. |

---

## 4. Console information architecture

The console uses the same shell as today's admin (inset sidebar, frosted top bar, ⌘K) with a **distinct identity**, so
staff never confuse it with a tenant dashboard. Suggestion: a cool deep-ink base with a cyan/teal accent (OKLCH hue
≈ 190–230°, well outside the banned 25–75° band) and a permanent "Platform" badge in the top bar. During impersonation a
full-width violet ribbon shows: "Viewing <store> as support, read-only, 24:13 left · End".

```
/admin                         Overview (platform pulse)
/admin/queue                   Approvals (signups, store go-live requests, domain requests, appeals)
/admin/stores                  Stores list (filters: status, mode, plan, market, risk, "needs attention")
/admin/stores/<id>             Store profile (tabs, §6)
/admin/users                   People (platform identities, memberships, bans, 2FA resets)
/admin/users/<id>              User profile (stores, sessions, devices, signup signals, audit)
/admin/orders                  Cross-store order lookup by id/phone (masked; break-glass to reveal)
/admin/inbox                   Support tickets
/admin/broadcasts              Announcements, changelog, in-app messages
/admin/analytics               Platform analytics (GMV, activation, cohorts, niches)
/admin/plans                   Plans, entitlements, overrides
/admin/flags                   Feature flags and kill switches
/admin/health                  Cron/jobs, queues, DB and disk, errors, integrations
/admin/abuse                   Reports, protected brands, blocklists, rules
/admin/settings                Signup mode, branding, legal templates, reserved handles, email
/admin/security                Staff, platform roles, staff 2FA, IP allowlist, platform audit, break-glass log
```

Overview "platform pulse" (P0, a single screen):
- KPI row: active stores, pending approvals (with the oldest waiting time), today's orders, today's placed GMV, error
  rate, DB used.
- The "Needs attention" list: high-risk signups, stores past 85 % quota, Sheets backlog > 15 min, failed CAPI bursts,
  stuck renders, last cron tick older than 10 min.
- A live activity feed: signups, publishes, first orders, suspensions.

---

## 5. Approval queue and signup risk signals

### 5.1 Signup modes (platform setting, P0)

| Mode | Behaviour | When |
|---|---|---|
| `closed` | No signup. Invite links from the console only. | Default on the temporary domain until the console ships. |
| `invite` | Signup needs a platform invite code (single use or N-use, expiring, hashed like store invites). | Friends-and-sellers beta. |
| `approval` (**recommended launch mode**) | Anyone can sign up (Turnstile). The account and its first store are `pending`. Building is allowed; publishing and orders are not. | Launch. |
| `waitlist` | Email/phone only. Admins promote entries to invites in batches. | Marketing campaigns, capacity control. |
| `open` | Auto-approve when the risk score is below a threshold; the rest goes to the queue. | Later, once the signals are trusted. |

### 5.2 What a pending account can and can't do

- **Can:** finish onboarding, generate pages and the store theme, upload media (within a reduced pending quota, e.g.
  100 MB), preview with a private signed link, invite at most 1 teammate.
- **Can't:** publish (`pages.publish` is denied by an entitlement, not by a role), take orders (the public resolver
  refuses stores that aren't active, TENANCY-MAP §1.2.6), connect Sheets or pixels (avoids abuse of the shared service
  account and CAPI), export PHP, add domains.
- **UX:** a calm "In review" pill in the store switcher, an expected-time line ("Usually within a few hours"), and a
  "Submit for review" button that adds an optional business context: what they sell, a social page link, a WhatsApp
  number. Approval sends a notification (in-app now, email once SMTP exists) and unlocks "Publish" with a quiet
  motion reveal (no confetti or gimmicks, in line with the DESIGN.md banned list).

### 5.3 Signals and score (P0 core, P1 enrichments)

`scoreSignup(input) → {score 0-100, flags[]}`, the same contract as `scoreRisk` (`src/lib/orders/risk.ts:42`). It is
stored in `signup_reviews.signals` (JSON) so the queue explains itself.

| Signal | How (no paid API needed unless noted) | Points (proposal) | Priority |
|---|---|---|---|
| Disposable email domain | CC0 list `disposable_email_blocklist.conf` from disposable-email-domains [S5]. Vendor it as a JSON file, refresh it by hand or with a dev script (no runtime fetch). Lists contain false positives [S5b], so a hit is a flag, never an auto-reject. | +35 | P0 |
| No MX / null MX for the email domain | Node `dns.promises.resolveMx` [S17], cached per domain for 24 h, 2 s timeout, fail-open | +20 | P0 |
| Brand impersonation | Compute the UTS #39 **skeleton** [S7] of the store name, handle and email local part. Match it against a `protected_brands` table (platform brand, big marketplaces, banks, carriers such as Amana/CTM, telecoms) by exact skeleton, substring and edit distance ≤ 1. ICU computes skeletons at runtime and advises against storing them [S7]. Node's `Intl` has no skeleton API, so vendor `confusables.txt` (a pure-JS map, ~6k entries, **UNVERIFIED size**). | +40 (exact) / +25 (near) | P0 (list + substring), P1 (full skeleton) |
| Mixed-script name or handle | UTS #39 restriction levels [S7]: flag Latin+Cyrillic mixes. Arabic+Latin in a *display name* is normal in Morocco and is not flagged; handles are ASCII by rule. | +15 | P1 |
| Duplicate identity | Same normalized email (gmail dots/plus), same phone (E.164 via `libphonenumber-js`, already installed), same `hashIp` network with N signups in 24 h, same device cookie id | +15 to +40 | P0 |
| Linked to a banned account | Shares a phone, network or device id with a `banned` user | +50, auto-hold | P0 |
| Signup velocity | `p:signup:net:<hash>` rate bucket, more than 3 per day per network | +20 | P0 |
| Turnstile | Token missing / unverified (the platform key; the free plan has unlimited challenges, 20 widgets, 10 hostnames per widget [S12]) | +20 / hard block if missing in `open` | P0 |
| Too-fast form, bot UA | Reuse `BOT_UA` and the timing logic of `risk.ts` | +10 to +40 | P0 |
| Hosting/VPN network | No free reliable source found. An ASN list would need a dataset (**UNVERIFIED**, P2). Shopify surfaces "possible VPN" [S2], so the idea is validated. | +10 | P2 |
| URL reputation | Links in the business context or store name checked with Google **Web Risk** (commercial; Safe Browsing is non-commercial only; lookups free up to 100k/month per third-party snippets, **UNVERIFIED** [S18]) | +40 if listed | P2 (needs a Google Cloud key; optional) |
| Positive signals | Verified phone (P1, once a WhatsApp/SMS channel exists), a business link that resolves, an earlier approved store by the same user | −10 to −30 | P1 |

Thresholds (platform settings): `< 25` → fast lane (one-click approve, or auto in `open` mode), `25–59` → normal review,
`≥ 60` → hold with a red rail, `≥ 85` or linked to a ban → auto-reject candidate (still human-confirmed at launch).

### 5.4 Queue UX (P0)

- A dense table: score ring, applicant (name, masked email, phone country flag), store name + handle (with confusable
  characters highlighted), mode, market, flag chips, signup time, waiting time, device, network cluster size.
- A split view on the right: signals with plain-language explanations, a preview thumbnail of the store draft (first
  generated page), other accounts in the same cluster, notes.
- Actions: **Approve** (A), **Request info** (I, sends a message, state `needs_info`), **Reject** (R, a reason template
  and an optional block on email/phone/network), **Snooze**. Keyboard first, with the next item auto-focused (the Radar
  queue's speed [S9]).
- Bulk approve for the fast lane. Every decision is an audit row `platform.signup.approved|rejected|info_requested`
  with the actor, reason and score snapshot.
- Appeals: a rejected user can send one appeal (an `appeal` ticket in the inbox).
- Queue SLA tile: median time to decision, oldest waiting.

The same queue later carries: **go-live requests** (when a restricted store asks to be restored), **custom-domain
requests** (DNS verified, waiting for the admin to attach it in hPanel, see the domains research), and **plan upgrade
requests** (manual billing).

---

## 6. Store profile (`/admin/stores/<id>`)

Header (always visible): logo, name, handle, a status pill with a lifecycle menu, mode badge (Store / Landing / Both),
plan, market and currency, created date and age, owner (link to the user profile), a health score ring (0–100), and the
buttons **View as store**, **Open live store**, **Message**, **⋯** (suspend, restrict, export, transfer ownership,
close).

| Tab | Content | Data source | P |
|---|---|---|---|
| **Overview** | KPIs (7/30/90 days): visitors, orders placed, confirmation rate, delivery rate (once statuses come from Sheets/carriers), placed GMV, delivered GMV, AOV, return/refusal rate. A chart. Activation milestones (first page, first publish, first order, first delivered). The health score and its components. | `stats_daily` + `orders` (store-scoped), `store_daily_rollup` (§16) | P0 |
| **Orders** | Store orders list (the tenant `orders-view` in read-only mode, phone/name **masked**), status counts, risk distribution, a CSV export **blocked** for support roles. "Reveal" on one order needs a reason (break-glass, §15). | `orders` | P0 |
| **Catalog & pages** | Pages (status, last publish, views, conversion), products/collections when in store mode, version count and bytes, open live/preview, **unpublish** (abuse takedown). | `pages`, `page_versions`, `products` | P0 |
| **Team** | Members, roles, 2FA on/off, last seen, pending invites. Platform actions: remove a member, reset a member's 2FA, force sign-out (platform-only, AUTH-08/09). | `store_members`, `store_invites`, `users`, `sessions` | P0 |
| **Activity** | The store audit timeline (`audit-log.tsx`) plus platform actions on this store and support sessions, flagged clearly. | `audit_log WHERE store_id` | P0 |
| **Usage & plan** | Plan, entitlements, overrides; meters (media bytes, pages, published versions, members, orders/month, AI generations/month, exports); history of plan changes; "grant temporary boost". | `store_usage`, `store_entitlements` | P0 (meters), P1 (boosts) |
| **Integrations** | Sheets (connected, backlog, last push/pull, last error), pixels (count, CAPI health per pixel, last error code), Turnstile, WhatsApp, carriers/webhooks (when they exist). Each shows ok/warn/error with the last-error summary (never secrets). | `store_settings` health keys, `job_runs` | P0 (Sheets, pixels), P1 (others) |
| **Domains** | Current address (path on the temporary domain, the subdomain later), custom domains with verification state, TLS state, primary flag. | `store_domains` | P1 |
| **AI usage** | Generations by kind (page, theme, logo, copy, images), local vs optional provider, latency p50/p95, accept/regenerate ratio (a quality signal for the AI learning loop owned by the AI research). | `ai_events` (proposed by AI research) | P1 |
| **Risk & abuse** | The signup score snapshot, reports received, takedowns, the order fraud mix (share of orders with risk ≥ 70), linked accounts, current restrictions. | `signup_reviews`, `abuse_reports` | P0 (snapshot), P1 (reports) |
| **Media** | Grid of the store's assets (bytes, kind, used-in) with an abuse takedown. | `assets` + `asset_refs` | P1 |
| **Notes** | Internal staff notes (markdown-lite, @staff mentions, pinned note). Never visible to the store. | `platform_notes` | P0 (S effort) |
| **Support** | Tickets of this store, support sessions, messages sent. | `tickets`, `impersonation_sessions` | P1 |
| **Timeline** | One merged chronological stream: lifecycle changes, plan changes, approvals, publishes, first order, tickets, notes. | union view | P1 |

**Store health score (P1):** a weighted mix of setup completeness, integration errors, quota pressure, order risk mix,
activity recency and open tickets. Shown as a ring in the stores list and sortable, so the owner sees at a glance which
sellers need help. This is "every detail on the profile" turned into a single number the owner can act on.

**Dormancy (P1):** no login and no order for 60 days → `dormant` tag, a re-engagement message, and later a reclaim of a
premium handle (the policy must be in the terms). Stripe pauses some verification after 540 days of inactivity [S8],
which confirms that platforms treat inactivity as a state.

---

## 7. Store lifecycle

```
            signup
              │
          ┌───▼────┐  reject   ┌──────────┐
          │pending │──────────▶│ rejected │ (account kept 30 d for appeal, then purged)
          └───┬────┘           └──────────┘
       approve│
          ┌───▼────┐ restrict ┌────────────┐ suspend ┌───────────┐
          │ active │─────────▶│ restricted │────────▶│ suspended │
          │        │◀─────────│            │◀────────│           │
          └───┬────┘ restore  └────────────┘ restore └─────┬─────┘
   owner close│ / admin close                              │ close
          ┌───▼────┐   30 d (restorable)   ┌────────────────────┐   purge job   ┌────────┐
          │ closed │──────────────────────▶│ scheduled_deletion │──────────────▶│ purged │
          └────────┘                       └────────────────────┘               └────────┘
```

| State | Public store | Order API | Dashboard | Cron (Sheets/CAPI/renders) | Notes |
|---|---|---|---|---|---|
| `pending` | 404 (private preview link only) | refused | full building, no publish | none | §5.2 |
| `active` | live | open | full | yes | — |
| `restricted` | live, checkout/order form replaced by a neutral "temporarily unavailable" (or all pages hidden: an admin choice) | refused | full, with a banner and reason | pull only | Quota abuse, payment late (later), soft policy issue. Like Shopify's Pause (checkout off, storefront visible [S3]). |
| `suspended` | neutral 404 (no "suspended" page, so scam victims don't learn anything and it's not an oracle) or a platform notice (admin choice) | refused | read-only + export + support ticket | no pushes; pending orders still exported to Sheets once, so the seller's call centre doesn't lose orders already placed | Fraud, phishing, ToS. |
| `closed` | 404 | refused | owner can restore (30 d), export | none | Owner self-service close, or admin. |
| `scheduled_deletion` | 404 | refused | none | the purge job runs in batches (≤ 110 s per tick, Hostinger's 120 s limit [S4]) | Handle released after purge plus a cool-off (P1). |
| `purged` | — | — | — | — | Keep a tombstone row (id, handle hash, purge date, actor) for the audit trail. |

Rules:
- Every transition is a `platformAction` with a reason (a template + free text), a store notification and an audit row.
  Suspend and close need **step-up re-auth** (TOTP again within 5 min). Purge needs **two staff** (four-eyes) or a
  24 h delay for a single super-admin (P1).
- The published static HTML stays in the DB. Serving checks `stores.status` on each request through the cached store row
  (cache invalidated on transition). No re-render is needed.
- **Export (P0 for owners, P0 for admins):** a ZIP produced in cron batches: `orders.csv` (all columns), `leads.csv`,
  `products.json`, `pages/` (the published HTML + the PageDoc JSON), `media/` (originals), `settings.json` (**secrets
  removed**), `audit.csv`. Delivered as a time-limited signed link (24 h) and audited. This satisfies "data portability"
  expectations and makes closing a store safe. `fflate` is already installed (`package.json:55`).
- **Retention (UNVERIFIED legal basis):** keep orders of a purged store for N months only if Morocco tax or 09-08 rules
  require it [S13]. Until a lawyer confirms, the default is to purge everything after 30 days in `closed`, keeping only
  the tombstone and the audit rows with PII redacted.

---

## 8. Plans, quotas and entitlements (billing-ready, no payments)

Tables (P0):
- `plans(id, name, status, sort, limits JSON, features JSON, created_at)`, e.g. `starter`, `pro`, `scale`, `internal`.
- `store_entitlements(store_id, key, value, source enum('plan','override','boost'), expires_at, set_by, reason)`: the
  per-store overrides.
- `store_usage(store_id, metric, period, value)`: counters updated atomically on write (media bytes, pages, versions,
  members, orders this month, AI generations this month, exports this month).
- One resolver `entitlement(store, key)`: override > boost (not expired) > plan > platform default, cached per store and
  invalidated on change. One helper `assertWithin(store, metric, delta)` throws a typed `QuotaError` that the UI turns
  into a premium "upgrade / ask for more" sheet, never a generic error.

Proposed keys (the architect sets the values; these are product ideas, **not** invented prices):

| Kind | Keys |
|---|---|
| Limits | `media_bytes`, `pages_max`, `products_max`, `members_max`, `agents_max`, `orders_month_soft`, `ai_generations_month`, `exports_month`, `versions_kept_per_page`, `custom_domains_max` |
| Features | `mode_store`, `mode_landing`, `mode_both`, `custom_domain`, `php_export`, `capi`, `remove_platform_badge`, `require_member_2fa`, `api_webhooks`, `ai_provider_premium`, `accounting`, `agent_commissions` |

Policies:
- **Orders are never blocked by a quota.** A COD seller losing an order costs real money and trust. Over the soft limit
  → banner + admin flag, never a refused order. Blocking applies to creation actions (upload, publish, invite, generate).
- A **pending** store has its own small plan (`pending`) so §5.2 is pure configuration.
- **Billing-ready:** `store_subscriptions(store_id, plan_id, status, period_start, period_end, provider, provider_ref)`
  exists from day one with `provider='manual'`. Admins record manual payments (bank transfer, cash) in `payments_manual`
  (P2). A payment provider plugs into the same table later. Which providers work for Moroccan merchants (CMI, others) is
  **UNVERIFIED** and out of scope here.

---

## 9. Impersonation and support access

| Rule | Value |
|---|---|
| Default mode | **Read-only "View as store"**. The dashboard renders with the store scope and `actor_kind='impersonation'`. Every mutation path (`storeAction`) refuses when `session.impersonation.mode='read'`. It is enforced server side, since server actions are callable by id from any route (AUTH-31). |
| Start | From the store profile ⋯ menu. A reason from a dropdown (Ticket #, Onboarding help, Abuse review, Bug reproduction, Other + note), as GitHub does [S11]. A ticket link is required for the support role. |
| Duration | 30 min default, 60 min max, as WorkOS (60 min [S10]) and GitHub (1 h [S11]). There is no silent extension; renewing is logged again. |
| Identity | A separate session row: `sessions.impersonator_user_id`, `impersonated_store_id`, `mode`, `reason`, `expires_at`. Audit rows carry both identities (the WorkOS `act` claim [S10]). Never log in "as the user" with their password. |
| Write mode | Only with an active **support grant** from the store owner: Settings → Support access → "Allow support to edit for 24 h / 72 h", scoped (pages, catalog, settings, **never** team, security, payouts or export). Shopify's request code is the model [S2]. Super-admin break-glass write without a grant needs a reason, step-up 2FA, a red ribbon and an immediate store notification (P1). |
| Never visible | Secrets (tokens, CAPI keys, Sheets IDs beyond the title), password/2FA screens, recovery codes, the full-PII CSV export, "reveal phone" in bulk. |
| Store visibility | A notification ("Support viewed your store: reason, from–to") in the store's notification centre and its Activity tab. Email once SMTP exists. GitHub always emails the user [S11]. |
| UI | A violet ribbon on every screen with a countdown and an **End** button. The cursor/pointer style is unchanged (no gimmicks). |
| Priority | P0 read-only (without it, support means asking sellers for screenshots); P1 owner grants for write; P1 break-glass. |

---

## 10. Tenant-side SaaS UX ("futuristic", owner items 14–15)

### 10.1 Onboarding wow moment (P0)
- **Goal:** a seller sees **their own store**, designed from their photos, within about 90 seconds of signup, before
  they fill any boring form.
- **Flow:** (1) signup (email + password + phone, Turnstile) → (2) "What will you run?" with three large visual cards
  (Store / Landing pages / Both) → (3) drop 1–5 product photos → (4) the local in-browser AI analyses them while the
  store name and handle are typed. Show a live path preview (`…/s/<handle>`, later `<handle>.<domain>`) with an
  availability check → (5) **reveal**: a full-bleed preview of the generated home or landing page, with 3 alternate
  directions to swipe (dynamic generation, never the same layout twice, owned by the design research) → (6) market,
  currency and delivery fee with Morocco defaults pre-filled → (7) the dashboard with the setup ring
  (`setup-checklist.tsx`) and the "In review" pill.
- **Rules:** never invent prices, ratings or stock (HANDOFF §2.4). Generation runs on the device (no paid API) with the
  rule-based fallback (`src/lib/ai`). If the device is weak, the rule-based design still produces a polished result
  instantly and the VLM refines it in the background.

### 10.2 Command palette everywhere (P0 extend, S)
- The tenant ⌘K: jump to an order by id/phone (store-scoped, ADM-02), create (product, landing page, collection), run
  (sync Sheets now, export orders, publish all), switch store, toggle language/theme, "ask AI" (P1, the AI research).
- The console ⌘K: jump to store/user/order/ticket, approve next in queue, start "view as", flag lookup.
- Natural-language actions ("orders from Casablanca not confirmed since yesterday") are P2 via the AI research.

### 10.3 Realtime dashboards (P1, M)
- Hostinger: 120 s per request, no inbound WebSockets [S4]. Use **visibility-aware polling** (every 15 s while focused,
  paused when hidden) on light JSON endpoints (`/api/app/<h>/pulse` → counts + last order id), or SSE that closes
  itself at 100 s with `retry:` hints (**UNVERIFIED** that LiteSpeed/Hostinger's proxy doesn't buffer SSE: test first).
- New orders slide into the list with a motion reveal. The KPI numbers roll (`AnimatedNumber`). A small "live" dot with
  the last-update time is honest about freshness.
- Process limits: Business plans have NPROC 120 and 60 entry processes shared by all sites [S4]. Polling endpoints must
  be cheap (indexed counts, cached 5 s per store) so dozens of open dashboards don't exhaust entry processes.

### 10.4 Notification centre (P0 table + bell, P1 rules)
- `notifications(id, store_id NULL, user_id NULL, kind, title_i18n, body_i18n, link, severity, created_at, read_at)`.
  Platform broadcasts fan out lazily (read-time join) rather than one row per user.
- Kinds: new order (batched: "12 new orders"), high-risk order, Sheets error, quota 80/100 %, approval result, support
  session, announcement, invite accepted, a teammate's role changed.
- Per-user preferences (in-app / push / email) are P1. Quiet hours are P2.

### 10.5 Mobile admin as a PWA (P1, M)
- Who it's for: the seller and the **confirmation agents** (owner item 10), who work on phones. An agent view = the
  order queue with one-tap call, WhatsApp and status buttons (the existing agent role, `permissions.ts:35`).
- A manifest + service worker (app-shell caching of the dashboard chrome only; **never cache order PII** offline).
- Web Push: Android/Chrome support is standard. On iOS/iPadOS, push works only for web apps **added to the Home
  Screen** (16.4+), and permission can only be asked after a user gesture [S19]. Implementing Web Push needs VAPID
  signing and payload encryption. Either add the `web-push` npm package (**UNVERIFIED** current maintenance; installs
  are slow here) or write the VAPID JWT and aes128gcm encryption with `node:crypto` (M effort). Push is sent from the
  request that created the order (no workers), with a cron retry.
- An install prompt after the 3rd visit, never on the first.

### 10.6 Other premium tenant touches (P1/P2)
- A "Today" brief at the top of the dashboard: 3 lines (orders to confirm, a problem to fix, an opportunity), generated
  from real numbers with templates first and the AI later. **P1.**
- Undo for destructive actions (soft delete with a 10 s toast via `sonner`) instead of confirm dialogs where it's safe.
  **P1.**
- Arabic RTL-perfect dashboard + French + English UI locale per user (ADM-40). **P1** (L effort, the owner's market).

---

## 11. Announcements, changelog and in-app messages (P1)

- `broadcasts(id, kind enum('announcement','changelog','maintenance','message'), audience JSON {plans, modes, markets,
  statuses, store_ids}, title_i18n, body_i18n (ar/fr/en), cta, starts_at, ends_at, dismissible, created_by)`.
- Surfaces: the notification centre, a top-of-dashboard banner (maintenance, critical), a "What's new" drawer
  (changelog with small screenshots), and a direct message thread to one store (ties into tickets).
- Draft → preview "as store X" → schedule → stats (seen / clicked / dismissed counts, no per-user tracking beyond
  read state).
- **Email:** none exists today. Hostinger mailboxes can send over SMTP, but limits are low and vary by plan: official
  pages cite **200 messages/hour** for the hosting-bundled email and **5 per minute** in another article [S20]
  (**UNVERIFIED for Business**: check hPanel → Emails → limits). Enough for verification, resets, approvals and
  impersonation notices; **not** for marketing broadcasts. Use a mail queue table drained by the cron with a per-minute
  cap. A transactional provider is a later option (vendor not chosen; **UNVERIFIED** pricing).
- **WhatsApp** is the channel Moroccan sellers actually read. Click-to-WhatsApp links for staff → seller messages are
  P1 (S effort, no API). An official WhatsApp Business API integration is owned by the COD ops research.

---

## 12. Support inbox and tickets (P1, M)

- The tenant "Help" button opens a sheet: search help articles (P2), or "Contact support". It **auto-attaches
  context**: store id, page URL, browser/device label (`describeUserAgent`), the last 5 client errors (an in-memory
  ring), the current build id. The seller writes in Darija/French/Arabic; a quick translate is P2 (AI research).
- `tickets(id, store_id, user_id, subject, status enum('open','pending','solved','closed'), priority, assignee_id,
  kind enum('question','bug','billing','appeal','abuse_report','domain'), created_at, updated_at, sla_due_at)` +
  `ticket_messages(id, ticket_id, author_kind, author_id, body, attachments JSON, internal bool)`.
- The console inbox: views (Mine, Unassigned, Waiting > 24 h, Appeals), macros (saved replies in 3 languages),
  internal notes, a "View as store" button pre-filled with the ticket reason, merge, and CSAT on close (1 tap, P2).
- Attachments use the media store with a per-ticket quota. Screenshots are the main use.

---

## 13. Global analytics across stores (P1, M), privacy first

Metrics (platform-level):
- **Growth:** signups/day, approval rate, time-to-approve, activation funnel (signup → first page generated → first
  publish → first order → first delivered order → 10th order), weekly active stores, churn (closed or dormant).
- **Commerce (COD-specific):** orders placed, **placed GMV**, **confirmed GMV**, **delivered GMV** (only once statuses
  come back from Sheets/carriers; label each clearly, never present placed GMV as revenue), confirmation rate, delivery
  rate, AOV, orders by market/city region, share of high-risk orders.
- **Product:** mode mix (store/landing/both), section/variant usage (what designs sell, input for the generation
  research), pixels connected, Sheets connected, AI generations, accept-vs-regenerate.
- **Niches/top products:** from a **platform category** the seller picks at onboarding plus generator tags, never from
  scraping product names in bulk.

Privacy rules (P0 policy, even if the dashboards are P1):
- The console aggregates; it does **not** show one store's numbers next to identifiable competitors to non-super-admin
  roles. Niche/region aggregates are shown only when **k ≥ 5 stores** contribute (a small-cell suppression rule), so an
  analyst can't infer one seller's sales from a "niche" of one.
- Customer PII never enters platform analytics. Phones and names stay in `orders`. Rollups hold counts and sums only.
- The terms of service and privacy policy must state that the platform processes aggregated store data to improve the
  product and the AI (also needed by the AI learning loop). Morocco 09-08 requires declarations to the CNDP for
  processing personal data, and cross-border transfers need CNDP authorization [S13] (summaries; **UNVERIFIED** detail;
  the owner should confirm with a Moroccan practitioner).
- Data plumbing: a nightly (cron, batched) `store_daily_rollup(store_id, day, visitors, orders, placed_cents,
  confirmed_cents, delivered_cents, risky_orders, ai_generations)` keeps console queries cheap on MariaDB 10.4.

---

## 14. System health (P0 basics, P1 depth)

| Panel | Content | P |
|---|---|---|
| Cron | Last tick time (red if older than 10 min), duration, per-step result, the last 50 ticks as a strip chart. `job_runs(id, job, started_at, ms, ok, summary JSON, error_code)` written by the tick (`tick/route.ts:56-72` already computes it). | P0 |
| Queues | Sheets push backlog per store (oldest pending), pull lag, render/re-render queue (theme change fan-out, TENANCY-MAP §11.1), export jobs, purge jobs, mail queue. | P0 (Sheets), P1 (others) |
| Storage | DB size total vs the 3 GB quota (`getDbUsage`), **per table** (`information_schema.tables`), **per store** (from `store_usage.media_bytes` + version bytes), disk usage of the media directory and inode count (**UNVERIFIED** Hostinger inode limit). A trend line projects the date the 85 % block will hit. | P0 |
| Errors | `error_events(id, at, area, code, store_id NULL, route, count, last_at, sample JSON redacted)`, deduplicated by `(area, code, route)` per hour. Fed by `logError` / `adminAction` catch blocks (`action.ts:45`). Never raw messages (they carry bound values, `action.ts:44`). | P0 (S–M) |
| Integrations | Platform Sheets service-account token health and Google quota errors, CAPI/Events failure rate by platform, Turnstile verify failures. | P1 |
| Build & runtime | Build id, deploy time, Node version, `process.memoryUsage()`, uptime, the boot warnings (`authConfigWarnings`, `config.ts`). | P0 (S) |
| External status | Last successful order per hour across the platform (a "heartbeat of commerce"). A drop to zero during the day is the best alarm. | P1 |
| Alerts | When a panel goes red, a notification to platform staff (in-app; email/WhatsApp later). | P1 |

Constraint facts: one Node process per site on Hostinger, 120 s per request, no always-on workers (they stop on deploy
or restart), cron for long work [S4]. **MariaDB 10.4 is past end-of-life** [S14]: the platform can't upgrade it on
shared hosting (**UNVERIFIED** whether Hostinger offers a newer version per database), so keep migrations portable to
MySQL 8 (TENANCY-MAP §2.4 already requires that).

---

## 15. Security centre and platform roles (P0)

Platform roles (separate from store roles; a staff member can also own stores of their own):

| Permission ↓ / Role → | super_admin | admin | support | analyst |
|---|---|---|---|---|
| View stores list, store profile (masked PII) | ✓ | ✓ | ✓ | ✓ (no notes) |
| Approve / reject signups | ✓ | ✓ | — | — |
| Restrict / suspend / restore store | ✓ | ✓ | — | — |
| Close / schedule deletion / purge | ✓ (purge = four-eyes or 24 h delay) | close only | — | — |
| View as store (read-only) | ✓ | ✓ | ✓ (with ticket) | — |
| Break-glass write / reveal PII | ✓ (step-up + reason) | reveal single order (step-up + reason) | — | — |
| Reset a user's 2FA / force sign-out / ban | ✓ | ✓ | — | — |
| Plans, entitlements, overrides | ✓ | overrides/boosts | — | — |
| Feature flags, kill switches | ✓ | flags (not kill switches) | — | — |
| Broadcasts | ✓ | ✓ | messages to one store | — |
| Tickets | ✓ | ✓ | ✓ | — |
| Analytics | ✓ | ✓ | — | ✓ (aggregates only, k ≥ 5) |
| Staff management, platform settings, security | ✓ | — | — | — |

Controls:
- **2FA mandatory** for every platform role: the console refuses a session without `mfaPassed`. TOTP exists
  (`mfa.ts`). Passkeys/WebAuthn are P2 (Shopify now frames secure sign-in as passkeys or 2FA [S15]).
- **Step-up re-auth** (TOTP within the last 5 min) for: suspend, close, purge, break-glass, reveal PII, 2FA reset, staff
  changes, kill switches.
- **Gate + IP allowlist + `ADMIN_HOST`** kept for the console (existing code). On the real domain the console lives on
  `admin.<domain>` with host-only `__Host-` cookies that never reach tenant subdomains (`config.ts:196-201` explains why).
- **Bootstrap:** the existing `/admin/setup` + `SETUP_TOKEN` creates the first **super_admin** (AUTH-13/15).
- **Audit:** every console action writes `audit_log` with `actor_kind='platform'` and `store_id` when it targets a
  store. Add a **hash chain** (`prev_hash`, `row_hash = HMAC(prev_hash || row)`) so a DB-level edit is detectable (P1,
  S). A tenant sees platform actions on its own store; it never sees other stores or the staff's IPs.
- **Break-glass log:** a dedicated, filterable view of every PII reveal, write impersonation and purge, reviewed weekly
  (P1).
- **Staff offboarding:** remove a role → sessions revoked at once (`revokeUserSessions`, `session.ts:187`).
- **Login hardening** applies to the public tenant login (AUTH-25/26), not only the console: per-(email, network)
  buckets, Turnstile, a scrypt semaphore, and finally enforcing `locked_until` (AUTH-27).

---

## 16. Feature flags and kill switches (P0 kill switches, P1 flags)

- `flags(key, description, kind enum('release','ops','kill','experiment'), default_value JSON, rules JSON, updated_by,
  updated_at)` + `flag_overrides(flag_key, scope enum('store','user','plan','market'), scope_id, value)`.
- Evaluation context = `{storeId, userId, plan, mode, market, platformRole}`, the OpenFeature concepts of evaluation
  context, targeting key and fractional rollout [S21]. Adopting the OpenFeature SDK itself is optional (a new package).
  The concepts fit in ~150 lines and a per-process cache with a 30 s TTL (a multi-process divergence risk, TENANCY-MAP
  §11.1).
- Percentage rollout = `hash(flagKey + storeId) % 100 < pct` (stable per store).
- **Kill switches (P0):** `signups_enabled`, `publishing_enabled`, `ai_generation_enabled`, `sheets_sync_enabled`,
  `capi_enabled`, `uploads_enabled`, `platform_read_only` (maintenance: dashboards read-only, **orders keep flowing**).
  Each is one click with step-up and shows a banner to tenants when it affects them.
- Today's build-time flags (`src/lib/page/features.ts:10-53`, ADM-40) become plan entitlements or release flags.

---

## 17. Platform settings (P0 core)

- **Signup:** mode (§5.1), Turnstile on/off, risk thresholds, pending quota, invite codes, the allowed markets list.
- **Brand:** platform name, logo/mark (replaces the COD Studio mark, ADM-32; **never** change the HKDF salt or purpose
  strings, TENANCY-MAP §11.1 brand-sweep hazard), console accent, email sender name, support WhatsApp number.
- **Legal templates (P0 content, owner-reviewed):** platform Terms of Service, Privacy Policy, Acceptable Use Policy
  (bans: phishing, counterfeit, prohibited goods, fake reviews/ratings: "never invented" is also a platform rule), Data
  Processing terms between the platform and stores, and **store legal templates** (privacy, returns, delivery, CGV in
  ar/fr/en) that tenants start from. Version every template, and record each user's acceptance (`legal_acceptances`).
  Content needs a Moroccan lawyer (**UNVERIFIED**, [S13]).
- **Reserved handles and words:** the reserved-segments list (TENANCY-MAP §6.3) + `protected_brands` (§5.3) + a profanity
  list in ar/fr/en/Darija (P1).
- **Defaults for new stores:** market MA, currency MAD, timezone `Africa/Casablanca`, language order ar/fr, delivery
  fee default empty (never invented).
- **Email/SMTP** credentials (encrypted with `encrypt(…, 'platform:smtp')`), sending caps.

---

## 18. Backups and disaster recovery (P0 export, P1 automated)

- Hostinger's own backup coverage and restore granularity for this plan are **UNVERIFIED** (TENANCY-MAP §11.1). Don't
  rely on them alone.
- **P0:** per-store export (§7) on demand. A platform "logical backup" job: the cron writes a chunked, compressed JSON
  dump of the small critical tables (`stores`, `store_members`, `users` without secrets, `store_settings` still
  encrypted, `orders`, `leads`, `plans`, `store_entitlements`) to the media directory outside `public_html`, one table
  slice per tick (≤ 100 s), keeping 7 dailies + 4 weeklies. Media originals are already files once the filesystem
  backend lands (storage research).
- **P1:** an off-site copy (the owner downloads it from the console, or a push to a Google Drive the owner connects;
  vendor details **UNVERIFIED**). A **restore drill** page that validates a backup's checksums and row counts against
  the live DB.
- `APP_SECRET` must be stored by the owner offline: without it every encrypted setting and TOTP secret in a backup is
  unreadable (HANDOFF §4: "never change after launch").

---

## 19. Data model additions (summary for the architect)

| Table | Purpose | P |
|---|---|---|
| `users.platform_role` (or `platform_staff(user_id, role, created_by)`) | Platform roles §15 | P0 |
| `signup_reviews(id, user_id, store_id, score, signals JSON, status, decided_by, decided_at, reason)` | Approval queue | P0 |
| `protected_brands(id, term, kind, added_by)` | Impersonation checks | P0 |
| `identity_links(user_id, kind enum('phone','net','device','email_norm'), value_hash, created_at)` | Duplicate/ban linking (hashes only) | P0 |
| `stores.status` extended: `pending, active, restricted, suspended, closed, scheduled_deletion, rejected` + `status_reason`, `status_changed_at`, `purge_after` | Lifecycle §7 | P0 |
| `plans`, `store_entitlements`, `store_usage`, `store_subscriptions` | §8 | P0 (`payments_manual` P2) |
| `impersonation_sessions` (or columns on `sessions`) + `support_grants(store_id, granted_by, scope, expires_at)` | §9 | P0 / P1 |
| `audit_log` + `store_id`, `actor_kind`, `impersonator_id`, `prev_hash`, `row_hash` | §15 | P0 (hash P1) |
| `platform_notes(id, store_id, user_id, author_id, body, pinned, created_at)` | Notes | P0 |
| `notifications`, `notification_prefs` | §10.4 | P0 / P1 |
| `job_runs`, `error_events` | §14 | P0 |
| `flags`, `flag_overrides` | §16 | P0 (kills) / P1 |
| `broadcasts`, `broadcast_reads` | §11 | P1 |
| `tickets`, `ticket_messages` | §12 | P1 |
| `store_daily_rollup` | §13 | P1 |
| `abuse_reports(id, store_id, page_url, reporter_contact, reason, status)` + a public "Report this store" link in store footers | Abuse | P1 |
| `mail_queue` | Email | P1 |
| `legal_documents`, `legal_acceptances` | §17 | P0 |
| `export_jobs` | Store export, backups | P0 |

---

## 20. Prioritised feature list

| # | Feature | P | Effort | Why it matters to a COD seller / the owner |
|---|---|---|---|---|
| 1 | Platform roles + mandatory staff 2FA + step-up re-auth | P0 | S | Without it, one stolen staff password exposes every store's customer phones. |
| 2 | Signup modes (closed/invite/approval/waitlist/open) | P0 | S | The owner controls who gets in; launch in approval mode. |
| 3 | Pending-store sandbox (build yes, publish/orders no) | P0 | M | Sellers get their wow moment at once; scam stores never go live. |
| 4 | Signup risk score with explainable flags (disposable, MX, brand list, duplicates, velocity, Turnstile, bot) | P0 | M | Faster, safer approvals; protects the platform's ad-domain reputation, which every seller's ads depend on. |
| 5 | Approval queue UI (keyboard triage, split view, bulk fast lane, request-info, reject + block) | P0 | M | The owner's daily job here takes minutes, not hours. |
| 6 | Stores list with "needs attention" filters and health chips | P0 | M | Find the stores that are losing orders (Sheets broken, quota) before the seller complains. |
| 7 | Store profile: Overview, Orders (masked), Catalog/pages, Team, Activity, Usage, Integrations, Risk snapshot, Notes | P0 | L | The owner's main request: every stat, log, order and teammate per store. |
| 8 | Lifecycle state machine + reasons + store notifications | P0 | M | Suspending a scammer without hurting legit sellers; restricted mode keeps a store visible. |
| 9 | Store data export ZIP (owner + admin) | P0 | M | Trust: sellers own their orders; closing is safe. |
| 10 | Read-only "View as store", time-boxed, reasoned, visible to the store | P0 | M | Support without screenshots or passwords. |
| 11 | Plans + entitlements + usage meters (no payments), orders never blocked | P0 | M | Fair limits on the shared 3 GB DB and one process; ready to charge later. |
| 12 | Kill switches (signups, publish, AI, Sheets, CAPI, uploads, read-only) | P0 | S | One click to contain an incident without a redeploy. |
| 13 | Health: cron ticks + job_runs, Sheets backlog per store, DB per table/store, error_events, build info | P0 | M | The 5-minute cron is the only background engine: if it stops, orders stop reaching call centres. |
| 14 | Notification centre (DB + bell) | P0 | S | Approvals, quota and errors reach the seller inside the app (there's no email yet). |
| 15 | Onboarding wow flow (mode cards → photos → live reveal with alternates → Morocco defaults) | P0 | L | First-session activation is the biggest lever on signups → paying sellers. |
| 16 | Console and tenant ⌘K extended and store-scoped | P0 | S | Speed; also fixes the ADM-02 PII search leak. |
| 17 | Platform settings: brand, signup, reserved handles, legal templates with acceptance records | P0 | M | Legal footing (09-08/CNDP) and platform identity. |
| 18 | Platform audit with actor kinds, store scope; break-glass PII reveal with reason | P0 | S | Accountability for every look at customer data. |
| 19 | Logical backups via cron + owner download | P0 | M | The hosting backup is unverified; orders are the business. |
| 20 | Support grants (owner allows write for 24/72 h, scoped) + break-glass write | P1 | M | Support can fix a seller's page in minutes when invited. |
| 21 | Tickets inbox with auto-context, macros in ar/fr/en, appeals | P1 | M | Organised support as stores grow. |
| 22 | Broadcasts: announcements, changelog drawer, maintenance banners, targeting | P1 | M | Communicate features and incidents to all stores. |
| 23 | Email via Hostinger SMTP with a queue and caps (verification, resets, approvals, impersonation notices) | P1 | M | Self-service recovery; fewer manual resets (TENANCY-MAP §11.1). |
| 24 | Realtime dashboards (visibility-aware polling / capped SSE) | P1 | M | Agents see new orders without reloading; the "live" vibe. |
| 25 | PWA + Web Push for owners and agents | P1 | M | Confirmation agents work on phones; a fast call after an order raises the confirmation rate. |
| 26 | Store health score + dormancy tagging | P1 | S | Proactive help; reclaim dormant handles later. |
| 27 | Global analytics (activation funnel, placed/confirmed/delivered GMV, mode mix, section usage) with k ≥ 5 suppression | P1 | M | Owner sees the business; feeds the design and AI learning loop. |
| 28 | Store-level "require 2FA for members" | P1 | S | Protects a seller's customer list from a careless agent. |
| 29 | Abuse reports (public link) + takedown tools + protected-brand rules | P1 | M | Phishing/counterfeit stores hurt every seller's domain reputation. |
| 30 | Audit hash chain + break-glass review view | P1 | S | Tamper evidence. |
| 31 | Ownership transfer flow | P1 | S | Sellers sell or hand over stores. |
| 32 | Domains tab + custom-domain request queue | P1 | M | Bridges to the domains research (hPanel attach is manual). |
| 33 | AI usage tab (latency, accept/regenerate) | P1 | S | Measures whether the AI gets better over time (owner item 11). |
| 34 | Full UTS #39 skeleton + mixed-script detection | P1 | S | Catches homograph brand impersonation. |
| 35 | Arabic RTL + French tenant UI locales | P1 | L | The market's languages. |
| 36 | "Today" brief on the dashboard | P1 | S | One look tells the seller what to do now. |
| 37 | Web Risk URL checks, VPN/ASN signal | P2 | S/M | Extra signals; needs a key or dataset. |
| 38 | Manual billing records, payment provider later | P2 | M | Monetisation once the product is proven. |
| 39 | Passkeys for staff and sellers | P2 | M | Phishing-resistant sign-in. |
| 40 | Natural-language console/tenant queries via AI | P2 | M | The futuristic layer once the data and AI are solid. |
| 41 | Help-centre articles + in-app search, CSAT | P2 | M | Deflects repetitive tickets. |
| 42 | Off-site backup push + restore drills | P2 | M | Disaster recovery maturity. |

---

## 21. Risks

- **The console is the highest-value target:** it reads every store. Mitigations: gate + allowlist + its own host + 2FA
  + step-up + masked PII + break-glass + audit chain. A single console XSS would be catastrophic, so the console must
  never render tenant HTML inline: previews go in sandboxed iframes on the store origin, not `dangerouslySetInnerHTML`.
- **Shared origin on the temporary domain:** the console, dashboards and every tenant page share one origin (TENANCY-MAP
  C7). Tenant pages carry vendor pixel scripts. Keep CSP narrowing, and move the console to `ADMIN_HOST` as soon as any
  real domain exists.
- **Manual approval friction:** if the queue waits for days, sellers leave. The sandbox and fast lane reduce this; the
  queue SLA tile makes delay visible.
- **False positives** from disposable lists [S5b] and brand checks: never auto-reject at launch; always explain.
- **Email limits** are low on Hostinger [S20]; never send broadcasts by email from there.
- **Hostinger limits** (120 s, NPROC 120 shared across 5 sites, no workers [S4]) cap realtime, exports and purges. Every
  long job must be resumable in slices.
- **MariaDB 10.4 EOL** [S14]: security fixes stopped. Keep SQL portable; move hosting if the database can't be upgraded.
- **Legal:** retention periods, CNDP declarations and cross-border rules (the servers' location is **UNVERIFIED**) need
  a Moroccan lawyer before launch [S13].
- **Impersonation abuse by staff:** mitigated by read-only defaults, owner grants, store-visible notices and the weekly
  break-glass review.
- **Multi-process divergence** (if Hostinger ever runs more than one process): caches for flags, entitlements and
  store status must have short TTLs or a DB version stamp.

---

## 22. Unverified items (to check before relying on them)

1. Shopify's deactivated-store data retention (about 2 years) comes from third-party sources [S3].
2. Hostinger email sending limits for the Business plan (200/h and 5/min come from different articles) [S20].
3. Whether SSE survives Hostinger's proxy without buffering, and whether the 120 s cap cuts streams [S4].
4. Hostinger inode/disk limits and backup coverage/restore granularity for this plan.
5. Whether Hostinger can provide a newer MariaDB/MySQL than 10.4 for this database.
6. Web Risk pricing tiers (from snippets) and approval process [S18].
7. The size of vendored `confusables.txt` and the effort of a pure-JS skeleton implementation.
8. The maintenance state of the `web-push` npm package (or the effort to hand-write VAPID + aes128gcm with
   `node:crypto`).
9. Morocco 09-08 / CNDP specifics: declarations for a SaaS processor vs each seller as controller, retention periods,
   cross-border hosting [S13].
10. A free, reliable VPN/hosting-ASN dataset for signup signals.
11. Payment providers available to Moroccan SaaS businesses (out of scope; for later billing).

---

## 23. Sources

- [S1] Shopify Partners blog, collaborator accounts (request expiry 7 days, request code): https://www.shopify.com/partners/blog/shopify-collaborator-account
- [S2] Shopify Help Center, Collaborator permissions (request code, account age and possible VPN shown, 90-day expiry, removal kept in logs, not counted in staff limit): https://help.shopify.com/manual/your-account/staff-accounts/collaborator-accounts
- [S3] Shopify Help Center, Pause and Build: https://help.shopify.com/en/manual/your-account/pause-close-store ; third-party retention claims: https://community.shopify.com/t/how-long-can-i-leave-my-store-inactive-for/233863
- [S4] Hostinger, Node.js limits for web and cloud plans (120 s, no inbound WebSockets, no background workers, NPROC 120 / 60 entry processes / 5 Node.js sites on Business): https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/ ; sockets: https://www.hostinger.com/support/?p=1364
- [S5] disposable-email-domains (CC0, `disposable_email_blocklist.conf`): https://github.com/disposable-email-domains/disposable-email-domains
- [S5b] Caveats on list quality and dead domains: https://www.suped.com/knowledge/email-deliverability/technical/where-can-i-find-comprehensive-lists-of-known-disposable-email-domains-to-block
- [S6] YouCan help: staff accounts and dashboard: https://help.youcan.shop/hc/en-us/articles/35317034450205 ; https://youcan.shop/en/help/blog/add-team ; https://help.youcan.shop/hc/en-us/articles/35317034364061
- [S7] Unicode UTS #39 skeleton via ICU SpoofChecker docs: https://javadoc.io/static/com.ibm.icu/icu4j/74.2/com/ibm/icu/text/SpoofChecker.html ; overview: https://unicodefyi.com/guide/unicode-security-guide/ ; spec: https://www.unicode.org/reports/tr39/
- [S8] Stripe, Manage connected accounts with the Dashboard / individual accounts ("View Dashboard As", filters, 540-day inactivity): https://docs.stripe.com/connect/dashboard ; https://docs.stripe.com/connect/dashboard/managing-individual-accounts
- [S9] Stripe Radar reviews: https://docs.stripe.com/radar/reviews ; https://stripe.com/ie/blog/improving-reviews-in-radar
- [S10] WorkOS impersonation (reason, 60-minute expiry, `act` claim): https://workos.com/docs/authkit/impersonation ; https://workos.com/blog/support-impersonation-delegated-sessions
- [S11] GitHub Enterprise Server, Impersonating a user (reason, user emailed, 1 hour, both audit logs): https://docs.github.com/en/enterprise-server@3.17/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/impersonating-a-user
- [S12] Cloudflare Turnstile plans (Free: unlimited challenges, 20 widgets, 10 hostnames per widget, pre-clearance): https://developers.cloudflare.com/turnstile/plans/
- [S13] Morocco Law 09-08 summaries (CNDP declarations, cross-border authorization): https://www.dlapiperdataprotection.com/index.html?c=MA&t=law ; https://upsilon-consulting.com/en/cndp-declarations-authorizations-practical-guide/
- [S14] MariaDB 10.4 end of life (18 June 2024 community): https://endoflife.date/mariadb ; https://isitpatched.com/eol/mariadb
- [S15] Shopify, requiring two-step authentication / secure sign-in for all users (organization setting): https://help.shopify.com/en/manual/organization-settings/security/two-step-authentication ; https://help.shopify.com/en/manual/your-account/logging-in/two-step-authentication
- [S16] Wix Roles & Permissions overview, contributor limits, custom roles: https://support.wix.com/en/article/roles-permissions-overview ; https://support.wix.com/en/article/about-site-contributor-roles-permissions
- [S17] Node.js `dns.promises.resolveMx`: https://nodejs.org/api/dns.html#dnspromisesresolvemxhostname
- [S18] Google Web Risk (commercial; Safe Browsing non-commercial only since 2019): https://cloud.google.com/security/products/web-risk ; https://docs.hetrixtools.com/google-safebrowsing-to-be-removed-on-11-nov-2019/
- [S19] WebKit, Web Push for Web Apps on iOS and iPadOS (Home Screen apps only, permission after user gesture): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- [S20] Hostinger email limits: https://www.hostinger.com/support/6550582-parameters-and-limits-of-hostinger-cpanel-email ; https://www.hostinger.com/support/11393648-php-mail-limitation-explained-how-to-improve-email-delivery-with-smtp/
- [S21] OpenFeature evaluation context (targeting, fractional evaluation): https://openfeature.dev/docs/reference/concepts/evaluation-context
