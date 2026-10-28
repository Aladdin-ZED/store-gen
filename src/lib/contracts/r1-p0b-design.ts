/**
 * The R1 P0b design contract (maintainer; docs/STORE-SAAS.md §K.2 P0, §K.3; P0b package E): a compile-time check,
 * written like src/lib/contracts/r1-p0.ts, of the P3 / P6 / P7 seams the track planners asked for before the eight
 * tracks start (qa/r1-plans.json: P6-6, P7-1, P2-10, P2-11, P1-5, P1-11, P2-9, P3-1):
 *   - P6's `brandIcon` (src/lib/logo/favicon.ts, DES-R11): the page icon every landing document asks for;
 *   - the optional patch value of the copy overlay (DES-R20, AI-D26): an `undefined` value leaves the section default;
 *   - P7's browser rung (AI-§A.7): `useAiTask`, `AiTaskState`, `useDeviceInfo` and P2's cancel hook `cancelStoreAiJobs`;
 *   - P6's reveal builder `buildRevealDirections` and its `RevealInput`;
 *   - the field group P1 mounts for P6 (`PlatformDesignFields`, PLA-§13.1), the policy template field list P1's legal
 *     editor reads from P3 (`POLICY_TEMPLATE_FIELDS`, PLA-§13.4), and the two `AddressCard` slots P2 mounts for P3
 *     (`TestOrderSlot`, `CampaignSlot`, PLA-§22.10.2);
 *   - the add-on asset records the asset build emits and src/landing/document.tsx reads (§H.13).
 * Types only: nothing here runs and nothing imports it. A track that renames, removes or re-types one of these breaks
 * `tsc` (and so `npm run gate`); a change goes through a CCR (docs/saas/ccr/README.md) and the maintainer updates the
 * entry with it. The bodies are the owners' (stubs until their merges).
 */
import type { ReactElement } from "react";
import type * as platformDesignFields from "@/components/admin/brand/platform-design-fields";
import type * as addressSlots from "@/components/admin/landing/address-slots";
import type * as revealDirections from "@/components/generate/reveal/directions";
import type { RevealDirections } from "@/components/generate/reveal/RevealFolds";
import type { LandingRenderContext } from "@/landing/context";
import type * as generatedAssets from "@/landing/generated/assets";
import type { AiPolicy, DeviceInfo } from "@/lib/ai/policy";
import type { AiFallbackNote, AiOutcome, AiRunOpts, AiTaskInput, AiTaskOutput } from "@/lib/ai/provider/types";
import type * as aiClient from "@/lib/ai/router/client";
import type { AiProviderId, AiSurface, AiTaskId } from "@/lib/ai/tasks";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import type { GenerateInput } from "@/lib/generator/directions";
import type { PatchEntry, SemanticItem } from "@/lib/generator/overlay";
import type { CopyFacts } from "@/lib/landing/honesty/facts.server";
import type * as favicon from "@/lib/logo/favicon";
import type { Locale, Product } from "@/lib/page/schema";
import type * as policyFields from "@/lib/policies/fields";
import type { PlatformDesignSetting } from "@/lib/settings/keys/platform-design";
import type { BuiltTheme } from "@/lib/theme/types";

/** true when A and B are the same type (parameter names aside; optionality and readonly count). */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Has<Sub, Of> = [Sub] extends [Of] ? true : false;
type Assert<T extends true> = T;
/** What a stub component answers (it may render nothing). */
type El = ReactElement | null;

/* ------------------------------------------------------------------ */
/* P6 DESIGN: the page icon, the copy overlay, the reveal, the console  */
/* ------------------------------------------------------------------ */

export type P6Design = [
  // DES-R11 / DS32: document.tsx calls it at its three call sites (landing, thank-you, legal)
  Assert<Equals<typeof favicon.brandIcon, (ctx: LandingRenderContext, theme: BuiltTheme) => { href: string; type: string }>>,
  // DES-R20 / AI-D26: P7's optional kickers reach the overlay as an undefined value (no write)
  Assert<Equals<PatchEntry["value"], string | boolean | number | readonly string[] | readonly SemanticItem[] | undefined>>,
  Assert<Has<undefined, PatchEntry["value"]>>,
  // the reveal P2's welcome step builds (DES-§14.3, DES-§8.9): one call, never a hand-built card
  Assert<
    Equals<
      revealDirections.RevealInput,
      {
        product: GenerateInput["product"];
        palette: GenerateInput["palette"];
        facts: CopyFacts;
        category: Product["category"];
        locale: Locale;
        photos: readonly PhotoFacts[];
        // P0b review F-8: what today's generator needs for the degraded stub (and P6's run for its seed)
        market: GenerateInput["market"];
        seedBase: number;
      }
    >
  >,
  // P0b review F-8: async (DES-§14.2 has server round trips); the stub resolves today's generator's docs with no card
  Assert<Equals<typeof revealDirections.buildRevealDirections, (input: revealDirections.RevealInput) => Promise<RevealDirections>>>,
  // PLA-§13.1: P1 mounts it on /admin/settings/general
  Assert<Equals<typeof platformDesignFields.PlatformDesignFields, (p: { value: PlatformDesignSetting; onSave(v: PlatformDesignSetting): Promise<void> }) => El>>,
];

/* ------------------------------------------------------------------ */
/* P7 AI: the browser rung (AI-§A.7) and the store-switch cancel hook   */
/* ------------------------------------------------------------------ */

export type P7Client = [
  Assert<
    Equals<
      aiClient.AiTaskState,
      { status: "idle" | "running" | "done" | "error"; provider: AiProviderId | null; notes: AiFallbackNote[]; fields: Record<string, unknown>; credits: number | null }
    >
  >,
  Assert<
    Equals<
      typeof aiClient.useAiTask,
      <T extends AiTaskId>(
        task: T,
        ctx: { handle: string; policy: AiPolicy; device: DeviceInfo },
      ) => {
        state: aiClient.AiTaskState;
        run(input: AiTaskInput<T>, opts?: Omit<AiRunOpts, "surface"> & { surface: AiSurface }): Promise<AiOutcome<AiTaskOutput<T>>>;
        cancel(): void;
      }
    >
  >,
  Assert<Equals<typeof aiClient.useDeviceInfo, () => DeviceInfo>>,
  // PLA-§22.3: P2's clearStoreClientState calls it on a store switch and on sign-out
  Assert<Equals<typeof aiClient.cancelStoreAiJobs, (storeId: string) => void>>,
];

/* ------------------------------------------------------------------ */
/* P3 LANDING: the policy template fields, the AddressCard slots        */
/* ------------------------------------------------------------------ */

export type P3Landing = [
  // PLA-§13.4: P3 appends names, never renames one
  Assert<Equals<typeof policyFields.POLICY_TEMPLATE_FIELDS, readonly string[]>>,
  // PLA-§22.10.2, PD61: P2's AddressCard mounts them; P3 fills the bodies
  Assert<Equals<typeof addressSlots.TestOrderSlot, (p: { pageId: string | null; live: boolean }) => El>>,
  Assert<Equals<typeof addressSlots.CampaignSlot, () => El>>,
];

/* ------------------------------------------------------------------ */
/* Maintainer: the add-on asset records (§H.13)                         */
/* ------------------------------------------------------------------ */

export type MaintainerAddonAssets = [
  // scripts/build-landing-assets.mjs emits them; document.tsx's generatedMap("addon" | "addonCss") reads them
  Assert<Equals<typeof generatedAssets.addonChunks, Record<string, string>>>,
  Assert<Equals<typeof generatedAssets.addonCss, Record<string, string>>>,
];
