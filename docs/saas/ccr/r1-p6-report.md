# r1-p6 report: P6 DESIGN (R1 product, wave 1)

- Track: P6 DESIGN, branch `r1/p6`, 14 of 14 steps committed. Part spec: docs/saas/spec/design.md (ownership DES-§26, proofs DES-§1.4).
- Written in speed mode (owner, 2026-11-03): the self-review passes, e2e, demo, perf and dark-mode shots were skipped. The branch is
  **not rebased** onto main: the step rules forbid a rebase in the worktree, so P8 / P1 / P2 / P3 / P4 / P5 / P7 bodies arrive at
  the merge. Everything below was measured on the P0 + P0b base.

## 1. Features delivered (all in P6's §K.2 row and DES-§26)

| Id | What | Main files |
|---|---|---|
| DG-02 | Genome v1: 35 genes, priors, sampler + solver, compile to `ThemeSpec` + `look`, back-derivation, hints and pins, chips, compact genome | `src/lib/design/{vocab,priors,genome,solve,compile,derive,hints,explain,distance}.ts` |
| DG-03 | `look` drives btn / card / mask / glyph / emphasis / density, 4-tier radius, glass budget, look-scoped CSS | `src/lib/theme/*`, `src/lib/design/tokens-table.ts`, `src/landing/sections/**` |
| DG-04 + DG-12 R1 | Choreography grammar (I1-I8, constrained Act 2), rhythm planners, generator integration (plan, directions, offers, remix) | `src/lib/design/{choreography,openers,cta,fold}.ts`, `src/lib/generator/{plan,directions,offers,remix,copy-map,index}.ts` |
| DG-05 | `design_genomes` repository, `genomeDistance`, `checkNovelty` (novelty pool, bands, clone flag, kill switch), reservation, `nicheShares`, exhaustion test | `src/lib/design/{novelty.server,genomes.server,pool,differentiate}.ts` |
| DG-06 + TC-1 | Gates V01-V37, slop S01-S26, novelty items, Q, repairs (`RepairOp`, `AI_REPAIR_OPS`), gate adapter, render digest, Director cards, designer seeds | `src/lib/design/gates/*`, `src/lib/design/{gate-input,digest}.ts`, `src/lib/design/seeds/*` |
| DG-06 (publish) | Design pre-publish check, publish listener, `recordDraftDesign`, design jobs | `src/lib/render/prepublish/design.ts`, `src/lib/design/{save.server,flags.server}.ts`, `src/lib/jobs/tracks/design.ts` |
| DG-07 | Normalisers (ar clitics, light stemmer), cliché + specificity detector, compositional headlines, headline novelty | `src/lib/design/text/*`, `src/lib/design/lexicon/*`, `src/lib/design/{cliche,copy-gen,copy-genes,voice,headlines.server}.ts` |
| DG-08 | Type engine, pairing catalogue, brand colour guard (no-orange, gold rule) | `src/lib/theme/*`, `src/lib/design/{typography,pairings}.ts`, `scripts/qa/design-font.ts`, `scripts/qa/design-ink.ts` |
| DG-04 / DG-06 measurement | Seven primitives, composition sheets, `variantFeatures`, `estimateHeights` (`HEIGHT_MODEL_VERSION` 1), `test:registry` | `src/lib/design/{sheets,features,heights,heights-calibration}.ts`, `scripts/qa/design-primitives.ts`, `src/landing/selftest-registry.ts` |
| Section kit I + II | Owner-rule redraws, aurora removal, footer report link, 5 new hero families, 4 new sections | `src/landing/sections/**` |
| DG-09 | Calibration corpus and report tooling | `scripts/qa/design-corpus.ts`, `scripts/qa/design-report.ts`, `src/lib/design/calibration/*` |
| UX-01 (component), GN-1, GH-1 | Photo facts + `estimateAlpha`, `directionCandidates`, the generate pipeline, `useDesignRun`, `RevealFolds`, DirectionView chips + why line, GeneHints intake | `src/lib/design/{photo-facts,photos,reveals,actions}.ts`, `src/components/generate/{pipeline,use-design-run,kit}.ts`, `src/components/generate/reveal/*` |
| DG-12 R1 (builder) | Design check panel, DNA card, Differentiate, Bolder / Calmer / Upgrade, Apply my brand | `src/components/builder/design/*`, `src/lib/design/{panel,panel-diff,brand-apply,budget-estimate,builder.server}.ts` |
| BK-1, UX-05 QR | `/app/<h>/brand` (logo, colours, pairing, gene locks, voice), grid monogram + favicon, Brand nav | `src/app/app/[store]/brand/*`, `src/components/admin/brand/*`, `src/lib/design/brand-kit*.ts`, `src/lib/logo/*` |
| HR-1, FL-1, SP-1, RD-1 | Five design health rules, `design_publish_gates` flag, ⌘K design search provider, render digest + `GenomeCard` | `src/lib/health/rules/design.ts`, `src/lib/flags/defs/design.ts`, `src/lib/admin-data/search/design.ts`, `src/lib/design/{health.server,digest}.ts` |
| i18n | Every P6 string in ar / fr / en | `src/lib/i18n/admin/{ar,fr,en}/design.ts` |

## 2. Checks run in step 14 (through the mutex, 2026-11-06)

| Command | Result | Time |
|---|---|---|
| `tsc --noEmit` | green | 16 s |
| `theme:check` | green | 29 s |
| `test:runtime` | green | 8 s |
| `test:generator` | green | 30 s |
| `test:render` | green (after the step-14 fixes, with the landing assets rebuilt) | 35 s |
| `test:money`, `test:conversions`, `test:offers`, `test:orders`, `test:settings`, `test:registries`, `test:tenancy-unit`, `test:checklist` | green | 3-15 s each |
| `test:prepublish` | 11 passed, **1 failed**: "rows without heights", open CCR r1-p6-4 (maintainer file) | 6 s |
| `test:ownership` | green | 3 s |
| `test:tenancy-lint` | green, 0 violations (after the step-14 fix) | 36 s |
| `test:design` (fast) | green | 39-43 s (≤ 40 s budget met on a quiet machine; 43 s while 8 tracks shared the PC) |
| `test:registry`, `test:copylib` | green | 3-4 s |
| `test:design-db` | 120 passed, 0 failed | 20 s |
| `test:tenancy` | 7,399 passed, **5 failed**: the argan baseline publish, open CCR r1-p6-9 (core file) | 106 s |
| `test:health`, `test:jobs` | not runnable in this base: their selftests come with the P1 / P8 merges | - |

Not run (speed mode or not runnable in a worktree): `npm run lint`, `test:slow` / `test:design:full`, `test:migrate`, `npm run build`,
`test:e2e`, the admin lints (`test:i18n-coverage`, `test:admin-tokens`, `test:admin-motion`, `test:admin-rtl`; their scripts are
not in this base), `qa/admin-visual/shoot.mjs`, `qa:design-corpus` / `qa:design-report` smoke runs, `qa:wow-demo`.

Measured earlier in the track (step reports): novelty p95 3.5 ms (1 × 20,000 rows), 47 ms (12 × 20,000); genome pack ≤ 1,200 B;
generation record ≤ 600 B; the css lines base 22,071 / 23,607, variants 75,327 / 79,778, page 100,088 / 106,677 B.

## 3. Step-14 fixes

- `test:tenancy-lint` L6: the health-design dev fixture cast a literal to `StoreScope`. The rules now carry a scope-free
  `previewIssue(ruleId, inputs)` (brand facts from the inputs only), and the fixture calls it (`src/lib/health/rules/design.ts`,
  `src/app/dev/fixture/design/health-design/page.tsx`). `rules` keeps the P0b `HealthRule` shape.
- `test:render` baseline: the 14 default documents failed "page shell changed". Cause: step 13's grid monogram favicon
  (DES-§12.5) changes the `<link rel="icon">` of every logo-less document. With the step-5 favicon swapped back, all 41
  documents matched (0 problems), so the icon was the only change. The icon link is now out of the shell hash
  (`scripts/qa/design-baseline.ts`, `test:design`'s favicon group pins the icon) and the 41 shell hashes were re-recorded
  (`src/lib/design/calibration/baseline-golden.json`; the section, divider and checksum goldens are unchanged).
- The other 42 `test:render` failures of the first run came from stale generated landing assets
  (`src/landing/generated/*`, kept at their base in git since step 2). They pass once `scripts/build-landing-assets.mjs`
  has run, which the merge build does.

## 4. Contracts

- P0 stubs replaced with frozen signatures unchanged: GENE_VOCAB, sampleGenome, validateHints, clicheScore,
  checkHeadlineNovelty, checkHeadlinesAction, genomeOf, genomeDistance, checkNovelty, nicheShares, designHealth,
  estimateHeights, variantFeatures, estimateAlpha, RevealFolds, renderDigest, GenomeCard / RepairOp / AI_REPAIR_OPS, task names.
  `git diff` of `src/lib/contracts/`, `types.frozen.ts` and `src/landing/runtime/landing.sha256` against the base is empty.
- Other tracks' stubs P6 calls (still stubs in this base): P8 `enqueueRenders` (throws; the brand write stands and the error is
  logged), P1 `flagValue` (CCR r1-p6-10), P3 `buildChecklist` / order-form hero prop, P7 wizard / reveal / builder mounts
  (CCR r1-p6-12, r1-p6-13), P2 UX-01 wow flow.

## 5. CCRs filed (all open, for the maintainer at the merges)

| CCR | Subject |
|---|---|
| r1-p6-1 | DES-R21 fonts: seven manifest lines, the Arabic metrics step, the shared WOFF2 module |
| r1-p6-2 | Spec and bible text after step 1 (F15 per-script calibration, catalogue values, look tokens) |
| r1-p6-3 | Spec text after step 2 (genomeOf consistency exceptions, GEN-12, the compact genome) |
| r1-p6-4 | `test:prepublish` "rows without heights" once the height model is real |
| r1-p6-5 | Spec text after step 3 (height model calibration, fold budget rows, legacy fold stacks) |
| r1-p6-6 | The `css` budget after the section kit redraws, two aurora layers in P3's sheets |
| r1-p6-7 | `NicheShares.vibe` for H33 on G1, the choreography's I2 / I8 repairs |
| r1-p6-8 | Export `allowedNumbers` (P7); store purge deletes headline shingles by owner tag (core) |
| r1-p6-9 | `test:tenancy` publishes a lean copy of the argan baseline once the height model is real |
| r1-p6-10 | Design flags read through P1's `flagValue` |
| r1-p6-11 | Publish lifecycle core seams (design override audit, error_events, health brand facts) |
| r1-p6-12 | P7 mounts in the wizard and the reveal |
| r1-p6-13 | Builder mounts and the G28 brand lock |
| r1-p6-14 | Brand mark in the store context, Generate's second permission, the brand voice write |

## 6. Deferred to the R1 integration

The DG-09 corpus run with owner labels, the fit, and `calibration.json` approved by the owner (currently pending); the blind
critic re-score DS43 (≥ 7.5, CI lower bound ≥ 7.0, no dimension < 6, distinctiveness ≥ 8); `qa:wow-demo`; `qa:publish-gates`; the
UX-01 timing (P2); the `qa:wizard-e2e` reveal screenshot (P7); DG-08 `metrics.ar.measured` for every Arabic display face (r1-p6-1);
the height model's estimate-vs-measured p95 ≤ 10 %.

## 7. Known gaps and risks

- `test:design:full` had 4 C1 failures on the 140-plan sweep plus two older failures (step 6); not re-run in speed mode.
- The P7 component mounts, the brand mark in the store context and the brand re-render fan-out wait for their CCRs and P8.
- The wow-demo design steps (step 11) were not built in speed mode.
- `npm run build`, lint and the admin lints have not run on this branch; they run at the merge in main.
- The merge must rebuild `src/landing/generated/*` before `test:render`, or ~42 render cases fail on stale chunks.
