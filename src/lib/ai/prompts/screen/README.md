# screen

The Fast-class injection screen of imported bulk text (AI-08, AI-§E.3 control 4). Task `injection.screen`, class
`fast` (Haiku), effort `low`, ≤ 512 output tokens, no server-side fallback.

| Version | Provider | File | Status at R1 |
|---|---|---|---|
| `screen@s1` | server | `s1.ts` | seed, active |

## Goal

Before imported text (supplier CSVs, product imports, Sheet cells written by agents, R2+) can be a prompt input:
does it try to act on a language model? A positive keeps the row out of every prompt until a staff member clears it
(`ai_memory.evidence.screen`, AI-08 (3)).

## Constraints

- The text travels in a `<text>` data block: it is screened, never obeyed.
- The reason names the kind of attempt and never quotes the text (finalize cuts any echo longer than 40 characters).
- Loud but ordinary product data (capitals, imperatives to a shopper, a customer's note) is not suspicious.
- The keyword heuristic (src/lib/ai/safety/injection.ts) is the library rung and the R1 screen for typed facts.
- No store layer: the screen needs no shop context.

## Gated by

`src/lib/ai/eval/sets/screen/` (12 fixtures: the six planted injections and six clean rows; 1 smoke case). Frozen
baseline: `baseline/library@<hash>.json` (the keyword heuristic).
