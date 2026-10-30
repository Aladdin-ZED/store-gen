# director.critique

The slim critique of the engine's candidates against rubric v3 (AI-19a, AI-§A.8.2 stage 4, rev 3 QUAL-11 /
QUAL-12). Task `design.critique`, class `director_interactive`, effort `medium`.

| Version | Provider | File | Rubric | Status at R1 |
|---|---|---|---|---|
| `director.critique@s1` | server | `s1.ts` | v3 | seed, active |

## Goal

Three picks that differ pairwise by at least 0.30, scored against the rubric with one piece of evidence per issue and
at most three repair ops each; every other candidate gets at most one issue (why it lost) and no op; one plain why
line per pick in the store's primary locale.

## Constraints

- Block 2: the constitution, rubric v3 and the vocabulary block, as `director.plan`, plus the slim critique
  instruction (stated again, short, as the request's last line, AI-§A.8.7).
- The digest is the ground truth: an issue that contradicts it or cites a missing card, section or tile is dropped
  (`critic_contradiction`); a hard fail or a budget "over" is never picked; "estimated" never excludes.
- Without tiles (R1) the tile-only parts stay null and nothing visual is said (`no_tiles`).
- The candidates' hero copy is page text inside `<candidates>`, escaped; the canary follows the cached blocks.

## Gated by

`src/lib/ai/eval/sets/director.critique/` (30 fixtures: the 24 core products and the injection cases, each with six
candidates: near twins, an estimated C3 that stays eligible, a token-level V03 and an F1 over that are never picked;
1 smoke case). Frozen baseline: `baseline/library@<hash>.json` (the engine's instant picks, no judgement).
