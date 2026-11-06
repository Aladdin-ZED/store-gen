"use client";
/**
 * The overview's System block (platform.md PLA-§5.5, PD57): the 5-minute job (on time < 6 min, late < 10 min, stopped),
 * the outbox, the render queue, the Worker, AI, the health engine, the media backend and the build. Every item is an
 * icon, a label and a sentence with its state (never a bare dot), and the block says when it was read. P8's machinery
 * (`getHealth()`) is "unavailable" until its track merges: the block then says so and shows the engine's own figures.
 *
 *   <SystemPanel data={await systemSummary(ctx)} at={…} canOpen={ctx.can("health.read")} />
 */
import { BotIcon, CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, ClockIcon, CpuIcon, HardDriveIcon, HeartPulseIcon, InboxIcon, LayersIcon, NetworkIcon, PackageIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { SystemSummary } from "@/lib/platform/overview";
import { cn } from "@/lib/utils";
import { durationText } from "../format";
import { ConsolePanel, PanelError } from "../panel";
import { useNow } from "../shell/context";
import { useConsolePulse } from "../shell/pulse-provider";
import { consoleUrl } from "@/lib/platform/console-url";

type State = "ok" | "warn" | "bad" | "none";

const STATE: Record<State, { icon: LucideIcon; tone: string }> = {
  ok: { icon: CheckCircle2Icon, tone: "text-[oklch(0.52_0.11_160)] dark:text-[oklch(0.78_0.11_160)]" },
  warn: { icon: CircleAlertIcon, tone: "text-[oklch(0.55_0.11_95)] dark:text-[oklch(0.84_0.11_95)]" },
  bad: { icon: CircleAlertIcon, tone: "text-[var(--c-danger-ink)]" },
  none: { icon: CircleDashedIcon, tone: "text-muted-foreground" },
};

function Item({ icon: Icon, label, state, children }: { icon: LucideIcon; label: string; state: State; children: ReactNode }) {
  const { icon: StateIcon, tone } = STATE[state];
  return (
    <li className="flex min-h-[calc(var(--row)+4px)] min-w-0 items-center gap-3 px-4 py-1">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 truncate text-[13px] text-muted-foreground">{label}</span>
      <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-[13px]", state === "bad" && "font-medium")}>
        <StateIcon aria-hidden="true" className={cn("size-3.5 shrink-0", tone)} />
        <span className="num min-w-0 truncate">{children}</span>
      </span>
    </li>
  );
}

export function SystemPanel({ data, at, canOpen }: { data: SystemSummary; at: string; canOpen: boolean }) {
  const t = useT();
  const build = useConsolePulse().pulse?.build ?? "dev";
  const now = useNow(30_000);
  const ago = (iso: string | null) => {
    if (!iso) return null;
    const d = durationText(now - Date.parse(iso));
    return d ? t("console.time.ago", { d }) : t("console.time.now");
  };
  const m = data.machine;
  const h = data.health;

  return (
    <ConsolePanel title={t("console.system.title")} at={at} action={canOpen ? { href: consoleUrl("/health"), label: t("console.system.open") } : null}>
      <ul className="py-1.5">
        {m.state === "ok" && (
          <>
            <Item icon={ClockIcon} label={t("console.system.tick")} state={m.data.tick === "ok" ? "ok" : m.data.tick === "late" ? "warn" : m.data.tick === "stopped" ? "bad" : "none"}>
              {m.data.tick === null
                ? t("console.system.tick.never")
                : t(`console.system.tick.${m.data.tick}`, { ago: ago(m.data.lastTickAt) ?? "" })}
            </Item>
            <Item icon={InboxIcon} label={t("console.system.outbox")} state={m.data.outbox.dead > 0 ? "bad" : "ok"}>
              {t("console.system.outbox_value", { pending: m.data.outbox.pending, dead: m.data.outbox.dead })}
            </Item>
            <Item icon={LayersIcon} label={t("console.system.renders")} state={m.data.renders.failed > 0 ? "bad" : (m.data.renders.oldestMin ?? 0) > 30 ? "warn" : "ok"}>
              {m.data.renders.oldestMin !== null && m.data.renders.pending > 0
                ? t("console.system.renders_oldest", { pending: m.data.renders.pending, failed: m.data.renders.failed, minutes: m.data.renders.oldestMin })
                : t("console.system.renders_value", { pending: m.data.renders.pending, failed: m.data.renders.failed })}
            </Item>
            <Item icon={NetworkIcon} label={t("console.system.worker")} state={m.data.edge.sMode ? (m.data.edge.workerVersion ? "ok" : "warn") : "none"}>
              {m.data.edge.sMode ? (m.data.edge.workerVersion ? t("console.system.worker_on", { version: m.data.edge.workerVersion }) : t("console.system.worker_on_unknown")) : t("console.system.worker_off")}
            </Item>
            {m.data.ai && (
              <Item icon={BotIcon} label={t("console.system.ai")} state={m.data.ai.state === "ok" ? "ok" : m.data.ai.state === "paused" ? "warn" : "none"}>
                {m.data.ai.state === "ok"
                  ? m.data.ai.capUsedPct !== null
                    ? t("console.system.ai.ok", { percent: Math.round(m.data.ai.capUsedPct) })
                    : t("console.system.ai.ok_nocap")
                  : t(`console.system.ai.${m.data.ai.state}`)}
              </Item>
            )}
            {m.data.mediaBackend && (
              <Item icon={HardDriveIcon} label={t("console.system.media")} state={m.data.mediaBackend === "db" ? "bad" : "ok"}>
                {t(m.data.mediaBackend === "db" ? "console.system.media.db" : "console.system.media.fs")}
              </Item>
            )}
          </>
        )}
        {m.state === "unavailable" && (
          <li className="flex items-start gap-3 px-4 py-2">
            <CpuIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[12px] text-muted-foreground text-pretty">{t("console.system.machine_unavailable")}</p>
          </li>
        )}
        {m.state === "error" && (
          <li>
            <PanelError reference={m.ref} compact />
          </li>
        )}

        {h.state === "ok" ? (
          <Item icon={HeartPulseIcon} label={t("console.system.health")} state={h.data.staleSnapshots > 0 ? "warn" : h.data.lastRunAt ? "ok" : "none"}>
            {h.data.lastRunAt
              ? t("console.system.health_value", { stale: h.data.staleSnapshots, dirty: h.data.dirtyRows, ago: ago(h.data.lastRunAt) ?? "" })
              : t("console.system.health_never", { dirty: h.data.dirtyRows })}
          </Item>
        ) : h.state === "error" ? (
          <li>
            <PanelError reference={h.ref} compact />
          </li>
        ) : null}

        <Item icon={PackageIcon} label={t("console.system.build")} state="none">
          <bdi dir="ltr" className="font-mono text-[12px]">
            {m.state === "ok" && m.data.build ? m.data.build.slice(0, 8) : build}
          </bdi>
        </Item>
      </ul>
    </ConsolePanel>
  );
}
