"use client";

/**
 * The manual-order sheet (P4 CALL CENTER; operations.md OPE-§11.2, §11.3; S4 takes this folder over in R2). One scroll,
 * three blocks, no step labels: Product (live pages as compact rows, the page's offers as cards with the payable price
 * from src/lib/page/pricing.ts, option pickers on src/lib/page/options.ts availability, unavailable choices disabled
 * with the page's own label), Customer (phone in the market's country, ltr; name; a city combobox with folded
 * matching; the address exactly as checkout.addressMode says; landmark; note), Summary (the server quote debounced
 * 250 ms with a skeleton, the adjustment for managers, "Customer already confirmed", Deliver from…, Create order).
 * States: quoting, stale quote, duplicate warning with Create anyway, blocked, inline field errors, a success toast
 * with "Open order".
 *
 * A stable component: the orders page, the customer page, ⌘K and P3's leads inbox open it with `initial`; `edit`
 * switches it to the edit mode of one order (contact fields, the adjustment, and the product only when changed).
 */
import { CalendarClockIcon, CheckIcon, Loader2Icon, PackageIcon, SearchIcon, ShieldAlertIcon, UsersIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  convertLeadAction,
  createManualOrderAction,
  editOrderAction,
  manualPageAction,
  manualSheetBootAction,
  quoteManualOrderAction,
} from "@/app/app/[store]/orders/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { dirOf, type MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { foldCity } from "@/lib/orders/address";
import type { ManualPageModel, ManualPageRow, ManualQuote } from "@/lib/orders/manual";
import { expandUnits, offerAvailable, offerName, type UnitSlot } from "@/lib/page/catalog";
import { groupCombos, groupOptions, ruleLock, rulePreset } from "@/lib/page/options";
import { bumpOffered, offerMath } from "@/lib/page/pricing";
import { isChoiceGroup, isFieldGroup, isMatrixGroup, type ExtraGroup, type Item, type OptionGroup } from "@/lib/page/schema";
import { cn } from "@/lib/utils";
import { useStore } from "../../shell/store-context";
import { DateSheet } from "../../queue/pickers";
import { money, ymdLabel } from "../../queue/time";
import { newIdem, settle } from "../ops-ui";

export interface ManualInitial {
  phone?: string;
  name?: string;
  city?: string;
  pageId?: string;
  /** P3's leads inbox: "Convert" (the page and source come from the lead) */
  leadId?: string;
}

/** Edit mode (OPE-§11.3): the order as the drawer shows it. The phone stays masked: typing a new one replaces it. */
export interface ManualEditSeed {
  id: string;
  rev: number;
  pageId: string | null;
  offerId: string | null;
  name: string;
  phoneMasked: string;
  city: string | null;
  address: string | null;
  landmark: string | null;
  note: string | null;
  adjustCents: number;
  currency: string;
  /** shipped orders keep their lines (`locked`): only the address, landmark and note change */
  locked: boolean;
}

export interface ManualOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ManualInitial;
  mode?: "create" | "edit";
  edit?: ManualEditSeed;
  /** after a create, convert or save */
  onDone?: (orderId: string) => void;
}

interface Boot {
  pages: ManualPageRow[];
  market: string;
  country: string;
  addressMode: "required" | "optional";
  cities: { key: string; value: string; ar: string; en: string }[];
  canAdjust: boolean;
  currency: string;
}

interface Unit {
  item?: string;
  o: Record<string, string>;
  f: Record<string, string>;
}

type Fields = Record<string, string | undefined>;

const QUOTE_DEBOUNCE_MS = 250;

export function ManualOrderSheet(props: ManualOrderSheetProps) {
  const locale = useAdminLocale();
  const rtl = dirOf(locale) === "rtl";
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        dir={rtl ? "rtl" : "ltr"}
        side={rtl ? "left" : "right"}
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[560px] data-[side=right]:sm:max-w-[560px]"
      >
        <CloseX />
        {props.open && <Body {...props} />}
      </SheetContent>
    </Sheet>
  );
}

/** the close button on the inline end (the sheet's own sits on the physical right, under the title in RTL) */
function CloseX() {
  const t = useT();
  return (
    <SheetClose
      aria-label={t("ops.drawer.close")}
      className="absolute end-3 top-3 z-10 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <XIcon className="size-4" />
    </SheetClose>
  );
}

function Body({ onOpenChange, initial, mode = "create", edit, onDone }: ManualOrderSheetProps) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const storeView = useStore();
  const editing = mode === "edit" && !!edit;
  const idem = useRef(newIdem());

  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootError, setBootError] = useState(false);
  const [pageId, setPageId] = useState<string | null>(edit?.pageId ?? initial?.pageId ?? null);
  const [model, setModel] = useState<ManualPageModel | null>(null);
  const [modelError, setModelError] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [productOpen, setProductOpen] = useState(!editing);

  const [offerId, setOfferId] = useState<string | null>(edit?.offerId ?? null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [bump, setBump] = useState(false);
  const [touchedSel, setTouchedSel] = useState(false);

  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [name, setName] = useState(edit?.name ?? initial?.name ?? "");
  const [city, setCity] = useState(edit?.city ?? initial?.city ?? "");
  const [address, setAddress] = useState(edit?.address ?? "");
  const [landmark, setLandmark] = useState(edit?.landmark ?? "");
  const [note, setNote] = useState(edit?.note ?? "");
  const [touched, setTouched] = useState<Record<string, true>>({});

  const [confirmed, setConfirmed] = useState(true);
  const [shipAfter, setShipAfter] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [adjust, setAdjust] = useState(edit && edit.adjustCents ? String(-edit.adjustCents / 100) : "");
  const [adjustReason, setAdjustReason] = useState("");

  const [quote, setQuote] = useState<ManualQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stale, setStale] = useState(false);
  const [serverFields, setServerFields] = useState<Fields>({});
  const [dupConfirm, setDupConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const priced = useRef<string | null>(null);

  // boot: pages, cities, the address rule
  useEffect(() => {
    let off = false;
    settle<Boot>(manualSheetBootAction()).then((r) => {
      if (off) return;
      if (r.ok) {
        setBoot(r.data);
        if (!pageId && r.data.pages.length === 1) setPageId(r.data.pages[0]!.id);
      } else setBootError(true);
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the page's selling part
  useEffect(() => {
    if (!pageId) return;
    let off = false;
    setModel(null);
    setModelError(false);
    settle<ManualPageModel>(manualPageAction(pageId)).then((r) => {
      if (off) return;
      if (!r.ok) {
        setModelError(true);
        return;
      }
      setModel(r.data);
      const offers = r.data.doc.offers.bundles.filter((o) => offerAvailable(o, r.data.doc.items));
      const pre = offers.find((o) => o.id === offerId) ?? offers.find((o) => o.preselected) ?? offers[0];
      if (pre) pickOffer(r.data, pre.id, false);
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const doc = model?.doc ?? null;
  const offer = doc?.offers.bundles.find((o) => o.id === offerId) ?? null;
  const slots = useMemo<UnitSlot[]>(() => (doc && offer ? expandUnits(offer, doc.items) : []), [doc, offer]);
  const itemsById = useMemo(() => new Map((doc?.items ?? []).map((i) => [i.id, i])), [doc]);
  const currency = model?.currency ?? boot?.currency ?? edit?.currency ?? storeView.currency;

  function pickOffer(m: ManagerModel, id: string, touch = true) {
    const o = m.doc.offers.bundles.find((x) => x.id === id);
    if (!o) return;
    const byId = new Map(m.doc.items.map((i) => [i.id, i]));
    const next: Unit[] = expandUnits(o, m.doc.items).map((s) => {
      const item = s.item ?? (s.available && s.available.length === 1 ? s.available[0] : undefined);
      const u: Unit = { ...(s.choices && item ? { item } : {}), o: {}, f: {} };
      const it = item ? byId.get(item) : undefined;
      for (const g of it?.groups ?? []) {
        if (isChoiceGroup(g)) {
          const r = s.rules?.[g.id];
          const v = ruleLock(r) ?? rulePreset(r);
          if (v) u.o[g.id] = v;
        }
      }
      return u;
    });
    setOfferId(id);
    setUnits(next);
    setExtras({});
    setBump(false);
    if (touch) setTouchedSel(true);
  }

  const selection = offer ? { offerId: offer.id, units: units.map((u) => ({ ...(u.item ? { item: u.item } : {}), o: u.o, f: u.f })), extras, bump } : null;
  const adjustCents = boot?.canAdjust && adjust.trim() ? -Math.round(Math.abs(Number(adjust.replace(",", "."))) * 100) || 0 : 0;
  const customer = { name, phone, city, ...(address.trim() ? { address } : {}), ...(landmark.trim() ? { landmark } : {}), ...(note.trim() ? { note } : {}) };
  const quoteInput =
    model && selection
      ? {
          pageId: model.pageId,
          selection,
          customer: editing ? { ...customer, phone: phone || "0600000000" } : customer,
          confirmed,
          ...(adjustCents ? { adjustCents, adjustReason: adjustReason || "adjustment" } : {}),
          idem: idem.current,
        }
      : null;
  const quoteKey = quoteInput && (!editing || touchedSel) ? JSON.stringify(quoteInput) : null;

  // the server quote, debounced (OPE-§11.2): the numbers the page itself would show
  useEffect(() => {
    if (!quoteKey) return;
    setQuoting(true);
    const h = setTimeout(async () => {
      const r = await settle<ManualQuote>(quoteManualOrderAction(JSON.parse(quoteKey)));
      setQuoting(false);
      if (!r.ok) return;
      if (priced.current && priced.current !== r.data.versionId) setStale(true);
      priced.current = r.data.versionId;
      setQuote(r.data);
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [quoteKey]);

  const fields: Fields = { ...((quote?.fields ?? {}) as Fields), ...serverFields };
  const errOf = (k: string) => (touched[k] || serverFields[k] ? fields[k] : undefined);
  const blocked = !!quote?.warnings.includes("blocked");
  const duplicate = !!quote?.warnings.includes("duplicate");
  const addressRequired = boot?.addressMode !== "optional";
  const touch = (k: string) => setTouched((x) => ({ ...x, [k]: true }));

  const close = () => onOpenChange(false);
  const opened = (id: string) => {
    onDone?.(id);
    toast.success(editing ? t("ops.manual.saved") : t("ops.manual.created", { id }), {
      action: editing ? undefined : { label: t("ops.manual.openOrder"), onClick: () => router.push(storeView.href(`/orders?order=${id}`)) },
    });
    close();
  };

  const submit = async () => {
    setTouched({ name: true, phone: true, city: true, address: true });
    if (editing && edit) {
      const patch: Record<string, unknown> = {};
      if (name !== edit.name) patch.name = name;
      if (phone.trim()) patch.phone = phone;
      if ((city || null) !== edit.city) patch.city = city;
      if ((address || null) !== edit.address) patch.address = address || null;
      if ((landmark || null) !== edit.landmark) patch.landmark = landmark || null;
      if ((note || null) !== edit.note) patch.note = note || null;
      if (touchedSel && selection && !edit.locked) patch.selection = selection;
      if (boot?.canAdjust && adjustCents !== edit.adjustCents) patch.adjust = { cents: adjustCents, reason: adjustReason || "adjustment" };
      if (!Object.keys(patch).length) return close();
      setSaving(true);
      const r = await settle<{ changed: boolean }>(editOrderAction(edit.id, patch as Parameters<typeof editOrderAction>[1], edit.rev));
      setSaving(false);
      if (!r.ok) {
        toast.error(errorText(t, r.error));
        return;
      }
      return opened(edit.id);
    }
    if (!quoteInput || blocked) return;
    if (duplicate && !dupConfirm) {
      setDupConfirm(true);
      return;
    }
    setSaving(true);
    const input = { ...quoteInput, ...(duplicate ? { allowDuplicate: true } : {}) };
    const r = initial?.leadId
      ? await settle<{ orderId: string }>(convertLeadAction(initial.leadId, withoutPage(input)))
      : await settle<{ orderId: string }>(createManualOrderAction(input, confirmed && shipAfter ? { shipAfter } : {}));
    setSaving(false);
    if (!r.ok) {
      const raw = r as unknown as { fields?: Fields };
      if (raw.fields) setServerFields(raw.fields);
      toast.error(errorText(t, r.error));
      return;
    }
    opened(r.data.orderId);
  };

  const pages = boot?.pages ?? [];
  const shownPages = pageQuery ? pages.filter((p) => foldCity(p.name).includes(foldCity(pageQuery))) : pages;
  const canCreate = editing ? !saving : !!quote && !quoting && !blocked && !saving && !!selection;

  return (
    <>
      <SheetHeader className="gap-1 border-b border-border/70 px-5 pt-5 pb-4 pe-14">
        <SheetTitle className="text-base">{editing ? t("ops.manual.editTitle", { id: edit!.id }) : initial?.leadId ? t("ops.manual.convertTitle") : t("ops.manual.title")}</SheetTitle>
        <SheetDescription className="text-xs">{editing ? t("ops.manual.editHint") : t("ops.manual.hint")}</SheetDescription>
      </SheetHeader>

      <div className="adm-scroll grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 py-5">
        {bootError ? (
          <p className="text-sm text-muted-foreground">{t("ops.state.error")}</p>
        ) : !boot ? (
          <SheetSkeleton />
        ) : (
          <>
            {/* Product */}
            <Section title={t("ops.manual.product")} icon={<PackageIcon />}>
              {editing && edit?.locked ? (
                <p className="text-[0.8125rem] text-muted-foreground">{t("ops.error.locked")}</p>
              ) : editing && !productOpen ? (
                <button type="button" onClick={() => setProductOpen(true)} className="justify-self-start text-[0.8125rem] font-medium underline-offset-4 hover:underline">
                  {t("ops.manual.changeProduct")}
                </button>
              ) : (
                <>
                  {!pages.length ? (
                    <p className="rounded-xl bg-foreground/[0.03] px-3 py-3 text-[0.8125rem] text-muted-foreground">{t("ops.manual.noPages")}</p>
                  ) : (
                    !(editing && model) && (
                      <div className="grid gap-2">
                        {pages.length > 6 && (
                          <label className="flex h-9 items-center gap-2 rounded-lg border border-input px-2.5 text-[0.8125rem] focus-within:ring-2 focus-within:ring-ring/50">
                            <SearchIcon className="size-3.5 text-muted-foreground" />
                            <input value={pageQuery} onChange={(e) => setPageQuery(e.target.value)} placeholder={t("ops.manual.searchPages")} aria-label={t("ops.manual.searchPages")} className="min-w-0 flex-1 bg-transparent outline-none" />
                          </label>
                        )}
                        <ul className="grid max-h-56 gap-1 overflow-y-auto" role="listbox" aria-label={t("ops.manual.pages")}>
                          {shownPages.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={p.id === pageId}
                                onClick={() => {
                                  setPageId(p.id);
                                  setOfferId(null);
                                  setTouchedSel(true);
                                }}
                                className={cn(
                                  "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-[0.8125rem] transition-colors",
                                  p.id === pageId ? "bg-foreground/[0.06] font-medium" : "hover:bg-foreground/[0.03]",
                                )}
                              >
                                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/[0.06] text-[0.6875rem] font-semibold">{Array.from(p.name.trim())[0] ?? "·"}</span>
                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                {p.id === pageId && <CheckIcon className="size-4 shrink-0" />}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  )}
                  {pageId && !model && !modelError && <div className="adm-shimmer h-24 rounded-xl" />}
                  {modelError && <p className="text-[0.8125rem] text-destructive">{t("ops.manual.pageGone")}</p>}
                  {doc && model && (
                    <div className="grid gap-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {doc.offers.bundles.map((o) => {
                          const ok = offerAvailable(o, doc.items);
                          const m = offerMath(doc, o);
                          const on = o.id === offerId;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              disabled={!ok}
                              aria-pressed={on}
                              onClick={() => pickOffer(model, o.id)}
                              className={cn(
                                "grid gap-1 rounded-xl p-3 text-start ring-1 transition-[box-shadow,background-color] duration-150 ring-inset disabled:opacity-50",
                                on ? "bg-brand/[0.05] ring-2 ring-brand" : "ring-border hover:bg-foreground/[0.025]",
                              )}
                            >
                              <span className="text-[0.8125rem] font-medium">{offerName({ doc }, o)}</span>
                              <span className="flex items-baseline gap-2">
                                <span className="text-sm font-semibold tabular-nums">{money(m.from, currency, locale)}</span>
                                {m.showReference && <s className="text-xs text-muted-foreground tabular-nums">{money(m.displayReference, currency, locale)}</s>}
                              </span>
                              {!ok && <span className="text-xs text-muted-foreground">{t("ops.manual.unavailable")}</span>}
                            </button>
                          );
                        })}
                      </div>

                      {offer && slots.length > 0 && (
                        <div className="grid gap-3">
                          {slots.map((s) => (
                            <SlotPicker
                              key={s.k}
                              slot={s}
                              unit={units[s.k] ?? { o: {}, f: {} }}
                              first={slots.findIndex((x) => (x.item ?? units[x.k]?.item) === (s.item ?? units[s.k]?.item)) === s.k}
                              items={itemsById}
                              count={slots.length}
                              currency={currency}
                              errOf={(k) => (touchedSel ? fields[k] : undefined)}
                              onChange={(u) => {
                                setUnits((cur) => cur.map((x, i) => (i === s.k ? u : x)));
                                setTouchedSel(true);
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {offer &&
                        doc.offers.extras
                          .filter((g) => g.scope === "all" || g.scope.includes(offer.id))
                          .map((g) => (
                            <ExtraPicker
                              key={g.id}
                              group={g}
                              value={extras[g.id] ?? ""}
                              error={touchedSel ? fields[`x.${g.id}`] : undefined}
                              currency={currency}
                              onChange={(v) => {
                                setExtras((x) => ({ ...x, [g.id]: v }));
                                setTouchedSel(true);
                              }}
                            />
                          ))}

                      {offer && doc.offers.orderBump?.enabled && bumpOffered(doc, offer.id) && (
                        <label className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border ring-inset">
                          <span className="grid gap-0.5">
                            <span className="text-[0.8125rem] font-medium">{doc.offers.orderBump.title}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">+ {money(Math.round(doc.offers.orderBump.price * 100), currency, locale)}</span>
                          </span>
                          <Switch
                            checked={bump}
                            onCheckedChange={(v) => {
                              setBump(v);
                              setTouchedSel(true);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Customer */}
            <Section title={t("ops.manual.customer")} icon={<UsersIcon />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("ops.manual.phone")} error={errOf("phone")} hint={editing ? t("ops.manual.phoneKeep", { phone: edit!.phoneMasked }) : undefined}>
                  <input
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="off"
                    value={phone}
                    onChange={(e) => setPhone(formatAsYouType(e.target.value, boot.country))}
                    onBlur={() => touch("phone")}
                    placeholder={editing ? edit!.phoneMasked : boot.country === "MA" ? "06 12 34 56 78" : ""}
                    className={inputCls(!!errOf("phone"))}
                  />
                </Field>
                <Field label={t("ops.manual.name")} error={errOf("name")}>
                  <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={() => touch("name")} className={inputCls(!!errOf("name"))} />
                </Field>
                <Field label={t("ops.manual.city")} error={errOf("city")} className="sm:col-span-2">
                  <CityCombo value={city} cities={boot.cities} locale={locale} invalid={!!errOf("city")} onChange={setCity} onBlur={() => touch("city")} />
                </Field>
                <Field label={addressRequired ? t("ops.manual.address") : t("ops.manual.addressOptional")} error={errOf("address")} className="sm:col-span-2">
                  <input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} onBlur={() => touch("address")} className={inputCls(!!errOf("address"))} />
                </Field>
                <Field label={t("ops.manual.landmark")}>
                  <input value={landmark} maxLength={160} onChange={(e) => setLandmark(e.target.value)} className={inputCls(false)} />
                </Field>
                <Field label={t("ops.manual.note")}>
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={inputCls(false)} />
                </Field>
              </div>
            </Section>

            {/* Summary */}
            <Section title={t("ops.manual.summary")} icon={<CalendarClockIcon />}>
              {stale && (
                <p role="status" className="rounded-xl bg-warn/10 px-3 py-2 text-[0.8125rem] text-warn-ink ring-1 ring-warn/30 ring-inset">
                  {t("ops.manual.pricesChanged")}
                </p>
              )}
              {quoteKey && (quoting && !quote) ? (
                <div className="grid gap-2" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="adm-shimmer h-4 rounded-md" style={{ width: `${90 - i * 20}%` }} />
                  ))}
                </div>
              ) : quote && (!editing || touchedSel) ? (
                <dl className={cn("grid gap-1.5 text-[0.8125rem] transition-opacity duration-150", quoting && "opacity-60")}>
                  {quote.lines.map((l, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3">
                      <dt className="min-w-0 truncate text-foreground/85">
                        {l.label}
                        {l.qty > 1 ? <span className="text-muted-foreground">{` × ${l.qty}`}</span> : null}
                      </dt>
                      <dd className="shrink-0 tabular-nums">{money(l.cents, quote.currency, locale)}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                    <dt>{t("ops.manual.delivery")}</dt>
                    <dd className="tabular-nums">{quote.shippingCents ? money(quote.shippingCents, quote.currency, locale) : t("ops.manual.free")}</dd>
                  </div>
                  {quote.adjustCents !== 0 && (
                    <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                      <dt>{t("ops.drawer.adjustment")}</dt>
                      <dd className="tabular-nums">{money(quote.adjustCents, quote.currency, locale)}</dd>
                    </div>
                  )}
                  <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border/70 pt-2 text-sm font-semibold">
                    <dt>{t("ops.manual.total")}</dt>
                    <dd className="tabular-nums">{money(quote.totalCents, quote.currency, locale)}</dd>
                  </div>
                </dl>
              ) : editing ? (
                <p className="text-[0.8125rem] text-muted-foreground">{t("ops.manual.editSummary")}</p>
              ) : (
                <p className="text-[0.8125rem] text-muted-foreground">{t("ops.manual.pickOffer")}</p>
              )}

              {boot.canAdjust && (
                <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <Field label={t("ops.manual.discount")}>
                    <input dir="ltr" inputMode="decimal" value={adjust} onChange={(e) => setAdjust(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 9))} placeholder="0" className={inputCls(false)} />
                  </Field>
                  <Field label={t("ops.manual.discountReason")}>
                    <input value={adjustReason} maxLength={200} onChange={(e) => setAdjustReason(e.target.value)} className={inputCls(false)} />
                  </Field>
                </div>
              )}

              {!editing && (
                <div className="grid gap-2 rounded-xl px-3 py-2.5 ring-1 ring-border ring-inset">
                  <label className="flex items-center justify-between gap-3">
                    <span className="grid gap-0.5">
                      <span className="text-[0.8125rem] font-medium">{t("ops.manual.confirmed")}</span>
                      <span className="text-xs text-muted-foreground">{t("ops.manual.confirmedHint")}</span>
                    </span>
                    <Switch checked={confirmed} onCheckedChange={setConfirmed} />
                  </label>
                  {confirmed && (
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[0.8125rem]">
                      <span className="text-muted-foreground">{shipAfter ? t("ops.hold.shipFrom", { date: ymdLabel(shipAfter, locale) }) : t("ops.manual.shipNow")}</span>
                      <span className="flex gap-1">
                        {shipAfter && (
                          <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setShipAfter(null)}>
                            {t("ops.drawer.remove")}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => setHoldOpen(true)}>
                          {t("ops.hold.deliverFrom")}
                        </Button>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {blocked && (
                <p className="flex items-center gap-2 rounded-xl bg-destructive/[0.06] px-3 py-2 text-[0.8125rem] text-destructive ring-1 ring-destructive/15 ring-inset">
                  <ShieldAlertIcon className="size-4 shrink-0" /> {t("ops.error.blocked")}
                </p>
              )}
              {duplicate && !blocked && (
                <div className="grid gap-1.5 rounded-xl bg-violet-500/[0.06] px-3 py-2.5 text-[0.8125rem] ring-1 ring-violet-500/20 ring-inset">
                  <p>{t("ops.error.duplicate")}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {quote!.duplicates.map((d) => (
                      <li key={d.id}>
                        <a href={storeView.href(`/orders?order=${d.id}`)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs underline-offset-4 hover:underline">
                          <bdi dir="ltr">{d.id}</bdi>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          </>
        )}
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-3 border-t border-border/70 bg-background px-5 py-3">
        <span className="min-w-0 text-sm">
          {quote && !editing ? (
            <>
              <span className="text-muted-foreground">{t("ops.manual.total")} </span>
              <span className="font-semibold tabular-nums">{money(quote.totalCents, quote.currency, locale)}</span>
            </>
          ) : null}
        </span>
        <span className="flex gap-2">
          <Button variant="ghost" className="rounded-full" onClick={close} disabled={saving}>
            {t("ops.common.cancel")}
          </Button>
          <Button className="rounded-full" onClick={() => void submit()} disabled={!canCreate}>
            {saving && <Loader2Icon className="animate-spin" />}
            {editing ? t("ops.drawer.save") : duplicate && dupConfirm ? t("ops.manual.createAnyway") : initial?.leadId ? t("ops.manual.convert") : t("ops.manual.create")}
          </Button>
        </span>
      </SheetFooter>

      <DateSheet
        open={holdOpen}
        onOpenChange={setHoldOpen}
        title={t("ops.hold.title")}
        description={t("ops.hold.hint")}
        now={new Date()}
        tz={storeView.timeZone}
        locale={locale}
        onPick={(ymd) => {
          setHoldOpen(false);
          setShipAfter(ymd);
        }}
      />
    </>
  );
}

type ManagerModel = ManualPageModel;

/** convertLeadToOrder's input: the page comes from the lead */
function withoutPage<T extends { pageId: string }>(input: T): Omit<T, "pageId"> {
  const { pageId: _pageId, ...rest } = input;
  return rest;
}

function errorText(t: ReturnType<typeof useT>, code: string): string {
  const key = `ops.error.${code}` as MessageKey;
  const text = t(key);
  return text === key ? t("ops.error.generic") : text;
}

/* ------------------------------------------------------------------ */
/* pickers                                                             */
/* ------------------------------------------------------------------ */

function SlotPicker({
  slot,
  unit,
  first,
  items,
  count,
  currency,
  errOf,
  onChange,
}: {
  slot: UnitSlot;
  unit: Unit;
  /** the first unit of its item: shared groups (perUnit false) are picked here only */
  first: boolean;
  items: ReadonlyMap<string, Item>;
  count: number;
  currency: string;
  errOf: (key: string) => string | undefined;
  onChange: (u: Unit) => void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const itemId = slot.item ?? unit.item ?? null;
  const item = itemId ? items.get(itemId) : undefined;
  const groups = (item?.groups ?? []).filter((g) => g.perUnit || first);
  if (!slot.choices && !groups.length) return null;
  return (
    <fieldset className="grid gap-2.5 rounded-xl p-3 ring-1 ring-border ring-inset">
      <legend className="sr-only">{t("ops.manual.unit", { n: slot.k + 1 })}</legend>
      <p className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{count > 1 ? t("ops.manual.unit", { n: slot.k + 1 }) : (item?.name ?? "")}</span>
        {slot.free && <span className="font-medium text-emerald-700 dark:text-emerald-300">{t("ops.manual.freeUnit")}</span>}
      </p>
      {slot.choices && (
        <Chips
          label={t("ops.manual.chooseItem")}
          error={errOf(`u.${slot.k}.@item`)}
          options={slot.choices.map((id) => ({ id, label: items.get(id)?.name || id, disabled: !(slot.available ?? []).includes(id) }))}
          value={unit.item ?? ""}
          onPick={(id) => onChange({ item: id, o: {}, f: {} })}
        />
      )}
      {groups.map((g) => (
        <GroupPicker
          key={g.id}
          group={g}
          rules={slot.rules}
          item={item}
          value={g.kind === "field" ? (unit.f[g.id] ?? "") : (unit.o[g.id] ?? "")}
          error={errOf(`u.${slot.k}.${g.id}`) ?? (item ? errOf(`s.${item.id}.${g.id}`) : undefined)}
          currency={currency}
          locale={locale}
          onChange={(v) => onChange(g.kind === "field" ? { ...unit, f: { ...unit.f, [g.id]: v } } : { ...unit, o: { ...unit.o, [g.id]: v } })}
        />
      ))}
    </fieldset>
  );
}

function GroupPicker({ group, rules, item, value, error, currency, locale, onChange }: { group: OptionGroup; rules: UnitSlot["rules"]; item: Item | undefined; value: string; error?: string; currency: string; locale: ReturnType<typeof useAdminLocale>; onChange: (v: string) => void }) {
  if (isChoiceGroup(group)) {
    const lock = group.perUnit ? ruleLock(rules?.[group.id]) : undefined;
    return (
      <Chips
        label={group.name}
        error={error}
        options={groupOptions(group, rules).map((o) => ({ id: o.id, label: o.label, swatch: o.swatch, disabled: o.soldOut || (!!lock && lock !== o.id), extra: o.delta ? `+${money(Math.round(o.delta * 100), currency, locale)}` : undefined }))}
        value={value}
        onPick={onChange}
      />
    );
  }
  if (isMatrixGroup(group)) {
    const combos = groupCombos(group, rules, item).filter((c) => c.state !== "none");
    return (
      <Chips
        label={group.name}
        error={error}
        options={combos.map((c) => ({ id: c.key, label: c.values.map((v) => v.value.label).join(" · "), disabled: c.state === "out", extra: c.delta ? `+${money(c.delta, currency, locale)}` : undefined }))}
        value={value}
        onPick={onChange}
      />
    );
  }
  if (isFieldGroup(group)) {
    return (
      <Field label={group.name} error={error} hint={group.help}>
        <input
          value={value}
          maxLength={group.maxLength}
          inputMode={group.input === "number" ? "numeric" : undefined}
          placeholder={group.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls(!!error)}
        />
      </Field>
    );
  }
  return null;
}

function ExtraPicker({ group, value, error, currency, onChange }: { group: ExtraGroup; value: string; error?: string; currency: string; onChange: (v: string) => void }) {
  const locale = useAdminLocale();
  if (group.kind === "field") {
    return (
      <Field label={group.name} error={error} hint={group.help}>
        <input value={value} maxLength={group.maxLength} placeholder={group.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls(!!error)} />
      </Field>
    );
  }
  return (
    <Chips
      label={group.name}
      error={error}
      options={group.options.map((o) => ({ id: o.id, label: o.label, swatch: o.swatch, disabled: o.soldOut, extra: o.delta ? `+${money(Math.round(o.delta * 100), currency, locale)}` : undefined }))}
      value={value}
      onPick={onChange}
    />
  );
}

function Chips({ label, options, value, error, onPick }: { label: string; options: { id: string; label: string; swatch?: string; disabled?: boolean; extra?: string }[]; value: string; error?: string; onPick: (id: string) => void }) {
  const t = useT();
  return (
    <div className="grid gap-1.5" role="radiogroup" aria-label={label}>
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === value}
            disabled={o.disabled}
            onClick={() => onPick(o.id)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] ring-1 transition-colors duration-150 ring-inset disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through",
              o.id === value ? "bg-foreground text-background ring-foreground" : "ring-border hover:bg-foreground/[0.04]",
            )}
          >
            {o.swatch && <span className="size-3.5 rounded-full ring-1 ring-foreground/15" style={{ background: o.swatch }} aria-hidden="true" />}
            {o.label}
            {o.extra && <span className={cn("text-xs tabular-nums", o.id === value ? "text-background/70" : "text-muted-foreground")}>{o.extra}</span>}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{t(`ops.manual.err.${error}` as MessageKey)}</p>}
    </div>
  );
}

function CityCombo({ value, cities, locale, invalid, onChange, onBlur }: { value: string; cities: Boot["cities"]; locale: string; invalid: boolean; onChange: (v: string) => void; onBlur: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = foldCity(value);
  const label = (c: Boot["cities"][number]) => (locale === "ar" ? c.ar : locale === "en" ? c.en : c.value);
  const matches = q ? cities.filter((c) => [c.value, c.ar, c.en].some((x) => foldCity(x).includes(q))).slice(0, 8) : cities.slice(0, 8);
  const pick = (c: Boot["cities"][number]) => {
    onChange(c.value);
    setOpen(false);
  };
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
          onBlur();
        }}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(matches.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={cities.length ? t("ops.manual.cityPlaceholder") : ""}
        className={inputCls(invalid)}
      />
      {open && cities.length > 0 && matches.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl bg-popover p-1 shadow-lg ring-1 ring-foreground/10">
          {matches.map((c, i) => (
            <li
              key={c.key}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[0.8125rem]", i === active && "bg-foreground/[0.05]")}
            >
              <span>{label(c)}</span>
              {label(c) !== c.value && <span className="text-xs text-muted-foreground">{c.value}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* frame                                                               */
/* ------------------------------------------------------------------ */

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 text-[0.8125rem] font-semibold [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  const t = useT();
  return (
    <label className={cn("grid gap-1", className)}>
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{t(`ops.manual.err.${error}` as MessageKey)}</span> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputCls = (invalid: boolean) =>
  cn(
    "h-10 w-full rounded-lg border bg-transparent px-3 text-[0.875rem] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50",
    invalid ? "border-destructive/60" : "border-input",
  );

/** "0612345678" → "06 12 34 56 78" for Morocco; other markets keep the digits as typed. */
function formatAsYouType(raw: string, country: string): string {
  const clean = raw.replace(/[^\d+]/g, "").slice(0, 16);
  if (country !== "MA" || clean.startsWith("+")) return clean;
  return clean.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

function SheetSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      {[40, 120, 40, 160, 100].map((h, i) => (
        <div key={i} className="adm-shimmer rounded-xl" style={{ height: h }} />
      ))}
    </div>
  );
}
