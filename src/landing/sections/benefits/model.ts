/**
 * Benefits data model: zod schema (the saved-page contract) and the props every variant view receives.
 */
import { z } from "zod";
import { AssetRef, type SectionBg } from "@/lib/page/schema";
import type { RenderContext } from "../../types";
import { IconField, opt } from "./kit";

export const Item = z.object({
  icon: IconField.default("check"),
  title: z.string().min(1).max(70),
  text: opt(220),
  /** short product fact: "3", "12 h", "45 dB" (rolls up when it starts with a number) */
  stat: opt(14),
  statLabel: opt(48),
  image: AssetRef.optional(),
});

export const schema = z.object({
  kicker: opt(60),
  title: z.string().min(1).max(140),
  lead: opt(280),
  items: z.array(Item).min(2).max(6),
  cta: z.boolean().default(false),
  ctaLabel: opt(60),
  /** hanging (sheet S1): false = the numbered ledger without thumbnails; absent = thumbnails when every row has a photo */
  thumbs: z.boolean().optional(),
});

export type Data = z.infer<typeof schema>;
export type BenefitItem = Data["items"][number];

export interface ViewProps {
  ctx: RenderContext;
  data: Data;
  /** section instance id (seeds, uids) */
  id: string;
  titleId: string;
  /** the section's color block (nested surfaces pick a contrasting one) */
  bg: SectionBg;
}
