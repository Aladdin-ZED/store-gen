"use client";
/**
 * `/app/<h>/team/agents` (P4 CALL CENTER; operations.md OPE-§14.2, OD17, OD54, OPS-23; core §I.8).
 *
 *   header   "Agents: 2 of 10": members whose role is `agent` against the plan (owners and managers who take calls
 *            carry their role chip and never count)
 *   rows     name + role chip, presence as text + icon, daily cap, weight, 7 and 28-day decided and confirmation
 *            rate with n ("needs 20" below the agent minimum), first-call p50, the mapped sheet labels as chips
 *            (× unmaps, callcenter.configure); a row opens the agent page
 *   sheet    the profile: daily cap (empty = none) and weight 1-5 (callcenter.configure)
 */
import "../queue/queue.css";
import { ChevronRightIcon, CircleDotIcon, CoffeeIcon, Loader2Icon, MoonIcon, PencilIcon, UserPlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { unmapAgentLabelAction, updateAgentProfileAction } from "@/app/app/[store]/team/agents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentListRow } from "@/lib/callcenter/agents.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { Kpi } from "@/lib/orders/profile";
import { cn } from "@/lib/utils";
import { settle } from "../orders/ops-ui";
import { EmptyTable } from "../queue/empty-table";
import { QSheet } from "../queue/sheet";
import { num, pct } from "../queue/time";

export function AgentsView({ agents, gauge, canConfigure, hrefs }: { agents: AgentListRow[]; gauge: { used: number; limit: number | null }; canConfigure: boolean; hrefs: { agents: string; team: string } }) {
  const t = useT();
  const locale = useAdminLocale();
  const [edit, setEdit] = useState<AgentListRow | null>(null);
  return (
    <div className="grid gap-4">
      <p className="q-sm q-num text-muted-foreground">
        {gauge.limit === null ? t("ops.agents.gaugeOpen", { used: num(gauge.used, locale) }) : t("ops.agents.gauge", { used: num(gauge.used, locale), limit: num(gauge.limit, locale) })}
      </p>
      {agents.length === 0 ? (
        <EmptyTable
          cols={6}
          text={t("ops.agents.empty")}
          action={
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={hrefs.team}>
                <UserPlusIcon className="size-4" aria-hidden="true" />
                {t("ops.board.invite")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-border bg-card">
          <table className="hidden w-full text-sm lg:table">
            <thead>
              <tr className="q-2xs border-b border-border text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                <th>{t("ops.board.col.agent")}</th>
                <th>{t("ops.agents.col.profile")}</th>
                <th className="!text-end">{t("ops.agents.col.decided7")}</th>
                <th>{t("ops.agents.col.rate7")}</th>
                <th>{t("ops.agents.col.rate28")}</th>
                <th>{t("ops.board.col.first_touch")}</th>
                <th>{t("ops.agents.col.labels")}</th>
                <th className="w-0" />
              </tr>
            </thead>
            <tbody className="q-num">
              {agents.map((a) => (
                <tr key={a.userId} className="group border-b border-border/70 transition-colors last:border-0 hover:bg-foreground/[0.025] [&>td]:px-3 [&>td]:py-3">
                  <td>
                    <Link href={`${hrefs.agents}/${a.userId}`} className="grid gap-0.5">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {a.name}
                        <RoleChip role={a.role} />
                      </span>
                      <Presence a={a} />
                    </Link>
                  </td>
                  <td className="q-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {a.dailyCap === null ? t("ops.board.cap.none") : t("ops.agents.cap", { cap: num(a.dailyCap, locale) })} · {t("ops.agents.weight", { weight: a.weight })}
                      {canConfigure && (
                        <button type="button" onClick={() => setEdit(a)} aria-label={t("ops.agents.edit", { name: a.name })} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
                          <PencilIcon className="size-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="text-end">{num(a.d7.decided, locale)}</td>
                  <td className="q-xs whitespace-nowrap">
                    <KpiText k={a.d7.confirmationRate} fmt={(v) => pct(v, locale)} />
                  </td>
                  <td className="q-xs whitespace-nowrap">
                    <KpiText k={a.d28.confirmationRate} fmt={(v) => pct(v, locale)} />
                  </td>
                  <td className="q-xs whitespace-nowrap">
                    <KpiText k={a.d28.firstTouchP50Min} fmt={(v) => t("ops.me.min", { v: num(Math.round(v), locale) })} />
                  </td>
                  <td>
                    <Labels labels={a.labels} canEdit={canConfigure} />
                  </td>
                  <td>
                    <Link href={`${hrefs.agents}/${a.userId}`} aria-label={a.name} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
                      <ChevronRightIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-border lg:hidden">
            {agents.map((a) => (
              <li key={a.userId} className="grid gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`${hrefs.agents}/${a.userId}`} className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                    <span className="truncate">{a.name}</span>
                    <RoleChip role={a.role} />
                  </Link>
                  <Presence a={a} />
                </div>
                <p className="q-xs q-num text-muted-foreground">
                  {t("ops.agents.phoneLine", { decided: num(a.d7.decided, locale) })} · <KpiText k={a.d7.confirmationRate} fmt={(v) => pct(v, locale)} />
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Labels labels={a.labels} canEdit={canConfigure} />
                  {canConfigure && (
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setEdit(a)}>
                      <PencilIcon className="size-3" aria-hidden="true" />
                      {a.dailyCap === null ? t("ops.board.cap.none") : t("ops.agents.cap", { cap: num(a.dailyCap, locale) })} · {t("ops.agents.weight", { weight: a.weight })}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ProfileSheet agent={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

export function RoleChip({ role }: { role: string }) {
  const t = useT();
  if (role === "agent") return null;
  return <span className="q-2xs rounded-full px-2 py-0.5 font-medium text-muted-foreground ring-1 ring-border ring-inset">{t(`ops.agents.role.${role === "owner" || role === "admin" || role === "manager" ? role : "other"}`)}</span>;
}

function Presence({ a }: { a: Pick<AgentListRow, "presence" | "live"> }) {
  const t = useT();
  const p = a.presence === "online" && !a.live ? "offline" : a.presence;
  const Icon = p === "online" ? CircleDotIcon : p === "break" ? CoffeeIcon : MoonIcon;
  return (
    <span className={cn("q-xs inline-flex items-center gap-1.5 whitespace-nowrap", p === "online" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden="true" />
      {t(`ops.board.agent.presence.${p}`)}
    </span>
  );
}

function KpiText({ k, fmt }: { k: Kpi; fmt: (v: number) => string }) {
  const t = useT();
  const locale = useAdminLocale();
  if (!("value" in k)) return <span className="text-muted-foreground">{t("ops.counter.needs", { min: k.min })}</span>;
  return (
    <span>
      <bdi dir="ltr" className="font-medium text-foreground">
        {fmt(k.value)}
      </bdi>{" "}
      <span className="text-muted-foreground">· {t("ops.counter.n", { n: num(k.n, locale) })}</span>
    </span>
  );
}

function Labels({ labels, canEdit }: { labels: string[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!labels.length) return <span className="q-xs text-muted-foreground">–</span>;
  const unmap = async (label: string) => {
    setBusy(label);
    const res = await settle(unmapAgentLabelAction(label));
    setBusy(null);
    if (!res.ok) toast.error(t("ops.error.generic"));
    else router.refresh();
  };
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className="q-2xs inline-flex h-6 items-center gap-1 rounded-full bg-foreground/[0.05] ps-2.5 pe-1 font-medium text-foreground/80" title={t("ops.agents.labelHint")}>
          <bdi>{l}</bdi>
          {canEdit ? (
            <button type="button" aria-label={t("ops.agents.unmap", { label: l })} disabled={busy === l} onClick={() => void unmap(l)} className="grid size-4 place-items-center rounded-full hover:bg-foreground/[0.1]">
              {busy === l ? <Loader2Icon className="size-2.5 animate-spin" aria-hidden="true" /> : <XIcon className="size-2.5" aria-hidden="true" />}
            </button>
          ) : (
            <span className="w-1" />
          )}
        </span>
      ))}
    </span>
  );
}

function ProfileSheet({ agent, onClose }: { agent: AgentListRow | null; onClose: () => void }) {
  const t = useT();
  return (
    <QSheet open={agent !== null} onOpenChange={(o) => !o && onClose()} title={agent ? t("ops.agents.profile", { name: agent.name }) : ""} description={t("ops.agents.profileHint")}>
      {agent && <ProfileForm key={agent.userId} agent={agent} onClose={onClose} />}
    </QSheet>
  );
}

function ProfileForm({ agent, onClose }: { agent: AgentListRow; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [cap, setCap] = useState(agent.dailyCap === null ? "" : String(agent.dailyCap));
  const [weight, setWeight] = useState(agent.weight);
  const [saving, setSaving] = useState(false);
  const capNum = cap.trim() === "" ? null : Number(cap);
  const capOk = capNum === null || (Number.isInteger(capNum) && capNum >= 1 && capNum <= 1_000);
  const save = async () => {
    if (!capOk) return;
    setSaving(true);
    const res = await settle(updateAgentProfileAction(agent.userId, { dailyCap: capNum, weight }));
    setSaving(false);
    if (!res.ok) {
      toast.error(t("ops.error.generic"));
      return;
    }
    toast.success(t("ops.saved"));
    onClose();
    router.refresh();
  };
  return (
    <form
      className="grid gap-5 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="agent-cap">{t("ops.agents.capLabel")}</Label>
        <Input id="agent-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder={t("ops.board.cap.none")} aria-invalid={!capOk} className="h-11" />
        <p className={cn("q-xs", capOk ? "text-muted-foreground" : "text-destructive")}>{capOk ? t("ops.agents.capHint") : t("ops.agents.capInvalid")}</p>
      </div>
      <div className="grid gap-1.5">
        <span id="agent-weight" className="text-sm font-medium">
          {t("ops.agents.weightLabel")}
        </span>
        <div role="radiogroup" aria-labelledby="agent-weight" className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={weight === w}
              onClick={() => setWeight(w)}
              className={cn("h-11 rounded-xl text-sm font-medium tabular-nums ring-1 transition-colors ring-inset", weight === w ? "bg-foreground text-background ring-foreground" : "ring-border hover:bg-foreground/[0.04]")}
            >
              {w}
            </button>
          ))}
        </div>
        <p className="q-xs text-muted-foreground">{t("ops.agents.weightHint")}</p>
      </div>
      <Button type="submit" className="h-11" disabled={saving || !capOk}>
        {saving && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
        {t("ops.drawer.save")}
      </Button>
    </form>
  );
}
