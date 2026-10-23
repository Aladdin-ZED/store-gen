# Store Gen SaaS upgrade: progress log (resume point)

Read this first when resuming after a network drop, a crash or a new session. It records what is done, what is
running, and how to restart it. Newest state at the top of "Running now".

## Plan (owner brief: docs/STORE-GEN-BRIEF.md, items 1-7)

| # | Phase | Output | State |
|---|---|---|---|
| 0 | First deploy of the cloned code | live site, build 01a16abd | **done** 2026-10-23 |
| 1 | Understand: subsystem maps | docs/saas/TENANCY-MAP.md | **done** 2026-10-23 (run wf_2ff1c4b9-e11) |
| 1b | Research + brainstorm (owner items 8-15): domains/subdomains, COD ops+agents+accounting+integrations, AI learning loop, generative design, platform admin, storefront/landing | docs/saas/research/*.md + docs/saas/RESEARCH.md | running |
| 2 | Spec: architect → reviews (COD operator, principal engineer, premium designer, security) → revision → critic | docs/STORE-SAAS.md | todo (first attempt wf_1620a313-a04 was stopped on purpose to add owner items 8-15: do NOT resume it, relaunch with the research as input) |
| 3 | Build phase 0: core tenancy (schema, migration, store scope, auth/memberships, routing) | code | todo |
| 4 | Build phase 1: parallel tracks (store pages, landing+, brand kit/logo, team/invites, platform admin, storage) | code | todo |
| 5 | Adversarial verification incl. cross-tenant attack tests, fix loop | tests + fixes | todo |
| 6 | Deploy to the Store Gen site (archive method, HANDOFF §4) + live smoke | live | todo |

## Running now

(updated by the lead session; each entry: what, workflow run id, script path, how to resume)

- **Phase 1b research** — started 2026-10-23 ~23:45. Task `w1pqiuxkb`, run `wf_b99045d6-630`.
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
