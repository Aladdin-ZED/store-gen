"use client";
/**
 * The Director default switch (P7 AI; ai.md AI-§K.2 Overview, AI-19 (10), AI-§F.9 #10): "Auto by default" stays
 * disabled until a passing preference test is recorded (lower bound ≥ 0.55), with that status in words; the server
 * refuses it again without the run (`needs_preference`).
 */
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { setAiDirectorDefaultAction } from "@/app/admin/(console)/ai/actions";
import { PREFERENCE_PASS_LOWER_BOUND } from "@/lib/ai/platform/console-view";
import { t } from "@/lib/i18n/admin";
import { sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

const c = (k: string, v?: Record<string, string | number>) => t(k, v, "en");

export function DirectorDefaultControl({ auto, recorded }: { auto: boolean; recorded: { lowerBound: number; at: string } | null }) {
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [on, setOn] = useState(auto);
  const allowed = recorded !== null && recorded.lowerBound >= PREFERENCE_PASS_LOWER_BOUND;
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="ai-director-default" className="text-sm font-medium">
            {c("ai.console.director.auto")}
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">{on ? c("ai.console.director.is_auto") : c("ai.console.director.is_ask")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Spinner on={pending} />
          <Switch
            id="ai-director-default"
            checked={on}
            disabled={pending || (!allowed && !on)}
            onCheckedChange={(next) => {
              setOn(next);
              void run(
                () => setAiDirectorDefaultAction({ auto: next }),
                (r) => {
                  const s = sayOf(r, c("ai.console.saved"));
                  if (s?.tone === "error") setOn(!next);
                  setSaid(s);
                },
              );
            }}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {recorded
          ? c(allowed ? "ai.console.director.test_pass" : "ai.console.director.test_fail", { lb: recorded.lowerBound.toFixed(2), min: PREFERENCE_PASS_LOWER_BOUND, at: new Date(recorded.at).toISOString().slice(0, 10) })
          : c("ai.console.director.test_none", { min: PREFERENCE_PASS_LOWER_BOUND })}
      </p>
      <Status said={said} className="mt-1" />
      {sheet}
    </div>
  );
}
