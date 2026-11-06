# R1 P5 INTEGRATIONS: track report (speed mode)

Branch `r1/p5` (worktree `C:\Users\SICO\sg-wt\p5`), base `25293bb`. Thirteen build commits, `fa9ac71` to `4e99e1d`, plus
this report. Speed mode (owner, 2026-11-03): no self-review pass and no e2e. `next build`, `npm run gate` and the HTTP e2e
run at the merge in main.

## 1. Delivered, per feature id

| Feature | What | Main files | Proving test |
|---|---|---|---|
| IN-05, OP-05, LP-04, AI-15 | Template language (`template-lang.ts`, split from `templates.ts`), `renderTemplate`, `orderTemplateValues`, WhatsApp built-ins ar/fr/en, template repository, `waLink`, WhatsApp templates screen with `TemplateEditor`, variable chips, 1,000 counter, live masked preview | `src/lib/integrations/{template-lang,templates,template-values}.ts`, `whatsapp/*`, `components/admin/integrations/{whatsapp-templates,template-editor,variable-chips,template-preview}.tsx` | `test:conversions` (templates section), `templates.selftest.ts` |
| IN-01, SF-05 (Sheets half) | Pure run planner, optional columns, conflict table; push runner, `scheduleSheetPush`, `p:sheets:sa` bucket, 90 s breaker, run history, `sheets.push` job, `int.sheets` hook, transport seam | `src/lib/sheets/*`, `src/lib/integrations/transport.ts`, `jobs/tracks/integrations.ts` | `test:conversions` (sheets), `test:integrations-db` §7 |
| IN-09, OP-16 (R1) | Sheet bindings with the ownership proof (generic refusal), `sheets.bind_legacy` pass, `ensureLegacyBinding`, the pull with the optional columns | `src/lib/sheets/bindings*`, `pull*` | `test:integrations-db` §8 |
| IN-02, IN-03, SF-05 (CAPI half) | Purchase trigger matrix, sealed `capi_ctx` (purpose `capi-ctx`, purge at 8-9 days), creation path through the outbox, `int.capi` hook, capi outbox handler (7-day guard, kill switch), Server-events card on Pixels | `src/lib/orders/conversions*.ts`, `jobs/handlers/capi.ts`, `src/lib/pixels/server-events*.ts`, `components/admin/pixels/*` | `test:conversions`, `test:integrations-db` §8, §10 |
| IN-04, SF-05 (Telegram half) | Telegram client, messages, batch, daily summary, `queueTelegram`, outbox handler, `int.telegram` hook, setup (write-only token, Find my chat, test), Telegram screen | `src/lib/integrations/telegram/*`, `jobs/handlers/telegram.ts`, `components/admin/integrations/telegram-setup.tsx` | `test:integrations-db` §9 |
| IN-06 | Turnstile share (24 h, n >= 20), Settings > Anti-spam page and panel | `src/lib/integrations/turnstile-stats.ts`, `app/app/[store]/settings/anti-spam/*`, `anti-spam-panel.tsx` | `test:integrations-db` §10b |
| OPE-§27, §28 | `integration_status` writer (1 per minute per row), state rules, health reads, deliveries log, causes, notification kinds, pulse `syncFailed`, health rules, replay / Send again / Replay all (30/h + audit), hub screen | `src/lib/integrations/{status,status-rules,health,deliveries,causes,replay,hub.server}.ts`, `components/admin/integrations/*` | `test:integrations-db` §1-§3, §10, `test:health`, `test:pulse` |
| SF-03, SF-06 | Order integration state and the drawer blocks (Google Sheets, Ad events) P4 mounts | `src/lib/integrations/order-state.ts`, `order-sheet-block.tsx`, `order-ad-events.tsx` | `test:conversions`, `test:integrations-db` |
| Shell | Actions, Sheets routes on the same run, Connect nav items, three ⌘K commands | `app/app/[store]/integrations/**/actions.ts`, `api/app/[store]/sheets/*`, `components/admin/shell/{nav,commands}/integrations.ts` | `scripts/qa/tenancy-cases/integrations.ts` |

All ar/fr/en strings are in P5's admin i18n files. Every new route, action and read has a tenancy case.

## 2. Acceptance

- OPE-§20.9: (2)-(6) pass in `test:integrations-db` §8 and `test:conversions`. (1), the thank-you page with no pixel chunk,
  is a render-check fixture on P3's side and is deferred to the integration.
- OPE-§28.3: (1), (3), (4), (5) pass in `test:integrations-db`. (2), a revoked Telegram token turning the row `failing` on
  the first result, passes at the repository level. The one-tick notification end to end is deferred to the integration.
- OPE-§26 (P5 half): test orders are never appended to a sheet (Send again included), never sent to CAPI, and never sent
  to Telegram without the switch (`[TEST]` with it). Passes in `test:integrations-db` §7.6, §8 and §9.

## 3. Stubs

- Replaced, with the P0 signatures unchanged: `renderTemplate`, `orderTemplateValues`, `TEMPLATE_VARS`,
  `integrationHealth`, `sheetsBacklog`, `listDeliveries`, `scheduleSheetPush`, and the `capi` / `telegram` outbox handlers.
- Called, still stubs or pending other tracks: P4's confirmed and delivered triggers, `applyExternalStatus` from the sheet,
  `eta_text`, `tracking_link`, `confirm_hours` with a saved window; P3's thank-you render; the KPI figures in the Telegram
  daily summary. These are checked end to end only at the R1 integration.

## 4. CCRs filed (all open, for the maintainer at the merge)

`r1-p5-1.md` (export `numbersIn`, `allowedNumbers` from the AI guard), `r1-p5-2.md` (per-store Sheets run history in
`cron_cursors`), `r1-p5-3.md` (how health rules read past `HealthInputs`), `r1-p5-4.md` (`syncFailed` has one producer,
P5's pulse contributor), `r1-p5-5.md` (the "Statut livraison" cell reads P4's `ops.ship.<state>`), `r1-p5-6.md` (the
`pending_sheets` predicate of `forEachStore`), `r1-p5-7.md` (drop two stale entries of `tenancy-allow.json`), `r1-p5-8.md`
(**needed for `test:tenancy` to pass**: the R1.0 Sheets special cases moved to R1's bindings), `r1-p5-9.md` (the drainer
cancels a dropped outbox item), `r1-p5-10.md` (creation event of a risky order), `r1-p5-11.md` (outbox honours
`retryAfterMs` and flags a re-send), `r1-p5-12.md` (one `integrations.outbox.replayed` audit row per replay),
`r1-p5-13.md` (shell icons and keywords for the Connect items), `r1-p5-14.md` (the tenancy harness follows the Sheets
connect flow to the actions), `r1-p5-15.md` (the pulse broadcast's message shape).

## 5. Decisions

- `template-lang.ts` holds the pure parser and renderer, and `templates.ts` keeps the frozen P0 exports, so client
  components import the language without server code.
- P5 computes `syncFailed` (`syncFailedCount`) as its only producer (CCR r1-p5-4).
- Nav ids: `integrations`, `telegram`, `whatsapp` under Connect (CCR r1-p5-13 for icons and keywords).
- CAPI creation path: the creation event goes through the outbox with a sealed context, so trigger `confirmed` keeps the
  client data (CCR r1-p5-10).
- Legacy bindings (`src/lib/sheets/legacy-rule.ts`): every R1.0 sheet setting without a binding gets a `legacy` one.
  When two stores name the same spreadsheet, a code-proved binding is never moved; otherwise the earliest `connectedAt`
  keeps it (ties go to the smaller store id). The other stores' sheets are paused with `binding_conflict`.
- The `SG_E2E` mock transport seam stays inert unless all three of its guards hold.
- `int.telegram` on an order transition sends no message in R1 (only `new_order` on creation, and the daily summary).

## 6. Notes for the other tracks

- P4 imports: `template-lang`, `templates`, `resolveTemplate`, `waLink`, `TemplateEditor`, `scheduleSheetPush`,
  `queueTelegram`, `orderIntegrationState` with the drawer blocks, `syncFailedCount`.
- P3 imports: `renderTemplate`, the `thank_you_confirm`, `lead_recovery` and `confirm` kinds.

## 7. Checks run in this step

`npm run typecheck` and the full `npm test` through the mutex. Results are in the commit message of this step.
`test:tenancy` is not part of `npm test`. Without CCR r1-p5-8 it fails the 5 known R1.0 Sheets cases.

## 8. Known gaps

- `test:tenancy`: the 5 R1.0 Sheets cases until CCR r1-p5-8 is applied at the merge.
- The hub's deliveries log (the bottom half of the screen) was never seen in a screenshot. The full-page run could not
  reach it in step 9.
- Not run in the worktree, by rule: `npm run build`, `test:e2e`, `qa:integrations-e2e`, `npm run gate`, and the
  `test:db` group as a whole. They run at the merge in main.
- No dark-mode screenshots (speed mode).
- Drive C: has under 1 GB free. In step 12 it filled to zero and cut off a file write. Other tracks can hit the same
  failure until disk space is freed.
