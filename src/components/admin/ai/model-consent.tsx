"use client";
/**
 * ModelConsent (P7 AI; ai.md AI-§K.3 "Consent card", AI-03 (1), core D59; mounted by P2 in onboarding after the first
 * sign-in; props in src/components/generate/ai/README.md).
 *
 * "Download on-device AI (2.2 GB, one time) for faster, private writing on this computer" · Download · Not now.
 * Renders only on a desktop whose measured tier is lite or full, without save-data, at a wide viewport (never at
 * 390 px), with the store's on-device AI on and the model not cached yet, and never auto-starts a download: Download
 * calls `onDownload` with the tier, the mount starts the worker. "Not now" is remembered per device (localStorage, a
 * convenience: a private window simply asks again).
 */
import { CpuIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AiPolicy, DeviceInfo } from "@/lib/ai/policy";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

/** the one-time download per tier (AI-§K.3, AI-§P) */
export const MODEL_SIZE_GB = { lite: 0.9, full: 2.2 } as const;
const DISMISS_KEY = "sg.ai.consent.dismissed";

/** Whether the card may show for this device and policy (pure; the viewport and the dismissal are checked apart). */
export function consentEligible(device: DeviceInfo, policy: Pick<AiPolicy, "local"> | null | undefined): "lite" | "full" | null {
  if (!policy?.local.enabled || device.mobile || device.saveData || device.vlmCached || device.tier === "off") return null;
  return device.tier === "full" && policy.local.tierMax === "full" ? "full" : "lite";
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const noop = () => () => undefined;

export interface ModelConsentProps {
  device: DeviceInfo;
  policy: AiPolicy | null;
  onDownload(tier: "lite" | "full"): void;
  onDismiss?(): void;
  className?: string;
}

export function ModelConsent({ device, policy, onDownload, onDismiss, className }: ModelConsentProps) {
  const t = useT();
  const locale = useAdminLocale();
  const narrow = useIsMobile();
  const stored = useSyncExternalStore(noop, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const tier = consentEligible(device, policy);
  if (!tier || narrow || stored || dismissed) return null;

  const size = new Intl.NumberFormat(locale === "ar" ? "ar-u-nu-latn" : locale, { style: "unit", unit: "gigabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(MODEL_SIZE_GB[tier]);
  const later = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // storage refused: the card simply comes back next time
    }
    setDismissed(true);
    onDismiss?.();
  };
  return (
    <section aria-labelledby="ai-consent-title" className={cn("adm-surface-flat flex items-center gap-4 px-4 py-3.5", className)}>
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground ring-1 ring-foreground/[0.07]">
        <CpuIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id="ai-consent-title" className="text-[0.875rem] font-medium text-pretty">
          {t("ai.consent.title", { size })}
        </h3>
        <p className="mt-0.5 text-[0.8125rem] text-pretty text-muted-foreground">{t("ai.consent.body")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" className="h-9 px-3" onClick={later}>
          {t("ai.consent.later")}
        </Button>
        <Button variant="outline" className="h-9 px-3.5" onClick={() => onDownload(tier)}>
          {t("ai.consent.download")}
        </Button>
      </div>
    </section>
  );
}
