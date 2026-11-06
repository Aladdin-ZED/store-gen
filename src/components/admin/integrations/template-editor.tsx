"use client";
/**
 * The template editor (operations.md OPE-§7.1, §22.2; OD24): a plain-text area with the variable chips above it, the
 * insert at the caret, the parse error inline at its position, and the 1,000-character counter. Generic over the
 * variable list and the parser, so P4's call-script editor reuses it with its own list and line cap:
 *
 *   <TemplateEditor value={src} onChange={setSrc} vars={TEMPLATE_VARS} label="…" dir="rtl" lang="ar" />
 *
 * The default parser is the template language's (`parseTemplate`: unknown variable, unbalanced braces or blocks, too
 * long), whose `at` is the UTF-16 index the error points at; the editor shows the few characters around it with the
 * offending one marked, and "Show" puts the caret there. A save's refusal (`serverError`) shows the same way.
 */
import { CrosshairIcon } from "lucide-react";
import { useId, useMemo, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { parseTemplate, TEMPLATE_SRC_MAX, templateVars } from "@/lib/integrations/template-lang";
import { cn } from "@/lib/utils";
import { intlLocale } from "./hub-format";
import { VariableChips } from "./variable-chips";

export type EditorParse = { ok: true } | { ok: false; error: string; at: number };

const defaultParse = (max: number) => (src: string): EditorParse => {
  const p = parseTemplate(src, { max });
  return p.ok ? { ok: true } : { ok: false, error: p.error, at: p.at };
};

export function TemplateEditor<V extends string>({
  value,
  onChange,
  vars,
  label,
  dir,
  lang,
  max = TEMPLATE_SRC_MAX,
  parse,
  serverError = null,
  disabled = false,
  rows = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  vars: readonly V[];
  label: string;
  dir: "ltr" | "rtl";
  lang: string;
  max?: number;
  parse?: (src: string) => EditorParse;
  /** a save's refusal of this text: its error code and position */
  serverError?: { error: string; at?: number } | null;
  disabled?: boolean;
  rows?: number;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const check = useMemo(() => parse ?? defaultParse(max), [parse, max]);
  const result = useMemo(() => (value.trim() ? check(value) : ({ ok: true } as const)), [check, value]);
  const used = useMemo(() => new Set<string>(templateVars(value)) as unknown as ReadonlySet<V>, [value]);
  const problem = !result.ok ? { error: result.error, at: result.at } : serverError;
  const length = value.length;
  const nf = new Intl.NumberFormat(intlLocale(locale));

  function insert(name: V) {
    const el = area.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function show(at: number) {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(at, Math.min(at + 1, value.length));
  }

  const at = problem?.at;
  const snippet =
    at === undefined
      ? null
      : {
          before: value.slice(Math.max(0, at - 24), at),
          mark: value.slice(at, at + 1) || " ",
          after: value.slice(at + 1, at + 24),
          cut: at > 24,
        };

  return (
    <div className="grid gap-2.5">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className={cn("text-xs tabular-nums", length > max ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite" dir="ltr">
          {t("int.wae.count", { n: nf.format(length), max: nf.format(max) })}
        </span>
      </div>
      <VariableChips vars={vars} used={used} onInsert={insert} disabled={disabled} />
      <Textarea
        ref={area}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        lang={lang}
        rows={rows}
        disabled={disabled}
        spellCheck
        aria-invalid={!!problem}
        aria-describedby={problem ? `${id}-err` : undefined}
        className="min-h-36 text-[0.9rem] leading-relaxed"
      />
      {problem && (
        <div id={`${id}-err`} role="alert" className="grid gap-2 rounded-xl bg-destructive/[0.06] px-3.5 py-2.5 ring-1 ring-destructive/15 ring-inset">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-pretty text-destructive">
              {t(`int.wae.err.${problem.error}`)}
              {at !== undefined && <span className="text-destructive/80"> · {t("int.wae.err.at", { n: nf.format(at + 1) })}</span>}
            </p>
            {at !== undefined && (
              <button
                type="button"
                onClick={() => show(at)}
                className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-7"
              >
                <CrosshairIcon className="size-3.5" aria-hidden="true" />
                {t("int.wae.err.show")}
              </button>
            )}
          </div>
          {snippet && (
            <p dir={dir} lang={lang} className="overflow-hidden font-mono text-[0.75rem] text-ellipsis whitespace-pre text-foreground/80">
              {snippet.cut && "…"}
              {snippet.before}
              <mark className="rounded-sm bg-destructive/20 px-px text-destructive">{snippet.mark}</mark>
              {snippet.after}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
