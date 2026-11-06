# In-flow AI components: the mount contract (wizard, onboarding)

P7 AI owns these components (ai.md AI-§K.3, AI-§K.5, AI-§R.1 item 7; core §Q.5 R15). P6 mounts them in the wizard
(`/app/<h>/generate`) and P2 in onboarding (`/app/<h>/welcome`, the reveal step). The props below are the contract: a
mount that follows them needs no P7 change. Every component renders in the viewer's language (`useT()`), mirrors
under `dir="rtl"` and never blocks the step's Next button.

Shared inputs, computed once per page:

```ts
// server page: the policy (advisory for the client; every AI route re-checks it)
const policy = await aiPolicyFor(ctx);                       // src/lib/ai/router/server.ts
// client
const device = useDeviceInfo();                             // src/lib/ai/router/client.ts
const ctx = { handle, policy, device };
```

## 1. `AiProviderChip` (`src/components/admin/ai/chip.tsx`)

Next to the step title (24 px). Feed it the state of the task the step runs.

```tsx
const copy = useAiTask("copy.page", ctx);                  // or "analyze", "copy.hero"
<AiProviderChip state={copy.state} policy={policy} />
```

| Prop | Type | Notes |
|---|---|---|
| `state` | `Pick<AiTaskState, "status" \| "provider" \| "notes">` | from `useAiTask(...).state` |
| `policy` | `AiPolicy \| null` | names the rung before the first run (Cloud AI / On-device AI / Built-in copy) |
| `className` | `string` | |

A fallback note replaces the label for 6 s, then settles. A policy skip (cloud off, on-device only) shows no note.

## 2. Streamed reveal (`./copy-reveal.tsx`)

Paint the library draft first (`libraryDraft(task, input)`, synchronous), then `run(input, { surface, onField })`
and replace field by field.

```tsx
<CopyReveal as="h1" field="hero.headline" text={doc.hero.headline} origin={origins["hero.headline"]} />
<LinesWritten done={linesDone} total={linesTotal} />          // the step footer, never per field
<KeptNote fields={result.rejected} labels={{ "hero.sub": t("…") }} />
<NoveltyNote n={novelty.replaced + novelty.reasked} />
```

| Component | Props | Notes |
|---|---|---|
| `CopyReveal` | `text: string; origin?: CopyOrigin \| "owner" \| null; as?: ElementType; field?: string; className?` | only an AI origin (`cloud`, `local`) animates: 180 ms crossfade, 8 % `--brand` tint over 600 ms; reduced motion: instant |
| `LinesWritten` | `done: number; total: number` | count a line when its guarded `field` event arrived; never 100 % before `final` |
| `KeptNote` | `fields: readonly string[]; labels?: Record<path, label>` | the guard's `rejected` paths; a popover lists them |
| `NoveltyNote` | `n: number` | headlines the novelty guard re-asked or replaced |

**The wizard's copy merge (P6).** Pass `ctx.kickers` from `CopyDirectives.kickers` into `mergeAiCopy` (the optional
kickers of AI-D26), hand the per-field `CopyOrigin` map `mergeAiCopy` returns to the draft's `generation` block, and run
the headlines and leads through the novelty guard before they are shown:

```ts
const novelty = useNoveltyGuard({ check: checkHeadlinesAction, rewriteLine, ... });  // src/lib/ai/router/novelty.ts
// check: P6's checkHeadlinesAction (src/lib/design/actions.ts); rewriteLine: the engine's line for a slot
```

P7 imports no design server action: the check and the engine line are injected.

## 3. `SuggestedFacts` (`./suggested-facts.tsx`)

Under the facts list (Details step, onboarding product step).

```tsx
const [facts, dispatch] = useReducer(factsReducer, initialFacts(product.facts)); // src/lib/ai/router/suggested-facts.ts
useEffect(() => { if (analysis) dispatch({ type: "suggest", facts: analysis.suggestedFacts.map((s) => s.text) }); }, [analysis]);
<SuggestedFacts state={facts} dispatch={dispatch} />
copyInput.product.facts = factsForCopy(facts);              // owner-typed + ticked only (AI-04 (2))
```

| Prop | Type |
|---|---|
| `state` | `FactsState` |
| `dispatch` | `Dispatch<FactsAction>` |

## 4. `ModelConsent` (`src/components/admin/ai/model-consent.tsx`)

Onboarding, after the first sign-in. It decides itself whether to render (desktop, tier ≥ lite, no save-data, wide
viewport, local AI on, model not cached, not dismissed on this device). It never starts a download.

| Prop | Type | Notes |
|---|---|---|
| `device` | `DeviceInfo` | `useDeviceInfo()` |
| `policy` | `AiPolicy \| null` | `policy.local` |
| `onDownload` | `(tier: "lite" \| "full") => void` | start the worker download here |
| `onDismiss?` | `() => void` | |

## 5. The Director pass (`./director-pass.tsx`)

Under the three directions of `RevealFolds` (P6's reveal, `src/components/generate/reveal/RevealFolds.tsx`): the control
in `actionSlot`, the why line in `dnaSlot`. Nothing of the pass ever covers a fold.

```tsx
const pass = useDirectorPass(adapter, { handle, policy, device, session: wizardSessionId, revealed: state === "revealed" });

<DirectorPassProvider value={pass}>
  <RevealFolds
    state={state}
    directions={directions}
    actionSlot={<DirectorPassControl />}
    dnaSlot={(id) => <DirectorWhy directionId={id} />}
    onUse={(id) => {
      const criticPicks = pass.onUse(id);   // first: cancels a running pass on an instant direction
      saveGeneration(id, { criticPicks });  // page_versions.critic_picks for a refined direction, else null
    }}
  />
</DirectorPassProvider>
```

`useDirectorPass(adapter, opts)`:

| Option | Type | Notes |
|---|---|---|
| `handle` | `string` | |
| `policy` | `AiPolicy \| null` | `directorSlot(policy)` decides hidden / blocked / ask / auto |
| `device` | `DeviceInfo` | |
| `session` | `string` | the wizard session, `[A-Za-z0-9_-]{8,64}`, stable over its passes (the routes supersede older passes of it) |
| `revealed` | `boolean` | the instant set is on screen: `auto` starts here, once per set |
| `settingsHref?` | `string \| null` | the blocked line's link (default `/app/<h>/settings/ai`) |

It returns `DirectorPassApi`: `slot`, `state`, `set`, `start()`, `dismiss()`, `undo()`, `redo()`, `reset()` (call it
when the owner regenerates the instant set), `onUse(id)`, `whyFor(id, locale)`.

**The `DirectorEngineAdapter` P6 implements** (`src/lib/ai/director/pass.ts`; every method may throw: the pass ends as
busy and the instant set stays):

| Method | Stage | What P6 does |
|---|---|---|
| `brief()` | 0 | the `DirectorBrief` from the wizard state, `brand`, `policies`, `store_ai`, memory, the store's last 10 genome cards and `nicheShares`; bound it with `boundBrief` (photos carry `hasCutout: "estimated"` when `estimateAlpha` returned a mask) |
| `images?()` | 1 | ≤ 3 photos for the plan, ≤ 1,024 px and ≤ 400 KB each (`AnalyzeImage`) |
| `deliveryText?()` | 2b | the store's delivery line, or null |
| `candidates(plan, heroPacks, signal)` | 2-3 | per direction `sampleGenome(input, toSampleOpts(direction, locks))` × 4, the gates, `candidatePlan` (top 2 per brief by the two-signal order), ≤ 12 in one `checkNovelty` call (`noveltyBatches`), then six `Candidate`s: the `GenomeCard`, `directorDigest(renderDigest(...))` with the budget verdicts, and the hero copy (`heroPacks[i]` is direction i's guarded pack, null = keep the library's) |
| `repair(picks, critique, signal)` | 5 | per pick, design's `applyOps` on the critique's `repairs`, `runGates`, each op kept or reverted by `acceptOp(gateSnapshot(before), gateSnapshot(after))`; return the three picks and `applied[id]` per op |
| `present(set)` | 7 | replace the three directions in place with `set.picks` (ids = candidate ids) with the reveal's 180 ms crossfade; keep the focused fold focused |
| `restoreInstant()` | Undo | the instant set back in place |

P7 runs the rest: `design.plan` → three `copy.hero` in parallel → your candidates → `design.critique` (a detached job
below 80 tok/s, polled) → your repair in parallel with two `copy.field` translations of the why lines → the set, and
`set.criticPicks(chosen)` for the provenance row. The pass is ignored if it completes later than 150 s after its start.

| Component | Props |
|---|---|
| `DirectorPassProvider` | `value: DirectorPassApi` |
| `DirectorPassControl` | `pass?: DirectorPassApi` (else the provider's), `className?` |
| `DirectorWhy` | `directionId: string`, `pass?`, `className?` |

The action row that holds the control is P6's: sticky at the bottom on a phone, under the focused fold on desktop.

## 6. Onboarding (P2)

`/app/<h>/welcome` mounts, with the same props: `useAiTask("analyze", ctx)` on the photo step (its `state` into
`AiProviderChip`, its `suggestedFacts` into `SuggestedFacts`), `ModelConsent` once after the first sign-in, and the
reveal with `DirectorPassControl` / `DirectorWhy` exactly as in section 5 (P6's adapter, P2's step). Store-mode
onboarding (PDP reveal) mounts no Director pass.

## 7. The component harness

`/app/<h>/settings/ai/harness` renders every component above in every AI-§K.5 state with a scripted adapter. It is
reachable only with the `ai-harness` test seam (SG_E2E=1, SG_AI_HARNESS=1, a loopback origin, a `cod_test_*`
database), so never on a deployed site.
