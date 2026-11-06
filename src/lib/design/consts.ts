/**
 * The copy and rhythm vocabularies of the design genome (P6 DESIGN; design.md DES-§4.1). A leaf module (no imports) so
 * the genome types, the gene vocabulary and the schema read one list each without an import cycle; genome.ts
 * re-exports them under their frozen names (docs/STORE-SAAS.md §K.2 P0 design stubs).
 */
export const VOICE_REGISTERS = ["plain", "warm", "precise", "bold", "poetic-restrained"] as const;
export const HEADLINE_STRUCTURES = ["noun-phrase", "imperative", "question", "number-led", "contrast-pair", "quote-led", "word-subline"] as const;
/** copy angle (ai.md CopyRequest v2) */
export const ANGLES = ["benefit", "problem", "ritual", "gift", "value", "proof", "origin"] as const;
/** DES-§5.8 (C5) */
export const OPENERS = ["bare", "caption", "number", "quote", "image", "kicker"] as const;
/** the G19 aspect set (DES-§4.2) */
export const ASPECTS = ["4:5", "3:4", "1:1", "2:3", "16:9", "21:9"] as const;
/** DES-§5.10 (I1, I2) */
export const PHOTO_ROLES = ["hero", "detail", "context", "proof", "offer", "thumb"] as const;
export const CROPS = ["full", "tight", "context", "bleed"] as const;
/** Sections outside the page flow (DES-§5.1 Top, Footer and Floating); the hero is the first in-flow section. */
export const FIXED_TYPES: ReadonlySet<string> = new Set(["announcement", "header", "footer", "stickyCta", "whatsappFloat"]);
