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
| 3 | R1.0 core tenancy: C0a contract step → tracks T1 DATA, T2 AUTH, T3 EDGE, T4 SCOPE + C0b (worktrees) → integration → verify → deploy | code | C0a running |
| 4 | Build phase 1: parallel tracks (store pages, landing+, brand kit/logo, team/invites, platform admin, storage) | code | todo |
| 5 | Adversarial verification incl. cross-tenant attack tests, fix loop | tests + fixes | todo |
| 6 | Deploy to the Store Gen site (archive method, HANDOFF §4) + live smoke | live | todo |

## Progress toward "everything live" (owner asked 2026-10-24; report this % in every update)

Weights = share of total work. Update the "done" column when a stage moves.

| Stage | Weight | Done in stage | Contributes |
|---|---|---|---|
| Research + full spec | 12% | 100% | 12.0% |
| R1.0 core tenancy (accounts, stores, teammates, isolation; live on temp domain) | 18% | 10% (C0a 3/4 sub-steps) | 1.8% |
| R1 product (platform console + approvals + store profiles, landing+, call center, AI Director, design genome, onboarding wow) | 35% | 0% | 0% |
| R2 full stores + accounting + logo designer | 22% | 0% | 0% |
| R3 growth, custom domains, carrier APIs, learning AI | 13% | 0% | 0% |
| **Total** | 100% | | **≈ 14%** |

Milestones: R1.0 live ≈ 30% · R1 live ≈ 65% · R2 live ≈ 87% · R3 live = 100%. Owner inputs needed later: real domain +
Cloudflare (subdomains, before public sign-ups), optional Claude API key + monthly cap, a carrier statement sample (R2), legal
review of terms/privacy (before public launch).

## Running now

(updated by the lead session; each entry: what, workflow run id, script path, how to resume)

- **Phase 3 R1.0 / C0a (contract step on main)** — started 2026-10-24 ~10:55. Task `wsg3i2bv6`, run `wf_490a4c68-dd8`.
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
