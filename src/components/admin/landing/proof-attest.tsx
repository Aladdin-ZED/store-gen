"use client";
/**
 * ProofAttestSheet (P3 LANDING; landing.md LAN-§6.1, request Q31): the confirm sheet the builder opens when the owner
 * clears `sample` on a visible proof section (`reviews`, `socialProof`, `stats`, `beforeAfter`) or types or changes
 * `product.rating`. Confirm writes the audit row `page.proof_attested` through `attestProofAction` (meta
 * `{ pageId, sectionId, type }` or `{ pageId, field: "rating", value, count }`), then calls `onConfirmed`, where the
 * builder clears the flag; Cancel (or Escape) calls `onCancel` and the section keeps `sample: true`.
 *
 * Mount (P6's builder, R1): keep one sheet per editor and open it with the section or the rating the owner touched:
 *
 *   <ProofAttestSheet open={!!pending} pageId={page.id} subject={pending} action={attestProofAction}
 *     onConfirmed={() => clearSample(pending)} onCancel={() => setPending(null)} />
 *
 * `action` is `attestProofAction` of src/app/app/[store]/pages/actions.ts (passed in, so the builder's server page
 * hands it down like the other actions). Strings are `landing.attest.*` in ar, fr and en.
 */
import { BadgeCheckIcon } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "../lib/action-result";
import { ConfirmSheet } from "./confirm-sheet";

export type ProofSectionType = "reviews" | "socialProof" | "stats" | "beforeAfter";

/** What the owner is about to attest: a proof section, or the product's rating. */
export type ProofSubject = { sectionId: string; type: ProofSectionType } | { field: "rating"; value: number; count: number };

export interface ProofAttestSheetProps {
  open: boolean;
  pageId: string;
  subject: ProofSubject | null;
  action: (pageId: string, proof: ProofSubject) => Promise<ActionResult<null>>;
  /** the audit row exists: the builder clears `sample` (or keeps the typed rating) and closes the sheet */
  onConfirmed: (subject: ProofSubject) => void;
  /** dismissed: `sample` stays on (the typed rating goes back) */
  onCancel: () => void;
}

export function ProofAttestSheet(p: ProofAttestSheetProps) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const subject = p.subject;
  if (!subject) return null;
  const description =
    "field" in subject
      ? t("landing.attest.proof.rating", { value: String(subject.value), count: subject.count })
      : t("landing.attest.proof.body", { kind: t(`landing.attest.proof.kind.${subject.type}`) });
  return (
    <ConfirmSheet
      open={p.open}
      onOpenChange={(open) => {
        if (open) return;
        setError(null);
        p.onCancel();
      }}
      icon={<BadgeCheckIcon />}
      title={t("landing.attest.proof.title")}
      description={description}
      confirmLabel={t("landing.attest.proof.confirm")}
      cancelLabel={t("landing.attest.cancel")}
      error={error}
      onConfirm={async () => {
        setError(null);
        let res: ActionResult<null>;
        try {
          res = await p.action(p.pageId, subject);
        } catch {
          res = { ok: false, error: "network", message: "landing.common.network" };
        }
        if (!res.ok) {
          setError(res.message ? t(res.message) : t("landing.common.failed"));
          return false;
        }
        p.onConfirmed(subject);
        return false;
      }}
    />
  );
}
