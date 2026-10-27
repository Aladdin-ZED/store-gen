"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/admin/common/empty-state";
import { Screen } from "@/components/admin/common/screen";
import { useStore } from "@/components/admin/shell/store-context";
import { Button } from "@/components/ui/button";

/**
 * A screen of the member's own store that answers "not found" (`notFound()` from a page): a screen the member's role
 * can't open, a page id that is no longer here, an unknown path. One neutral wording for all of them inside the shell
 * (the store is the member's own; another store's id answers exactly as a missing one), with the way back to the
 * screen the member works from. A non-member never gets here: the layout's seam answers the platform's neutral 404.
 */
export default function StoreNotFound() {
  const store = useStore();
  // a call agent works from Orders (the overview redirects there)
  const home = !store.can("pages.read") && store.can("orders.read") ? { href: store.href("/orders"), label: "Back to Orders" } : { href: store.href(), label: "Back to the overview" };
  return (
    <Screen>
      <EmptyState
        illustration="search"
        title="This screen isn't available"
        description={`It doesn't exist in ${store.name}, or your role there can't open it. An owner can change roles in Members & invites.`}
        actions={
          <Button asChild className="rounded-full">
            <Link href={home.href}>
              <ArrowLeftIcon />
              {home.label}
            </Link>
          </Button>
        }
      />
    </Screen>
  );
}
