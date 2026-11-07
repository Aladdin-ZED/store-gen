"use client";
/**
 * The two slots of P2's `AddressCard` (P3 LANDING; platform.md PLA-§22.10.2, PD61; SF-01 and SF-05 of PLA-§1.5,
 * UX-05; P0b CCR P2-9), on the store dashboard, the onboarding done step, the address settings and the pages list:
 *   - `TestOrderSlot`: "Open a test order" (LAN-§14.1): mints the page's 2-hour `?sg-test=` link through P3's
 *     `mintTestLinkAction` (no pixel fires, the order is marked test and counted nowhere) and opens it in a new tab;
 *     disabled with `shell.address.after_publish` while nothing is live; absent for a member who may not publish
 *     (the action needs `pages.publish`, which every role that has it also reads pages with);
 *   - `CampaignSlot`: "Create a campaign" (LAN-§13.1, SF-01): the campaigns screen with its create sheet open; absent
 *     without `campaigns.write`, which the matrix already withholds in store mode unless landing pages show there.
 * The props are frozen (src/lib/contracts/r1-p0b-design.ts).
 *
 * The tab is opened on the click itself (a blank one, without opener) and pointed at the link once it is minted, so
 * no popup blocker stops it; a refusal closes it again and says why.
 */
import { FlaskConicalIcon, Loader2Icon, MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";
import { mintTestLinkAction } from "@/app/app/[store]/pages/actions";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { useOptionalStore } from "../shell/store-context";

export function TestOrderSlot(p: { pageId: string | null; live: boolean }): ReactElement | null {
  const t = useT();
  const store = useOptionalStore();
  const [pending, setPending] = useState(false);
  if (!store || !store.can("pages.publish")) return null;
  const disabled = !p.live || pending;

  const open = async () => {
    if (disabled) return;
    setPending(true);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const res = await mintTestLinkAction(p.pageId);
      if (res.ok) {
        if (tab) tab.location.href = res.data.url;
        else window.open(res.data.url, "_blank", "noopener");
        return;
      }
      tab?.close();
      toast.error(res.message ? t(res.message) : t("landing.testOrder.failed"));
    } catch {
      tab?.close();
      toast.error(t("landing.testOrder.failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      aria-busy={pending || undefined}
      title={p.live ? t("landing.testOrder.hint") : t("shell.address.after_publish")}
      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2", FOCUS_RING, TOUCH)}
    >
      {pending ? <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <FlaskConicalIcon aria-hidden="true" />}
      {t("landing.testOrder.open")}
      {!p.live && <span className="sr-only">: {t("shell.address.after_publish")}</span>}
    </button>
  );
}

export function CampaignSlot(): ReactElement | null {
  const t = useT();
  const store = useOptionalStore();
  if (!store || !store.can("campaigns.write")) return null;
  return (
    <Link href={store.href("/campaigns?new=1")} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2", FOCUS_RING, TOUCH)}>
      <MegaphoneIcon aria-hidden="true" />
      {t("landing.campaigns.slot")}
    </Link>
  );
}
