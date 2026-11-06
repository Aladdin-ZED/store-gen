# Builder AI components: the mount contract

P7 AI owns these components (ai.md AI-05, AI-§K.3, AI-§R.1 item 7; core §Q.5 R15); P6 mounts them in the builder
(`src/components/builder/**`) and in the wizard's editable fields. The props below are the contract.

## 1. `FieldRewrite` (`./field-rewrite.tsx`), the rewrite menu

Wrap any text field of the inspector or the wizard. While focus is inside, a "Rewrite" button shows above the field's
end edge; `Alt+R` opens the menu from the field. The menu is a popover on desktop and a bottom sheet on a phone.

```tsx
const rewrite = useAiTask("copy.field", { handle, policy, device });    // src/lib/ai/router/client.ts

<Label htmlFor={id}>{label}</Label>
<FieldRewrite
  field={{ path: "hero.headline", text: value, max: HERO_MAX.headline, locale: pageLocale, product: { name, facts } }}
  locales={storeCopyLocales}
  run={(input, { nonce, signal }) => rewrite.run(input, { surface: "builder", nonce, signal })}
  onAccept={(text) => store.setField("hero.headline", text)}     // ONE undo step in the builder store
  onUndo={() => store.undo()}
>
  <Input id={id} value={value} onChange={…} />
</FieldRewrite>
```

| Prop | Type | Notes |
|---|---|---|
| `field` | `RewriteField` (`src/lib/ai/router/rewrite.ts`) | `path`, the current `text`, the field's real `max`, its `locale`, the page's `product.name` and `facts` (the guard allows these numbers only) |
| `locales` | `readonly CopyLocale[]` | the store's copy locales: one "Translate to …" chip per other locale |
| `run` | `(input: FieldRewriteInput, opts: { nonce?; signal }) => Promise<AiOutcome<FieldRewriteOut>>` | `copy.field` down the ladder; "Try again" passes a fresh nonce |
| `onAccept` | `(text, choice) => void` | called once per accepted option; the builder's save path is unchanged (AI-05 (2)) |
| `onUndo?` | `() => void` | the toast's Undo ("Rewritten · Undo") |
| `disabled?` | `boolean` | read-only (impersonation, suspended): no button, no shortcut |
| `children` | the field | keep the label above it (core §I.8 rule 8) |

Intents: Shorter · More Darija (ar) · Warmer · More premium · Gift angle · More concrete · More formal (fr) · Translate.
Three options as stacked cards with a word-level diff against the current text; none left after the guard → "No
honest rewrite found. Try another angle." Record the accepted option as a `rewritten` event with the intent (AI-§G.1)
from `onAccept`'s `choice` when the learning loop lands (R2).

## 2. `CopyReveal` in the builder (`src/components/generate/ai/copy-reveal.tsx`)

The same component as the wizard's (see `src/components/generate/ai/README.md`, section 2): when "Write again" streams
new text into a canvas field, render it through `CopyReveal` with the field's `CopyOrigin`.

## 3. `DirectorReview` (`./director-review.tsx`), R2 shell

In the Design check panel. It renders nothing unless `enabled` (the R2 flag; `critique.doc` is not live in R1), so the
builder is unchanged in R1.

| Prop | Type | Notes |
|---|---|---|
| `enabled` | `boolean` | `policy.live.includes("critique.doc")` |
| `running` | `boolean` | the review call in flight (a 2 px hairline, no spinner) |
| `fixes` | `readonly DirectorReviewFix[] \| null` | ≤ 3: `{ id, label, evidence, noGain }`; only fixes the one acceptance rule kept |
| `onReview` / `onApply(id)` / `onApplyAll` | callbacks | apply through the builder store, undoable |

## 4. `JobProgress` (`src/components/admin/ai/job-progress.tsx`), R2 shell

For the deep pass on the brand and store blueprint screens (S1, S2): `job` from `useAiJob(id, { handle })`, `transport`
from `policy.cloud.deepTransport`, `onCancel` from `useAiJob(...).cancel`. `done` renders nothing: apply the result with
an Undo toast.
