"use client";
/**
 * FieldSpec → form. Renders a section's field specs (text, textarea, number, money, toggle,
 * select, image, images, datetime, icon, list, group) against a data root, with inline validation
 * messages keyed by data path. Lists are sortable, collapsible cards titled by their titlePath.
 */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { FieldSpec } from "@/landing/types";
import { getAt, joinPath, plainLabel } from "@/lib/editor/paths";
import { cn } from "@/lib/utils";
import { Choice, EASE, FieldRow, NumberInput, Segmented } from "../ui";
import { DateTimeField } from "./DateTimeField";
import { IconPicker } from "./IconPicker";
import { ImageField, ImagesField } from "./ImageField";
import { TextField } from "./TextField";

export interface FieldScope {
  /** data root the paths are relative to (a section's data) */
  root: unknown;
  /** validation messages by full data path */
  errors: Readonly<Record<string, string>>;
  set(path: string, value: unknown): void;
  currency: string;
  /** unique prefix for element ids */
  idPrefix: string;
}

const domId = (scope: FieldScope, path: string) => `${scope.idPrefix}-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export function Fields({ fields, base = "", scope }: { fields: readonly FieldSpec[]; base?: string; scope: FieldScope }) {
  return (
    <>
      {fields.map((f, i) => (
        <FieldControl key={"path" in f ? f.path : `group-${i}`} spec={f} base={base} scope={scope} />
      ))}
    </>
  );
}

function FieldControl({ spec, base, scope }: { spec: FieldSpec; base: string; scope: FieldScope }) {
  if (spec.kind === "group") {
    return (
      <div className="space-y-3 rounded-xl bg-foreground/[0.025] p-3 ring-1 ring-inset ring-foreground/[0.04]">
        <p className="text-[11px] font-semibold text-muted-foreground">{spec.label}</p>
        <Fields fields={spec.fields} base={base} scope={scope} />
      </div>
    );
  }

  const path = joinPath(base, spec.path);
  const value = getAt(scope.root, path);
  const error = scope.errors[path] ?? null;
  const id = domId(scope, path);
  const set = (v: unknown) => scope.set(path, v);

  switch (spec.kind) {
    case "text":
      return <TextField id={id} label={spec.label} value={value} onChange={set} max={spec.max} placeholder={spec.placeholder} help={spec.help} error={error} />;
    case "textarea":
      return <TextField id={id} label={spec.label} value={value} onChange={set} max={spec.max} help={spec.help} error={error} multiline rows={spec.rows} />;
    case "number":
      return (
        <FieldRow label={spec.label} htmlFor={id} hint={spec.help} error={error}>
          <NumberInput id={id} value={typeof value === "number" ? value : undefined} onCommit={set} min={spec.min} max={spec.max} step={spec.step} optional />
        </FieldRow>
      );
    case "money":
      return (
        <FieldRow label={spec.label} htmlFor={id} hint={spec.help} error={error}>
          <NumberInput id={id} value={typeof value === "number" ? value : undefined} onCommit={set} min={0} suffix={scope.currency} optional />
        </FieldRow>
      );
    case "toggle":
      return (
        <FieldRow label={spec.label} htmlFor={id} hint={spec.help} error={error} inline>
          <Switch id={id} checked={value === true} onCheckedChange={(v) => set(v)} />
        </FieldRow>
      );
    case "select": {
      const current = typeof value === "string" ? value : undefined;
      const compact = spec.options.length <= 3 && spec.options.every((o) => o.label.length <= 12);
      return (
        <FieldRow label={spec.label} htmlFor={compact ? undefined : id} hint={spec.help} error={error}>
          {compact ? (
            <Segmented value={current ?? ""} onChange={set} options={spec.options} label={spec.label} size="sm" />
          ) : (
            <Choice id={id} value={current} onChange={set} options={spec.options} />
          )}
        </FieldRow>
      );
    }
    case "image":
      return <ImageField label={spec.label} value={value} onChange={set} help={spec.help} error={error} />;
    case "images":
      return <ImagesField label={spec.label} value={value} onChange={set} max={spec.max} help={spec.help} error={error} />;
    case "datetime":
      return <DateTimeField id={id} label={spec.label} value={value} onChange={set} help={spec.help} error={error} />;
    case "icon":
      return (
        <FieldRow label={spec.label} htmlFor={id} hint={spec.help} error={error}>
          <IconPicker id={id} value={value} onChange={set} />
        </FieldRow>
      );
    case "list":
      return <ListField spec={spec} path={path} scope={scope} error={error} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* lists                                                               */
/* ------------------------------------------------------------------ */

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

type ListSpec = Extract<FieldSpec, { kind: "list" }>;

function ListField({ spec, path, scope, error }: { spec: ListSpec; path: string; scope: FieldScope; error: string | null }) {
  const raw = getAt(scope.root, path);
  const items: unknown[] = Array.isArray(raw) ? raw : [];
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  // a stable id for dnd-kit's aria-describedby: its own counter differs between the server render and hydration
  const dndId = useId();
  const ids = items.map((_, i) => `${path}#${i}`);
  const min = spec.min ?? 0;
  const max = spec.max ?? 50;

  const remap = (fn: (i: number) => number | null) =>
    setOpen((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        const j = fn(i);
        if (j !== null) next.add(j);
      }
      return next;
    });

  const add = () => {
    if (items.length >= max) return;
    scope.set(path, [...items, spec.newItem()]);
    setOpen((prev) => new Set(prev).add(items.length));
  };
  const remove = (at: number) => {
    if (items.length <= min) return;
    scope.set(
      path,
      items.filter((_, i) => i !== at),
    );
    remap((i) => (i === at ? null : i > at ? i - 1 : i));
  };
  const duplicate = (at: number) => {
    if (items.length >= max) return;
    const copy = structuredClone(items[at]);
    scope.set(path, [...items.slice(0, at + 1), copy, ...items.slice(at + 1)]);
    remap((i) => (i > at ? i + 1 : i));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    scope.set(path, arrayMove(items, from, to));
    remap((i) => {
      if (i === from) return to;
      if (from < to && i > from && i <= to) return i - 1;
      if (from > to && i >= to && i < from) return i + 1;
      return i;
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-foreground/85">
          {spec.label}
          <span className="ms-1.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {items.length}
            {spec.max ? <>/{spec.max}</> : null}
          </span>
        </p>
        <Button type="button" variant="ghost" size="xs" onClick={add} disabled={items.length >= max} className="text-foreground/80">
          <Plus />
          {spec.itemLabel}
        </Button>
      </div>
      {error ? <p className="mb-2 text-[11.5px] font-medium text-destructive">{error}</p> : null}
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <ListItem
                key={ids[i]}
                sortId={ids[i]!}
                spec={spec}
                index={i}
                item={item}
                base={joinPath(path, i)}
                scope={scope}
                open={open.has(i)}
                onToggle={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                canRemove={items.length > min}
                canDuplicate={items.length < max}
                onRemove={() => remove(i)}
                onDuplicate={() => duplicate(i)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {items.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.03] py-3 text-[12px] text-muted-foreground ring-1 ring-inset ring-foreground/[0.05] hover:text-foreground"
        >
          <Plus className="size-3.5" /> Add the first {spec.itemLabel.toLowerCase()}
        </button>
      ) : null}
    </div>
  );
}

function ListItem({
  sortId,
  spec,
  index,
  item,
  base,
  scope,
  open,
  onToggle,
  canRemove,
  canDuplicate,
  onRemove,
  onDuplicate,
}: {
  sortId: string;
  spec: ListSpec;
  index: number;
  item: unknown;
  base: string;
  scope: FieldScope;
  open: boolean;
  onToggle: () => void;
  canRemove: boolean;
  canDuplicate: boolean;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });
  const title = (spec.titlePath ? plainLabel(getAt(item, spec.titlePath), 48) : "") || `${spec.itemLabel} ${index + 1}`;
  const hasError = Object.keys(scope.errors).some((p) => p === base || p.startsWith(`${base}.`));

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/item overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_90%,transparent),0_1px_2px_rgb(0_0_0/0.03)] transition-shadow",
        isDragging && "relative z-10 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.3),0_0_0_1px_rgb(0_0_0/0.06)]",
        open && "shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_60%,var(--foreground)_10%),0_8px_20px_-14px_rgb(0_0_0/0.25)]",
      )}
    >
      <div className="flex h-10 items-center gap-0.5 pe-1 ps-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          data-dnd-handle
          aria-label={`Reorder ${title}`}
          className="grid h-8 w-5 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground/50 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-90")} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" dir="auto">
            {title}
          </span>
          {hasError ? <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-label="Has errors" /> : null}
        </button>
        <div className="flex opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100">
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Duplicate ${title}`} disabled={!canDuplicate} onClick={onDuplicate} className="text-muted-foreground">
            <Copy />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${title}`} disabled={!canRemove} onClick={onRemove} className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-[var(--bld-hairline)] px-3 pb-3.5 pt-3">
              <Fields fields={spec.item} base={base} scope={scope} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
