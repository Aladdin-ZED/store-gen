"use client";
/**
 * The lifecycle banner (P2 SHELL; platform.md PLA-§22.8, TN-02, PL-12; design.md DES-§16.8 "Banners"; docs/STORE-SAAS.md
 * §I.4): **one** banner at the top of the content, in `pickBanners`' order (suspended > closed > restricted > pending >
 * platform read-only > another kill switch > require-2FA > quota ≥ 80 %), with a "1 more" chevron that reveals the
 * rest. The status and the kill switches are the pulse's (a change shows within one poll, no reload); the dates, the
 * members without 2FA and the meters stream in from the layout. Informational banners hide for 24 h per viewer
 * (localStorage, every access wrapped); state banners stay.
 *
 * Each banner's one action: restricted → "Ask for a review" (an owner's `go_live` request), suspended → support on
 * WhatsApp, closed → "Reopen the store" (owner), require-2FA → the members, quota → the plan.
 */
import { AlertTriangleIcon, BanIcon, ChevronDownIcon, InfoIcon, XIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createStoreRequestAction } from "@/app/app/[store]/settings/plan/actions";
import { reopenOwnStoreAction } from "@/app/app/[store]/settings/danger/actions";
import type { KillKey } from "@/lib/flags/registry";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { formatDay, waHref } from "../common/primitive-logic";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { dismissalActive, type Banner, type BannerTone } from "./banner-priority";
import { pulseBanners, statusReasonKey } from "./pulse-state";
import { useStore } from "./store-context";
import { useActionError } from "./use-action-error";
import { usePulse } from "./use-pulse";

/** What the layout reads after the first paint (the store row's dates, the owner's 2FA count, the meters). */
export interface BannerFacts {
  closedAt: string | null;
  purgeAfter: string | null;
  /** owners of a store that requires 2FA: active members without it; null otherwise */
  membersWithout2fa: number | null;
  quota: { metric: string; used: number; limit: number | null }[];
}

export interface BannerFirstPaint {
  status: StoreStatus;
  statusReason: string | null;
  kill: KillKey[];
}

const TONE: Record<BannerTone, { box: string; icon: LucideIcon }> = {
  danger: { box: "bg-destructive-soft text-destructive-ink ring-destructive/15", icon: BanIcon },
  warning: { box: "bg-warn-soft text-warn-ink ring-warn/20", icon: AlertTriangleIcon },
  info: { box: "bg-info-soft text-info-ink ring-info/15", icon: InfoIcon },
};

const storageKey = (viewerId: string, storeId: string) => `sg:banners:${viewerId}:${storeId}`;

function readDismissed(key: string, now: number): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    return new Set(Object.entries(raw).filter(([, at]) => typeof at === "number" && dismissalActive(at, now)).map(([id]) => id));
  } catch {
    return new Set();
  }
}

function writeDismissed(key: string, id: string, now: number): void {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
    const kept = Object.fromEntries(Object.entries(raw).filter(([, at]) => typeof at === "number" && dismissalActive(at, now)));
    localStorage.setItem(key, JSON.stringify({ ...kept, [id]: now }));
  } catch {
    // storage blocked: the banner hides for this visit only
  }
}

function BannerAction({ banner, supportWhatsapp }: { banner: Banner; supportWhatsapp: string | null }): ReactNode {
  const t = useT();
  const store = useStore();
  const router = useRouter();
  const actions = useActionError();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const cls = cn("inline-flex h-8 shrink-0 items-center rounded-[var(--r-control)] px-3 text-[13px] font-medium underline-offset-4 ring-1 ring-current/20 ring-inset hover:bg-current/[0.06] disabled:opacity-60", FOCUS_RING, TOUCH);

  if (banner.id === "restricted" && store.can("billing.manage")) {
    if (sent) return null;
    return (
      <button
        type="button"
        disabled={busy}
        className={cls}
        onClick={async () => {
          setBusy(true);
          const res = await actions.run(() => createStoreRequestAction({ kind: "go_live" }));
          setBusy(false);
          if (res.ok || (!res.ok && res.error === "already_requested")) {
            setSent(true);
            toast.success(t("shell.limit.request_done"));
          }
        }}
      >
        {t("shell.banner.restricted_cta")}
      </button>
    );
  }
  if (banner.id === "suspended" && supportWhatsapp) {
    return (
      <a href={waHref(t("shell.help.wa_prefill", { handle: store.handle, path: "/", build: "-" }), supportWhatsapp)} target="_blank" rel="noopener noreferrer" className={cls}>
        {t("shell.banner.support")}
      </a>
    );
  }
  if (banner.id === "closed" && store.can("store.close")) {
    return (
      <button
        type="button"
        disabled={busy}
        className={cls}
        onClick={async () => {
          setBusy(true);
          const res = await actions.run(() => reopenOwnStoreAction());
          setBusy(false);
          if (res.ok) router.refresh();
        }}
      >
        {t("shell.banner.reopen")}
      </button>
    );
  }
  if (banner.id === "require_2fa" && store.can("members.read")) {
    return (
      <Link href={store.href("/team")} className={cls}>
        {t("shell.banner.require_2fa_cta")}
      </Link>
    );
  }
  if (banner.id.startsWith("quota:") && store.can("settings.read")) {
    return (
      <Link href={store.href("/settings/plan")} className={cls}>
        {t("shell.banner.quota_cta")}
      </Link>
    );
  }
  return null;
}

function BannerRow({ banner, supportWhatsapp, onHide }: { banner: Banner; supportWhatsapp: string | null; onHide(id: string): void }) {
  const t = useT();
  const tone = TONE[banner.tone];
  const vars: Record<string, string | number> = { ...banner.vars };
  for (const [k, key] of Object.entries(banner.varKeys ?? {})) vars[k] = t(key);
  return (
    <div
      role={banner.tone === "info" ? "status" : "alert"}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-card)] px-3.5 py-2.5 ring-1 ring-inset sm:flex-nowrap", tone.box)}
    >
      <tone.icon aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-pretty">{t(banner.key, vars)}</p>
      <BannerAction banner={banner} supportWhatsapp={supportWhatsapp} />
      {banner.dismissible && (
        <button
          type="button"
          onClick={() => onHide(banner.id)}
          aria-label={t("shell.banner.hide")}
          title={t("shell.banner.hide")}
          className={cn("grid size-7 shrink-0 place-items-center rounded-full opacity-70 hover:bg-current/[0.08] hover:opacity-100", FOCUS_RING, TOUCH)}
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function BannerStack({ firstPaint, facts, supportWhatsapp }: { firstPaint: BannerFirstPaint; facts: BannerFacts | null; supportWhatsapp: string | null }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const pulse = usePulse();
  const key = storageKey(store.viewerId, store.id);
  // the stored dismissals are read after mount: until then informational banners wait (no flash of a hidden one)
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDismissed(readDismissed(key, Date.now())), 0);
    return () => clearTimeout(timer);
  }, [key]);
  const hide = useCallback(
    (id: string) => {
      const now = Date.now();
      writeDismissed(key, id, now);
      setDismissed((d) => new Set([...(d ?? []), id]));
    },
    [key],
  );

  const reasonCode = pulse.body ? pulse.body.store.statusReason : firstPaint.statusReason;
  const reasonKey = statusReasonKey(reasonCode);
  const all = pulseBanners(
    {
      role: store.role,
      reason: reasonKey ? t(reasonKey) : t("shell.status_reason.other"),
      closedOn: formatDay(facts?.closedAt, locale),
      reopenUntil: formatDay(facts?.purgeAfter, locale),
      membersWithout2fa: store.role === "owner" ? (facts?.membersWithout2fa ?? null) : null,
      quota: facts?.quota ?? [],
      dismissed: dismissed ?? undefined,
    },
    { status: firstPaint.status, kill: firstPaint.kill },
    pulse.body,
  );
  const banners = dismissed ? all : all.filter((b) => !b.dismissible);
  if (banners.length === 0) return null;
  const [first, ...rest] = banners;
  return (
    <div className="grid gap-2 px-4 pt-3 sm:px-8" data-slot="store-banners">
      <BannerRow banner={first!} supportWhatsapp={supportWhatsapp} onHide={hide} />
      {expanded && rest.map((b) => <BannerRow key={b.id} banner={b} supportWhatsapp={supportWhatsapp} onHide={hide} />)}
      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className={cn("inline-flex h-7 items-center gap-1 justify-self-start rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground", FOCUS_RING, TOUCH)}
        >
          <ChevronDownIcon aria-hidden="true" className={cn("size-3.5 transition-transform duration-[var(--dur-2)]", expanded && "rotate-180")} />
          {expanded ? t("shell.banner.less") : t("shell.banner.more", { count: rest.length })}
        </button>
      )}
    </div>
  );
}

function WithFacts({ firstPaint, facts, supportWhatsapp }: { firstPaint: BannerFirstPaint; facts: Promise<BannerFacts | null>; supportWhatsapp: string | null }) {
  return <BannerStack firstPaint={firstPaint} facts={use(facts)} supportWhatsapp={supportWhatsapp} />;
}

/** The store's banners: the state ones paint at once, the facts (dates, 2FA, meters) complete them when they arrive. */
export function StoreBanner(p: { firstPaint: BannerFirstPaint; facts: Promise<BannerFacts | null>; supportWhatsapp: string | null }) {
  return (
    <Suspense fallback={<BannerStack firstPaint={p.firstPaint} facts={null} supportWhatsapp={p.supportWhatsapp} />}>
      <WithFacts {...p} />
    </Suspense>
  );
}
