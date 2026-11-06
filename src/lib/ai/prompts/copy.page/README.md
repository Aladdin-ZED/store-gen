# copy.page

One locale of a landing page's copy (AI-02). Task `copy.page`, Worker class, effort `low`, streamed hero first.

| Version | Provider | File | Status at R1 |
|---|---|---|---|
| `copy.page@s1` | server | `s1.ts` | seed, active |
| `copy.page@l1` | local (Qwen3.5 worker) | `l1.ts` | seed, active: today's `copyPrompt` (src/lib/ai/prompts.ts) |

## Goal

A page a shopper who came from an ad understands, trusts and orders from, on a phone, in ar / fr / en. Honest and
specific beats vivid: a plain true line wins over an invented one.

## Constraints

- The owner's five rules, stated whole in block 2 (no orange, modern, never an invented price / rating / stock /
  review / promise, natural ar / fr / en, no secret).
- Numbers only from the facts, the price and the stated policies, in digits or in words (guard rule 5).
- Promises only from the store's `policies` setting, rendered in block 3 (`policyLines`): no fixed Morocco policy
  line (the lines of `prompts.ts:99-103` are gone from both versions; AI-02 (4)).
- No WhatsApp line without a WhatsApp number (GEN-09); no medical claim; the named patterns to avoid; "Please remove
  all mannered prose."; no reasoning in the answer; no prefill.
- Darija at the store's level (`store_ai.voice.darija`), spelled as the orthography guide spells it; no Arabizi
  unless asked. The guide's hash is part of the template hash.
- The field guide's lengths come from the strict schema (`AI_COPY_JSON_SCHEMA`); the loose schema is the format.
- Block 2 carries the curated style guide (6 exemplars per locale, slots, no specifics); block 4 names the 2 to
  follow (`styleRotation`, AI-§G.3).

## Gated by

`src/lib/ai/eval/sets/copy.page/` (86 fixtures: core × locales, Darija, medical, modest / kids / names, injection,
no WhatsApp / no inspection, long / empty facts, niche, word numbers, misread materials; 6 smoke cases). Frozen
baseline: `baseline/library@<hash>.json` (the library rung).
