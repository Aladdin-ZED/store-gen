/**
 * Block 4 builders shared by the families (P7 AI; ai.md AI-§B.3 images, AI-§B.5 row 4, AI-§E.3 control 1). Pure and
 * isomorphic. Images come first, each after its `Image n:` label; untrusted text only inside escaped data blocks with
 * sorted-key JSON; the request's instruction is a plain operator text block after the data.
 */
import type { BetaContentBlockParam, BetaImageBlockParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Analysis } from "../copy-schema";
import type { AnalyzeImage } from "../schema/tasks/analyze";
import type { TaskProduct } from "../schema/tasks/common";
import { canonicalJson, dataBlock, type DataTag } from "./text";

export const text = (t: string): BetaTextBlockParam => ({ type: "text", text: t });

/** `Image n: <label>` then the image, for each one (AI-§A.8.7 vision prompting: images before text, labelled). */
export function imageBlocks(images: readonly AnalyzeImage[], label: (i: number) => string = () => "product photo"): BetaContentBlockParam[] {
  return images.flatMap((img, i): BetaContentBlockParam[] => [
    text(`Image ${i + 1}: ${label(i)}, ${img.w} x ${img.h} px.`),
    { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } } satisfies BetaImageBlockParam,
  ]);
}

/** A data block holding sorted-key JSON (escaped). */
export const jsonBlock = (tag: DataTag, value: unknown, attrs?: Readonly<Record<string, string>>): BetaTextBlockParam => text(dataBlock(tag, canonicalJson(value), attrs));

/** "199 MAD" from integer minor units. */
export const priceText = (minor: number, currency: string): string => `${minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2)} ${currency}`;

/** The product data block of the copy tasks: what the merchant typed (and the photo's appearance, never facts). */
export function productFactsBlock(p: TaskProduct, extra: { deliveryText?: string | null; analysis?: Analysis | null } = {}): BetaTextBlockParam {
  const a = extra.analysis;
  return jsonBlock("product_facts", {
    name: p.name,
    category: p.category,
    price: priceText(p.priceMinor, p.currency),
    facts: p.facts,
    ...(extra.deliveryText?.trim() ? { delivery_line: extra.deliveryText.trim() } : {}),
    ...(a
      ? { photo_appearance: { summary: a.summary, mood: a.secondaryVibe ? `${a.vibe} / ${a.secondaryVibe}` : a.vibe, colours: a.colorsDescribed, audience: a.audience } }
      : {}),
  });
}

/** The locale names the operator lines use. */
export const LOCALE_NAME = { ar: "Arabic (ar)", fr: "French (fr)", en: "English (en)" } as const;
