"use client";
/**
 * Per-page Purchase triggers (operations.md OPE-§20.7, §20.2: page → trigger, ≤ 200; add / remove). A page listed here
 * uses its own trigger instead of the store's; the list only edits the draft, the card's Save sends it.
 */
import { PlusIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n/admin/client";
import { OVERRIDES_MAX, type PurchaseTrigger, type ServerEventsPage } from "@/lib/pixels/server-events-shared";
import { InlineError } from "../integrations/hub-states";
import { TRIGGER_ORDER } from "./trigger-cards";

export function PageOverrides({
  overrides,
  pages,
  storeTrigger,
  onChange,
  disabled,
}: {
  overrides: Record<string, PurchaseTrigger>;
  pages: ServerEventsPage[] | "error";
  storeTrigger: PurchaseTrigger;
  onChange: (next: Record<string, PurchaseTrigger>) => void;
  disabled: boolean;
}) {
  const t = useT();
  const [pick, setPick] = useState<string>("");
  const ids = Object.keys(overrides);
  const byId = useMemo(() => new Map(pages === "error" ? [] : pages.map((p) => [p.id, p] as const)), [pages]);
  const free = pages === "error" ? [] : pages.filter((p) => !(p.id in overrides));
  const full = ids.length >= OVERRIDES_MAX;

  function add() {
    if (!pick || full) return;
    // a new row starts on the first trigger that differs from the store's: an override equal to it changes nothing
    const first = TRIGGER_ORDER.find((k) => k !== storeTrigger) ?? "confirmed";
    onChange({ ...overrides, [pick]: first });
    setPick("");
  }

  function remove(id: string) {
    const next = { ...overrides };
    delete next[id];
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-sm font-medium">{t("int.px.overrides.title")}</p>
        <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("int.px.overrides.help", { n: ids.length, max: OVERRIDES_MAX })}</p>
      </div>

      {pages === "error" ? (
        <InlineError />
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-foreground/[0.07] ring-inset">
          {ids.length === 0 ? (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">{t("int.px.overrides.empty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {ids.map((id) => {
                const page = byId.get(id);
                const name = page?.name || t("int.px.overrides.unknownPage");
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-sm font-medium" title={name}>
                        {name}
                      </span>
                      {page && !page.live && <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11px] font-medium text-foreground/60">{t("int.px.overrides.draft")}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 max-sm:w-full">
                      <Select value={overrides[id]} disabled={disabled} onValueChange={(v) => onChange({ ...overrides, [id]: v as PurchaseTrigger })}>
                        <SelectTrigger aria-label={t("int.px.overrides.triggerFor", { page: name })} className="h-11 min-w-[11rem] max-sm:flex-1 sm:h-8">
                          <SelectValue>{t(`int.px.trigger.short.${overrides[id]!}`)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {TRIGGER_ORDER.map((k) => (
                            <SelectItem key={k} value={k}>
                              {t(`int.px.trigger.short.${k}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!disabled && (
                        <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground sm:size-8" aria-label={t("int.px.overrides.remove", { page: name })} onClick={() => remove(id)}>
                          <XIcon aria-hidden="true" />
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {!disabled && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-foreground/[0.015] px-4 py-2.5">
              {full ? (
                <p className="text-xs text-muted-foreground">{t("int.px.overrides.full", { max: OVERRIDES_MAX })}</p>
              ) : free.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("int.px.overrides.allListed")}</p>
              ) : (
                <>
                  <Select value={pick} onValueChange={setPick}>
                    <SelectTrigger aria-label={t("int.px.overrides.pick")} className="h-11 min-w-0 flex-1 sm:h-8 sm:max-w-xs">
                      <SelectValue placeholder={t("int.px.overrides.pick")} />
                    </SelectTrigger>
                    <SelectContent>
                      {free.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {!p.live && <span className="text-muted-foreground"> · {t("int.px.overrides.draft")}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="h-11 px-3 sm:h-8" disabled={!pick} onClick={add}>
                    <PlusIcon aria-hidden="true" />
                    {t("int.px.overrides.add")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
