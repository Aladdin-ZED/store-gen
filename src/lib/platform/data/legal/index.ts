/**
 * Legal templates seeded from code at boot (docs/STORE-SAAS.md §H.4 step 5, PLA Q.13; CCR r1.0-t1-3 item 1).
 *
 * R1.0 shipped no template (version 0). R1 product (P1, platform.md PLA-§13.4, PD49): version 1 carries the platform
 * documents (./platform.ts: ToS, Privacy, AUP) and the store templates (./store.ts: privacy, terms of sale, delivery,
 * returns, contact) in ar / fr / en, 24 drafts; no DPA (R2). They are TypeScript modules rather than the `*.md` files
 * PLA-§13.4 names, so the seeder reads them without a loader; the texts are the same markdown-lite. P1 bumps the
 * version whenever it adds or changes entries. At boot, when `LEGAL_SEED_VERSION` is greater than the
 * platform marker `legal_seed`, every entry is inserted as version 1, status `draft`, `needs_legal_review = 1`, with
 * `INSERT IGNORE` on `ld_kind_loc_ver_uq` (a row the owner already edited is never overwritten), then the marker is
 * written last (src/lib/db/boot-tasks.ts, seedLegalTemplates). Never invented legal text: entries come from P1.
 */
import { PLATFORM_LEGAL } from "./platform";
import { STORE_LEGAL } from "./store";

export type LegalSeedKind = "tos" | "privacy" | "aup" | "dpa" | "store_privacy" | "store_terms" | "store_shipping" | "store_returns" | "store_contact";

export interface LegalSeedDoc {
  kind: LegalSeedKind;
  locale: "ar" | "fr" | "en";
  /** ≤ 160 characters (legal_documents.title) */
  title: string;
  body: string;
  /** "what changed", ≤ 500 characters (legal_documents.summary) */
  summary: string | null;
}

export const LEGAL_SEED_VERSION: number = 1;
export const LEGAL_SEED: readonly LegalSeedDoc[] = [...PLATFORM_LEGAL, ...STORE_LEGAL];
