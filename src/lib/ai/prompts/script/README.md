# script

The confirmation-call script of one product for the agents (AI-15 R1 slice for SF-01; operations.md OPE-§7.1-7.4).
Task `callcenter.script`, Worker class, effort `medium`; saved as a draft a manager approves.

| Version | Provider | File | Status at R1 |
|---|---|---|---|
| `script@s1` | server | `s1.ts` | seed, active |

## Goal

Steps in call order (greet, product and pack, address per the store's address mode, total and payment at the door,
delivery as stated, the upsell only when configured, close) and one calm, true answer to each of the six objections.

## Constraints

- A template of P5's language: only `TEMPLATE_VARS`, `[[ … ]]` optional blocks; objection answers use only the
  shop-side variables. The model never knows who the customer is: names, phones and addresses are variables
  (AI-D31); the PII sweep of `test:ai` checks the assembled request on 20 fixture stores (AI-15 (4)).
- No discount, gift or delay the store did not configure; no call-back time outside the store's calling hours
  (block 3, `callingHours`, null for a window never saved).
- Arabic scripts are spoken Darija in Arabic script, spelled as the orthography guide spells it.

## Gated by

`src/lib/ai/eval/sets/script/` (12 fixtures: six script cases incl. a configured discount, a configured gift and
an upsell, and the six Darija-heavy stores; 2 smoke cases). Frozen baseline: `baseline/library@<hash>.json` (the
fixed template the OP-05 fallback starts from).
