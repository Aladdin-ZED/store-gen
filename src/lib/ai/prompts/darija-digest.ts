/**
 * The Darija orthography guide as a hash input (P7 AI; ai.md AI-§F.2 rev 3 QUAL-30): "its hash is part of
 * `copy.*@s*` and the local `copy.page@l*` template hashes, so an edit is a prompt version". The whole guide counts
 * (the table, the MSA-kept words, the Arabizi table, the dialect markers, the register rules), not only what block 2
 * quotes of it. Pure and isomorphic; computed once at module load.
 */
import { ARABIZI, DARIJA_GUIDE_VERSION, DARIJA_REGISTER_RULES, DARIJA_WORDS, DIALECT_MARKERS, MSA_KEPT } from "./darija-orthography";
import { sha256Hex } from "./sha256";
import { canonicalJson } from "./text";

/** "darija:dg1:<sha256 of the guide>" */
export const DARIJA_GUIDE_DIGEST = `darija:${DARIJA_GUIDE_VERSION}:${sha256Hex(canonicalJson({ words: DARIJA_WORDS, msa: MSA_KEPT, arabizi: ARABIZI, dialects: DIALECT_MARKERS, rules: DARIJA_REGISTER_RULES }))}`;
