"use client";
/**
 * FactAttestSheet (P3 LANDING; landing.md LAN-§6.4 rule 7, request Q31): the sheet behind the soft numbers finding's
 * fix `{ actionId: "landing:attest-fact", field: path }`. It shows "«{value}» is a fact about my product (size, count,
 * content, year). Confirm and keep it." and, on confirm, calls `attestFactAction(pageId, { path, value, text })`,
 * which writes the audit row `page.fact_attested` (meta `{ pageId, path, value, text, source: "owner" }`, recordFacts'
 * row shape); the next check finds the numeral allowed. Cancel keeps the finding as it is.
 *
 * Mount (P6's builder, R1), beside ProofAttestSheet:
 *
 *   <FactAttestSheet open={!!fact} pageId={page.id} fact={fact} action={attestFactAction}
 *     onConfirmed={() => { setFact(null); recheck(); }} onCancel={() => setFact(null)} />
 *
 * `fact.text` is the field's current text (the server re-reads the numeral from it, so a stale sheet attests nothing).
 */
import { BadgeCheckIcon } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "../lib/action-result";
import { ConfirmSheet } from "./confirm-sheet";

export interface FactSubject {
  /** the document path of the field ("hero.title", "sections.3.items.0.text") */
  path: string;
  /** the numeral as the finding shows it ("50 ml", "2024") */
  value: string;
  /** the field's current text */
  text: string;
}

export interface FactAttestSheetProps {
  open: boolean;
  pageId: string;
  fact: FactSubject | null;
  action: (pageId: string, fact: FactSubject) => Promise<ActionResult<null>>;
  /** the audit row exists: the builder re-runs the check and closes the sheet */
  onConfirmed: (fact: FactSubject) => void;
  onCancel: () => void;
}

export function FactAttestSheet(p: FactAttestSheetProps) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const fact = p.fact;
  if (!fact) return null;
  return (
    <ConfirmSheet
      open={p.open}
      onOpenChange={(open) => {
        if (open) return;
        setError(null);
        p.onCancel();
      }}
      icon={<BadgeCheckIcon />}
      title={t("landing.attest.fact.title")}
      description={
        <>
          {t("landing.attest.fact.body", { value: fact.value })}
          <span dir="auto" className="mt-3 block rounded-xl bg-foreground/[0.035] px-3 py-2 text-[0.8125rem] text-foreground/80 ring-1 ring-foreground/[0.06] ring-inset">
            {fact.text}
          </span>
        </>
      }
      confirmLabel={t("landing.attest.fact.confirm")}
      cancelLabel={t("landing.attest.cancel")}
      error={error}
      onConfirm={async () => {
        setError(null);
        let res: ActionResult<null>;
        try {
          res = await p.action(p.pageId, fact);
        } catch {
          res = { ok: false, error: "network", message: "landing.common.network" };
        }
        if (!res.ok) {
          setError(res.message ? t(res.message) : t("landing.common.failed"));
          return false;
        }
        p.onConfirmed(fact);
        return false;
      }}
    />
  );
}
