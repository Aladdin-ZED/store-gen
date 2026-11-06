"use client";
/**
 * Settings → General, the store type (P2 SHELL; platform.md PLA-§22.10.1, §22.1.5, PD30, PD72; docs/STORE-SAAS.md
 * §A.2 "hide, never delete"): the three `ModeCards`; choosing another type opens the switch sheet, which first asks
 * P3's `landingModeSwitchPlan` (through `modeSwitchPlanAction`) and shows what appears, what is hidden, the live sales
 * pages that keep working with the "Also use sales pages" tick the owner may clear, and the category chips when the
 * store has none (a full store needs one). The switch is `setStoreModeAction` (`store.mode`): R1 sells sales pages
 * only, so the storefront types carry "Coming soon" and the cards never offer them yet.
 */
import { ArrowLeftRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ModeCards } from "@/components/admin/common/mode-explainer";
import { modeSummary } from "@/components/admin/common/mode-summary";
import { BusyButton, SettingsCard } from "@/components/admin/common/settings-kit";
import { useActionError } from "@/components/admin/shell/use-action-error";
import { useT } from "@/lib/i18n/admin/client";
import { PRODUCT_CATEGORIES } from "@/lib/page/schema";
import type { ActionResult } from "@/lib/tenancy/types";
import type { StoreMode } from "@/lib/tenancy/mode";
import { cn } from "@/lib/utils";

type Plan = { livePages: number; views7d: number; suggestInStoreMode: boolean };

export function ModePanel({
  mode,
  category,
  canChange,
  plan,
  setMode,
}: {
  mode: StoreMode;
  category: string | null;
  canChange: boolean;
  plan(): Promise<ActionResult<Plan>>;
  setMode(input: { mode: StoreMode; keepSalesPages: boolean }): Promise<ActionResult<{ mode: StoreMode }>>;
}) {
  const t = useT();
  const router = useRouter();
  const actions = useActionError();
  const [target, setTarget] = useState<StoreMode | null>(null);
  const [facts, setFacts] = useState<Plan | "failed" | null>(null);
  const [keep, setKeep] = useState(true);
  const [chosenCategory, setChosenCategory] = useState(category);
  const [busy, setBusy] = useState(false);
  const current = modeSummary(mode);

  const choose = async (next: StoreMode) => {
    if (next === mode || !canChange) return;
    setTarget(next);
    setFacts(null);
    setKeep(true);
    const res = await plan();
    setFacts(res.ok ? res.data : "failed");
  };

  const apply = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await actions.run(() => setMode({ mode: target, keepSalesPages: keep }), {
        limit: {
          kind: "feature",
          key: target === "both" ? "mode_both" : target === "store" ? "mode_store" : "mode_landing",
          reason: "release",
        },
      });
      if (res.ok) {
        toast.success(t("shell.general.mode_saved"));
        setTarget(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const next = target ? modeSummary(target) : null;
  const needsCategory = target !== null && target !== "landing" && !chosenCategory;

  return (
    <SettingsCard title={t("shell.general.mode")} description={t("shell.general.mode_lead")}>
      {canChange ? (
        <ModeCards value={mode} onChange={(m) => void choose(m)} />
      ) : (
        <div className="grid gap-1 rounded-[var(--r-control)] bg-muted/50 px-3.5 py-3">
          <p className="text-sm font-medium">{t(current.title)}</p>
          <p className="text-[13px] text-muted-foreground">{t(current.line)}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t(current.later)}</p>

      <Dialog open={target !== null} onOpenChange={(o) => !o && !busy && setTarget(null)}>
        <DialogContent className="gap-5 rounded-[var(--r-sheet,16px)] p-6 sm:max-w-lg">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="flex items-center gap-2 text-[1.05rem] font-semibold tracking-[-0.01em]">
              <ArrowLeftRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {t("shell.general.mode_change")}
            </DialogTitle>
            <DialogDescription>{t("shell.general.mode_sheet_lead")}</DialogDescription>
          </DialogHeader>
          {next && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <p className="text-[13px] font-medium">{t("shell.general.mode_appears")}</p>
                  <ul className="grid gap-1 text-[13px] text-muted-foreground">
                    {next.get.map((k) => (
                      <li key={k}>{t(k)}</li>
                    ))}
                  </ul>
                </div>
                <div className="grid content-start gap-1.5">
                  <p className="text-[13px] font-medium">{t("shell.general.mode_hidden")}</p>
                  <ul className="grid gap-1 text-[13px] text-muted-foreground">
                    {current.get
                      .filter((k) => !next.get.includes(k))
                      .map((k) => (
                        <li key={k}>{t(k)}</li>
                      ))}
                  </ul>
                </div>
              </div>
              <div className="grid gap-2 rounded-[var(--r-control)] bg-muted/50 px-3.5 py-3">
                {facts === null || facts === "failed" ? (
                  <p className="text-[13px] text-muted-foreground">{t(facts === null ? "shell.common.loading" : "shell.general.mode_plan_unavailable")}</p>
                ) : (
                  <>
                    <p className="text-[13px]">
                      {t("shell.general.mode_plan", {
                        pages: facts.livePages,
                        views: facts.views7d,
                      })}
                    </p>
                    {facts.livePages > 0 && target !== "landing" && (
                      <label className="flex min-h-11 items-center gap-2.5 text-[13px] font-medium">
                        <Checkbox checked={keep} onCheckedChange={(v) => setKeep(v === true)} />
                        {t("shell.general.mode_keep_pages")}
                      </label>
                    )}
                  </>
                )}
              </div>
              {needsCategory && (
                <div className="grid gap-2">
                  <p className="text-[13px] font-medium">{t("shell.general.mode_category")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRODUCT_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={chosenCategory === c}
                        onClick={() => setChosenCategory(c)}
                        className={cn(
                          "min-h-9 rounded-full px-3 text-[13px] ring-1 ring-border transition-colors duration-[var(--dur-1)] ring-inset",
                          chosenCategory === c ? "bg-foreground text-background" : "hover:bg-muted",
                        )}
                      >
                        {t(`shell.category.${c.replace("-", "_")}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>
              {t("shell.common.cancel")}
            </Button>
            <BusyButton variant="brand" busy={busy} disabled={facts === null || needsCategory} onClick={() => void apply()}>
              {t("shell.general.mode_apply")}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
