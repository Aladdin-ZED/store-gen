import type { Metadata } from "next";
import { AgentConsole } from "@/components/admin/queue/agent-console";
import { viewerLocale } from "@/lib/auth/locale";
import { consoleBoot, type ConsoleReadOnly } from "@/lib/callcenter/console.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.queue.title", undefined, await viewerLocale(null)) };
}

/**
 * `/app/<h>/queue` (P4 CALL CENTER; operations.md OPE-§13, §M.1: `agents.self`): the agent console, where an agent
 * lands after sign-in (core §B.4). The server hands the client its first state (presence, the calling window, my
 * callbacks, today's counters, a held claim) and the client talks to the hot path from there. Translated (ar / fr / en,
 * OD34) from the account's language inside the English shell (§I.5).
 *
 * A member without `agents.self` gets the neutral 404. View as store and a read-only store keep the screen with its
 * banner and no outcome (OPE-§13.4): the seam refuses `agents.self` to both with `impersonation_read_only` /
 * `read_only`, so the page then reads with `store.read` and renders read-only. `?next=1` (⌘K "Next order") claims at once.
 */
export default async function QueuePage({ params, searchParams }: Props) {
  const { store: handle } = await params;
  const { ctx, readOnly } = await queueMember(handle);
  const locale = await viewerLocale(ctx.user);
  const boot = await consoleBoot(ctx, locale, readOnly);
  const sp = await searchParams;
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <h1 className="sr-only">{t("ops.queue.title", undefined, locale)}</h1>
        <AgentConsole boot={boot} autoNext={sp.next === "1"} />
      </div>
    </AdminI18nProvider>
  );
}

/** `agents.self`, or the read-only view of a member the seam refuses for impersonation or the store's state. */
async function queueMember(handle: string): Promise<{ ctx: StoreCtx; readOnly: ConsoleReadOnly }> {
  try {
    return { ctx: await requireStoreMember({ handle, permission: "agents.self", throwOnFail: true }), readOnly: null };
  } catch (err) {
    if (err instanceof SeamError && (err.code === "impersonation_read_only" || err.code === "read_only")) {
      const ctx = await requireStoreMember({ handle, permission: "store.read" });
      return { ctx, readOnly: err.code === "impersonation_read_only" ? "impersonation" : "store" };
    }
    // every other refusal: the seam's own answer for pages (sign-in, the 2FA step, the neutral 404)
    return { ctx: await requireStoreMember({ handle, permission: "agents.self" }), readOnly: null };
  }
}
