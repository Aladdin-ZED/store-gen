"use client";
/**
 * The variable chips of a template editor (operations.md OPE-§7.1, §22.2): one chip per variable of the editor's list;
 * a press inserts `{name}` at the editor's caret (the editor owns the caret, this only names the variable). Generic
 * over the list, so P4's call-script editor passes its own. The chips are code (`{order_id}`), the same in every
 * language; the row scrolls sideways on a phone instead of wrapping into a wall.
 */
import { PlusIcon } from "lucide-react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

export function VariableChips<V extends string>({
  vars,
  used,
  onInsert,
  disabled = false,
  className,
}: {
  vars: readonly V[];
  /** the variables the text already uses (shown filled) */
  used?: ReadonlySet<V>;
  onInsert: (name: V) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t("int.wae.vars")} className={cn("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible", className)}>
      {vars.map((v) => {
        const on = used?.has(v) ?? false;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            // keep the textarea's selection: a mousedown here would blur it before the insert reads the caret
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(v)}
            aria-label={t("int.wae.insert", { name: v })}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-2.5 font-mono text-[0.72rem] ring-1 transition-colors ring-inset focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:h-7",
              on ? "bg-foreground/[0.07] text-foreground ring-foreground/15" : "text-muted-foreground ring-foreground/[0.09] enabled:hover:bg-foreground/[0.04] enabled:hover:text-foreground",
            )}
          >
            <PlusIcon className="size-3 opacity-60" aria-hidden="true" />
            <bdi dir="ltr">{`{${v}}`}</bdi>
          </button>
        );
      })}
    </div>
  );
}
