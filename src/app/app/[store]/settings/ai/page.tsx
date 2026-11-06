/**
 * `/app/<h>/settings/ai`: Settings → AI (P7 AI; ai.md AI-§K.1, AI-§K.5, AI-§E.6; core §I.8). Readable with
 * `settings.read`; every write is a server action under `ai.manage` (./actions.ts). The page streams: the skeleton per
 * section first, then the view from `loadAiSettings` (the policy, store_usage, ai_runs metadata, the explicit memory;
 * no customer field). "View as store" renders it read-only with no AI action.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { AiSettings } from "@/components/admin/ai/settings/ai-settings";
import { AiSettingsSkeleton } from "@/components/admin/ai/settings/skeleton";
import { loadAiSettings } from "@/lib/ai/settings/load.server";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";

export const metadata: Metadata = { title: "AI" };

type Params = Promise<{ store: string }>;

async function Body({ ctx }: { ctx: StoreCtx }) {
  return <AiSettings view={await loadAiSettings(ctx)} />;
}

export default async function AiSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const locale = await viewerLocale(ctx.user);
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Suspense fallback={<AiSettingsSkeleton />}>
          <Body ctx={ctx} />
        </Suspense>
      </div>
    </AdminI18nProvider>
  );
}
