import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import "@/components/admin/styles/admin.css";
import { LocaleRoot } from "@/components/admin/common/screen-locale";
import { statePage } from "@/components/admin/shell/banner-priority";
import type { PaletteIndex } from "@/components/admin/shell/command-palette";
import type { LegalSheetDoc } from "@/components/admin/shell/legal-sheet";
import type { StatePageProps } from "@/components/admin/shell/state-page";
import type { BannerFacts } from "@/components/admin/shell/store-banner";
import { StepUpProvider } from "@/components/admin/shell/step-up";
import { StoreProvider } from "@/components/admin/shell/store-context";
import { StoreFrame } from "@/components/admin/shell/store-frame";
import { StoreHandleMeta } from "@/components/admin/shell/store-handle";
import type { SwitcherStore } from "@/components/admin/shell/store-switcher";
import { storePulse } from "@/app/api/app/[store]/pulse/load";
import { membersWithout2faCount, paletteIndex, quotaGauges, reviewState, storeLifecycleDates } from "@/lib/admin-data/dashboard";
import { describeUserAgent } from "@/lib/admin-data/security";
import { storeClientInfo, switcherMemberships } from "@/lib/admin-data/shell";
import { buckets, peekBucket } from "@/lib/auth/attempts";
import { isUsableMembership, storeHomePath } from "@/lib/auth/landing";
import { viewerLocale } from "@/lib/auth/locale";
import { logError } from "@/lib/orders/log";
import { pendingReacceptance } from "@/lib/platform/legal";
import { getPlatformSetting } from "@/lib/settings";
import type { StoreCtx } from "@/lib/tenancy/types";
import { consoleHref } from "@/lib/urls";
import { memberCtx } from "./member-ctx";

type Props = { children: ReactNode; params: Promise<{ store: string }> };

/** `p:store:create:<userId>` allows 3 new stores a day (§B.1, as `/app`'s picker): "Create a store" hides at the limit. */
const STORES_PER_DAY = 3;

/** The store's name in the tab title, after the seam (a refusal answers before any title: sign-in or the neutral 404, LND-24). */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { store: handle } = await params;
  const { name } = (await memberCtx(handle)).store;
  return {
    title: { template: `%s · ${name}`, default: name },
    robots: { index: false, follow: false, nocache: true },
    // same-origin (as the admin's): a no-referrer page sends `Origin: null` on form POSTs
    referrer: "same-origin",
  };
}

/** A read the chrome can live without: logged, then the quiet fallback (never a made-up value). */
function settle<T>(where: string, p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((err: unknown) => {
    logError(`app/layout:${where}`, err);
    return fallback;
  });
}

/** The banners' facts after the first paint: the dates, the owner's members without 2FA, the gauges. */
async function bannerFacts(ctx: StoreCtx): Promise<BannerFacts | null> {
  const owner = ctx.membership.role === "owner";
  const [dates, without2fa, quota] = await Promise.all([
    storeLifecycleDates(ctx.scope),
    owner && ctx.store.requireMember2fa ? settle("2fa", membersWithout2faCount(ctx.scope), null) : Promise.resolve(null),
    ctx.can("settings.read") ? settle("quota", quotaGauges(ctx.scope, ctx.store.timezone), []) : Promise.resolve([]),
  ]);
  return { ...dates, membersWithout2fa: without2fa, quota };
}

/*
 * /app/<handle>/…: one store's dashboard (docs/STORE-SAAS.md §I.1, §I.4; platform.md PLA-§22.3-§22.9, §10.2, §20.1).
 * The seam resolves the member (signed out → the sign-in page; no store, no membership, a closed door → the neutral
 * 404) and the shell gets the store's context: grants, links, the switcher, the step-up sheet (§B.7). A layout never
 * replaces the checks of its pages and actions (AUTH-31): each page calls requireStoreMember with its own permission,
 * each action storeAction, each route storeGuard. The theme, tooltips and toasts come from `src/app/app/layout.tsx`.
 *
 * The first paint needs the store row, the memberships and the first pulse body (the same read as GET
 * /api/app/<h>/pulse, so the poller starts from it and its first answer is a 304). What the chrome can show a moment
 * later streams as promises: the banners' facts, the legal documents to accept, the "Create a store" allowance and
 * ⌘K's local index. A store whose state replaces its screens (closed for non-admins, scheduled deletion, rejected)
 * renders that state page inside the chrome.
 *
 * Language (§I.5, D36, UX-08): the chrome renders in the viewer's language and direction (`users.locale`); each screen
 * renders in that language only when it is translated, else in English left to right (`StoreFrame`'s `ScreenLocale`).
 */
export default async function StoreLayout({ children, params }: Props) {
  const { store: handle } = await params;
  const ctx = await memberCtx(handle);
  const viewing = !!ctx.impersonation || !!ctx.membership.synthetic;
  const [jar, hdrs, memberships, pulse, locale, platform] = await Promise.all([
    cookies(),
    headers(),
    switcherMemberships(ctx.user.id),
    // the first paint's pulse (D57): the poller starts from its ETag
    settle("pulse", storePulse(ctx), null),
    viewerLocale(ctx.user),
    settle("platform", getPlatformSetting("platform"), null),
  ]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  const support = platform?.brand ?? null;

  // the state page that replaces the screens (PLA-§22.8), with what it says
  const page = statePage(ctx.store.status, ctx.membership.role);
  let state: StatePageProps | null = null;
  if (page) {
    const [dates, review] = await Promise.all([
      page === "deletion" ? settle("dates", storeLifecycleDates(ctx.scope), { closedAt: null, purgeAfter: null }) : Promise.resolve(null),
      page === "rejected" ? settle("review", reviewState(ctx.scope), null) : Promise.resolve(null),
    ]);
    state = { page, date: dates?.purgeAfter ?? null, rejectReason: review?.rejectReason ?? null, appealsLeft: review?.appealsLeft ?? 0, supportWhatsapp: support?.supportWhatsapp ?? null };
  }

  const stores: SwitcherStore[] | null = memberships
    ? memberships.map((m) => ({
        storeId: m.storeId,
        handle: m.handle,
        name: m.name,
        role: m.role,
        status: m.status,
        storeStatus: m.storeStatus,
        mode: m.mode,
        usable: isUsableMembership(m),
        href: storeHomePath(m),
      }))
    : null;

  // streamed after the first paint
  const facts = settle("banner", bannerFacts(ctx), null);
  const legal: Promise<LegalSheetDoc[] | null> | null = viewing ? null : settle("legal", pendingReacceptance(ctx.user.id).then((r) => r?.docs ?? null), null);
  const canCreate = viewing ? Promise.resolve(false) : settle("create", peekBucket(buckets.storeCreate(ctx.user.id)).then((n) => n < STORES_PER_DAY), false);
  const index: Promise<PaletteIndex | null> = settle("palette", paletteIndex(ctx.scope, { pages: ctx.can("pages.read"), members: ctx.can("members.read") }), null);

  return (
    <LocaleRoot locale={locale}>
      {/* the media, framing and upload clients call this store's /api/app/<handle>/… */}
      <StoreHandleMeta handle={ctx.store.handle} />
      <StoreProvider value={storeClientInfo(ctx)}>
        <StepUpProvider totp={ctx.user.totpEnabled}>
          <StoreFrame
            user={{ name: ctx.user.name, email: ctx.user.email, totpEnabled: ctx.user.totpEnabled }}
            switcher={{ stores, platformRole: ctx.user.platformRole, consoleHref: ctx.user.platformRole !== "none" ? consoleHref() : null, canCreate }}
            pulse={pulse ? { body: pulse.body, etag: pulse.etag } : null}
            ribbon={
              ctx.impersonation
                ? {
                    storeId: ctx.store.id,
                    storeName: ctx.store.name,
                    expiresAt: ctx.impersonation.expiresAt.toISOString(),
                    serverNow: new Date().toISOString(),
                    reason: ctx.impersonation.reason,
                    profileHref: consoleHref(`/stores/${ctx.store.id}`),
                  }
                : null
            }
            banner={{
              firstPaint: { status: pulse?.body.store.status ?? ctx.store.status, statusReason: pulse?.body.store.statusReason ?? null, kill: pulse?.body.kill ?? [] },
              facts,
            }}
            statePage={state}
            legal={legal}
            help={{ whatsapp: support?.supportWhatsapp ?? null, hours: support?.supportHours ?? null, device: describeUserAgent(hdrs.get("user-agent")) }}
            paletteIndex={index}
            sidebarOpen={sidebarOpen}
          >
            {children}
          </StoreFrame>
        </StepUpProvider>
      </StoreProvider>
    </LocaleRoot>
  );
}
