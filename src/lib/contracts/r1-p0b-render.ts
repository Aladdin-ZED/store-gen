/**
 * The R1 P0b render contract (maintainer; docs/STORE-SAAS.md §K.2 P0, §K.3, §H.3, §H.13, §M.1 rule 2; P0b package F):
 * a compile-time check, written like src/lib/contracts/r1-p0.ts, of the render-path seams the track planners asked for
 * before the eight tracks start (qa/r1-plans.json: P3-2, P3-3, P3-11, P5-11, P6-8, P8-2):
 *   - P3's add-on loader `loadRenderAddons` and its `AddonMode` (every store render path calls it, LAN-§5.3);
 *   - P3's lead capture rule `leadCaptureOn` (the live and test documents omit `endpoints.lead` when it says no, LD11);
 *   - the one origin builder `originFrom` with `textFieldsOf` and `hash16` (src/lib/render/origin.ts), re-exported by
 *     the publish gate module with `generationRecordFor`, the server read of design's generation record;
 *   - P5's `triggerFor`, the one Purchase trigger rule the render context's `purchaseInBrowserFor` follows (OD18);
 *   - P6's draft design hook `recordDraftDesign` (DES-§8.7), awaited by the builder's `saveDraft` in warn mode;
 *   - P8's in-place re-render `rerenderInPlace` (§H.3, D50), the body of every `render_jobs` reason;
 *   - the render context fields the wiring adds (the thank-you document's add-ons, the endpoints).
 * Types only: nothing here runs and nothing imports it. A track that renames, removes or re-types one of these breaks
 * `tsc` (and so `npm run gate`); a change goes through a CCR (docs/saas/ccr/README.md) and the maintainer updates the
 * entry with it. The stub bodies are the owners' (P3, P6) until their merges.
 */
import type * as addonsLoad from "@/landing/addons/load.server";
import type { RenderAddons } from "@/landing/addons/types";
import type { DocumentUrls } from "@/landing/document";
import type { GateSummary, OriginClass as SchemaOriginClass } from "@/lib/db/schema";
import type * as designSave from "@/lib/design/save.server";
import type { RenderReason } from "@/lib/jobs/renders";
import type * as leadCapture from "@/lib/landing/lead-capture";
import type * as conversionsCore from "@/lib/orders/conversions-core";
import type { PageDoc } from "@/lib/page/schema";
import type * as origin from "@/lib/render/origin";
import type * as prepublish from "@/lib/render/prepublish";
import type * as publish from "@/lib/render/publish.server";
import type { StoreRenderContext } from "@/lib/render/store-context.server";
import type { ConversionsSetting } from "@/lib/settings/keys/conversions";
import type { LandingSetting } from "@/lib/settings/keys/landing";
import type { StoreSettingValue } from "@/lib/settings";
import type { Actor, GateItem, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";

/** true when A and B are the same type (parameter names aside; optionality and readonly count). */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

/* ------------------------------------------------------------------ */
/* P3 LANDING: the add-on loader, the lead capture rule                 */
/* ------------------------------------------------------------------ */

export type P3Render = [
  // LAN-§5.3: one mode per render path (live, preview, test, each export mode)
  Assert<Equals<addonsLoad.AddonMode, "live" | "preview" | "test" | "export-static" | "export-connected" | "export-php" | "export-whatsapp">>,
  Assert<
    Equals<
      typeof addonsLoad.loadRenderAddons,
      (scope: StoreScope, store: StoreRow, opts: { pageId: string | null; doc: PageDoc; mode: addonsLoad.AddonMode }) => Promise<{ landing: RenderAddons; thanks: RenderAddons }>
    >
  >,
  // LD11, LAN-§10.1: `capture` is the landing setting's leads.capture
  Assert<Equals<typeof leadCapture.leadCaptureOn, (market: string, capture: "market_default" | "on" | "off") => boolean>>,
  Assert<Equals<Parameters<typeof leadCapture.leadCaptureOn>[1], LandingSetting["leads"]["capture"]>>,
];

/* ------------------------------------------------------------------ */
/* Maintainer: the one origin builder (§M.1 rule 2) and the render context */
/* ------------------------------------------------------------------ */

export type MaintainerOrigin = [
  Assert<Equals<origin.OriginClass, SchemaOriginClass>>,
  Assert<Equals<origin.GenerationRecord, NonNullable<GateSummary["gen"]>>>,
  Assert<Equals<typeof origin.textFieldsOf, (doc: PageDoc) => ReadonlyMap<string, string>>>,
  Assert<Equals<typeof origin.hash16, (text: string) => string>>,
  Assert<Equals<typeof origin.originFrom, (prev: PageDoc | null, doc: PageDoc, gen?: origin.GenerationRecord | null) => ReadonlyMap<string, origin.OriginClass>>>,
  // the publish gate module re-exports the very functions (no second builder) and reads the record
  Assert<Equals<typeof prepublish.originFrom, typeof origin.originFrom>>,
  Assert<Equals<typeof prepublish.textFieldsOf, typeof origin.textFieldsOf>>,
  Assert<Equals<typeof prepublish.hash16, typeof origin.hash16>>,
  Assert<Equals<typeof prepublish.generationRecordFor, (scope: StoreScope, pageId: string) => Promise<origin.GenerationRecord | null>>>,
];

export type MaintainerRenderContext = [
  // the thank-you document's add-ons travel beside the landing document's (the wiring's choice, store-context.server.ts)
  Assert<Equals<StoreRenderContext["addons"], RenderAddons>>,
  Assert<Equals<StoreRenderContext["thanksAddons"], RenderAddons>>,
  Assert<Equals<StoreRenderContext["endpoints"], DocumentUrls["endpoints"]>>,
];

/* ------------------------------------------------------------------ */
/* P5 INTEGRATIONS: the one Purchase trigger rule (OD18)                */
/* ------------------------------------------------------------------ */

export type P5Trigger = [
  // the value the render context reads is the setting's own type
  Assert<Equals<StoreSettingValue<"conversions">, ConversionsSetting>>,
  Assert<Equals<typeof conversionsCore.triggerFor, (conversions: ConversionsSetting, pageId: string | null) => ConversionsSetting["purchaseTrigger"]>>,
];

/* ------------------------------------------------------------------ */
/* P6 DESIGN: the draft design hook (DES-§8.7)                          */
/* ------------------------------------------------------------------ */

export type P6DraftHook = [Assert<Equals<typeof designSave.recordDraftDesign, (scope: WriteScope, pageId: string, doc: PageDoc) => Promise<void>>>];

/* ------------------------------------------------------------------ */
/* P8 PLATFORM OPS: the in-place re-render (§H.3, D50)                  */
/* ------------------------------------------------------------------ */

export type P8Rerender = [
  Assert<
    Equals<
      typeof publish.rerenderInPlace,
      (
        scope: WriteScope,
        pageId: string,
        opts: { reason: RenderReason; actor: Actor },
      ) => Promise<{ status: "rendered" | "skipped_runtime_v1" | "not_live" | "live_changed"; versionId?: string; etag?: string; notes: GateItem[] }>
    >
  >,
];
