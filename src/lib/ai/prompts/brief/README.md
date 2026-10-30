# brief

The Campaign Kit's ad brief, written from the published page (AI-20 R1 slice; landing.md LAN-§13.2-13.3). Task
`ad.brief`, Worker class, effort `medium`, streamed; copy only, nothing is posted anywhere.

| Version | Provider | File | Status at R1 |
|---|---|---|---|
| `brief@s1` | server | `s1.ts` | seed, active |

## Goal

Three angles, each on one section of the page (its id and structure tag, no two on one tag): a name, hooks in Darija
(Arabic script) and French of at most 12 words, primary texts and headlines within each platform's limits
(`AD_LIMITS`), 15 s and 30 s UGC shot lists and a what-to-film checklist of real shots.

## Constraints

- Every hook traces to a fact, a stated policy or a section of the page (AI-20 (4)).
- The ad rules: no before / after, no body-shaming, no question about the reader's body or health, no guaranteed
  result, no medical claim, no invented urgency, no price or offer the page does not show.
- The page's sections are data (`<page_copy>`); `basedOnVersionId` repeats the request's version.

## Gated by

`src/lib/ai/eval/sets/brief/` (12 fixtures: six published pages and the six medical-adjacent products; 2 smoke
cases). Frozen baseline: `baseline/library@<hash>.json` (the page's own sections as the template brief).
