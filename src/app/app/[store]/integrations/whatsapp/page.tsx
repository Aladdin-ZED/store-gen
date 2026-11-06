import { ArrowUpRightIcon, ClockIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { InlineError, LockedCard, ReadOnlyNote } from "@/components/admin/integrations/hub-states";
import { WhatsAppTemplates, type BuiltinTexts } from "@/components/admin/integrations/whatsapp-templates";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, translator } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { builtinTemplate, TEMPLATE_LOCALES, templateLocaleOf, WA_KIND_INFO, WA_KINDS_R1 } from "@/lib/integrations/whatsapp/builtins";
import { whatsappScreen } from "@/lib/integrations/whatsapp/screen.server";
import { requireStoreMember, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";

/**
 * Who opens the screen: `callcenter.configure` (owner, admin, manager; OD24), else the neutral 404 (core §I.1). "View
 * as store" opens it read-only, the preview's customer fields masked.
 */
async function templatesMember(handle: string): Promise<StoreCtx> {
  try {
    return await requireStoreMember({ handle, permission: "callcenter.configure", throwOnFail: true });
  } catch (err) {
    if (err instanceof SeamError && err.code === "impersonation_read_only") return requireStoreMember({ handle });
    return requireStoreMember({ handle, permission: "callcenter.configure" });
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("int.wae.page") };
}

/** The built-in texts of the kinds an R1 screen lists, in the three template languages (code constants, OD24). */
function builtinTexts(): BuiltinTexts {
  const out: BuiltinTexts = {};
  for (const kind of WA_KINDS_R1) {
    if (!WA_KIND_INFO[kind].builtin) continue;
    out[kind] = Object.fromEntries(TEMPLATE_LOCALES.map((l) => [l, builtinTemplate(kind, l)?.body ?? ""])) as BuiltinTexts[string];
  }
  return out;
}

/**
 * Connect → WhatsApp (operations.md OPE-§22.1-§22.3, OD24, OD63; IN-05): the store's confirmation number and calling
 * hours, the click-to-chat templates per kind and language with the live preview, and the quick replies.
 */
export default async function WhatsAppPage({ params }: { params: Promise<{ store: string }> }) {
  const ctx = await templatesMember((await params).store);
  const locale = await viewerLocale(ctx.user);
  const t = translator(locale);
  const impersonating = ctx.scope.kind === "impersonation";
  const canWrite = ctx.can("callcenter.configure") && !impersonating;
  const locked = ctx.store.status === "pending";
  const tplLocale = templateLocaleOf(ctx.store.defaultLocale || locale);
  const screen = locked ? null : await whatsappScreen(ctx.scope, { firstName: ctx.user.name || null, locale: tplLocale });
  const builtins = builtinTexts();
  const callcenter = appHref(ctx.store.handle, "/team/callcenter");

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen>
          <PageHeader title={t("int.wae.page")} description={t("int.wae.pageLead")} />
          {impersonating && <ReadOnlyNote text={t("int.wae.impersonation")} />}
          {!screen ? (
            <LockedCard />
          ) : (
            <div className="grid max-w-6xl gap-5">
              <section aria-label={t("int.wae.facts")} className="grid gap-3 sm:grid-cols-2">
                <div className="adm-surface-flat flex items-start gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/70">
                    <PhoneIcon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("int.wae.number")}</span>
                    {screen.confirmation === null ? (
                      <InlineError className="mt-1" />
                    ) : screen.confirmation.number ? (
                      <bdi dir="ltr" className="text-start font-mono text-sm font-medium tabular-nums">
                        {screen.confirmation.number}
                      </bdi>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("int.wae.number.none")}</span>
                    )}
                  </div>
                </div>
                <div className="adm-surface-flat flex items-start gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/70">
                    <ClockIcon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("int.wae.hours")}</span>
                    {screen.hours === null ? (
                      <InlineError className="mt-1" />
                    ) : !screen.hours.configured ? (
                      <span className="text-sm font-medium">{t("int.wae.hours.notSet")}</span>
                    ) : (
                      <bdi dir="ltr" className="text-start text-sm font-medium tabular-nums">
                        {screen.hours.text ?? t("int.wae.hours.set")}
                      </bdi>
                    )}
                    <Link href={callcenter} className="mt-1 inline-flex min-h-11 w-fit items-center gap-1 text-xs font-medium text-foreground/80 underline-offset-4 hover:underline sm:min-h-0">
                      {t(screen.hours && !screen.hours.configured ? "int.wae.hours.setLink" : "int.wae.hours.link")}
                      <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </section>
              <WhatsAppTemplates kinds={Object.keys(builtins)} builtins={builtins} rows={screen.rows} preview={screen.preview} canWrite={canWrite} defaultLocale={tplLocale} />
            </div>
          )}
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
