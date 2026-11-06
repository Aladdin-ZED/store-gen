import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { E164 } from "@/components/admin/shell/action-inputs";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { dashboardLoaders, quotaGauges, reviewFacts, storeRowFacts } from "@/lib/admin-data/dashboard";
import { aiPolicyFor } from "@/lib/ai/router/server";
import { viewerLocale } from "@/lib/auth/locale";
import { getOwnProfile } from "@/lib/auth/profile";
import { t } from "@/lib/i18n/admin";
import { liveMediaUrl } from "@/lib/media/keys";
import { Market, PRODUCT_CATEGORIES, type Locale, type ProductCategory } from "@/lib/page/schema";
import { getStoreSetting, getStoreSettings } from "@/lib/settings";
import { MiB } from "@/lib/tenancy/entitlement-keys";
import { requireStoreMember } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { memberCtx } from "../member-ctx";
import { DoneStep } from "./_components/done-step";
import { initialView, maskSignupPhone, revealSeed } from "./_components/flow-logic";
import { WelcomeFlow } from "./_components/welcome-flow";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const PAGE_LOCALES: readonly Locale[] = ["ar", "fr", "en"];
/** The library thumbnail the strip shows: the smallest WebP rendition of at least 360 px, else the largest. */
const THUMB_MIN = 360;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  const locale = screenLocale(await viewerLocale(user), screenLocalesFor("/welcome"));
  // the `[store]` layout's `%s · <store>` template names the store
  return { title: t("onboarding.meta", undefined, locale) };
}

/** The draft's photos, the store's own files (another store's id reads as missing, §E.3 rule 5). */
async function draftPhotos(ctx: StoreCtx, ids: readonly string[]) {
  if (!ids.length) return [];
  const rows = await previewAssetsFor(ctx.scope, [], ids.map((id) => ({ id, alt: "" })));
  return ids.flatMap((id) => {
    const row = rows[id];
    if (!row) return [];
    const webp = row.variants.filter((v) => v.fmt === "webp").sort((a, b) => a.w - b.w);
    const thumb = webp.find((v) => v.w >= THUMB_MIN) ?? webp[webp.length - 1] ?? row.variants[row.variants.length - 1];
    return [{ id, thumbUrl: thumb ? liveMediaUrl(thumb.key) : null, width: row.width, height: row.height }];
  });
}

/** The media gauge the limit sheet shows for a quota answer: the plan's, under the pending store's cap (D69, PD68). */
async function mediaQuota(ctx: StoreCtx): Promise<{ used: number; limit: number } | null> {
  const [gauges, pending] = await Promise.all([quotaGauges(ctx.scope, ctx.store.timezone), ctx.store.status === "pending" ? reviewFacts(ctx.scope, { submitted: false, pages: false }) : Promise.resolve(null)]);
  const g = gauges.find((x) => x.metric === "media_bytes");
  if (!g) return null;
  const cap = pending ? pending.mediaMb * MiB : null;
  const limit = g.limit === null ? cap : cap === null ? g.limit : Math.min(g.limit, cap);
  return limit === null ? null : { used: g.used, limit };
}

/*
 * /app/<h>/welcome: the onboarding wow flow (platform.md PLA-§22.2, UX-01; core D59, §A.2). Full screen, no sidebar
 * (the frame's welcome bypass). The owner only: everyone else, and staff viewing the store, go to the dashboard. The
 * page resumes on the saved `onboarding.step`; `?step=` opens an earlier step that is still open (Back, a link). A
 * skipped flow is over. Works for a pending store and never publishes.
 */
export default async function WelcomePage({ params, searchParams }: Props) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "store.read" });
  const { store, user } = ctx;
  if (ctx.membership.role !== "owner" || ctx.impersonation) redirect(appHref(store.handle, ""));

  const onboarding = await getStoreSetting(ctx.scope, "onboarding", { fresh: true });
  const asked = (await searchParams).step;
  const view = initialView(onboarding.step, typeof asked === "string" ? asked : undefined, onboarding.pageId !== null);
  if (view === null) redirect(appHref(store.handle, ""));

  if (view === "done") {
    const locale = screenLocale(await viewerLocale(user), screenLocalesFor("/welcome"));
    return (
      <DoneStep
        view={{
          load: dashboardLoaders(ctx),
          scope: ctx.scope,
          store: { id: store.id, handle: store.handle, name: store.name, status: store.status },
          locale,
          viewer: { isOwner: true, pagesRead: ctx.can("pages.read"), pagesWrite: ctx.can("pages.write"), ordersWrite: ctx.can("orders.write") },
        }}
        pageId={onboarding.pageId}
        canPages={ctx.can("pages.write")}
        mode={store.mode}
      />
    );
  }

  const [photos, facts, settings, profile, quota, aiPolicy] = await Promise.all([
    draftPhotos(ctx, onboarding.draft.assetIds),
    storeRowFacts(ctx.scope),
    getStoreSettings(ctx.scope, ["defaults", "store"]),
    getOwnProfile({ user, actor: ctx.actor }),
    view === "photos" || view === "details" ? mediaQuota(ctx) : Promise.resolve(null),
    aiPolicyFor(ctx),
  ]);
  const preferred = settings.defaults.locales[0] ?? store.defaultLocale;
  const pageLocale = PAGE_LOCALES.find((l) => l === preferred) ?? "ar";
  const market = Market.safeParse(store.market);
  const phone = E164.safeParse(profile.phone ?? "");
  const suggested = (PRODUCT_CATEGORIES as readonly string[]).includes(facts.category ?? "") ? (facts.category as ProductCategory) : null;
  const { draft } = onboarding;

  return (
    <WelcomeFlow
      view={view}
      saved={onboarding.step}
      hasPage={onboarding.pageId !== null}
      revealed={onboarding.revealedAt !== null}
      draft={{ category: draft.category, productName: draft.productName, priceMinor: draft.priceMinor, compareAtMinor: draft.compareAtMinor, fact: draft.fact }}
      photos={photos}
      suggestedCategory={suggested}
      pageLocale={pageLocale}
      market={market.success ? market.data : "MA"}
      seedBase={revealSeed(store.brandSeed)}
      phoneMasked={phone.success ? maskSignupPhone(phone.data) : null}
      whatsapp={settings.store.whatsapp ?? null}
      mediaQuota={quota}
      aiPolicy={aiPolicy}
    />
  );
}
