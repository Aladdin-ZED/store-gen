import type { Metadata } from "next";
import { AntiSpamPanel, type AntiSpamView } from "@/components/admin/integrations/anti-spam-panel";
import { ReadOnlyNote } from "@/components/admin/integrations/hub-states";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, translator } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { protectionSource, turnstileStats } from "@/lib/integrations/turnstile-stats";
import { UNPROTECTED_MIN_SCORE } from "@/lib/orders/risk";
import { getStoreSetting } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("int.as.title") };
}

type Params = Promise<{ store: string }>;

const settled = <T,>(r: PromiseSettledResult<T>): T | "error" => (r.status === "fulfilled" ? r.value : "error");

/**
 * Settings → Anti-spam (operations.md OPE-§24, IN-06; P5 [Q.17]): read under `settings.read`; the store's own keys are
 * edited with `settings.write` + `integrations.manage` (saveTurnstileOverrideAction). The platform's widget on the
 * apex hostname protects every store subdomain; the store's own pair is only for a custom domain (R3). The secret
 * never leaves the server: the page only learns whether one is set. Each block loads on its own.
 */
export default async function AntiSpamSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const locale = await viewerLocale(ctx.user);
  const t = translator(locale);
  const impersonating = ctx.scope.kind === "impersonation";
  const pending = ctx.store.status === "pending";
  const allowed = ctx.can("settings.write") && ctx.can("integrations.manage");
  const canWrite = allowed && !impersonating && !pending;
  const readOnlyReason = canWrite ? null : impersonating ? null : pending ? t("int.hub.locked.body") : t("int.as.keys.readOnly");

  const [source, share, own] = await Promise.allSettled([protectionSource(ctx.scope), turnstileStats(ctx.scope), getStoreSetting(ctx.scope, "turnstile", { fresh: true })]);
  const ownKeys = settled(own);
  const view: AntiSpamView = {
    source: settled(source),
    share: settled(share),
    // set / not set only: the secret is write-only, the site key is public (it is in every page's HTML)
    keys: ownKeys === "error" ? "error" : { siteKey: ownKeys.siteKey && ownKeys.secretKey ? ownKeys.siteKey : null, secretSet: !!ownKeys.secretKey },
    unprotectedScore: UNPROTECTED_MIN_SCORE,
  };

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="grid min-w-0 gap-5">
        <header className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-[-0.015em]">{t("int.as.title")}</h2>
          <p className="max-w-[64ch] text-sm text-pretty text-muted-foreground">{t("int.as.lead")}</p>
        </header>
        {impersonating && <ReadOnlyNote text={t("int.as.impersonation")} />}
        <AntiSpamPanel view={view} canWrite={canWrite} readOnlyReason={readOnlyReason} />
      </div>
    </AdminI18nProvider>
  );
}
