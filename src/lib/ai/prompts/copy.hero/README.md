# copy.hero

One hero pack (kicker, headline, sub, cta) for one design direction, in the store's primary locale (AI-02 (1),
AI-§A.8.2 stage 2b). Task `copy.hero`, Worker class, effort `low`, structured output.

| Version | Provider | File | Status at R1 |
|---|---|---|---|
| `copy.hero@s1` | server | `s1.ts` | seed, active |

## Goal

The first screen after the ad: in two seconds the shopper knows what the product is and why it is for them. The
three directions of one page ask for three headline structures, so the three heroes read differently.

## Constraints

- Everything of `copy.page` (owner rules, honesty, policies from block 3, Darija guide, patterns to avoid).
- The direction's headline structure (design's G29 ids, each explained in block 2); finalize checks it with the
  detector (`headlineStructureOf`) and the hero lengths (`HERO_MAX`).
- A quote-led headline quotes the merchant's own words, never an invented review.

## Gated by

`src/lib/ai/eval/sets/copy.hero/` (58 fixtures; slot, structure and angle rotate over the cases; 3 smoke cases).
Frozen baseline: `baseline/library@<hash>.json`.
