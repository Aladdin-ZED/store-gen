import type { Metadata } from "next";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const metadata: Metadata = { title: "Store", robots: { index: false, follow: false, nocache: true } };

/*
 * /app/<h>: the store home behind the minimal C0a seam (docs/STORE-SAAS.md §I.1, §K.1 exit: "one page under /app/<h>
 * renders through the minimal seam"). A placeholder: T4 replaces it with the dashboard it moves from /admin (Today
 * brief, KPIs, Store Health ring) and owns this folder from C0a's merge.
 */
export default async function StoreHomePage({ params }: { params: Promise<{ store: string }> }) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "store.read" });
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 sm:px-10">
      <div className="w-full max-w-[22.5rem]">
        <header className="mb-8 grid gap-2">
          <p className="text-[0.8rem] font-medium text-muted-foreground tabular-nums">/app/{ctx.store.handle}</p>
          <h1 className="font-display text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">{ctx.store.name}</h1>
          <p className="text-sm text-pretty text-muted-foreground" data-sg-seam={ctx.scope.kind}>
            Signed in as <span className="font-medium text-foreground">{ctx.user.email}</span> ({ctx.membership.role}). This store&apos;s
            dashboard is on its way.
          </p>
        </header>
      </div>
    </main>
  );
}
