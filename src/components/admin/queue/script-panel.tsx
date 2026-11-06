"use client";
/**
 * The call script accordion (P4 CALL CENTER; operations.md OPE-§7.2, §7.3, §13.1, §13.3 `S`). The steps of the order's
 * compiled script (rendered on the server, no template left), the ar / fr / en tabs (another language is compiled by
 * `queueScriptAction` with the order's visibility rule) and the objection chips: tapping one shows its answer and
 * remembers its id for the next outcome (`objectionId`, the R3 learner reads it, never a text). It scrolls inside the
 * card, never the page. An unavailable script says so instead of showing a guessed text.
 */
import { ChevronDownIcon } from "lucide-react";
import { useId } from "react";
import type { CompiledScript, ScriptLocale } from "@/lib/callcenter/script";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

const LOCALES: { id: ScriptLocale; label: string }[] = [
  { id: "ar", label: "العربية" },
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];

export function ScriptPanel({
  script,
  open,
  onToggle,
  loadingLocale,
  onLocale,
  objectionId,
  onObjection,
  className,
}: {
  script: CompiledScript;
  open: boolean;
  onToggle: () => void;
  loadingLocale: ScriptLocale | null;
  onLocale: (l: ScriptLocale) => void;
  objectionId: string | null;
  onObjection: (id: string | null) => void;
  className?: string;
}) {
  const t = useT();
  const id = useId();
  const active = script.objections.find((o) => o.id === objectionId) ?? null;
  return (
    <section className={cn("rounded-2xl border border-border bg-foreground/[0.015]", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 py-2 text-start focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="q-sm flex-1 font-semibold">{t("ops.script.title")}</span>
        <span className="q-xs text-muted-foreground">{t(open ? "ops.script.hide" : "ops.script.show")}</span>
        <kbd className="q-kbd hidden lg:inline-flex">S</kbd>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform duration-[180ms]", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div id={id} className="q-fade grid gap-3 px-4 pb-4">
          <div role="tablist" aria-label={t("ops.script.lang")} className="inline-flex w-fit gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5">
            {LOCALES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                lang={l.id}
                aria-selected={script.locale === l.id}
                disabled={loadingLocale !== null}
                onClick={() => script.locale !== l.id && onLocale(l.id)}
                className={cn(
                  "q-xs inline-flex h-8 min-w-11 items-center justify-center rounded-md px-2.5 font-medium transition-colors",
                  script.locale === l.id ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                  loadingLocale === l.id && "q-shimmer",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div lang={script.locale} dir={script.locale === "ar" ? "rtl" : "ltr"} className="grid gap-3">
            {script.unavailable || script.steps.length === 0 ? (
              <p className="q-sm text-muted-foreground">{t("ops.script.unavailable")}</p>
            ) : (
              <ol className="grid gap-3">
                {script.steps.map((s, i) => (
                  <li key={s.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
                    <span aria-hidden="true" className="q-2xs q-num mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-foreground/[0.06] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="q-xs font-semibold text-muted-foreground">{s.title}</p>
                      <p className="q-base text-foreground">{s.text}</p>
                      {s.checks.length ? (
                        <ul className="q-xs mt-1 flex flex-wrap gap-1.5 text-muted-foreground">
                          {s.checks.map((c) => (
                            <li key={c} className="rounded-md border border-border px-1.5 py-0.5">
                              {c}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {script.objections.length ? (
            <div className="grid gap-2 border-t border-border pt-3">
              <p className="q-xs font-semibold text-muted-foreground">{t("ops.script.objections")}</p>
              <div className="flex flex-wrap gap-1.5">
                {script.objections.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={objectionId === o.id}
                    onClick={() => onObjection(objectionId === o.id ? null : o.id)}
                    className={cn(
                      "q-xs inline-flex min-h-9 items-center rounded-full px-3 font-medium ring-1 transition-colors ring-inset",
                      objectionId === o.id ? "bg-brand/10 text-brand ring-brand/30" : "text-foreground/80 ring-border hover:bg-muted",
                    )}
                  >
                    {t(o.label.key, o.label.vars)}
                  </button>
                ))}
              </div>
              {active ? (
                <p lang={script.locale} dir={script.locale === "ar" ? "rtl" : "ltr"} className="q-fade q-base rounded-xl bg-brand/[0.06] px-3 py-2 text-foreground">
                  {active.text}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
