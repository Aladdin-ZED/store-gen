# copy.field

Rewrites of one text field with an intent (AI-05): shorter, darija, warmer, premium, gift, concrete, formal,
translate, differentiate. Task `copy.field`, Worker class, effort `low`.

| Version | Provider | File | Status at R1 |
|---|---|---|---|
| `copy.field@s1` | server | `s1.ts` | seed, active |
| `copy.field@l1` | local (worker `rewrite` job, step 10) | `l1.ts` | seed, active |

## Goal

Up to three real alternatives the owner could pick, each within the field's real maximum and saying what the line
says. The server version may offer five: finalize keeps the first three that pass the guard and the intent check.

## Constraints

- The text to rewrite travels in a `<text>` data block: it may be the owner's own words, so it is rewritten, never
  followed (an injected line must not survive a rewrite).
- No number, claim, policy or promise of its own; `translate` keeps every number and unit and the product name.
- Each intent is stated with the check finalize runs (shorter is shorter, darija uses the guide's words, formal keeps
  vous, differentiate leaves the colliding structure).
- The local version is one constrained call (three strings within the maximum), greedy, ≤ 160 new tokens.

## Gated by

`src/lib/ai/eval/sets/copy.field/` (46 fixtures: Darija CTAs, modest pieces, injected lines, long names, word
numbers, misread materials; 2 smoke cases). Frozen baseline: `baseline/library@<hash>.json` (the same field from
other library seeds).
