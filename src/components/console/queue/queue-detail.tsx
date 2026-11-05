"use client";
/**
 * The approval queue's detail pane (platform.md PLA-§3.5 "Detail pane", items 1-7; PD16, PD35, PD52, PD65):
 *   1. header: store, handle, mode, market; the applicant (e-mail in full for admin+, masked for support and analyst,
 *      as the server sent it), the masked phone, the signup age; Open profile (E) and View as store (V);
 *   2. score card: the 56 px ring, the band, the Why list (`explainFlag` sentences, points crimson + / emerald −,
 *      evidence chips), the partial line, the counterfactual line (pivot / margin / hold) and the 0-100 thresholds bar;
 *   3. business context (the social link as plain text with Copy, never a link), the question and the answer;
 *   4. draft evidence chips (facts only; "No page yet", and never a number for an absent Design check), then the
 *      9:16 preview in an iframe sandboxed `allow-scripts` only (never `allow-same-origin`) on the 10-minute token;
 *   5. linked accounts; 6. notes (pinned first) with the inline composer; 7. the decision bar, passed in by the split.
 * Tenant HTML is never rendered here outside that iframe: every store value is text.
 *
 *   <QueueDetail pane={pane} bar={<DecisionBar …/>} onReload={() => load(id, true)} />
 */
import { CopyIcon, ExternalLinkIcon, EyeIcon, MonitorIcon, PinIcon, RefreshCwIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { addNoteAction } from "@/app/admin/(console)/stores/[id]/actions";
import { StatusPill } from "@/components/admin/common/status-pill";
import { useT } from "@/lib/i18n/admin/client";
import { renderMarkdownLite } from "@/lib/platform/markdown-lite";
import type { NoteView } from "@/lib/platform/notes";
import type { ReviewDetail } from "@/lib/platform/queue";
import type { ReviewPane } from "@/lib/platform/queue-pane";
import type { SignupBand } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { useNow } from "../shell/context";
import { newOpId } from "../op";
import { PrefetchLink } from "../prefetch-link";
import { ScoreRing } from "../ring";
import { bandTint, TINT_INK, TINT_SOFT, TINT_STROKE } from "../tints";
import { button, Kbd, NoteField, useRequestSummary } from "./decision-dialogs";
import { Chip, MarkTerms } from "./queue-row";
import styles from "../shell/console.module.css";

const LOWER: Record<SignupBand, SignupBand | null> = { fast: null, review: "fast", hold: "review", reject_candidate: "hold" };
/** the evidence keys the risk score stores (src/lib/platform/signup-risk.ts); any other key shows as itself */
const EVIDENCE_KEYS = new Set(["domain", "field", "term", "users", "banned", "ms", "uaLabel", "phoneCountry", "market", "label"]);

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-2.5 border-b border-[var(--c-hairline)] px-4 py-4 md:px-5", className)}>
      <div className="flex min-h-5 items-center gap-2">
        <h3 className="min-w-0 flex-1 text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[112px_1fr] items-baseline gap-3 py-[3px] text-[13px] max-sm:grid-cols-1 max-sm:gap-0.5">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function useFlagText() {
  const t = useT();
  return (code: string, evidence: Record<string, string | number>) => {
    const vars: Record<string, string | number> = { ...evidence };
    if (typeof evidence.field === "string") vars.field = t(`console.risk.field.${evidence.field}`);
    return t(`console.risk.${code}`, vars);
  };
}

/** The 0-100 bar of the thresholds in force, the stored score marked (how close the call is). */
function ThresholdBar({ score, th }: { score: number; th: ReviewDetail["scoreCard"]["thresholds"] }) {
  const t = useT();
  const all: { band: SignupBand; from: number; to: number }[] = [
    { band: "fast", from: 0, to: th.fastLaneMax },
    { band: "review", from: th.fastLaneMax, to: th.holdMin },
    { band: "hold", from: th.holdMin, to: th.rejectCandidateMin },
    { band: "reject_candidate", from: th.rejectCandidateMin, to: 100 },
  ];
  const segs = all.filter((s) => s.to > s.from);
  const at = Math.max(0, Math.min(100, score));
  return (
    <div className="grid gap-1.5" aria-label={t("console.queue.thresholds_label", { fast: th.fastLaneMax, hold: th.holdMin, reject: th.rejectCandidateMin, score })} role="img">
      <div className="relative h-2">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          {segs.map((s) => (
            <span key={s.band} className="h-full" style={{ width: `${s.to - s.from}%`, background: TINT_SOFT[bandTint(s.band)], boxShadow: `inset 0 -2px 0 ${TINT_STROKE[bandTint(s.band)]}` }} />
          ))}
        </div>
        <span aria-hidden="true" className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_0_2px_var(--card)] rtl:translate-x-1/2" style={{ insetInlineStart: `${at}%` }} />
      </div>
      <div className="num relative h-3.5 text-[10.5px] text-muted-foreground" aria-hidden="true">
        <span className="absolute start-0">0</span>
        {[th.fastLaneMax, th.holdMin, th.rejectCandidateMin].map((v, i) => (
          <span key={i} className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${v}%` }}>
            {v}
          </span>
        ))}
        <span className="absolute end-0">100</span>
      </div>
    </div>
  );
}

function ScoreCard({ d }: { d: ReviewDetail }) {
  const t = useT();
  const flagText = useFlagText();
  const sc = d.scoreCard;
  const ex = sc.explanation;
  const tint = bandTint(d.band);
  const lower = LOWER[ex.band];
  return (
    <Section title={t("console.queue.detail.score")}>
      <div className="flex items-center gap-4">
        <ScoreRing score={d.score} tint={tint} size={56} />
        <div className="grid min-w-0 gap-0.5">
          <span className={cn("text-[15px] font-semibold tracking-[-0.006em]", TINT_INK[tint] === "text-muted-foreground" ? "text-foreground" : TINT_INK[tint])}>{t(`console.band.${d.band}`)}</span>
          <span className="num text-[12px] text-muted-foreground">{t("console.queue.detail.score_line", { score: d.score })}</span>
          {sc.appeal && <Chip tint="yellow">{t("console.queue.appeal")}</Chip>}
        </div>
      </div>

      {sc.flags.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("console.queue.detail.no_flags")}</p>
      ) : (
        <ul className="grid">
          {sc.flags.map((f) => (
            <li key={f.code} className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 border-b border-[var(--c-hairline)] py-2 last:border-b-0">
              <span className="text-[13px] leading-[1.45]">{flagText(f.code, f.evidence)}</span>
              <span className={cn("num pt-px text-[12.5px] font-semibold", f.points > 0 ? "text-[var(--c-danger-ink)]" : f.points < 0 ? TINT_INK.emerald : "text-muted-foreground")}>
                {f.points > 0 ? `+${f.points}` : f.points < 0 ? `−${Math.abs(f.points)}` : "0"}
              </span>
              {Object.keys(f.evidence).length > 0 && (
                <span className="col-span-2 flex flex-wrap gap-1">
                  {Object.entries(f.evidence).map(([k, v]) => (
                    <span key={k} className="inline-flex h-[18px] items-center gap-1 rounded-[5px] bg-secondary px-1.5 text-[11px] text-muted-foreground">
                      <span>{EVIDENCE_KEYS.has(k) ? t(`console.queue.evidence_key.${k}`) : k}</span>
                      <bdi dir="ltr" className="font-mono text-foreground/80">
                        {k === "field" ? t(`console.risk.field.${v}`) : String(v)}
                      </bdi>
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {sc.partial && <p className="text-[12.5px] text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.86_0.11_95)]">{t("console.queue.partial")}</p>}

      <div className="grid gap-1 rounded-[var(--r-control)] bg-muted/60 px-3 py-2 text-[12.5px]">
        {ex.pivot ? (
          <p>{t("console.queue.pivot", { flag: t(`console.sflag.${ex.pivot.code}`), band: t(`console.band.${ex.pivot.bandWithout}`) })}</p>
        ) : lower && ex.marginToLower > 0 ? (
          <p>{t("console.queue.margin", { band: t(`console.band.${lower}`), points: ex.marginToLower })}</p>
        ) : (
          <p className="text-muted-foreground">{t(ex.band === "fast" ? "console.queue.lowest_band" : "console.queue.no_pivot")}</p>
        )}
        {ex.holds.length > 0 && <p>{t("console.queue.hold", { flag: ex.holds.map((c) => t(`console.sflag.${c}`)).join(", ") })}</p>}
      </div>
      <ThresholdBar score={d.score} th={sc.thresholds} />
    </Section>
  );
}

function RequestCard({ d }: { d: ReviewDetail }) {
  const t = useT();
  const summary = useRequestSummary();
  const req = d.request;
  return (
    <Section title={t("console.queue.detail.request")}>
      <p className="text-[14px] font-medium">{summary(req)}</p>
      {req && "message" in req && req.message ? <p className="rounded-[var(--r-control)] bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap">{req.message}</p> : <p className="text-[12.5px] text-muted-foreground">{t("console.request.no_message")}</p>}
      <dl>
        <Fact label={t("console.queue.detail.store_status")}>
          <StatusPill status={d.store.status} size="sm" />
        </Fact>
        <Fact label={t("console.queue.detail.requested")}>
          <Ago iso={d.createdAt} />
        </Fact>
      </dl>
    </Section>
  );
}

function CopyText({ value }: { value: string }) {
  const t = useT();
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <bdi dir="ltr" className="min-w-0 truncate font-mono text-[12.5px]">
        {value}
      </bdi>
      <button
        type="button"
        aria-label={t("console.queue.copy")}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => toast.success(t("console.queue.copied")),
            () => toast.error(t("console.queue.copy_failed")),
          );
        }}
        className="inline-grid size-6 shrink-0 place-items-center rounded-[var(--r-chip)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-10"
      >
        <CopyIcon aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}

function ContextCard({ d }: { d: ReviewDetail }) {
  const t = useT();
  const c = d.context;
  if (!c) return null;
  return (
    <Section title={t("console.queue.detail.context")}>
      <dl>
        {c.sells && <Fact label={t("console.queue.detail.sells")}>{c.sells}</Fact>}
        {c.link && (
          <Fact label={t("console.queue.detail.link")}>
            <CopyText value={c.link} />
          </Fact>
        )}
        {c.whatsapp && (
          <Fact label={t("console.queue.detail.whatsapp")}>
            <bdi dir="ltr" className="num">
              {c.whatsapp}
            </bdi>
          </Fact>
        )}
        {c.appeal && <Fact label={t("console.queue.detail.appeal")}>{c.appeal}</Fact>}
      </dl>
      {c.question && (
        <div className="grid gap-2 rounded-[var(--r-control)] bg-muted/60 p-3">
          <div className="grid gap-0.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">{t("console.queue.detail.question")}</span>
            <p className="text-[13px] whitespace-pre-wrap">{c.question}</p>
          </div>
          <div className="grid gap-0.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">{d.answeredAt ? t("console.queue.detail.answer") : t("console.queue.detail.no_answer")}</span>
            {c.answer && <p className="text-[13px] whitespace-pre-wrap">{c.answer}</p>}
          </div>
        </div>
      )}
      {!c.sells && !c.link && !c.whatsapp && !c.question && !c.appeal && <p className="text-[12.5px] text-muted-foreground">{t("console.queue.detail.context_empty")}</p>}
    </Section>
  );
}

function designLine(t: ReturnType<typeof useT>, design: NonNullable<ReviewDetail["evidence"]["design"]>): string | null {
  const parts: string[] = [];
  if (design.q !== null) parts.push(t("console.queue.evidence.q", { q: design.q }));
  if (design.slop !== null) parts.push(t("console.queue.evidence.slop", { slop: design.slop }));
  if (design.hardFailing !== null) parts.push(design.hardFailing === 0 ? t("console.queue.evidence.gates_green") : t("console.queue.evidence.gates_failing", { count: design.hardFailing }));
  return parts.length ? parts.join(" · ") : null;
}

/** "$0.42": micro-dollars as dollars with cents (AI cost is in USD platform-wide, ai.md). */
const usd = (micros: number) => `$${(Math.max(0, micros) / 1_000_000).toFixed(2)}`;

/** "Private link, 8 min left" (the 10-minute staff token, PD16); the server's first paint and the client's tick may differ. */
function ValidFor({ expiresAt }: { expiresAt: string }) {
  const t = useT();
  const now = useNow(30_000);
  const left = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  return (
    <span className="num ms-auto text-[11.5px] text-muted-foreground" suppressHydrationWarning>
      {left > 0 ? t("console.queue.preview.valid", { minutes: left }) : t("console.queue.preview.expired")}
    </span>
  );
}

function Preview({ url, expiresAt, onReload }: { url: string; expiresAt: string; onReload(): void }) {
  const t = useT();
  const [mode, setMode] = useState<"phone" | "desktop">("phone");
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => entry && setScale(entry.contentRect.width / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  const frame = (
    <iframe
      // tenant HTML only ever renders here: scripts may run, but never on the console's origin (PD16)
      sandbox="allow-scripts"
      src={url}
      title={t("console.queue.preview.title")}
      referrerPolicy="no-referrer"
      loading="lazy"
      className="block border-0 bg-white"
      style={mode === "phone" ? { width: "100%", height: "100%" } : { width: 1280, height: 800, transform: `scale(${scale})`, transformOrigin: "top left" }}
    />
  );
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label={t("console.queue.preview.size")} className="inline-flex rounded-[var(--r-control)] bg-secondary p-0.5">
          {(["phone", "desktop"] as const).map((m) => {
            const Icon = m === "phone" ? SmartphoneIcon : MonitorIcon;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-10", mode === m ? "bg-card font-medium shadow-[0_1px_2px_oklch(0.2_0.01_230/0.12)]" : "text-muted-foreground")}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {t(`console.queue.preview.${m}`)}
              </button>
            );
          })}
        </div>
        <ValidFor expiresAt={expiresAt} />
        <button type="button" onClick={onReload} aria-label={t("console.queue.preview.reload")} className="inline-grid size-7 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-10">
          <RefreshCwIcon aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      {mode === "phone" ? (
        <div className="mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_var(--c-hairline),0_12px_32px_-16px_oklch(0.2_0.01_230/0.3)]">{frame}</div>
      ) : (
        <div ref={box} className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--r-control)] bg-white shadow-[0_0_0_1px_var(--c-hairline)]">
          {frame}
        </div>
      )}
    </div>
  );
}

function Evidence({ d, onReload }: { d: ReviewDetail; onReload(): void }) {
  const t = useT();
  const e = d.evidence;
  const to = `/admin/stores/${d.store.id}#pages`;
  const link = "outline-none rounded-[5px] focus-visible:ring-2 focus-visible:ring-[var(--ring)] hover:opacity-80";
  const design = e.design ? designLine(t, e.design) : null;
  return (
    <Section title={t("console.queue.detail.evidence")}>
      <div className="flex flex-wrap gap-1.5">
        <PrefetchLink href={to} className={link}>
          <Chip tint={e.readiness === "submitted" ? "emerald" : "neutral"}>{t(`console.queue.readiness.${e.readiness}`)}</Chip>
        </PrefetchLink>
        {e.readiness !== "no_page" && (
          <PrefetchLink href={to} className={link}>
            <Chip tint={e.design?.hardFailing ? "yellow" : "neutral"} className="max-w-none">
              {design ?? t("console.queue.evidence.design_none")}
            </Chip>
          </PrefetchLink>
        )}
        {e.honesty && (
          <PrefetchLink href={to} className={link}>
            <Chip tint={e.honesty.count > 0 ? "yellow" : "neutral"} className="max-w-[320px]">
              {e.honesty.count === 0 ? t("console.queue.evidence.honesty_none") : e.honesty.first ? t("console.queue.evidence.honesty", { count: e.honesty.count, first: e.honesty.first }) : t("console.queue.evidence.honesty_count", { count: e.honesty.count })}
            </Chip>
          </PrefetchLink>
        )}
        {e.genomeBand && (
          <PrefetchLink href={to} className={link}>
            <Chip tint={e.genomeBand === "too_close" ? "yellow" : "neutral"}>{t(`console.queue.evidence.genome.${e.genomeBand}`)}</Chip>
          </PrefetchLink>
        )}
        {e.ai && (
          <PrefetchLink href={to} className={link}>
            <Chip tint={e.ai.tint ? "yellow" : "neutral"} title={e.ai.tint ? t("console.queue.evidence.ai_tint") : undefined}>
              <span className="num">
                {e.ai.creditsLimit !== null ? t("console.queue.ai_used", { used: e.ai.creditsUsed, limit: e.ai.creditsLimit, cost: usd(e.ai.costMicros) }) : t("console.queue.ai_used_open", { used: e.ai.creditsUsed, cost: usd(e.ai.costMicros) })}
              </span>
            </Chip>
          </PrefetchLink>
        )}
      </div>
      {e.preview ? (
        <Preview url={e.preview.url} expiresAt={e.preview.expiresAt} onReload={onReload} />
      ) : (
        <div className="grid place-items-center gap-1 rounded-[var(--r-control)] bg-muted/50 px-4 py-8 text-center shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <p className="text-[13px] font-medium">{t(e.readiness === "no_page" ? "console.queue.readiness.no_page" : "console.queue.preview.unavailable")}</p>
          <p className="text-[12px] text-muted-foreground">{t(e.readiness === "no_page" ? "console.queue.preview.no_page_hint" : "console.queue.preview.unavailable_hint")}</p>
        </div>
      )}
    </Section>
  );
}

function Linked({ d }: { d: ReviewDetail }) {
  const t = useT();
  if (!d.linked.length) return null;
  return (
    <Section title={t("console.queue.detail.linked", { count: d.linked.length })}>
      <ul className="grid gap-1.5">
        {d.linked.map((a) => (
          <li key={a.userId} className="grid gap-1.5 rounded-[var(--r-control)] p-2.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <PrefetchLink href={`/admin/users/${a.userId}`} className="min-w-0 truncate rounded-[4px] text-[13px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <bdi dir="ltr">{a.email}</bdi>
              </PrefetchLink>
              {a.banned && <Chip tint="crimson">{t("console.queue.banned")}</Chip>}
              <span className="ms-auto flex flex-wrap gap-1">
                {a.kinds.map((k) => (
                  <Chip key={k} tint="neutral">
                    {t(`console.queue.link_kind.${k}`)}
                  </Chip>
                ))}
              </span>
            </div>
            {a.stores.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {a.stores.map((s) => (
                  <li key={s.id} className="flex min-w-0 items-center gap-1.5 text-[12px]">
                    <PrefetchLink href={`/admin/stores/${s.id}`} className="min-w-0 truncate rounded-[4px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                      {s.name} <bdi dir="ltr" className="font-mono text-muted-foreground">@{s.handle}</bdi>
                    </PrefetchLink>
                    <StatusPill status={s.status} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Notes({ storeId, notes, onAdded }: { storeId: string; notes: NoteView[] | null; onAdded(): void }) {
  const t = useT();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const op = useRef(newOpId());
  if (notes === null) return null;
  const submit = () => {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const r = await addNoteAction({ storeId, body: text, opId: op.current });
      if (r.ok) {
        setBody("");
        op.current = newOpId();
        toast.success(t("console.queue.note_added"));
        onAdded();
      } else toast.error(t(r.message ?? "console.queue.note_failed"));
    });
  };
  return (
    <Section title={t("console.queue.detail.notes", { count: notes.length })}>
      {notes.length > 0 && (
        <ul className="grid gap-2">
          {notes.map((n) => (
            <li key={n.id} className={cn("grid gap-1 rounded-[var(--r-control)] p-2.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]", n.pinned && "bg-[var(--brand-soft)]/40")}>
              <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                {n.pinned && <PinIcon aria-label={t("console.queue.pinned")} className="size-3 shrink-0 text-[var(--c-brand-ink)]" />}
                <span className="truncate font-medium text-foreground/80">{n.author.name ?? t("console.queue.someone")}</span>
                {n.kind !== "note" && <Chip tint={n.kind === "warning" ? "yellow" : "neutral"}>{t(`console.queue.note_kind.${n.kind}`)}</Chip>}
                <Ago iso={n.createdAt} className="ms-auto shrink-0" />
              </div>
              <div className="text-[13px] leading-[1.5] [&_p]:my-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:ps-4">{renderMarkdownLite(n.body)}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2">
        <NoteField label={t("console.queue.add_note")} value={body} onChange={setBody} max={4000} required rows={2} />
        <div className="flex justify-end">
          <button type="button" disabled={pending || !body.trim()} onClick={submit} className={cn(button.base, button.secondary)}>
            {t("console.queue.save_note")}
          </button>
        </div>
      </div>
    </Section>
  );
}

function Decided({ d }: { d: ReviewDetail }) {
  const t = useT();
  if (!d.decision) return null;
  const verb = d.status === "approved" ? "approved" : d.status === "rejected" ? "rejected" : "withdrawn";
  return (
    <Section title={t("console.queue.detail.decision")}>
      <p className="text-[13px]">
        {d.decision.by ? t(`console.queue.decided_by.${verb}`, { name: d.decision.by.name || t("console.queue.someone") }) : t(`console.queue.decided_auto.${verb}`)} <Ago iso={d.decision.at} className="text-muted-foreground" />
      </p>
      <dl>
        {d.decision.reason && <Fact label={t("console.queue.detail.reason")}>{t(`console.queue.reason_code.${d.decision.reason}`)}</Fact>}
        {d.decision.note && <Fact label={t("console.queue.note")}>{d.decision.note}</Fact>}
        {d.decision.blocked && <Fact label={t("console.queue.detail.blocked")}>{t("console.queue.detail.blocked_yes")}</Fact>}
      </dl>
    </Section>
  );
}

export function QueueDetail({ pane, bar, onReload, onOpenProfile, onViewAs, canViewAs }: { pane: ReviewPane; bar: ReactNode; onReload(): void; onOpenProfile(): void; onViewAs(): void; canViewAs: boolean }) {
  const t = useT();
  const d = pane.detail;
  const isRequest = !!d.request || (d.kind !== "signup" && d.kind !== "reopen");
  const nameTerms = d.scoreCard.flags.filter((f) => (f.code === "brand_exact" || f.code === "brand_near") && f.evidence.field === "store_name").map((f) => String(f.evidence.term ?? "").toLowerCase());
  const handleTerms = d.scoreCard.flags.filter((f) => (f.code === "brand_exact" || f.code === "brand_near") && f.evidence.field === "handle").map((f) => String(f.evidence.term ?? "").toLowerCase());
  return (
    <article aria-label={d.store.name} className="flex min-h-full flex-col">
      <header className="grid gap-3 border-b border-[var(--c-hairline)] px-4 pt-4 pb-4 md:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 className="min-w-0 text-[17px] leading-tight font-semibold tracking-[-0.012em] break-words">
              <MarkTerms text={d.store.name} terms={nameTerms} />
            </h2>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
              {d.store.handle && (
                <bdi dir="ltr" className="font-mono">
                  @<MarkTerms text={d.store.handle} terms={handleTerms} />
                </bdi>
              )}
              <Chip tint="neutral">{t(`console.mode.${d.store.mode}`)}</Chip>
              <span className="font-mono text-[11.5px]">{d.store.market}</span>
              <StatusPill status={d.store.status} size="sm" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={onOpenProfile} className={cn(button.base, button.secondary, "px-2.5")}>
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              <span className="max-sm:sr-only">{t("console.queue.open_profile")}</span>
              <Kbd>E</Kbd>
            </button>
            {canViewAs && (
              <button type="button" onClick={onViewAs} className={cn(button.base, button.secondary, "px-2.5")}>
                <EyeIcon aria-hidden="true" className="size-3.5" />
                <span className="max-sm:sr-only">{t("console.queue.view_as")}</span>
                <Kbd>V</Kbd>
              </button>
            )}
          </div>
        </div>
        <dl className="grid">
          <Fact label={t("console.queue.detail.applicant")}>
            <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{d.applicant.name}</span>
              {d.applicant.banned && <Chip tint="crimson">{t("console.queue.banned")}</Chip>}
            </span>
          </Fact>
          <Fact label={t("console.queue.detail.email")}>
            <bdi dir="ltr" className="break-all">
              {d.applicant.email}
            </bdi>
          </Fact>
          {d.applicant.phone && (
            <Fact label={t("console.queue.detail.phone")}>
              <bdi dir="ltr" className="num">
                {d.applicant.phone}
              </bdi>
            </Fact>
          )}
          <Fact label={t("console.queue.detail.signed_up")}>
            <Ago iso={d.applicant.signedUpAt} />
          </Fact>
          {d.status === "snoozed" && d.snoozeUntil && (
            <Fact label={t("console.queue.detail.snoozed")}>
              <Until iso={d.snoozeUntil} template="console.queue.snoozed_until" />
            </Fact>
          )}
        </dl>
      </header>

      <div className={cn(styles.rise, "flex-1")}>
        <Decided d={d} />
        {isRequest ? <RequestCard d={d} /> : <ScoreCard d={d} />}
        <ContextCard d={d} />
        {!isRequest && <Evidence d={d} onReload={onReload} />}
        <Linked d={d} />
        <Notes storeId={d.store.id} notes={pane.notes} onAdded={onReload} />
      </div>
      {bar}
    </article>
  );
}

/** Loading bones that mirror the pane (header, the score card, the chips, the preview). */
export function QueueDetailSkeleton() {
  return (
    <div aria-busy="true" className={cn(styles.skeleton, "grid content-start")}>
      <div className="grid gap-2.5 border-b border-[var(--c-hairline)] px-5 py-4">
        <div className={cn(styles.bone, "h-5 w-1/2")} />
        <div className={cn(styles.bone, "h-3 w-1/3")} />
        <div className={cn(styles.bone, "mt-2 h-3 w-2/3")} />
        <div className={cn(styles.bone, "h-3 w-3/5")} />
      </div>
      <div className="grid gap-3 border-b border-[var(--c-hairline)] px-5 py-4">
        <div className="flex items-center gap-4">
          <div className={cn(styles.bone, "size-14 rounded-full")} />
          <div className="grid flex-1 gap-2">
            <div className={cn(styles.bone, "h-4 w-1/4")} />
            <div className={cn(styles.bone, "h-3 w-1/3")} />
          </div>
        </div>
        {[70, 55, 62].map((w) => (
          <div key={w} className={cn(styles.bone, "h-3")} style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="grid gap-3 px-5 py-4">
        <div className="flex gap-1.5">
          {[64, 120, 90].map((w) => (
            <div key={w} className={cn(styles.bone, "h-[18px]")} style={{ width: w }} />
          ))}
        </div>
        <div className={cn(styles.bone, "mx-auto aspect-[9/16] w-full max-w-[300px] rounded-[18px]")} />
      </div>
    </div>
  );
}
