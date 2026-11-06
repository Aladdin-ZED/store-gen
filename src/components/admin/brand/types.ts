/**
 * Shapes of the brand kit's client (P6 DESIGN; design.md DES-§12.2, DES-§12.7). Isomorphic types only: the page
 * builds them on the server, the story fixture builds them by hand, `BrandKit` renders them.
 */
import type { BrandKitView, BrandWriteResult, ColorPatch, LogoSlot } from "@/lib/design/brand-kit.server";
import type { ActionResult } from "@/lib/tenancy/types";

export type { BrandKitView, BrandWriteResult, ColorPatch, LogoSlot };

/** One pairing card of the Type tab (the catalogue row with its family names). */
export interface PairingCard {
  id: string;
  note: string;
  archetype: string;
  alsoFits: readonly string[];
  display: string;
  displayAr: string;
  body: string;
  displayWeight: number;
  displayWeightAr: number;
  families: { display: string; displayAr: string; body: string };
}

/** The writes the kit calls: the server actions on the real page, local stubs in the fixture. */
export interface BrandKitActions {
  bindLogo(input: { slot: LogoSlot; assetId: string | null }): Promise<ActionResult<BrandWriteResult>>;
  saveColor(input: ColorPatch): Promise<ActionResult<BrandWriteResult>>;
  saveFonts(input: { pairing?: string | null; locked?: boolean }): Promise<ActionResult<BrandWriteResult>>;
  saveVoice(input: { register?: BrandKitView["voice"]["register"]; darija?: BrandKitView["voice"]["darija"] }): Promise<ActionResult<BrandWriteResult>>;
  /** uploads a file through the store's media endpoint and returns the new asset id (null: not available) */
  upload: ((file: File) => Promise<string>) | null;
}

export type BrandTab = "logo" | "colors" | "type" | "voice";
