"use client";
/**
 * `/admin/settings/brands` (platform.md PLA-§13.3, PD70, SEC-18): the protected terms (offensive ones "••••" until
 * Show), add / edit / disable (seeded rows are never deleted; staff-added rows can be), and "Check a name": the same
 * matcher as the write path (`brandMatches`), with the points the sign-up score gives each match.
 */
import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { checkBrandNameAction, deleteProtectedBrandAction, saveProtectedBrandAction } from "@/app/admin/(console)/settings/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { BrandMatch } from "@/lib/platform/brand-match";
import type { ProtectedBrandRow } from "@/lib/platform/settings-view";
import { DEFAULT_SIGNUP_POINTS } from "@/lib/platform/signup-band";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { ConsoleDialog } from "../queue/decision-dialogs";
import { Banner, button, card, EmptyLine, Field, inputCls, SettingsCard, StatusText, SwitchRow, td, th } from "../kit";

const KINDS = ["brand", "bank", "carrier", "gov", "platform", "offensive"] as const;
type Kind = (typeof KINDS)[number];

export function Brands({ rows }: { rows: ProtectedBrandRow[] }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<ProtectedBrandRow | "new" | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const list = rows.filter((r) => kind === "all" || r.kind === kind);
  return (
    <div className="grid gap-4">
      <CheckName />
      <section aria-label={t("console.brands.title")} className={card}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.brands.terms", { count: rows.length })}</h2>
            <p className="text-[12.5px] text-muted-foreground">{t("console.brands.terms_lead")}</p>
          </div>
          <select aria-label={t("console.brands.kind")} value={kind} onChange={(e) => setKind(e.target.value as Kind | "all")} className={cn(inputCls, "w-auto")}>
            <option value="all">{t("console.brands.kind_all")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`console.brands.kind.${k}`)}
              </option>
            ))}
          </select>
          <button type="button" aria-pressed={show} onClick={() => setShow(!show)} className={cn(button.base, button.secondary)}>
            {show ? <EyeOffIcon aria-hidden="true" className="size-3.5" /> : <EyeIcon aria-hidden="true" className="size-3.5" />}
            {t(show ? "console.brands.hide" : "console.brands.show")}
          </button>
          <button type="button" onClick={() => setEdit("new")} className={cn(button.base, button.primary)}>
            <PlusIcon aria-hidden="true" className="size-3.5" />
            {t("console.brands.add")}
          </button>
        </div>
        {g.problem && <p className="px-5 pb-2 text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
        {list.length === 0 ? (
          <EmptyLine>{t("console.brands.empty")}</EmptyLine>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-[var(--c-hairline)]">
                  <th className={th}>{t("console.brands.term")}</th>
                  <th className={th}>{t("console.brands.kind")}</th>
                  <th className={th}>{t("console.brands.match")}</th>
                  <th className={th}>{t("console.brands.active")}</th>
                  <th className={th}>{t("console.brands.note")}</th>
                  <th className={th}>{t("console.brands.added_by")}</th>
                  <th className={th}>
                    <span className="sr-only">{t("console.codes.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={cn("border-b border-[var(--c-hairline)] last:border-0", !r.active && "text-muted-foreground")}>
                    <td className={cn(td, "font-medium")}>
                      <bdi>{r.kind === "offensive" && !show ? "••••" : r.term}</bdi>
                    </td>
                    <td className={td}>{t(`console.brands.kind.${r.kind}`)}</td>
                    <td className={td}>{t(`console.brands.match.${r.match}`)}</td>
                    <td className={td}>{r.active ? <StatusText tone="ok">{t("console.brands.on")}</StatusText> : <StatusText tone="neutral">{t("console.brands.off")}</StatusText>}</td>
                    <td className={cn(td, "max-w-[220px] truncate text-muted-foreground")}>{r.kind === "offensive" && !show ? "" : (r.note ?? "")}</td>
                    <td className={cn(td, "text-muted-foreground")}>{r.addedBy ? (r.addedBy.name ?? "—") : t("console.brands.seeded_row")}</td>
                    <td className={cn(td, "w-px whitespace-nowrap text-end")}>
                      <button type="button" aria-label={t("console.brands.edit")} onClick={() => setEdit(r)} className={cn(button.base, button.ghost, "h-8 px-2")}>
                        <PencilIcon aria-hidden="true" className="size-3.5" />
                      </button>
                      {r.addedBy && (
                        <button type="button" aria-label={t("console.brands.delete")} disabled={g.busy} onClick={() => void g.run((opId) => deleteProtectedBrandAction({ id: r.id, opId }), () => (g.reset(), toast.success(t("console.brands.deleted")), router.refresh()))} className={cn(button.base, button.ghost, "h-8 px-2 hover:text-[var(--c-danger-ink)]")}>
                          <Trash2Icon aria-hidden="true" className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {g.sheet}
      </section>
      <SettingsCard title={t("console.brands.live")} lead={t("console.brands.live_lead")}>
        <ul className="grid gap-1.5 text-[12.5px] text-muted-foreground">
          <li>{t("console.brands.live_1")}</li>
          <li>{t("console.brands.live_2")}</li>
          <li>{t("console.brands.live_3")}</li>
        </ul>
      </SettingsCard>
      {edit && <BrandDialog row={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BrandDialog({ row, onClose }: { row: ProtectedBrandRow | null; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [v, setV] = useState({ term: row?.term ?? "", kind: (row?.kind ?? "brand") as Kind, match: (row?.match === "exact" ? "exact" : "substring") as "exact" | "substring", active: row?.active ?? true, note: row?.note ?? "" });
  const ok = v.term.trim().length >= 2 && v.term.trim().length <= 60;
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(row ? "console.brands.edit_title" : "console.brands.add_title")}
      description={row && !row.addedBy ? t("console.brands.seeded_note") : t("console.brands.dialog_lead")}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.form.cancel")}
          </button>
          <button
            type="button"
            disabled={!ok || g.busy}
            onClick={() => void g.run((opId) => saveProtectedBrandAction({ id: row?.id, term: v.term.trim(), kind: v.kind, match: v.match, active: v.active, note: v.note.trim() || undefined, opId }), () => (toast.success(t("console.brands.saved")), onClose(), router.refresh()))}
            className={cn(button.base, button.primary)}
          >
            {t("console.form.save")}
          </button>
          {g.sheet}
        </>
      }
    >
      <Field label={t("console.brands.term")} hint={t("console.brands.term_hint")}>
        {(id, d) => <input id={id} aria-describedby={d} autoFocus value={v.term} maxLength={60} onChange={(e) => setV({ ...v, term: e.target.value })} className={inputCls} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("console.brands.kind")}>
          {(id) => (
            <select id={id} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Kind })} className={inputCls}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`console.brands.kind.${k}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("console.brands.match")}>
          {(id) => (
            <select id={id} value={v.match} onChange={(e) => setV({ ...v, match: e.target.value as "exact" | "substring" })} className={inputCls}>
              <option value="substring">{t("console.brands.match.substring")}</option>
              <option value="exact">{t("console.brands.match.exact")}</option>
            </select>
          )}
        </Field>
      </div>
      <Field label={t("console.brands.note")} optional>
        {(id) => <input id={id} value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} className={inputCls} />}
      </Field>
      <SwitchRow label={t("console.brands.active")} hint={t("console.brands.active_hint")} checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
    </ConsoleDialog>
  );
}

function pointsOf(m: BrandMatch): { code: "brand_exact" | "brand_near" | "offensive_term"; points: number } | null {
  if (m.verdict === "ok") return null;
  const code = m.termKind === "offensive" ? "offensive_term" : m.verdict === "exact" ? "brand_exact" : "brand_near";
  return { code, points: DEFAULT_SIGNUP_POINTS[code] };
}

function CheckName() {
  const t = useT();
  const g = useGuarded();
  const [value, setValue] = useState("");
  const [res, setRes] = useState<{ value: string; storeName: BrandMatch; handle: BrandMatch } | null>(null);
  const run = () => value.trim() && void g.run(() => checkBrandNameAction({ value: value.trim() }), (d) => setRes({ value: value.trim(), ...d }));
  return (
    <SettingsCard title={t("console.brands.check")} lead={t("console.brands.check_lead")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex gap-2"
      >
        <input aria-label={t("console.brands.check")} value={value} maxLength={200} placeholder={t("console.brands.check_placeholder")} onChange={(e) => setValue(e.target.value)} className={cn(inputCls, "md:max-w-md")} />
        <button type="submit" disabled={!value.trim() || g.busy} className={cn(button.base, button.secondary)}>
          <SearchIcon aria-hidden="true" className="size-3.5" />
          {t("console.brands.check_run")}
        </button>
      </form>
      {g.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      {res && (
        <div className="grid gap-2" aria-live="polite">
          {(["storeName", "handle"] as const).map((f) => {
            const m = res[f];
            const p = pointsOf(m);
            return (
              <div key={f} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-control)] bg-muted/40 px-3 py-2">
                <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{t(`console.brands.as_${f}`)}</span>
                {m.verdict === "ok" ? (
                  <StatusText tone="ok">{t("console.brands.no_match")}</StatusText>
                ) : (
                  <>
                    <StatusText tone={m.verdict === "exact" ? "danger" : "warn"}>{t(`console.brands.verdict.${m.verdict}`)}</StatusText>
                    {m.term && (
                      <span className="text-[12.5px]">
                        «<bdi>{m.termKind === "offensive" ? "••••" : m.term}</bdi>» · {m.termKind ? t(`console.brands.kind.${m.termKind}`) : ""}
                      </span>
                    )}
                    {p && <span className="num ms-auto rounded-[var(--r-chip)] bg-card px-1.5 py-0.5 text-[11.5px] font-medium shadow-[inset_0_0_0_1px_var(--border)]">{t("console.brands.points", { points: p.points, code: p.code })}</span>}
                  </>
                )}
              </div>
            );
          })}
          {res.storeName.verdict === "exact" && <Banner tone="danger">{t("console.brands.would_refuse")}</Banner>}
        </div>
      )}
      {g.sheet}
    </SettingsCard>
  );
}
