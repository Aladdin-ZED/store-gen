"use client";
/**
 * AiProviderChip (P7 AI; ai.md AI-§K.3, AI-§K.5, AI-03 (3); mounted by P2 next to the onboarding step title and by P6
 * next to the wizard's step titles; props in src/components/generate/ai/README.md).
 *
 * A 24 px chip: an icon and "Cloud AI", "On-device AI" or "Built-in copy" for the rung that is answering (or, before a
 * run, the rung the policy will try first). While a run is going, a 2 px hairline under the chip (no spinner). When a
 * run falls down the ladder, a note replaces the label for 6 s and then settles on the rung that answered ("Cloud AI
 * busy · used on-device AI" → "On-device AI"); a skip the policy decided (cloud off, on-device only) never shows a note,
 * and a refusal never shows its category. One polite announcement per state change. No sparkle, gradient or glow.
 */
import { BookTextIcon, CloudIcon, CpuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { AiPolicy } from "@/lib/ai/policy";
import type { AiTaskState } from "@/lib/ai/router/client";
import type { AiFallbackNote } from "@/lib/ai/provider/types";
import type { AiProviderId } from "@/lib/ai/tasks";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { Hairline } from "./hairline";

/** how long a fallback note replaces the label (AI-§K.3) */
export const NOTE_MS = 6_000;

const LABEL: Record<AiProviderId, MessageKey> = { server: "ai.chip.cloud", local: "ai.chip.local", library: "ai.chip.library" };
const ICON = { server: CloudIcon, local: CpuIcon, library: BookTextIcon } as const;

/** The note a fallback shows, or null for a quiet skip (a policy decision, a local rung that could not load). */
export function noteKeyOf(n: AiFallbackNote): MessageKey | null {
  if (n.from !== "server") return null;
  const local = n.to === "local";
  switch (n.code) {
    case "quota_store":
    case "quota_day":
    case "quota_platform":
    case "quota_director":
      return local ? "ai.note.credits_local" : "ai.note.credits";
    case "quota_platform_pending":
      return "ai.note.pending";
    case "refused":
    case "model_refusal":
      return "ai.note.refused";
    case "timeout":
      return "ai.note.timeout";
    case "disabled":
    case "store_local_only":
    case "no_key":
    case "no_cap":
    case "kill":
    case "entitlement":
    case "state":
    case "flag_off":
    case "cancelled":
      return null;
    default:
      return local ? "ai.note.busy" : "ai.note.busy_library";
  }
}

/** The rung a run will try first when nothing has run yet (the chip before the first run). */
export function expectedProvider(policy: AiPolicy | null | undefined): AiProviderId {
  if (!policy) return "library";
  if (policy.cloud.available && policy.mode !== "local") return "server";
  return policy.local.enabled ? "local" : "library";
}

export interface AiProviderChipProps {
  state: Pick<AiTaskState, "status" | "provider" | "notes">;
  /** the store's policy: which rung the chip names before a run */
  policy?: AiPolicy | null;
  className?: string;
}

export function AiProviderChip({ state, policy, className }: AiProviderChipProps) {
  const t = useT();
  const notes = state.notes;
  const [seen, setSeen] = useState(notes.length);
  // a note already there at mount (a remount mid-run) is shown too
  const [note, setNote] = useState<MessageKey | null>(() => (notes.length ? noteKeyOf(notes[notes.length - 1]!) : null));
  // a new fallback note: shown for NOTE_MS, then the label settles (adjusted while rendering, not in an effect)
  if (notes.length !== seen) {
    setSeen(notes.length);
    const last = notes[notes.length - 1];
    setNote(last ? noteKeyOf(last) : null);
  }
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note, seen]);

  const provider = state.provider ?? expectedProvider(policy);
  const Icon = ICON[provider];
  const running = state.status === "running";
  const text = note ? t(note) : t(LABEL[provider]);
  return (
    <span className={cn("inline-flex w-fit max-w-full min-w-0 flex-col gap-[3px] align-middle", className)} data-provider={provider} data-state={state.status}>
      <span title={text} className="flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-foreground/[0.045] ps-2 pe-2.5 text-[0.75rem] leading-none font-medium text-foreground/80 ring-1 ring-foreground/[0.07] ring-inset">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{text}</span>
      </span>
      {running ? <Hairline label={t("ai.chip.writing")} /> : <span aria-hidden="true" className="h-0.5" />}
      <span className="sr-only" aria-live="polite">
        {running ? `${text} · ${t("ai.chip.writing")}` : text}
      </span>
    </span>
  );
}
