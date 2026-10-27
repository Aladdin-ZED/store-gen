# Store Gen SaaS upgrade: progress log (resume point)

Read this first when resuming after a network drop, a crash or a new session. It records what is done, what is
running, and how to restart it. Newest state at the top of "Running now".

## Plan (owner brief: docs/STORE-GEN-BRIEF.md, items 1-7)

| # | Phase | Output | State |
|---|---|---|---|
| 0 | First deploy of the cloned code | live site, build 01a16abd | **done** 2026-10-23 |
| 1 | Understand: subsystem maps | docs/saas/TENANCY-MAP.md | **done** 2026-10-23 (run wf_2ff1c4b9-e11) |
| 1b | Research + brainstorm (owner items 8-15): domains/subdomains, COD ops+agents+accounting+integrations, AI learning loop, generative design, platform admin, storefront/landing | docs/saas/research/*.md + docs/saas/RESEARCH.md | **done** 2026-10-24 |
| 2a | Spec writing: core contract + 6 part specs | docs/STORE-SAAS.md, docs/saas/spec/*.md | **done** 2026-10-24 |
| 2b | ELEVATE (owner item 16, Fable): core rev 2 integrates requests + rethink; 6 parts rev 2 raise ceilings; core rev 2.1 | same files | **done** 2026-10-24 (commit a2e9fc2) |
| 2c | Reviews (6 lenses) → per-file revisers → critic loop | same files + §P | **done** 2026-10-24 (56db6eb) |
| 2d | Integrate critic r2 residuals (single integrator) + confirming critic | same files | **done** 2026-10-24 (efd8849) |
| 3 | R1.0 core tenancy: C0a contract step → tracks T1 DATA, T2 AUTH, T3 EDGE, T4 SCOPE + C0b (worktrees) → integration → verify → deploy | code | **LIVE 2026-10-27** |
| 4 | Build phase 1: parallel tracks (store pages, landing+, brand kit/logo, team/invites, platform admin, storage) | code | todo |
| 5 | Adversarial verification incl. cross-tenant attack tests, fix loop | tests + fixes | todo |
| 6 | Deploy to the Store Gen site (archive method, HANDOFF §4) + live smoke | live | todo |

## Progress toward "everything live" (owner asked 2026-10-24; report this % in every update)

Weights = share of total work. Update the "done" column when a stage moves.

| Stage | Weight | Done in stage | Contributes |
|---|---|---|---|
| Research + full spec | 12% | 100% | 12.0% |
| R1.0 core tenancy (accounts, stores, teammates, isolation; live on temp domain) | 18% | **100% — LIVE 2026-10-27** (build 01a17eb4, smoke 22/22) | 18.0% |
| R1 product (platform console + approvals + store profiles, landing+, call center, AI Director, design genome, onboarding wow) | 35% | 0% | 0% |
| R2 full stores + accounting + logo designer | 22% | 0% | 0% |
| R3 growth, custom domains, carrier APIs, learning AI | 13% | 0% | 0% |
| **Total** | 100% | | **≈ 30%** |

Milestones: R1.0 live ≈ 30% · R1 live ≈ 65% · R2 live ≈ 87% · R3 live = 100%. Owner inputs needed later: real domain +
Cloudflare (subdomains, before public sign-ups), optional Claude API key + monthly cap, a carrier statement sample (R2), legal
review of terms/privacy (before public launch).

## Running now

(updated by the lead session; each entry: what, workflow run id, script path, how to resume)

- **R1.0 LIVE** 2026-10-27 18:54: build `01a17eb4` (commit a2d923d, archive sha256 afb0607d…aa8f, Turbopack 4 workers,
  2m 8s). First boot: gate SHA, 0004 applied, empty-install conversion, tenancy-check 0 problems; reboot idempotent.
  Live smoke 22/22 (CDN headers accounted for). Cron created via API (uid YSkoD5krXj, */5, header form). Records in
  HANDOFF §6. NEXT PHASE: R1 product (STORE-SAAS §K.2): P0 contract step (maintainer) then 8 parallel tracks P1-P8.
  Owner steps (non-blocking): /admin/setup bootstrap; optional DATA_DIR probe; optional max_user_connections.
- **CORRECTION (2026-10-27 ~18:55): the dot-name upload rule committed in a2d923d (HANDOFF §4, runbook §2.2) is WRONG.**
  Tested: `/.sg-dotprobe.txt` was served publicly (200); only `/.env` is blocked by a specific rule. What works (tested:
  403 for the file, the .htaccess and the listing): upload into `public_html/_sgdeploy/` which holds an `.htaccess`
  with "Require all denied" (uploaded 2026-10-27, kept). Upload as `_sgdeploy/sg-<hex>.zip`, archive_path the same.
  The docs are corrected in the first commit after this deploy (not before: it would invalidate the running gate).
- **R1.0 DEPLOY ATTEMPT 1 FAILED (infra, not code)** 2026-10-27 18:26: build 01a17e99 passed install + gate:offline on
  Hostinger (lint 0 / 1011 files, 618 + 5997 + 66 + 251 selftests), compiled, then "Collecting page data using 63 workers"
  hit the build host thread limit (os error 11, SIGABRT; webpack fallback too). Old version stays live; env already 16 keys.
  The uploaded sg-a0d930792752.zip was PUBLIC (200) because a failed build never syncs public_html: deleted via the file
  service API (204 → 404). Fixes: next.config experimental.cpus 4; uploads now dot-named (.sg-<hex>.zip, 403 by the web
  server); delete-on-failure step; HANDOFF §4 + runbook updated. NEXT: commit → gate → archive → upload .sg-… → verify 403
  → build → smoke.
- **R1.0 DEPLOY IN PROGRESS** 2026-10-27 ~18:22: gate green on 097a0eb (qa/.gate-ok), archive storegen-097a0eb.zip
  (10,787,593 B, sha256 b9c976e6…a805fe), uploaded as sg-a0d930792752.zip, env replaced (16 keys verified by name), build
  `01a17e99-23cc-73f8-9794-64f939ed6b92` started. Next: poll hosting_get-deployment → runtime logs (3.3) → smoke (4.1,
  scratchpad/sg-smoke.mjs) → cron via hosting_cron-jobs_create (header form) → report. Owner afterwards: /admin/setup,
  DATA_DIR probe (File Manager), max_user_connections (phpMyAdmin).
- **FINALE DONE** (F5 eb5304f: runbook docs/saas/ccr/r1.0-deploy-checklist.md; its one blocker = runbook ownership row, fixed
  by the lead in §K.3). NOW: `npm run gate` on the final HEAD (writes qa/.gate-ok) → then deploy per the runbook.
- **2026-10-27 resumed:** Hostinger connector RECONNECTED by the owner (works: 14 env keys, 1 completed build 01a16abd, account
  has NO cron job at all). Finale F1-F4 done (bd03f6e, 1981729, 1a703da gate green, 2da7720 F4 fix: 0004 would have created an
  ownerless store #1 from the old boot's pixel-library audit rows; fixed before production). F5 readiness resumed as task
  `wlc1l72tp` (same run wf_d05b9e9b-e40). ORDER: F5 commits the runbook docs/saas/ccr/r1.0-deploy-checklist.md → commit this
  log → re-run `npm run gate` on that HEAD (qa/.gate-ok must name HEAD) → deploy per the runbook (env 16 keys from
  .env.hostinger, archive.mjs, TUS upload, build, smoke, create the cron in header form via hosting_cron-jobs_create, second
  deploy for the DATA_DIR probe).
- (resolved) **BLOCKED ON OWNER (2026-10-27 ~05:20): the Hostinger MCP connector signed out** ("needs you to sign in again"). The owner
  must reconnect Hostinger in Claude's connector settings (or /mcp in a terminal). Until then: no env replace, no upload, no
  build. Everything else continues. Heartbeat: if the connector works again (mcp__hostinger__search answers), continue the deploy
  per docs/saas/ccr/r1.0-deploy-checklist.md.
- **Phase 3 R1.0 / FINALE** — started 2026-10-27. Task `w4pesqcs8`, run `wf_d05b9e9b-e40`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\r1-0-finale-wf_d05b9e9b-e40.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_d05b9e9b-e40"})` (no args). Steps: F1 chores + scripts/deploy/
  archive.mjs (gated on qa/.gate-ok) → F2 exit-scenario e2e (production build on 3452, Playwright msedge) → F3 npm run gate until
  green → F4 upgrade dry run on a production-equivalent DB (temp worktree of 3598537 at C:\Users\SICO\sg-wt\prod-equiv) → F5
  readiness review + docs/saas/ccr/r1.0-deploy-checklist.md. The finale commits on main: the lead does not commit while it runs.
  NEXT (lead): follow r1.0-deploy-checklist.md: env full replace (16 keys from .env.hostinger + PLATFORM_URL + DATA_DIR),
  archive.mjs → upload → build → smoke → second deploy for the DATA_DIR probe.
- **MERGE T4** — DONE 2026-10-27: c93c8a0 merge, 7ffbc8c + 151d721 CCRs (all stopgaps, adminAction/adminGuard and string
  rateLimit removed), 83f9b5c + e851f92 lint at 0 over 1,004 files and in npm test, 0164239 attack suite on real code
  (test:tenancy 6,424 / 0 / 0 pending; action-replay 4,080 / 0 / 0), 5583286 review fixes (20 findings, 7 serious: Sheets
  ownership proof via titles only, step-up on integration secrets, audit redaction, cron pull, CSV export, RTL shell).
  ALL R1.0 TRACKS MERGED. Next: R1.0 FINALE (integration chores, gated archive script, exit-scenario e2e, npm run gate,
  upgrade dry run on a production-equivalent DB, deploy checklist) then the deploy (16 env keys, DATA_DIR probe x2).
- **Phase 3 R1.0 / MERGE T4 into main** — started 2026-10-27 (after T3). Task `wtdbg51y9`, run `wf_850c39cb-71e`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\r1-0-merge-t4-wf_850c39cb-71e.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_850c39cb-71e"})` (no args). Steps: merge + conflicts + CCRs →
  lint to 0 in src/lib → lint to 0 everywhere + lint into npm test → full attack suite with 0 pending → 2 parallel reviews
  (isolation, dashboard regressions) → fix. Every step commits + pushes on main. Next: R1.0 FINALE (§K.1 integration list +
  exit criteria) then the gated deploy.
- **MERGE T3** — DONE: 04b0404 merge, fa880e4 + 315a806 CCRs (T3 lint 101 → 0), c8d8a48 review fixes (8 findings, 2 majors:
  Worker subrequest cache could serve store A's page to store B → cacheTtlByStatus -1; legacy Sheets/CAPI path limited to store
  #1 until T4). Online P/S-mode HTTP isolation checked.
- (old) **Phase 3 R1.0 / MERGE T3 into main** — started 2026-10-26 ~15:05. Task `wzv7nvq7c`, run `wf_7da03428-30c` (generic merge
  script, args key t3, n 4, branch r1.0/t3, base c54c12b; exact args in the run's journal). Resume with the same args.
  Next: MERGE T4 (branch head 9c54cde), then the R1.0 finale.
- **MERGE C0b** — DONE 2026-10-26 ~14:55: 0505558 merge, 54de35c + 07638f0 CCRs, c54c12b review fixes (16 findings, 1 blocker
  + 11 majors: forged-scope detection, OR-injection, unscoped chains, raw SQL anywhere, store_id overwrite; all fixed, every
  probe a permanent lint fixture).
- **C0b fix round RESUMED** 2026-10-26 ~14:40 as task `wnhb0ri5c` (same run `wf_d63d1781-d50`; merge + review replayed from cache).
  A ~40 h network outage (2026-10-24 evening → 2026-10-26) killed all 6 attempts of fix-c0b; its partial edits stayed
  uncommitted on main and the fix prompt now tells the agent to finish them. C0b review headline: a StoreScope can be forged
  with an object spread (no cast; tsc and lint silent) and src/lib/db/upgrade-check.ts runs ~20 unannotated cross-store raw
  SQL statements L10 cannot see. Next after it: MERGE T3, then T4, then the R1.0 finale.
- **R1.0 TRACKS ALL DONE** 2026-10-24 ~18:45 (22/22 steps, 0 agent errors after the relaunch). Branch heads: t1 c59cd40,
  t2 fb4583f, t3 99a613f, t4 9c54cde, c0b (merged). T4 attack suite 4,600 pass / 0 fail / 101 pending; action replay 2,489 /
  0 / 31 (pending = checks ending in T2/T3 stubs). Remaining merges: T3 then T4 (generic merge script, new args), then the
  R1.0 FINALE (delete adminAction/adminGuard + deprecated overloads + stubs, lint into npm test, gate:offline into prebuild,
  npm run gate, exit criteria §K.1, deploy).
- **Phase 3 R1.0 / MERGE C0b into main** — started 2026-10-24 ~17:35. Task `wnptvb4ra`, run `wf_d63d1781-d50` (generic merge
  script below, args key c0b, n 3, branch r1.0/c0b, base 1d1a83f). Resume with the same args from the run's journal.
  Then: MERGE T3 (done, waiting), then T4 (on its last step).
- **Phase 3 R1.0 / MERGE T2** — DONE 2026-10-24 ~17:30: 6ae3e7b merge, 958f5db + 0e66662 CCRs, 1d1a83f review fixes (9 findings,
  3 majors: step-up on admin/owner invites, legacy /admin admission, login challenge race; all fixed with tests).
- (old entry) **Phase 3 R1.0 / MERGE T2 into main** — started 2026-10-24 ~16:25. Task `w7qq2ybye`, run `wf_6252808c-e3f`.
  GENERIC merge script (reused for C0b, T3, T4 with new args): `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\r1-0-merge-track-wf_6252808c-e3f.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_6252808c-e3f", args: <the same T2 args: key t2, n 2, branch r1.0/t2, base f132495, …; see the run's journal "launched" entry>})`.
  The integrator commits on main: the lead does not commit on main while it runs.
- **Phase 3 R1.0 / MERGE T1** — DONE 2026-10-24 ~16:20: 955b520 merge, 3389943 + cb6b1ba CCRs, f132495 review fixes (1 major +
  6 minors, all fixed with regression tests). Was: started 2026-10-24 ~15:10.
- (old entry) **Phase 3 R1.0 / MERGE T1 into main** — started 2026-10-24 ~15:10. Task `wv3x3wg8p`, run `wf_3b2b82ba-9c2`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\r1-0-merge-t1-wf_3b2b82ba-9c2.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_3b2b82ba-9c2"})`. Merge agent → adversarial review → fix.
  THE INTEGRATOR COMMITS ON MAIN: the lead does not commit on main while it runs. T1 and C0b tracks are DONE (4/4 each).
  Merge order after it: T2 → C0b → T3 → T4 (each as its own merge workflow when its track is done).
- **Phase 3 R1.0 / TRACKS RELAUNCHED** 2026-10-24 ~12:58 as task `wji9seiv8` (same run `wf_ddc6f9d4-22c`, same script): the
  first launch died at ~12:50 on a network outage (ENOTFOUND; all 3 immediate retries of every first step failed). Script now
  has 6 retries per step and a FIRST ACTION note so each agent continues from the partial uncommitted work in its worktree.
  If the whole run dies again on ENOTFOUND: wait for the network (curl https://api.anthropic.com/ answers 404), then resume the
  same run id the same way.
- **Phase 3 R1.0 / TRACKS** — started 2026-10-24 ~12:30. Task `wkeu546qq`, run `wf_ddc6f9d4-22c`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\r1-0-tracks-wf_ddc6f9d4-22c.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_ddc6f9d4-22c"})` (finished steps replay; a chain resumes at its
  first unfinished step; each finished step is also COMMITTED on its branch, so work is never lost).
  5 parallel chains in worktrees C:\Users\SICO\sg-wt\{t1,t2,t3,t4,c0b} (branches r1.0/<t>, DBs cod_wt_<t>, test DBs cod_test_<t>_*):
  T1 DATA 4 steps · T2 AUTH 4 · T3 EDGE 4 · T4 SCOPE 6 · C0b 4. Heavy commands serialized by C:\Users\SICO\sg-wt\heavy.mjs
  (lock dir C:\Users\SICO\sg-wt\.heavy-lock; stale after 20 min or dead pid). Track reports: docs/saas/ccr/r1.0-<t>-report.md
  (in each worktree). Next: R1.0 integration in main: merge T1 → T2 → C0b → T3 → T4, apply CCRs, delete adminAction/adminGuard
  + deprecated overloads + stubs, lint into npm test, gate:offline into prebuild, npm run gate, attack suite, fix loop, deploy.
  Worktree removal later: ALWAYS `cmd //c "rmdir <wt>\node_modules"` first (junction), then `git worktree remove --force`.

- **Phase 3 R1.0 / C0a** — DONE 2026-10-24 ~12:15 (commit 776d24c; independently re-verified: tsc, npm test, test:php
  2650/2650, smoke 13/13). Baseline manifest docs/saas/ownership-baseline.json (5bbef59).
  Was: started 2026-10-24 ~10:55. Task `wsg3i2bv6`, run `wf_490a4c68-dd8`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\r1-0-c0a-wf_490a4c68-dd8.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_490a4c68-dd8"})`.
  Sequential agents A1 types/permissions/pure helpers → A2 schema.ts + drizzle/0004 + settings registries → A3 minimal seam,
  typed cross-track stubs, extension skeletons, package.json scripts, maintainer build note in core §K.1 → A4 verify (tsc, npm
  test, 0004 on empty DB twice, /app/<h> renders through the seam on port 3451) → spec tidy (10 wording minors, rev 6).
  Works directly in the main tree; the LEAD commits after reviewing (agents do not commit).
  Next: lead reviews + commits C0a, writes the ownership baseline, creates worktrees C:\Users\SICO\sg-wt\{t1,t2,t3,t4,c0b}
  (node_modules junction, own .env.local DB cod_wt_<track>, test DB prefix cod_test_<track>_*), launches the 5 tracks.

- **Phase 2d INTEGRATE (critic r2 residuals)** — DONE 2026-10-24 ~10:50 (commit efd8849): 22/22 applied; confirming critic ready.
  Was: started 2026-10-24 ~10:05. Task `wnqnfawnz`, run `wf_a623cd7c-cd2`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\store-saas-spec-integrate-wf_49308093-160.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_a623cd7c-cd2", args: {issuesFile: "C:\\Users\\SICO\\store-gen\\qa\\saas-baseline\\critic-r2-issues.json", count: 22}})`.
  One sequential integrator applies the 22 issues (7 majors = cross-file drift) across all 7 spec files, then a confirming
  critic. (A first launch wf_49308093-160 was stopped at once: it had a placeholder instead of the issues; it edited nothing.)
  Next after it: R1.0 build (core §K.1: contract step C0, then tracks T1-T4).

- **Phase 2c REVIEW** — DONE 2026-10-24 ~10:00 (commit 56db6eb): 196 findings (9 B / 103 M / 84 m), 787 resolutions, 92 reasoned
  rejections; core rev 4 (5,496 lines), parts rev 4; critic r2: 0 blockers, 7 majors + 15 minors, 94/96 claims verified.

- **Phase 2c round 2 RESUMED** — 2026-10-24 ~08:25 after a session usage limit (reset 08:20) killed all round-2 agents.
  Round 1 is done and committed (5750823): 6 reviews, 7 revisions, critic r1 = 0 blockers, 5 majors (2 cross, 2 operations,
  1 landing), 15 minors, 84 claims checked. New task `wr7x91yx5`, same run `wf_04544af2-2aa` (finished agents replay from cache).
  If it dies again: resume the same run id again. Next after it: R1.0 build.

- **Phase 2c REVIEW → REVISE → CRITIC** — started 2026-10-24 ~04:20 (Fable 5.1). Task `w9ig7imm0`, run `wf_04544af2-2aa`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\store-saas-review-wf_04544af2-2aa.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_04544af2-2aa"})`.
  Stages: 6 reviewers (OPS, ENGC, ENGP, UX, SEC, QUAL) → 6 part revisers in parallel → core reviser (cross-file + §P) →
  critic (≤ 2 rounds, each followed by a fix round). Next after it: R1.0 build (contract step, then 4 parallel tracks).

- **Phase 2b ELEVATE** — DONE 2026-10-24 ~04:15 (8 agents, 0 errors; commit a2e9fc2): core rev 2.1 (4,299 lines), parts rev 2
  (19.9k lines). Was: started 2026-10-24 ~02:25 (Fable 5.1). Task `wsbd0jhy1`, run `wf_c7874943-a15`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\store-saas-elevate-wf_c7874943-a15.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_c7874943-a15"})`.
  Stages: core-integrate (STORE-SAAS.md rev 2, appendix Q request decisions) → 6 parallel part elevations (rev 2; design at
  max effort) → core-reconcile (rev 2.1). Next after it: Phase 2c reviews → revise → critic loop → R1 build.

- **Phase 1d Fable rethink (AI + features)** — DONE 2026-10-24 ~01:15 (2 agents, 0 errors): docs/saas/research/rethink-ai.md (~560 lines), rethink-features.md (927 lines). Was: started 2026-10-24 ~00:45. Task `wjqy0ncln`, run `wf_ba647c5b-5cb`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\fable-rethink-wf_ba647c5b-5cb.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_ba647c5b-5cb"})`.
  Output: docs/saas/research/rethink-ai.md, docs/saas/research/rethink-features.md (inputs of Phase 2b ELEVATE).

- **Phase 1c design baseline audit** — DONE 2026-10-24 ~01:55: docs/saas/research/design-baseline.md (482 lines; score 4.3/10, distinctiveness 2/10; 60+ targets). 2 ENOTFOUND first attempts auto-retried. Was: started 2026-10-24 ~00:40 (Fable 5.1). Task `wos2qnru9`, run `wf_21efd09c-0c8`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\design-baseline-audit-wf_21efd09c-0c8.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_21efd09c-0c8"})`.
  Output: qa/saas-baseline/ (html, shots, index.json; git-ignored) + docs/saas/research/design-baseline.md.

- **Plan change 2026-10-24 (owner item 16, Fable 5.1):** after Phase 2a finishes, run **Phase 2b ELEVATE** (Fable, xhigh/max):
  one elevation architect per spec file (core + 6 parts) raises the quality ceiling using design-baseline.md, the
  rethink docs (docs/saas/research/rethink-*.md) and the anti-slop rubric copied at qa/ref/anti-slop-frontend-rubric.md
  (owner rules win over it: no orange ever). Then Phase 2c reviews (operator, principal engineer, premium designer,
  security, AI/design-quality lens) → 2d revise + critic loop → R1 build.

- **Phase 2a spec writing** — DONE 2026-10-24 ~02:20 (12 agents; 5 ENOTFOUND first attempts auto-retried; 0 missing): docs/STORE-SAAS.md rev 1 (2,885 lines) + docs/saas/spec/*.md (13,9k lines). Was: started 2026-10-24 ~00:10. Task `wf817bkqi`, run `wf_7baa2790-029`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\store-saas-spec-write-wf_7baa2790-029.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_7baa2790-029"})`.
  Output: docs/STORE-SAAS.md (core, lead architect) then docs/saas/spec/{platform,storefront,landing,operations,ai,design}.md.
  Next after it: Phase 2b = reviews (operator, principal engineer, premium designer, security, AI/design lens) over core +
  parts → revisions (core integrates "Requests to the core") → critic loop.

- **Phase 1b research** — DONE 2026-10-24 ~00:05 (7 agents, 0 errors). docs/saas/RESEARCH.md + docs/saas/research/*.md.
  Run `wf_b99045d6-630`, task `w1pqiuxkb`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\store-saas-research-wf_b99045d6-630.js`
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_b99045d6-630"})`.
  Next after it: relaunch the spec workflow (Phase 2) with RESEARCH.md as input; routing decision changed to
  subdomain-per-store on a real domain (path mode /s/<handle> only on the temporary domain).

- ~~Phase 2 spec, first attempt~~ (STOPPED on purpose, superseded) — started 2026-10-23 ~23:20. Task `wcdw7iaxo`, run `wf_1620a313-a04`.
  Script: `C:\Users\SICO\.claude\projects\C--Users-SICO-store-gen\f427b800-e33a-487e-8dbe-9a6d72ce6159\workflows\scripts\store-saas-spec-wf_1620a313-a04.js`
  Journal: `...\subagents\workflows\wf_1620a313-a04\journal.jsonl`.
  Resume: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_1620a313-a04"})`.
  Output: docs/STORE-SAAS.md (draft → 4 reviews → rev 2 → critic loop). Lead decisions for TENANCY-MAP §11.2 are in the script.

## Auto-restart rules (owner request 2026-10-23: "always awake, restart automatically")

- A heartbeat cron in the lead session fires every ~20 min. On each fire: check running workflows/background
  tasks; if one died (network ENOTFOUND, API error, crash), resume it with
  `Workflow({scriptPath, resumeFromRunId})` (finished agents replay from cache); if nothing runs and work is left,
  start the next phase from this file.
- Every workflow agent call is wrapped in a retry (3 attempts) so one network drop does not lose a stage.
- Build agents work from the working tree, so a resumed agent continues from files already written.
- Never kill the owner's dev servers (3400, 3450). Test servers use 3451+.
