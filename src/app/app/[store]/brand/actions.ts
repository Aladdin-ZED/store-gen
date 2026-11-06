"use server";
/**
 * The brand page's server actions (P6 DESIGN; design.md DES-§12.1, BK-1; core §E.2). Every write is
 * `storeAction("brand.write", …)` on the store of the request and returns the page's new view; the bodies live in
 * src/lib/design/brand-kit.server.ts. The logo file itself goes through the core upload endpoint
 * (`/api/app/<h>/media`, core §G.4) first; `bindLogoAction` only binds an id the store owns (`assertOwned`).
 * The kit accepts no free text in R1 (colours, a pairing id, gene values and voice enums), so it has no brand-term
 * check of its own (D76: the store name is written by Settings → General).
 */
import { z } from "zod";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { revalidateStore } from "@/lib/admin-data/shell";
import { bindLogo, saveColors, saveFonts, saveGenes, saveVoice, type BrandWriteResult } from "@/lib/design/brand-kit.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const RATE = { rate: { name: "design:brand", limit: 120, windowSec: 600, per: "store" as const } };

const LogoInput = z.object({ slot: z.enum(["primary", "mark", "wordmark", "inverse"]), assetId: z.string().min(1).max(64).nullable() });
const ColorInput = z.object({
  role: z.enum(["accent", "pop", "neutral", "base"]),
  value: z.union([z.string().max(9), z.number().min(0).max(360), z.null()]).optional(),
  lock: z.boolean().optional(),
});
const FontsInput = z.object({ pairing: z.string().regex(/^[a-z0-9-]{2,40}$/).nullable().optional(), locked: z.boolean().optional() });
const GenesInput = z.record(z.string().regex(/^G\d{1,2}$/), z.string().max(48).nullable()).refine((r) => Object.keys(r).length <= 8);
const VoiceInput = z.object({
  register: z.enum(["plain", "warm", "precise", "bold", "poetic-restrained"]).nullable().optional(),
  darija: z.enum(["none", "cta", "light"]).optional(),
});

/** Binds (or, with null, removes) a logo slot; the file was uploaded through the media endpoint. */
export async function bindLogoAction(input: z.input<typeof LogoInput>): Promise<ActionResult<BrandWriteResult>> {
  return storeAction(
    "brand.write",
    async (ctx) => {
      const { slot, assetId } = LogoInput.parse(input);
      const out = await bindLogo(ctx.scope, settingsActor(ctx.actor), ctx.store.currency, slot, assetId);
      revalidateStore(ctx.store.handle, "/brand");
      return out;
    },
    RATE,
  );
}

/** One colour role: its value (through the no-orange guard) and / or its lock. */
export async function saveBrandColorAction(input: z.input<typeof ColorInput>): Promise<ActionResult<BrandWriteResult>> {
  return storeAction(
    "brand.write",
    async (ctx) => {
      const patch = ColorInput.parse(input);
      return saveColors(ctx.scope, settingsActor(ctx.actor), ctx.store.currency, patch);
    },
    RATE,
  );
}

/** The type pairing (a catalogue id) and its lock. */
export async function saveBrandFontsAction(input: z.input<typeof FontsInput>): Promise<ActionResult<BrandWriteResult>> {
  return storeAction(
    "brand.write",
    async (ctx) => saveFonts(ctx.scope, settingsActor(ctx.actor), ctx.store.currency, FontsInput.parse(input)),
    RATE,
  );
}

/** Brand gene locks; values outside the gene vocabulary come back in `dropped`. */
export async function saveBrandGenesAction(input: z.input<typeof GenesInput>): Promise<ActionResult<BrandWriteResult>> {
  return storeAction(
    "brand.write",
    async (ctx) => saveGenes(ctx.scope, settingsActor(ctx.actor), ctx.store.currency, GenesInput.parse(input)),
    RATE,
  );
}

/** The store voice's register and Darija ratio (store_ai.voice, DS45). */
export async function saveBrandVoiceAction(input: z.input<typeof VoiceInput>): Promise<ActionResult<BrandWriteResult>> {
  return storeAction(
    "brand.write",
    async (ctx) => saveVoice(ctx.scope, settingsActor(ctx.actor), ctx.store.currency, VoiceInput.parse(input)),
    RATE,
  );
}
