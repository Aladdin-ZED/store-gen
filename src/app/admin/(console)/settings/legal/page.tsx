import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { Banner, PageHeader, StatusText } from "@/components/console/kit";
import { card, td, th } from "@/components/console/kit-styles";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { LegalEditor, type LegalEditorDoc } from "@/components/console/settings/legal-editor";
import { t as message, translator } from "@/lib/i18n/admin";
import { getLegalVersion, listLegal, type LegalGroup, type LegalList } from "@/lib/platform/legal";
import { isLegalLocale, isPlatformKind, isR1LegalKind, R1_LEGAL_KINDS } from "@/lib/platform/legal-rules";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { cn } from "@/lib/utils";

/*
 * `/admin/settings/legal` (platform.md PLA-§13.4, PL-14; PD17, PD49): every kind × locale of R1 (no DPA row: R2) with
 * its published version, draft and Needs-legal-review chip, the red "Sign-up runs without published <kind>" lines;
 * `?doc=<id>` opens a version in the editor, `?new=<kind>.<locale>` starts the first version of a pair.
 * `legal.manage`.
 */
export const metadata: Metadata = { title: message("console.legal.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const tr = translator(CONSOLE_LOCALE);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

function List({ list }: { list: LegalList }) {
  const byKind = new Map<string, LegalGroup[]>();
  for (const g of list.groups) byKind.set(g.kind, [...(byKind.get(g.kind) ?? []), g]);
  return (
    <div className="grid gap-4">
      {list.missing.length > 0 && (
        <Banner tone="danger">
          {list.missing.map((k) => (
            <p key={k}>{tr("console.legal.missing", { kind: tr(`console.legal.kind.${k}`) })}</p>
          ))}
        </Banner>
      )}
      <p className="text-[12.5px] text-muted-foreground">{tr("console.legal.dpa_later")}</p>
      {R1_LEGAL_KINDS.map((kind) => (
        <section key={kind} aria-label={tr(`console.legal.kind.${kind}`)} className={card}>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
            <h2 className="me-auto text-[14px] font-semibold tracking-[-0.006em]">{tr(`console.legal.kind.${kind}`)}</h2>
            <span className="text-[12px] text-muted-foreground">{tr(isPlatformKind(kind) ? "console.legal.platform_kind" : "console.legal.store_kind")}</span>
          </div>
          <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--c-hairline)]">
                  <th className={th}>{tr("console.legal.locale")}</th>
                  <th className={th}>{tr("console.legal.published")}</th>
                  <th className={th}>{tr("console.legal.effective")}</th>
                  {isPlatformKind(kind) && <th className={cn(th, "text-end")}>{tr("console.legal.acceptances")}</th>}
                  <th className={th}>{tr("console.legal.draft")}</th>
                  <th className={th}>
                    <span className="sr-only">{tr("console.legal.open")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(["ar", "fr", "en"] as const).map((locale) => {
                  const g = (byKind.get(kind) ?? []).find((x) => x.locale === locale);
                  const pub = g?.published ?? null;
                  const draft = g?.draft ?? null;
                  const open = draft ?? pub ?? g?.versions[0] ?? null;
                  return (
                    <tr key={locale} className="border-b border-[var(--c-hairline)] last:border-0">
                      <td className={cn(td, "font-medium")}>{tr(`console.locale.${locale}`)}</td>
                      <td className={td}>
                        {pub ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <StatusText tone="ok">{tr("console.legal.version", { version: pub.version })}</StatusText>
                            {pub.needsLegalReview && <span className="rounded-[var(--r-chip)] bg-[var(--c-warn-soft)] px-1.5 py-0.5 text-[11px] font-medium">{tr("console.legal.needs_review")}</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{tr("console.legal.none")}</span>
                        )}
                      </td>
                      <td className={cn(td, "num text-muted-foreground")}>{day(pub?.effectiveAt ?? null)}</td>
                      {isPlatformKind(kind) && <td className={cn(td, "num text-end")}>{pub?.acceptances ?? "—"}</td>}
                      <td className={td}>
                        {draft ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <StatusText tone="info">{tr("console.legal.version", { version: draft.version })}</StatusText>
                            {draft.needsLegalReview && <span className="rounded-[var(--r-chip)] bg-[var(--c-warn-soft)] px-1.5 py-0.5 text-[11px] font-medium">{tr("console.legal.needs_review")}</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn(td, "text-end")}>
                        <PrefetchLink href={open ? `/admin/settings/legal?doc=${open.id}` : `/admin/settings/legal?new=${kind}.${locale}`} className="inline-flex min-h-8 items-center rounded-[var(--r-control)] px-2 text-[12.5px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
                          {open ? tr("console.legal.open") : tr("console.legal.write_first")}
                        </PrefetchLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export default async function LegalSettingsPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "legal.manage" });
  const sp = await searchParams;
  const docId = one(sp.doc);
  const fresh = one(sp.new);
  let body: ReactNode;
  if (docId && /^[0-9A-Z]{26}$/.test(docId)) {
    const [detail, list] = await Promise.all([panel("legal.doc", () => getLegalVersion(ctx, docId)), panel("legal.list", () => listLegal(ctx))]);
    if (detail.state !== "ok") body = detail.state === "error" ? <PanelError reference={detail.ref} /> : <PanelUnavailable />;
    else {
      const d = detail.data;
      const group = list.state === "ok" ? list.data.groups.find((g) => g.kind === d.doc.kind && g.locale === d.doc.locale) : undefined;
      const doc: LegalEditorDoc = {
        id: d.doc.id,
        kind: d.doc.kind,
        locale: d.doc.locale,
        platform: isPlatformKind(d.doc.kind),
        version: d.doc.version,
        status: d.doc.status,
        title: d.doc.title,
        body: d.doc.body,
        summary: d.doc.summary ?? "",
        effectiveAt: d.doc.effectiveAt,
        requiresReacceptance: d.doc.requiresReacceptance,
        needsLegalReview: d.doc.needsLegalReview,
        reviewedAt: d.doc.reviewedAt,
        latestVersion: group?.versions[0]?.version ?? d.doc.version,
        previous: d.previous ? { version: d.previous.version } : null,
        diff: d.diff,
        diffStats: d.diffStats,
      };
      body = <LegalEditor key={d.doc.id} doc={doc} />;
    }
  } else if (fresh) {
    const [kind, locale] = fresh.split(".");
    if (!isR1LegalKind(kind) || !isLegalLocale(locale)) body = <PanelUnavailable text={tr("console.legal.kind_invalid")} />;
    else
      body = (
        <LegalEditor
          key={fresh}
          doc={{ id: null, kind, locale, platform: isPlatformKind(kind), version: 1, status: "new", title: "", body: "", summary: "", effectiveAt: null, requiresReacceptance: false, needsLegalReview: true, reviewedAt: null, latestVersion: 0, previous: null, diff: [], diffStats: { added: 0, removed: 0 } }}
        />
      );
  } else {
    const list = await panel("legal.list", () => listLegal(ctx));
    body = list.state === "ok" ? <List list={list.data} /> : list.state === "error" ? <PanelError reference={list.ref} /> : <PanelUnavailable />;
  }
  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.legal.title")} lead={tr("console.legal.lead")} />
      <PanelBoundary title={tr("console.legal.title")}>{body}</PanelBoundary>
    </div>
  );
}
