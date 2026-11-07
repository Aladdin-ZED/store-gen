# r1-p3-w2-report: P3 LANDING, wave 2

(Named `r1-p3-w2-report.md`, not `r1-p3w2-report.md`: only `docs/saas/ccr/r1-p3-*.md` is P3's, and
`test:ownership` refuses the other name as unowned.)

Branch `r1/p3w2` (worktree `C:\Users\SICO\sg-wt\p3`), cut from main `be96fe3` (all eight R1 tracks merged and live),
four steps in speed mode (owner, 2026-11-03). Wave 1 is reported in `r1-p3-report.md` and is on main since `1426c24`.
Commits: `769e9cc` and `cdf1448` (step 11), `d6e6d9d` (step 12), `ed8707a` (step 13), and this report (step 14).

## 1. Features delivered

| Id | What | Main files |
|---|---|---|
| LP-12 | Short links with UTM presets: create, pause (410), resume, delete, edit target; codes, click counter with its flush job (`links.flush`); the `/s/<store>/go/<code>` 308 redirect, never cached, 404 for unknown codes and pending stores, target safety check (no open redirect) | `src/lib/links/*`, `src/app/s/[store]/go/[code]/route.ts`, `src/app/app/[store]/links/*`, `src/components/admin/links/*` |
| LP-19 / SF-05 | Test-order links: the real `mintTestLink` (store-bound token, 2 h), the test render (noindex, no pixels, banner), "Open a test order" in the pages-list address card | `src/lib/testing/links.ts`, `src/lib/testing/render.server.ts`, `src/app/app/[store]/pages/actions.ts`, `src/components/admin/landing/address-slots.tsx` |
| LP-11 | Order on WhatsApp: the request carries no price; intents priced with the order's own functions (incomplete choices charge the offer's real "from" total and name the groups to confirm); `WA-` refs; the owner's `wa_order` template or the composed message, within 1,000 chars of text and 2,000 of link; one WhatsApp lead with no phone; the runtime upgrade of the form's WhatsApp link (4 s timeout, 30 s reuse, in-app browser rule, plain link on any error); live pages only; "Set phone" in the Leads inbox | `src/lib/wa-order/*`, `src/app/api/public/wa/route.ts`, `src/landing/runtime/addons/{select,assist}.ts`, `src/landing/addons/plan.ts`, `src/lib/leads/*`, `src/components/admin/leads/*`, the After the order card |
| LP-18 / SF-01 | Campaign Kit: `compileKit` (every number from the page, checked with `allowedNumbers`; three angles from three structure tags; hooks from the copy library; UGC sheet; `doNotSay`; pixel plan; call script with customer placeholders); create (one short link per channel), recompile, go live (gauge charged), pause (links 410), end (refund, links kept), stale marking; Cloud AI brief and call script through P7's `runAi` behind the flag and `ai.use`, never blocking the template kit; 28-day results per link and angle (test orders excluded, rates hidden under 20 orders); share page `/kit/<token>` (token shown once, sha256 at rest, revocable); the campaigns list and detail screens and the "Create a campaign" entry | `src/lib/campaigns/*`, `src/app/app/[store]/campaigns/*`, `src/app/(public)/kit/[token]/page.tsx`, `src/components/admin/campaigns/*` |

Wiring for all four: sidebar nav, ⌘K commands, search (link codes, campaigns), ar / fr / en strings in the landing
admin i18n files, and attack cases for every new route, action and read in `scripts/qa/tenancy-cases/landing.ts`.
Stub replaced in wave 2: `mintTestLink` (`src/lib/testing/links.ts`) and `compileKit` (`src/lib/campaigns/compile.ts`),
frozen signatures kept.

## 2. Final checks (step 14, through the mutex, 2026-11-07)

Every sub-suite of `npm test` run one by one (continuing past a failure), plus the four wave-2 suites that are not in
the aggregate yet: 40 pass, 1 fails.

- Pass: `typecheck`, `theme:check`, `test:runtime`, `test:generator`, `test:money`, `test:conversions`, `test:ops`,
  `test:state`, `test:profit`, `test:offers`, `test:orders`, `test:settings`, `test:registries`, `test:tenancy-unit`,
  `test:jobs`, `test:prepublish`, `test:checklist`, `test:delivery`, `test:landing-addons`, `test:policies`,
  `test:honesty`, `test:cod-invariants`, `test:pulse`, `test:shell`, `test:admin-tokens`, `test:admin-motion`,
  `test:admin-rtl`, `test:i18n-coverage`, `test:platform`, `test:health`, `test:design`, `test:registry`,
  `test:copylib`, `test:ai`, `test:ownership`, `test:tenancy-lint` (0), `test:links`, `test:test-orders`,
  `test:wa-price`, `test:kit`.
- Fails: `test:render`, one line only: "runtime assist is 3909 B gzip, over its 2600 B budget + 5%". This is CCR
  r1-p3-14 item 1 (the budget file is the maintainer's): LP-11 bundles the message serialiser and the intent click into
  the `assist` chunk. Every other budget line and all render cases pass (page 35,361 / 34,800 is inside its +5 %).
- Not run in this step (speed mode, lead note 2026-11-07): the DB suites outside `npm test` (`test:tracking`,
  `test:leads`, `test:tenancy`, `test:public-api`, `test:migrate`, `test:php`), `build`, `test:e2e`,
  `qa:publish-gates`, `qa:wow-demo`, `npm run gate`. They run at the merge in main. `test:public-api` is expected to
  fail its four `/wa` intent cases until CCR r1-p3-14 item 3 lands.

## 3. Screens

None of the wave-2 screens were shot in dev in steps 12 to 14: `/app/<h>/links` (English in step 11's first attempt
and Arabic in its retry are the exceptions), `/app/<h>/campaigns`, `/app/<h>/campaigns/<id>`, `/kit/<token>`, the
inbox's intent rows and the After the order card. The merged app's webpack dev compile needs more than 4 GB and timed
out or crashed on this 7.7 GB machine (0.5 to 1.0 GB free; three runs in step 13 timed out at 180 s per page). The
lead checks these screens on the live site after the merge and deploy (lead note 2026-11-07).

## 4. CCRs filed in wave 2 (all open, for the P3 wave-2 merge)

| CCR | What | Effect while open |
|---|---|---|
| r1-p3-13 | short-link audit actions (`link.resumed`, `link.deleted`, `link.target_changed`); `test:links` and `test:test-orders` in the aggregates; P2 slot mounts check | resume is audited as `link.paused` with `meta.paused = false`; delete and edit target not audited; both suites run on their own |
| r1-p3-14 | `assist` budget 2600 -> 4000 and page cap 34800 -> 36100; `leads.merged_into`; the public-api harness turns `landing.waOrder.enabled` on for the `/wa` cases; a `wa` burst scope; P5's `wa_order_reply` kind; the `lead.phone_set` audit label | `test:render` fails its `assist` line; "Set phone" links leads through `lost_reason = 'merged'`; the intent API shares the `lead` burst scope; `test:public-api` fails its four `/wa` intent cases |
| r1-p3-15 | `test:kit` (offline half) in `npm test`; the `campaigns.share_expiry` nightly job; contract note on `CompileKitInput`'s optional fields; the `[id]` fixture for `/app/<h>/campaigns/[id]` in `test:tenancy` | `test:kit` runs on its own; shares of ended kits stay valid until revoked by a member |

Wave-1 CCRs r1-p3-11 (items 2 and 3) and r1-p3-12 (builder mounts) stay deferred to the integration, as their merge
notes say.

## 5. Known gaps

- Skipped by the speed note for this step: the wow-demo landing steps (`scripts/qa/wow-demo/steps/landing.ts`), the
  integration-only assertions (real `estimateHeights`, P6's hero COD line, the builder's sheet mounts, P7's
  `policyLines` guard), the self-review of the wave-2 diff, and the full `r1-p3-report.md` "Proven by" table.
- No `git merge main` in the worktree (forbidden in a step); the maintainer merges `r1/p3w2`.
- The screens listed in §3 have not been looked at.
- Open items for the R1 integration: live V-checks of `/go`, `/kit`, `/track` and the test render headers; the
  calibration corpus; the manual COD run on XAMPP and on the live site (test order, WhatsApp intent, campaign kit).
