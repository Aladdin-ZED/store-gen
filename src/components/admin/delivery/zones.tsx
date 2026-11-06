"use client";
/**
 * The zones column of the delivery editor (landing.md LAN-§7.3): cards in `position` order with the name, the city
 * count, the days or "Days not set", the fee or "Fee not set" and the "Not served" pill. A card opens its editor in
 * place (one at a time); text and numbers are written on blur or Enter, switches at once. Reorder by drag (the grip),
 * by Alt+↑ / Alt+↓ on a focused card, or with the Move up / Move down buttons of the open editor (the tap path).
 * Server problems sit on the card they name.
 */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import { MAX_ETA_DAYS, MAX_FEE_CENTS, MAX_ZONES, ZONE_NAME_MAX, ZONE_NOTE_MAX } from "@/lib/landing/limits";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { opt } from "../landing/read-only";
import { Field, TextInput } from "../settings/form-kit";
import { centsText, STAR } from "./model";

export interface ZonesColumnProps {
  zones: DeliveryZoneRow[];
  canWrite: boolean;
  currency: string;
  moneyLocale: string;
  /** zone id → the sentence of the server problem that names it */
  problems: Record<string, string>;
  open: string | null;
  onOpen: (id: string | null) => void;
  onChange: (next: DeliveryZoneRow[], message: string) => void;
  onAdd: () => void;
}

/** the errors without one field's */
const without = (e: Record<string, string>, key: string): Record<string, string> => {
  const next = { ...e };
  delete next[key];
  return next;
};

export function ZonesColumn(p: ZonesColumnProps) {
  const t = useT();
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= p.zones.length || from === to) return;
    p.onChange(arrayMove([...p.zones], from, to), t("landing.dz.saved.order"));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(
      p.zones.findIndex((z) => z.id === e.active.id),
      p.zones.findIndex((z) => z.id === e.over!.id),
    );
  };
  const update = (id: string, patch: Partial<DeliveryZoneRow>) => p.onChange(p.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)), t("landing.dz.saved.zone"));
  const remove = (id: string) => {
    p.onOpen(null);
    p.onChange(
      p.zones.filter((z) => z.id !== id),
      t("landing.dz.saved.removed"),
    );
  };

  return (
    <section aria-labelledby={`${dndId}-h`} className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 id={`${dndId}-h`} className="text-sm font-semibold">
          {t("landing.dz.zones.title")} <span className="font-normal text-muted-foreground tabular-nums">{p.zones.length}</span>
        </h3>
        {p.canWrite && p.zones.length < MAX_ZONES && (
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 rounded-lg" onClick={p.onAdd}>
            <PlusIcon aria-hidden="true" className="size-4" />
            {t("landing.dz.zones.add")}
          </Button>
        )}
      </div>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={p.zones.map((z) => z.id)} strategy={verticalListSortingStrategy}>
          <ol className="grid gap-2">
            {p.zones.map((z, i) => (
              <ZoneCard
                key={z.id}
                zone={z}
                index={i}
                count={p.zones.length}
                {...p}
                isOpen={p.open === z.id}
                problem={p.problems[z.id] ?? null}
                onMove={(dir) => move(i, i + dir)}
                onUpdate={(patch) => update(z.id, patch)}
                onRemove={() => remove(z.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function ZoneCard({
  zone,
  index,
  count,
  canWrite,
  currency,
  moneyLocale,
  isOpen,
  problem,
  onOpen,
  onMove,
  onUpdate,
  onRemove,
}: ZonesColumnProps & {
  zone: DeliveryZoneRow;
  index: number;
  count: number;
  isOpen: boolean;
  problem: string | null;
  onMove: (dir: -1 | 1) => void;
  onUpdate: (patch: Partial<DeliveryZoneRow>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: zone.id, disabled: !canWrite });
  const star = zone.cities.includes(STAR);
  const listed = zone.cities.filter((c) => c !== STAR).length;
  const days =
    zone.etaMinDays !== null && zone.etaMaxDays !== null
      ? zone.etaMinDays === zone.etaMaxDays
        ? t("landing.dz.zone.daysOne", { n: zone.etaMinDays })
        : t("landing.dz.zone.days", { min: zone.etaMinDays, max: zone.etaMaxDays })
      : null;
  const fee = zone.feeCents !== null ? (zone.feeCents === 0 ? t("landing.dz.zone.free") : centsText(zone.feeCents, currency, moneyLocale)) : null;
  const onKey = (e: KeyboardEvent) => {
    if (!canWrite || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    onMove(e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-xl bg-card ring-1 ring-border transition-shadow duration-200 ease-out",
        isOpen && "ring-foreground/20 shadow-[0_10px_28px_-18px_rgb(0_0_0/0.35)]",
        problem && "ring-destructive/45",
        isDragging && "z-10 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]",
      )}
    >
      <div className="flex items-stretch">
        {canWrite && (
          <button
            type="button"
            aria-label={t("landing.dz.zone.drag", { name: zone.name })}
            className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-s-xl text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon aria-hidden="true" className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-expanded={isOpen}
          aria-keyshortcuts={canWrite ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
          onClick={() => onOpen(isOpen ? null : zone.id)}
          onKeyDown={onKey}
          className={cn("grid min-h-[4.5rem] min-w-0 flex-1 gap-1 rounded-e-xl px-3 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60", !canWrite && "rounded-s-xl ps-4")}
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{zone.name}</span>
            {zone.notServed && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[0.7rem] font-medium text-destructive">{t("landing.dz.zone.notServed")}</span>}
          </span>
          <span className="text-xs text-muted-foreground">
            {star ? (listed ? t("landing.dz.zone.citiesAndRest", { n: listed }) : t("landing.dz.zone.rest")) : t("landing.dz.zone.cities", { n: listed })}
          </span>
          {!zone.notServed && (
            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span className={days ? "text-foreground/80" : "text-muted-foreground italic"}>{days ?? t("landing.dz.zone.noDays")}</span>
              <span className={fee ? "text-foreground/80" : "text-muted-foreground italic"}>{fee ? <bdi dir="ltr">{fee}</bdi> : t("landing.dz.zone.noFee")}</span>
            </span>
          )}
        </button>
      </div>
      {problem && (
        <p role="alert" className="border-t border-destructive/20 px-4 py-2 text-xs font-medium text-destructive">
          {problem}
        </p>
      )}
      {isOpen && <ZoneForm key={zone.id} zone={zone} index={index} count={count} canWrite={canWrite} currency={currency} onMove={onMove} onUpdate={onUpdate} onRemove={onRemove} />}
    </li>
  );
}

const toNum = (s: string): number | null => {
  const v = s.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function ZoneForm({
  zone,
  index,
  count,
  canWrite,
  currency,
  onMove,
  onUpdate,
  onRemove,
}: {
  zone: DeliveryZoneRow;
  index: number;
  count: number;
  canWrite: boolean;
  currency: string;
  onMove: (dir: -1 | 1) => void;
  onUpdate: (patch: Partial<DeliveryZoneRow>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(zone.name);
  const [min, setMin] = useState(zone.etaMinDays?.toString() ?? "");
  const [max, setMax] = useState(zone.etaMaxDays?.toString() ?? "");
  const [fee, setFee] = useState(zone.feeCents === null ? "" : String(zone.feeCents / 100));
  const [freeFrom, setFreeFrom] = useState(zone.freeFromCents === null ? "" : String(zone.freeFromCents / 100));
  const [note, setNote] = useState(zone.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const star = zone.cities.includes(STAR);

  const commitName = () => {
    const v = name.trim().slice(0, ZONE_NAME_MAX);
    if (!v) return setErrors((e) => ({ ...e, name: t("landing.dz.form.nameRequired") }));
    setErrors((e) => without(e, "name"));
    if (v !== zone.name) onUpdate({ name: v });
  };
  const commitDays = () => {
    const a = toNum(min);
    const b = toNum(max);
    const bad = (n: number | null) => n !== null && (!Number.isInteger(n) || n < 0 || n > MAX_ETA_DAYS);
    if (bad(a) || bad(b)) return setErrors((e) => ({ ...e, days: t("landing.dz.form.daysRange", { max: MAX_ETA_DAYS }) }));
    if ((a === null) !== (b === null)) return setErrors((e) => ({ ...e, days: t("landing.dz.form.daysBoth") }));
    if (a !== null && b !== null && a > b) return setErrors((e) => ({ ...e, days: t("landing.dz.form.daysOrder") }));
    setErrors((e) => without(e, "days"));
    if (a !== zone.etaMinDays || b !== zone.etaMaxDays) onUpdate({ etaMinDays: a, etaMaxDays: b });
  };
  const commitMoney = (field: "feeCents" | "freeFromCents", raw: string) => {
    const n = toNum(raw);
    const cents = n === null ? null : Math.round(n * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents < 0 || cents > MAX_FEE_CENTS)) return setErrors((e) => ({ ...e, [field]: t("landing.dz.form.money") }));
    setErrors((e) => without(e, field));
    if (cents !== zone[field]) onUpdate({ [field]: cents });
  };
  const commitNote = () => {
    const v = note.trim().slice(0, ZONE_NOTE_MAX) || null;
    if (v !== zone.note) onUpdate({ note: v });
  };
  const enter = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div className="grid gap-4 border-t border-border/70 px-4 pt-4 pb-4">
      <Field label={t("landing.dz.form.name")} error={errors.name}>
        {(f) => <TextInput {...f} value={name} maxLength={ZONE_NAME_MAX} disabled={!canWrite} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={enter(commitName)} />}
      </Field>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
        <span className="grid gap-0.5">
          <span className="font-medium">{t("landing.dz.form.notServed")}</span>
          <span className="text-xs text-muted-foreground">{t("landing.dz.form.notServedHint")}</span>
        </span>
        <Switch
          checked={zone.notServed}
          disabled={!canWrite}
          onCheckedChange={(v) => onUpdate(v ? { notServed: true, etaMinDays: null, etaMaxDays: null, feeCents: null, freeFromCents: null } : { notServed: false })}
        />
      </label>
      {!zone.notServed && (
        <>
          <Field label={t("landing.dz.form.days")} hint={t("landing.dz.form.daysHint")} error={errors.days}>
            {(f) => (
              <div className="flex items-center gap-2">
                <TextInput {...f} inputMode="numeric" aria-label={t("landing.dz.form.daysMin")} className="w-20 text-center tabular-nums" value={min} disabled={!canWrite} onChange={(e) => setMin(e.target.value)} onBlur={commitDays} onKeyDown={enter(commitDays)} />
                <span className="text-sm text-muted-foreground">{t("landing.dz.form.to")}</span>
                <TextInput inputMode="numeric" aria-label={t("landing.dz.form.daysMax")} className="w-20 text-center tabular-nums" value={max} disabled={!canWrite} onChange={(e) => setMax(e.target.value)} onBlur={commitDays} onKeyDown={enter(commitDays)} />
                <span className="text-sm text-muted-foreground">{t("landing.dz.form.workingDays")}</span>
              </div>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Field label={t("landing.dz.form.fee", { currency })} hint={t("landing.dz.form.feeNote")} error={errors.feeCents}>
              {(f) => <TextInput {...f} inputMode="decimal" dir="ltr" className="tabular-nums" value={fee} disabled={!canWrite} onChange={(e) => setFee(e.target.value)} onBlur={() => commitMoney("feeCents", fee)} onKeyDown={enter(() => commitMoney("feeCents", fee))} />}
            </Field>
            <Field label={opt(t, t("landing.dz.form.freeFrom", { currency }))} error={errors.freeFromCents}>
              {(f) => <TextInput {...f} inputMode="decimal" dir="ltr" className="tabular-nums" value={freeFrom} disabled={!canWrite} onChange={(e) => setFreeFrom(e.target.value)} onBlur={() => commitMoney("freeFromCents", freeFrom)} onKeyDown={enter(() => commitMoney("freeFromCents", freeFrom))} />}
            </Field>
          </div>
        </>
      )}
      <Field label={opt(t, t("landing.dz.form.note"))} hint={t("landing.dz.form.noteHint")}>
        {(f) => <TextInput {...f} value={note} maxLength={ZONE_NOTE_MAX} disabled={!canWrite} onChange={(e) => setNote(e.target.value)} onBlur={commitNote} onKeyDown={enter(commitNote)} />}
      </Field>
      {canWrite && (
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span className="grid gap-0.5">
            <span className="font-medium">{t("landing.dz.form.rest")}</span>
            <span className="text-xs text-muted-foreground">{t("landing.dz.form.restHint")}</span>
          </span>
          <Switch checked={star} onCheckedChange={(v) => onUpdate({ cities: v ? [...zone.cities.filter((c) => c !== STAR), STAR] : zone.cities.filter((c) => c !== STAR) })} />
        </label>
      )}
      {canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" className="h-11 min-w-11 rounded-lg sm:h-9 sm:min-w-9" disabled={index === 0} aria-label={t("landing.dz.form.up")} onClick={() => onMove(-1)}>
              <ArrowUpIcon aria-hidden="true" className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-11 min-w-11 rounded-lg sm:h-9 sm:min-w-9" disabled={index === count - 1} aria-label={t("landing.dz.form.down")} onClick={() => onMove(1)}>
              <ArrowDownIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9" onClick={onRemove}>
            <Trash2Icon aria-hidden="true" className="size-4" />
            {t("landing.dz.form.remove")}
          </Button>
        </div>
      )}
    </div>
  );
}
