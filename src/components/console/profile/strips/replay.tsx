"use client";
/**
 * Replay of one dead outbox item of the store (platform.md PLA-§7.3 row 6; `stores.lifecycle`, P8's `replay`, which
 * audits it). The opId makes a double click one replay.
 *
 *   <ReplayButton storeId={id} id={row.id} />
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { replayOutboxAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { newOpId } from "../../op";
import { button } from "../../queue/decision-dialogs";

export function ReplayButton({ storeId, id }: { storeId: string; id: string }) {
  const t = useT();
  const router = useRouter();
  const [opId] = useState(newOpId);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await replayOutboxAction({ storeId, id, opId });
          if (r.ok) {
            toast.success(t("console.strip.integrations.replayed"));
            router.refresh();
          } else toast.error(r.message ? t(r.message) : t("console.strip.integrations.replay_failed"));
        })
      }
      className={cn(button.base, button.secondary, "h-7 shrink-0 px-2.5 text-[12px]")}
    >
      {t("console.strip.integrations.replay")}
    </button>
  );
}
