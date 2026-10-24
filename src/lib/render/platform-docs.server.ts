import "server-only";
/**
 * The platform's own public documents (docs/STORE-SAAS.md §C.4: `/terms`, `/privacy`, `/aup` of the marketing
 * area; platform.md PLA-§13.4): the published `legal_documents` version of a kind in a locale, with the
 * locale → fr → en → ar fallback signup uses. Editing, review and the markdown-lite renderer are P1's
 * (src/lib/platform/legal.ts, R1 product); until then a page shows the published text as plain paragraphs and
 * headings, and a kind with no published version answers the 404 (nothing is invented, owner rule 4).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { legalDocuments } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { getPlatformSetting } from "@/lib/settings";

let nameWarned = false;

/** The platform's name as the owner set it (`platform.brand.name`, PLA-§2.4); its default when it can't be read. */
export async function platformBrandName(): Promise<string> {
  try {
    return (await getPlatformSetting("platform")).brand.name;
  } catch (err) {
    // once per process: the marketing pages render on every visit
    if (!nameWarned) console.warn("[marketing] platform name unavailable, using the default:", errorSummary(err));
    nameWarned = true;
    return "Store Gen";
  }
}

export type PlatformDocKind = "tos" | "privacy" | "aup";
export type MarketingLocale = "ar" | "fr" | "en";

/** The marketing path of each platform document kind. */
export const PLATFORM_DOC_PATHS: Record<PlatformDocKind, `/${string}`> = { tos: "/terms", privacy: "/privacy", aup: "/aup" };

export interface PlatformDoc {
  kind: PlatformDocKind;
  locale: string;
  version: number;
  title: string;
  body: string;
  publishedAt: Date | null;
  effectiveAt: Date | null;
}

const fallbacks = (locale: MarketingLocale): MarketingLocale[] => [...new Set<MarketingLocale>([locale, "fr", "en", "ar"])];

/** The published version of `kind` in `locale` (else fr, en, ar), or null when none is published. */
export async function publishedPlatformDoc(kind: PlatformDocKind, locale: MarketingLocale): Promise<PlatformDoc | null> {
  const order = fallbacks(locale);
  const rows = await db
    .select({
      kind: legalDocuments.kind,
      locale: legalDocuments.locale,
      version: legalDocuments.version,
      title: legalDocuments.title,
      body: legalDocuments.body,
      publishedAt: legalDocuments.publishedAt,
      effectiveAt: legalDocuments.effectiveAt,
    })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.status, "published"), inArray(legalDocuments.locale, order)))
    .orderBy(desc(legalDocuments.version));
  for (const want of order) {
    const row = rows.find((r) => r.locale === want);
    if (row) return { ...row, kind } as PlatformDoc;
  }
  return null;
}

/** The kinds that have a published version in some locale (the platform sitemap lists their pages). */
export async function publishedPlatformKinds(): Promise<PlatformDocKind[]> {
  const rows = await db
    .selectDistinct({ kind: legalDocuments.kind })
    .from(legalDocuments)
    .where(and(inArray(legalDocuments.kind, ["tos", "privacy", "aup"]), eq(legalDocuments.status, "published")));
  return rows.map((r) => r.kind as PlatformDocKind);
}

export type DocBlock = { kind: "h2" | "h3" | "p" | "li"; text: string };

/**
 * The text of a document as blocks: "# " / "## " / "### " lines are headings (the page title is the document's
 * own), "- " and "1. " lines list items, other runs of lines paragraphs. Text only: no markup survives (React
 * escapes every block), links stay readable as written.
 */
export function docBlocks(body: string): DocBlock[] {
  const out: DocBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^(?:[-*]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ kind: heading[1]!.length >= 3 ? "h3" : "h2", text: heading[2]!.replace(/\*\*|__/g, "") });
    } else if (item) {
      flush();
      out.push({ kind: "li", text: item[1]!.replace(/\*\*|__/g, "") });
    } else {
      para.push(line.replace(/\*\*|__/g, ""));
    }
  }
  flush();
  return out.slice(0, 2_000);
}
