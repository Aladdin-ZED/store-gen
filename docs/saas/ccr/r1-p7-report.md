# R1 P7 AI: track report (step 14/14, speed mode)

Branch `r1/p7`, worktree `C:\Users\SICO\sg-wt\p7`. Speed mode (owner, 2026-11-03): no self-review pass and no e2e in
this step. The full `npm test` ran once, and the AI suites ran after it. Results are under Checks below.

## Features delivered (steps 1 to 13)

| Step | Commit | What |
|---|---|---|
| 01 | `0947f57` | Pure core: task registry, class router, policy ladder, cost math, stream parser, PII / injection / canary, stage machine, settings keys |
| 02 | `13c0c3c` | Guard v2, loose schemas, optional kickers, per-task finalize (copy, analyze, field, script, brief, screen), the AI render case |
| 03 | `0cd8d36` | Director pure layer: types and zod schemas, rubric v3, plan / critique validators, budget verdicts, the one acceptance rule |
| 04 | `86ca0e3` | Prompt registry, layered assembly with caching and channel separation, R1 prompt families with READMEs, eval fixtures, frozen library baselines |
| 05 | `b3912a0` | Eval harness v1 offline: scorers, gate, canary and promotion rules, pairwise jury table, recorded outputs, `test:ai-eval`, `test:ai:slow` |
| 06 | `3733670` | Metering (reserve, reconcile, release), scoped repositories, platform tables, `aiPolicyFor`, `aiUsageForStore`, `linkAiRuns`, `test:ai-db` |
| 07 | `2ab6d8e` | Claude server provider and `runAi`: client, request builder, typed errors and breaker, class semaphores, library provider, local fake provider, ai-probe SDK lines |
| 08 | `206215f` | Pattern B detached jobs (`ai_jobs`), Message Batches, the `ai.*` cron jobs, live and smoke eval runs, canary rollups, notification kinds and flags |
| 09 | `62930f9` | AI route handlers, NDJSON and poll transport, Director stage routes, job poll driver, `qa:ai-stream`, tenancy attack cases, detached-job probe |
| 10 | `52621e1` | Browser layer: `useAiTask`, `useDeviceInfo`, `useAiJob`, novelty guard, local provider adapter, worker v2 rewrite, cutout mask upload, suggested-facts reducer |
| 11 | `fe8b18d`, `9af6fc4` | In-flow AI components, the Director interactive pass control and why line, ar / fr / en catalogs, mount contract, seam-gated component harness |
| 12 | `40820bf` | Settings → AI page with every state, its actions, the nav item, Store Health AI rules (SF-03), the staff detached-job probe action |
| 13 | `d161af2` | Console → AI with all tabs (incl. Prompts & evals), the store AI tab, `aiStoreSummary` and `aiHealth` |

Feature map: AI-01 to AI-08, the class router, `ai_jobs` + pattern B + probe, the Director interactive pass, rubric v3 +
kicker budget, eval harness v1 with the pairwise judge, gate and canary, the injection screen, AI-19a behind
`ai_director_brief`, and `ad.brief` and `callcenter.script` for SF-01.

## P0 stubs

- Replaced with real bodies (frozen signatures kept): `runAi`, `queueAi`, `registerBatchResultHandler`, `aiPolicyFor`,
  `AiPolicy` / `AiOutcome`, `aiStoreSummary`, `aiHealth`, `aiUsageForStore`, `linkAiRuns`, `enqueueAiJob`, `aiJobsForPulse`.
- Still stubbed on purpose: `recordPublishFeedback` (P0 no-op; `ai_feedback` is a 0006 table, QUAL-24), and the R2 / S7 items.

## CCRs filed (all open, for the maintainer at the P7 merge)

`r1-p7-1` (spec sync: price seed, eval gate, `estimate()`), `r1-p7-2` (copy-library lines with a figure or a dash),
`r1-p7-3` (wizard AI merge through guard v2), `r1-p7-4` (spec sync: guard v2 and task contracts), `r1-p7-5` (spec sync:
Director pure layer), `r1-p7-6` (server provider wiring), `r1-p7-7` (WriteScope narrowing for `runAi`, lint L6),
`r1-p7-8` (the `src/lib/ai/platform/**` lint pin), `r1-p7-9` (`ai_jobs.input`), `r1-p7-10` (the `ai` data area),
`r1-p7-11` (tenancy route sweep records for `ai/jobs/[id]` and `ai/runs/[id]`), `r1-p7-12` (tenancy page sweep and the
harness page), `r1-p7-13` (HealthInputs AI line), `r1-p7-14` (Settings → AI shell tab, probe audit name, Ask for more),
`r1-p7-15` (Console → AI folder pin, audit name, store profile AI tab, `platformScope` in `summary.ts`).

## Checks at this step

All through the machine mutex, on `d161af2` + this report (no code change was needed in this step):

| Check | Result | Time vs budget |
|---|---|---|
| `tsc --noEmit` | green | incremental |
| `npm test` (theme … ownership) | every suite green up to `test:ownership` | |
| `test:tenancy-lint` (last suite of `npm test`) | red: 3 violations, all on CCRs (below) | 31.5 s |
| `test:ai` | 8,383 checks pass | 6.44 s of 15 s |
| `test:ai:slow` | 8,390 checks pass | 8.23 s of 15 s |
| `test:ai-eval --offline` | 10 families hold every hard metric; the broken version is blocked by the gate | 13.3 s of 60 s |
| `test:ai-db` | 268 pass, 0 fail; test DB dropped | 33 s |
| `test:tenancy` | 7,942 pass, 12 fail (all on CCRs, below) | 106 s |

Known reds, every one waiting on a CCR:
- `test:tenancy-lint`: 3 violations. `ai/platform` PIN 44 vs 0 (r1-p7-8), `router/write-scope.ts` L6 (r1-p7-7),
  `platform/summary.ts` L6 `platformScope` (r1-p7-15).
- `test:tenancy`: 6 route cases (`ai/jobs/[id]`, `ai/runs/[id]` own-store records, r1-p7-11) and 6 page cases (the
  harness page answers 404 outside `SG_AI_HARNESS`, r1-p7-12).
- `test:ai` notes 74 library lines pending P6 (r1-p7-2).

## Integration checklist (at the P7 merge, in main)

1. Apply CCRs r1-p7-7, -8, -11, -12, -15 first: the tenancy lint and `test:tenancy` turn green with them.
2. `qa:wizard-e2e --strict` after P6 mounts the in-flow components; P2's onboarding mount.
3. `selftest --strict`, incl. the ≈ 9K Director prefix and the vocabulary equality; `PENDING_LIBRARY_CCR` empty.
4. Re-freeze the prompt hashes once P6's real `GENE_VOCAB` / `AI_REPAIR_OPS` land.
5. Live probe and the detached-job probe; then flag `ai_detached_jobs` on and add the HANDOFF line.
6. Live eval with the platform key; the 40-case naturalness slice; recorded outputs replace the synthetic ones.
7. `SG_STUB_BUILD_OK=1 npm run build`, `npm run test:e2e` (`qa:ai-stream`, `qa:wizard-e2e`), `npm run gate`.

## Decisions

- Library baselines are frozen per family; the synthetic recorded outputs are labelled as synthetic.
- The component harness route answers 404 outside `SG_AI_HARNESS` + a `cod_test_*` DB.
- The local fake provider is test-only and never imported by app code.
- `linkAiRuns` is implemented in R1, not deferred.
- `ad.brief` merges per field.
- Call-script drafts are not persisted in R1 until P4's `upsertCallScriptDraft` exists.
- Console → AI is English only, as the brief says.

## Known gaps

- No self-review pass, no e2e, no build or gate run in the worktree (speed mode; they run at the merge in main).
- P2's admin checkers (`test:i18n-coverage`, `test:admin-tokens`, `test:admin-motion`, `test:admin-rtl`) are not in this
  worktree and run at the merge.
- `recordPublishFeedback` stays a no-op until the 0006 `ai_feedback` table.

## Progress

P7 build: 14 of 14 steps done. Everything live for P7 waits on the merge, the CCRs above and the deploy.
