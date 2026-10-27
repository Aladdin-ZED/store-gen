# Change requests (CCRs)

A track never edits a file it does not own. When it needs a change in another track's file, a shared file or a frozen
contract, it files a change request here and the owner applies it. The rules come from `docs/STORE-SAAS.md` §K.1
(R1.0) and §K.3 (shared files and extension points).

## When to file one

- The change touches a file another track owns (the "Owns" column of §K.1, §K.2 or §K.4).
- The change touches a maintainer file: `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`,
  `src/lib/auth/permissions.ts`, `src/lib/tenancy/{types,seam,public}.ts`, `src/lib/platform/{seam,impersonation}.ts`,
  `src/lib/orders/hooks.ts`, the registries (`nav`, `commands`, `jobs`, `i18n/admin` base catalogs, `prepublish`,
  `pulse`, `notify`, `flags`, `health`, `settings` registries) and the other §K.3 files.
- A frozen signature (C0a's typed stubs, §E, §M, the cross-track row of §K.1) must change shape.
- A permission key, an entitlement key, a settings key or a budget key is missing (they are all pre-defined).
- A file no track lists must change (in R1.0 they are read-only: `src/lib/orders/{contract,validate,versions,text,risk}.ts`,
  `src/lib/page/**`, the rest of `src/landing/runtime/**`).

No CCR is needed to read any file, to add a file inside your own folders, to fill an extension file you own
(`src/lib/jobs/tracks/<track>.ts`, `src/lib/settings/keys/<key>.ts`, …), or to add an error code of your part (list it
in your spec, with its `error.<code>` messages in ar/fr/en).

## R1 product (P1-P8)

The R1 tracks are P1 CONSOLE, P2 SHELL, P3 LANDING, P4 CALL CENTER, P5 INTEGRATIONS, P6 DESIGN, P7 AI and P8 PLATFORM
OPS (`docs/STORE-SAAS.md` §K.2). The P0 contract step froze everything they build against, so most work needs no CCR:

- **Extension files are created and registered.** P0 created every extension file a §K.2 row names, with typed empty
  contents, and wrote its import line into the registry. Fill your own file; never edit the registry. The files are
  under `src/lib/{health/rules,pulse/contributors,notify/kinds,flags/defs,jobs/tracks,orders/hooks,render/prepublish,
  admin-data/search}/<track>.ts`, `src/components/admin/shell/{nav,commands}/<track>.ts`,
  `src/lib/i18n/admin/<locale>/<file>.ts` (D67), `scripts/qa/{tenancy-cases,wow-demo/steps,render-cases}/<track>.ts`.
  `npm run test:registries` fails when an extension file on disk is not imported by its registry.
- **A new extension file needs a CCR.** That covers a file no row names, for example a second nav file or a flags
  file for P3 (LAN-§23.10 declares none). The maintainer creates the file and its import line in one commit.
- **`package.json` is frozen for tracks.** Every R1 script of §J is already there, pointing at the file its track
  writes (`test:ops` → `scripts/qa/ops-check.ts`, …). Write the file at that path. The maintainer adds your suites to
  `npm test`, `test:db`, `test:e2e` and the gates when your track merges, inside your group's budget in
  `scripts/qa/test-budget.json`. A missing script, a changed command or a budget change is a CCR.
- **Typed stubs are yours to replace.** A stub of a cross-track API in your file (§K.2 P0) keeps its signature: you
  replace the body, never the shape. A shape change is a CCR, because other tracks already build against it. A stub in
  another track's file stays a stub until that track merges, so build against it in merge order (§K.2 rev 5,
  CRIT2-6).
- **Shared files** (§K.3: `schema.ts`, `drizzle/**`, the registries, the base i18n catalogs, `src/landing/{types,
  context,i18n,document}.ts`, the harnesses `render-check.ts`, `tenancy-check.ts`, `wow-demo.ts`, …) change only
  through a CCR, which the maintainer applies serially, one per commit, the same day.

## Naming

`docs/saas/ccr/<release>-<track>-<n>.md`, numbered per track from 1, never reused:

- R1.0: `r1.0-t1-1.md`, `r1.0-t2-3.md`, `r1.0-c0b-1.md`
- R1 product: `r1-p1-1.md` … `r1-p8-<n>.md` (the track id in lower case; `test:ownership` gives each track its own
  `r1-p<n>-*.md` files). The maintainer's own notes are `r1-m-<n>.md`.
- R2: `r2-s1-1.md`; R3: `r3-d1-1.md`

## Template

```md
# r1.0-t3-1: <one line: what changes>

- Status: open | applied (<commit>) | rejected (<reason>)
- Filed by: T3 · Owner of the file: maintainer | T<n> | P<n>
- Files: src/lib/…, src/lib/…

## What
The exact change, as a diff or a precise description per file.

## Why
What breaks or cannot be built without it; the spec section or finding it serves.

## Effect on others
Callers, other tracks, frozen contracts (PageDoc v2, runtime config v2, payload v2, PHP export, the landing chunk),
tests that must change with it. "None" is a valid answer.
```

## How it is applied

1. The filing track commits the CCR file only (no change to the target file) and tells the owner.
2. The owner applies it the same day: the maintainer for shared files, serially, one CCR per commit; a track for its
   own files. `schema.ts` and `drizzle/**` fixes T1 finds go through the maintainer the same day.
3. The commit that applies it names the CCR (`CCR r1.0-t3-1`) and sets its status to `applied (<commit>)`; a refusal
   sets `rejected (<reason>)`. The maintainer notifies every track the change touches.
4. Until it is applied, the filing track works against the current file (a local adapter in its own files, never an
   edit of the target). Merges stay in the §K.1 (R1.0) or §K.2 (R1 product) order; `main` typechecks after every merge.
