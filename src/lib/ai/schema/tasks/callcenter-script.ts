/**
 * `callcenter.script` (AI-15 R1 slice for SF-01; ai.md AI-§D.3, AI-D31; operations.md OPE-§7.2-7.4): the call script of
 * one product, never of one customer. Types only. The output is P4's `ScriptDoc` (src/lib/callcenter/script.ts); the
 * per-order personalisation (name, pack, city) is done by templates in the agent console, so the input has no field a
 * customer datum could travel in.
 */
import type { CopyLocale, TaskProduct } from "./common";

export interface CallScriptInput {
  locale: CopyLocale;
  product: TaskProduct;
  /** the offer's packs as configured (integer minor units) */
  packs: { label: string; qty: number; priceMinor: number }[];
  /** the store's voice (`store_ai.voice.darija`) */
  darija: "none" | "cta" | "light";
  /** `checkout.addressMode` (UX-31): optional → quartier + repère checklist line; required → confirm only */
  addressMode: "required" | "optional" | null;
}

export type { ScriptDoc as CallScriptOut } from "@/lib/callcenter/script";
