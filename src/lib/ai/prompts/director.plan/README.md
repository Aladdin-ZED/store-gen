# director.plan

The Director's read of the product and three direction briefs for the engine (AI-19a, AI-§A.8.2 stage 1). Task
`design.plan`, class `director_interactive`, effort `medium`, behind the flag `ai_director_brief`.

| Version | Provider | File | Rubric | Status at R1 |
|---|---|---|---|---|
| `director.plan@s1` | server | `s1.ts` | v3 | seed, active |

## Goal

One design read (Reading this as …, the audience, the price tier, risks, suggested facts, photo quality, the three
dials), then three directions the engine samples from (best_fit, contrast, explore) that differ in what they ask for:
hints in the closed vocabulary, at most one pin, distinct headline structures, a copy angle, named patterns to avoid
(plus the niche's crowded sequences and tells) and a one-sentence rationale an owner understands.

## Constraints

- Block 2 embeds the constitution (who the owner is, the five owner rules, honesty), rubric v3
  (src/lib/ai/prompts/rubric/v3.ts, by import) and the vocabulary block rendered from design's `GENE_VOCAB` and
  `AI_REPAIR_OPS` (never hand-written). A rubric or vocabulary change changes the template hash: a new version.
- The per-run canary token follows the cached blocks; it must never appear in the answer (`canary_leak`).
- The brief is data (`<brief>`), photos are labelled images; the store's identity, seed and memory stay out of block
  4 (block 3 carries the policies and the memory).
- `finalizePlan` drops whatever the vocabulary does not allow; a prompt rule is never the only defence.
- The section and variant catalog of AI-§A.8.7 `system[2]` joins block 2 with P6's catalog (a new version then).

## Gated by

`src/lib/ai/eval/sets/director.plan/` (34 fixtures: the 24 core briefs, the injection briefs, the analyze photos;
1 smoke case). Frozen baseline: `baseline/library@<hash>.json` (the engine's archetype ranking as three slot briefs
with empty hints, AI-§A.5).
