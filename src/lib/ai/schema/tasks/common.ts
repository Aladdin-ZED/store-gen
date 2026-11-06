/**
 * Shapes shared by the task inputs (P7 AI; ai.md AI-§A.3, AI-§E.1, AI-D31). Isomorphic, types only. Every task input
 * is merchant data (class a) or aggregates (class b): no field exists for a customer's name, phone, address or note,
 * so customer text has nowhere to travel (AI-D13, AI-D31). Money is integer minor units.
 */
import type { CopyLocale } from "../../prompts";
import type { Market, ProductCategory } from "@/lib/page/schema";

export type { CopyLocale };

/** The product data block every copy task sends (owner-typed: untrusted, AI-§E.3). Only ticked facts (AI-04). */
export interface TaskProduct {
  name: string;
  category: ProductCategory;
  /** integer minor units (centimes) */
  priceMinor: number;
  /** ISO 4217 */
  currency: string;
  /** ≤ 6 × 200 chars, owner-typed or ticked suggestions only (AI-§D.2 rule 7) */
  facts: string[];
}

/** The direction a copy run writes for (AI-§A.8.2 stage 2b): the Director's brief, or the engine's structure tags. */
export interface CopyDirection {
  slot: "best_fit" | "contrast" | "explore";
  /** design's copy angle id (DES `ANGLES`), null when the engine chose none */
  angle: string | null;
  /** design's headline structure id (G29, DES `HEADLINE_STRUCTURES`), null when free */
  headlineStructure: string | null;
  /** named patterns or colliding structures to avoid ("differ from these", AI-D24) */
  mustAvoid: string[];
}

export type { Market };
