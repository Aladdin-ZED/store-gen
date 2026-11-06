import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { InlineError, LockedCard, ReadOnlyNote } from "@/components/admin/integrations/hub-states";
import { PixelLibrary } from "@/components/admin/pixels/pixel-library";
import { ServerEventsCard } from "@/components/admin/pixels/server-events-card";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, translator } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { pixelLibraryView } from "@/lib/pixels/library.server";
import { serverEventsView, type ServerEventsView } from "@/lib/pixels/server-events";
import { requireStoreMember, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("int.px.page.title") };
}

type Params = Promise<{ store: string }>;

/**
 * Who opens the page: `pixels.manage` (the library, health, usage and test windows are the owners' and admins', §I.1),
 * else the neutral 404. "View as store" opens it read-only (every write hidden, with its one-line reason).
 */
async function pixelsMember(handle: string): Promise<StoreCtx> {
  try {
    return await requireStoreMember({ handle, permission: "pixels.manage", throwOnFail: true });
  } catch (err) {
    if (err instanceof SeamError && err.code === "impersonation_read_only") return requireStoreMember({ handle });
    return requireStoreMember({ handle, permission: "pixels.manage" });
  }
}

/** The request's instant, for the relative times the client then keeps fresh (a module function: render stays pure). */
const requestTime = () => Date.now();

/**
 * Connect → Pixels: the store's pixel library (pages own their pixels; docs/OFFERS.md §A.4), then the **Server events**
 * card at #server-events (operations.md OPE-§20.7: the Purchase trigger, custom events, manual orders, per-page
 * overrides, last result per pixel), shown to `integrations.manage`. A pending store sees the locked card in its place.
 * The builder's and the generator's pixel pickers read the library through their own `pages.read` action.
 */
export default async function PixelsPage({ params }: { params: Params }) {
  const ctx = await pixelsMember((await params).store);
  const locale = await viewerLocale(ctx.user);
  const t = translator(locale);
  const impersonating = ctx.scope.kind === "impersonation";
  const manage = ctx.can("integrations.manage");
  // tokens leave the server only as masks (••••3f9a), and only for members who manage integrations
  const view = await pixelLibraryView(ctx.scope, { canCreate: ctx.can("pixels.manage") && !impersonating, canSeeTokens: manage && !impersonating, fresh: true });
  const showCard = manage || impersonating;
  const locked = ctx.store.status === "pending";
  let events: ServerEventsView | "error" | null = null;
  if (showCard && !locked) events = await serverEventsView(ctx.scope, view.pixels).catch(() => "error" as const);
  const now = requestTime();

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen>
          <PageHeader title={t("int.px.page.title")} description={t("int.px.page.lead")} />
          {impersonating && <ReadOnlyNote text={t("int.px.impersonation")} />}
          <div className="grid gap-6">
            <div id="pixel-library" className="scroll-mt-24">
              <PixelLibrary initial={view} canPages={ctx.can("pages.write") && !impersonating} canPublish={ctx.can("pages.publish") && !impersonating} />
            </div>
            {showCard &&
              (locked ? (
                <LockedCard />
              ) : events === "error" || events === null ? (
                <InlineError />
              ) : (
                <ServerEventsCard view={events} canWrite={manage && !impersonating} now={now} />
              ))}
          </div>
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
