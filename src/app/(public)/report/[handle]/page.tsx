import type { Metadata } from "next";
import { getCspNonce, getSignedInUser } from "@/lib/auth";
import { viewerLocale } from "@/lib/auth/locale";
import { platformTurnstileKeys } from "@/lib/auth/platform-config";
import { translator } from "@/lib/i18n/admin";
import { ABUSE_REASONS, sameHostPath } from "@/lib/platform/abuse-input";
import { resolveStoreByHandle } from "@/lib/tenancy/public";
import { AuthHeading } from "../../_components/auth-heading";
import { ReportForm } from "./report-form";

/*
 * `/report/<handle>` (platform.md PLA-§24.2 R1 slice, PD70, SEC-18; core §B.1, §I.5; PL-20): the public report form on
 * the platform host (store hosts answer the neutral 404 for /report/*). Area auth: the nonce CSP, noindex,
 * `Referrer-Policy: same-origin` (the form posts a Server Action before hydration), `private, no-store` from the proxy.
 * ar / fr / en (the shell sets `dir="rtl"` for Arabic). The store's name comes from `resolveStoreByHandle`; an unknown
 * or purged handle renders the same form with the handle as typed, and its post stores nothing (no handle oracle).
 * The page path is `?p=` kept as a same-host path without its query.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("report.meta"), robots: { index: false, follow: false, nocache: true }, referrer: "same-origin" };
}

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const HANDLE_RE = /^[a-z0-9-]{1,63}$/;

export default async function ReportPage({ params, searchParams }: Props) {
  const [{ handle: raw }, sp, viewer] = await Promise.all([params, searchParams, getSignedInUser()]);
  const locale = await viewerLocale(viewer);
  const t = translator(locale);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // a malformed escape: kept as typed (the post stores nothing for an unknown handle)
  }
  const handle = decoded.trim().toLowerCase().slice(0, 63);
  const valid = HANDLE_RE.test(handle);
  const store = valid ? await resolveStoreByHandle(handle).catch(() => null) : null;
  const name = store && store.status !== "purged" ? store.name : null;
  const p = Array.isArray(sp.p) ? sp.p[0] : sp.p;
  const [widget, nonce] = await Promise.all([platformTurnstileKeys(), getCspNonce()]);
  return (
    <>
      <AuthHeading title={t("report.title", { store: name ?? `@${valid ? handle : "…"}` })}>
        {name && (
          <bdi dir="ltr" className="mb-1 block font-medium text-foreground">
            @{handle}
          </bdi>
        )}
        {t("report.lead")}
      </AuthHeading>
      <ReportForm handle={handle} reasons={ABUSE_REASONS} path={sameHostPath(p)} locale={locale} siteKey={widget?.siteKey ?? null} nonce={nonce} />
    </>
  );
}
