import "server-only";
/**
 * The three platform documents a sign-up form links (platform.md PLA-§22.1, §13.4), as the legal sheet shows them:
 * the published version in the page language (else fr, en, ar); a kind with no published version is left out.
 */
import type { AdminLocale } from "@/lib/i18n/admin";
import { docBlocks, publishedPlatformDoc, type PlatformDocKind } from "@/lib/render/platform-docs.server";
import type { LegalDocView } from "../_components/legal-sheet";

const KINDS: readonly PlatformDocKind[] = ["tos", "privacy", "aup"];

export async function legalDocsFor(locale: AdminLocale): Promise<LegalDocView[]> {
  const docs = await Promise.all(KINDS.map((kind) => publishedPlatformDoc(kind, locale).catch(() => null)));
  return docs.flatMap((d) => (d ? [{ kind: d.kind, title: d.title, version: d.version, locale: d.locale, blocks: docBlocks(d.body) }] : []));
}
