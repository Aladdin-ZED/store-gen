"use client";
/**
 * Console → AI, Settings (P7 AI; ai.md AI-§K.2 Settings, AI-§B.1, AI R6, D40; docs/STORE-SAAS.md §B.7): Cloud AI on /
 * off (refused without a key and a cap), the API key (where it comes from, "Set API key" in a focus-trapped sheet
 * with a password field: sent once, sealed into platform_ai_secret, never shown again; Remove key; both step-up),
 * Test connection (a 1-token call: latency and the model's display name), the monthly cap (step-up), the daily,
 * Director and pending shares, transport, cache TTL, fallbacks, the pattern library, and the read-only after() driver
 * line with the detached-job probe date and a link to Flags.
 */
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { removeAiKeyAction, saveAiCapAction, saveAiSettingsAction, setAiKeyAction, testAiConnectionAction } from "@/app/admin/(console)/ai/actions";
import type { loadConsoleSettings } from "@/lib/ai/platform/console-read";
import { consoleHref } from "@/lib/ai/platform/console-view";
import { t } from "@/lib/i18n/admin";
import { NumberField, SelectField, sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

const c = (k: string, v?: Record<string, string | number>) => t(k, v, "en");
type Data = Awaited<ReturnType<typeof loadConsoleSettings>>;

function Card({ id, title, children, meta }: { id?: string; title: string; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-20 rounded-xl border bg-card">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SettingsTab({ d }: { d: Data }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <EnableCard d={d} />
        <KeyCard d={d} />
        <CapCard d={d} />
      </div>
      <div className="space-y-4">
        <SharesCard d={d} />
        <RuntimeCard d={d} />
      </div>
    </div>
  );
}

function EnableCard({ d }: { d: Data }) {
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [on, setOn] = useState(d.enabled);
  return (
    <Card title={c("ai.console.settings.cloud")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="ai-enabled" className="text-sm font-medium">
            {c("ai.console.settings.enable")}
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">{c("ai.console.settings.enable_hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Spinner on={pending} />
          <Switch
            id="ai-enabled"
            checked={on}
            disabled={pending}
            onCheckedChange={(next) => {
              setOn(next);
              void run(
                () => saveAiSettingsAction({ enabled: next }),
                (r) => {
                  const s = sayOf(r, c("ai.console.saved"));
                  if (s?.tone === "error") setOn(!next);
                  setSaid(s);
                },
              );
            }}
          />
        </div>
      </div>
      <Status said={said} className="mt-2" />
      {sheet}
    </Card>
  );
}

function KeyCard({ d }: { d: Data }) {
  const id = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [test, setTest] = useState<string | null>(null);
  const source = d.keySource as "settings" | "env" | "none";
  return (
    <Card id="key" title={c("ai.console.settings.key")} meta={c(`ai.console.key_source.${source}`)}>
      <p className="text-sm">
        {source === "settings" ? c("ai.console.settings.key_settings", { at: d.keySetAt ? d.keySetAt.slice(0, 10) : "-" }) : source === "env" ? c("ai.console.settings.key_env") : c("ai.console.settings.key_none")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          {d.keySet ? c("ai.console.settings.key.replace") : c("ai.console.settings.key.set")}
        </Button>
        {d.keySet ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => removeAiKeyAction(), (r) => setSaid(sayOf(r, c("ai.console.settings.key.removed"))))}>
            {c("ai.console.settings.key.remove")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || source === "none"}
          onClick={() => {
            setTest(null);
            void run(
              () => testAiConnectionAction(),
              (r) => {
                if (r.ok && r.data.ok) setTest(c("ai.console.settings.test_ok", { ms: r.data.value.ms, name: r.data.value.displayName }));
                else setSaid(sayOf(r));
              },
            );
          }}
        >
          {c("ai.console.settings.test")}
        </Button>
        <Spinner on={pending} />
      </div>
      {test ? (
        <p role="status" className="mt-2 text-xs text-success-ink">
          {test}
        </p>
      ) : null}
      <Status said={said} className="mt-2" />
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setKey("");
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <form
            className="flex h-full flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              const value = key;
              void run(
                () => setAiKeyAction({ apiKey: value }),
                (r) => {
                  const s = sayOf(r, c("ai.console.settings.key.saved"));
                  setSaid(s);
                  if (s?.tone !== "error") {
                    setKey("");
                    setOpen(false);
                  }
                },
              );
            }}
          >
            <SheetHeader>
              <SheetTitle>{c("ai.console.settings.key.set")}</SheetTitle>
              <SheetDescription>{c("ai.console.settings.key.sheet")}</SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <label htmlFor={`${id}-key`} className="text-xs text-muted-foreground">
                {c("ai.console.settings.key.label")}
              </label>
              <input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-…"
              />
              <p className="mt-2 text-xs text-muted-foreground">{c("ai.console.settings.key.never")}</p>
              <Status said={said?.tone === "error" ? said : null} className="mt-2" />
            </div>
            <SheetFooter className="mt-auto">
              <Button type="submit" disabled={pending || !/^sk-ant-/.test(key)}>
                {c("ai.console.settings.key.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {sheet}
    </Card>
  );
}

function CapCard({ d }: { d: Data }) {
  const id = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState<number | "">(d.caps.monthlyUsd ?? "");
  return (
    <Card title={c("ai.console.settings.cap")} meta={c("ai.console.settings.step_up")}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => saveAiCapAction({ monthlyUsd: v === "" ? null : v }), (r) => setSaid(sayOf(r, c("ai.console.saved"))));
        }}
      >
        <div className="w-40">
          <NumberField id={id} label={c("ai.console.settings.cap_usd")} value={v} min={1} max={100_000} step={1} suffix="USD" placeholder={c("ai.console.settings.cap_none")} onChange={setV} />
        </div>
        <Button type="submit" size="sm" disabled={pending || v === (d.caps.monthlyUsd ?? "")}>
          {c("ai.console.save")}
        </Button>
        <Spinner on={pending} />
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{c("ai.console.settings.cap_hint")}</p>
      <Status said={said} className="mt-1" />
      {sheet}
    </Card>
  );
}

function SharesCard({ d }: { d: Data }) {
  const id = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState({ storeDailyCapPct: d.caps.storeDailyCapPct as number | "", directorSharePct: d.caps.directorSharePct as number | "", pendingSharePct: d.caps.pendingSharePct as number | "", pendingDailyFloor: d.caps.pendingDailyFloor as number | "" });
  const fields: [keyof typeof v, number, number, string, string][] = [
    ["storeDailyCapPct", 5, 100, "%", "25"],
    ["directorSharePct", 10, 100, "%", "60"],
    ["pendingSharePct", 1, 50, "%", "10"],
    ["pendingDailyFloor", 0, 50, c("ai.console.settings.credits"), "10"],
  ];
  return (
    <Card title={c("ai.console.settings.shares")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => saveAiSettingsAction(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]))), (r) => setSaid(sayOf(r, c("ai.console.saved"))));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([key, min, max, suffix, def]) => (
            <NumberField key={key} id={`${id}-${key}`} label={c(`ai.console.settings.${key}`)} value={v[key]} min={min} max={max} suffix={suffix} hint={c("ai.console.settings.default", { v: def })} onChange={(x) => setV({ ...v, [key]: x })} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {c("ai.console.save")}
          </Button>
          <Spinner on={pending} />
          <Status said={said} />
        </div>
      </form>
      {sheet}
    </Card>
  );
}

function RuntimeCard({ d }: { d: Data }) {
  const id = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState({ streamTransport: d.transport, cacheTtl: d.cacheTtl, fallbacks: d.fallbacks, patternLibrary: d.patternLibrary });
  return (
    <Card title={c("ai.console.settings.runtime")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => saveAiSettingsAction(v), (r) => setSaid(sayOf(r, c("ai.console.saved"))));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <SelectField id={`${id}-tr`} label={c("ai.console.settings.transport")} value={v.streamTransport} options={(["stream", "poll"] as const).map((x) => ({ value: x, label: c(`ai.console.transport.${x}`) }))} onChange={(x) => setV({ ...v, streamTransport: x })} />
          <SelectField id={`${id}-ttl`} label={c("ai.console.settings.cache_ttl")} value={v.cacheTtl} options={(["1h", "5m"] as const).map((x) => ({ value: x, label: x }))} onChange={(x) => setV({ ...v, cacheTtl: x })} />
          <SelectField id={`${id}-fb`} label={c("ai.console.settings.fallbacks")} value={v.fallbacks} options={(["default", "off"] as const).map((x) => ({ value: x, label: c(`ai.console.settings.fallbacks.${x}`) }))} onChange={(x) => setV({ ...v, fallbacks: x })} />
          <label className="flex min-h-9 items-center gap-2 self-end text-sm">
            <Switch checked={v.patternLibrary} onCheckedChange={(x) => setV({ ...v, patternLibrary: x })} />
            {c("ai.console.settings.patterns")}
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {c("ai.console.save")}
          </Button>
          <Spinner on={pending} />
          <Status said={said} />
        </div>
      </form>
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        {d.detached.probedAt
          ? c("ai.console.after_driver", { state: d.detached.flag ? c("ai.console.on") : c("ai.console.off"), date: d.detached.probedAt.slice(0, 10) })
          : c("ai.console.after_driver.unprobed", { state: d.detached.flag ? c("ai.console.on") : c("ai.console.off") })}{" "}
        <Link href={consoleHref.flags} className="text-foreground underline-offset-4 hover:underline">
          {c("ai.console.status.flags")}
        </Link>
      </p>
      {sheet}
    </Card>
  );
}
