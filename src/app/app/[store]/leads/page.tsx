import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { LocaleScope } from "@/components/admin/landing/locale-scope";
import { LeadsInbox } from "@/components/admin/leads/leads-inbox";
import { pageOptions } from "@/lib/admin-data/pages";
import { addDays, dayKey } from "@/lib/admin-data/time";
import { viewerLocale } from "@/lib/auth/locale";
import { leadCaptureOn } from "@/lib/landing/lead-capture";
import { getLeadRow, leadCities, leadCounts, listLeadRows } from "@/lib/leads/read";
import { LeadQuery } from "@/lib/leads/types";
import { getStoreSetting } from "@/lib/settings";
import { listMembersByScope } from "@/lib/tenancy/invites";
import { requireStoreMember } from "@/lib/tenancy/seam";
import {
  assignLeads,
  convertLead,
  getLead,
  logLeadAttempt,
  markLeadLost,
  reopenLeadAction,
  setLeadFollowUp,
  takeNextLead,
} from "./actions";

export const metadata: Metadata = { title: "Leads" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ store: string }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Leads (P3 LANDING; landing.md LAN-§10.3; core §I.1 `/app/<h>/leads`, `leads.read`): the abandoned order forms and
 * WhatsApp intents of the last 30 days, read through src/lib/leads/read.ts (masked by scope: phones always, names and
 * notes under "View as store"). An agent sees the leads assigned to them plus the unassigned new ones. The view and
 * the filters are the URL's (`view`, `page`, `city`, `assignee`, `kind`, `period`, `cursor`); `lead` opens one lead.
 */
export default async function LeadsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "leads.read" });
  const sp = await searchParams;
  const { scope, store } = ctx;
  const viewer = { userId: ctx.user.id, role: ctx.membership.role };
  const agent = viewer.role === "agent";
  const today = dayKey(new Date(), store.timezone);
  const period = one(sp.period);
  const query = LeadQuery.parse({
    view: one(sp.view) || undefined,
    pageId: one(sp.page) || undefined,
    city: one(sp.city) || undefined,
    // an agent's inbox is theirs: the assignee filter is a manager's
    assignee: agent ? undefined : one(sp.assignee) || undefined,
    kind: one(sp.kind) || undefined,
    from: period === "today" ? today : period === "7d" ? addDays(today, -6) : undefined,
    cursor: one(sp.cursor) || undefined,
    limit: 50,
  });
  const focusId = one(sp.lead);

  const [page, counts, pages, cities, team, landing, focus, locale] = await Promise.all([
    listLeadRows(scope, query, viewer),
    leadCounts(scope, viewer),
    pageOptions(scope),
    leadCities(scope, viewer),
    listMembersByScope(scope),
    getStoreSetting(scope, "landing"),
    focusId ? getLeadRow(scope, focusId, viewer) : Promise.resolve(null),
    viewerLocale(ctx.user),
  ]);
  const captureOn = leadCaptureOn(store.market, landing.leads.capture);
  const captureOff = captureOn ? null : landing.leads.capture === "off" ? "setting" : "market";

  return (
    <LocaleScope locale={locale}>
      <Screen wide>
        <LeadsInbox
          rows={page.rows}
          next={page.next ?? null}
          counts={counts}
          pages={pages.map((p) => ({ id: p.id, name: p.name }))}
          cities={cities}
          members={team.filter((m) => m.status === "active").map((m) => ({ id: m.userId, name: m.name, role: m.role }))}
          me={ctx.user.id}
          role={viewer.role}
          can={{
            write: ctx.can("leads.write"),
            contact: ctx.can("leads.write") && ctx.can("orders.reveal_phone"),
            assign: ctx.can("orders.assign"),
            convert: ctx.can("orders.create"),
            export: ctx.can("orders.export"),
          }}
          readOnly={!!ctx.impersonation}
          captureOff={captureOff}
          focus={focus}
          timeZone={store.timezone}
          renderedAt={new Date().toISOString()}
          actions={{
            get: getLead,
            attempt: logLeadAttempt,
            assign: assignLeads,
            takeNext: takeNextLead,
            lost: markLeadLost,
            reopen: reopenLeadAction,
            followUp: setLeadFollowUp,
            convert: convertLead,
          }}
        />
      </Screen>
    </LocaleScope>
  );
}
