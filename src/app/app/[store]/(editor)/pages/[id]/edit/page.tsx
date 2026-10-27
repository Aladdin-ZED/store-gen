import { ArrowLeft, FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Builder } from "@/components/builder/Builder";
import { Button } from "@/components/ui/button";
import { EditorError, loadBootstrap } from "@/lib/editor/pages.server";
import { RowId } from "@/lib/editor/schemas";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

type Props = { params: Promise<{ store: string; id: string }> };

/** The member's ctx and the page's bootstrap of this request (one seam pass and one load for the metadata and the page). */
const editorFor = cache(async (handle: string, id: string) => {
  const ctx = await requireStoreMember({ handle, permission: "pages.read" });
  if (!RowId.safeParse(id).success) notFound();
  try {
    return { ctx, boot: await loadBootstrap(ctx, id), damaged: null };
  } catch (err) {
    if (err instanceof EditorError) return { ctx, boot: null, damaged: err.message };
    throw err;
  }
});

/** The page's name in the title only after the seam and a store-scoped load (another store's id never names it, LND-24). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, id } = await params;
  const { boot } = await editorFor(store, id);
  return { title: boot ? `${boot.page.name} · Builder` : "Builder" };
}

/**
 * /app/<h>/pages/<id>/edit: the builder of one of the store's pages (`pages.read`; editing, publishing and uploads
 * follow the member's grants, each re-checked by its action). Another store's page id answers exactly as a missing
 * one: the store's not-found screen, rendered inside `[store]/loading.tsx`'s stream, so with HTTP 200 and Next's
 * injected noindex (the status is committed once the stream starts); the preview route handler answers a real 404.
 * qa:r1-exit compares the two answers.
 */
export default async function EditPagePage({ params }: Props) {
  const { store, id } = await params;
  const { ctx, boot, damaged } = await editorFor(store, id);
  if (damaged !== null) return <Damaged handle={ctx.store.handle} message={damaged} />;
  if (!boot) notFound();
  return <Builder boot={boot} />;
}

function Damaged({ handle, message }: { handle: string; message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <FileWarning className="size-6" />
        </span>
        <h1 className="mt-5 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">This page can&apos;t be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href={appHref(handle, "/pages")}>
              <ArrowLeft />
              All pages
            </Link>
          </Button>
          <Button asChild>
            <Link href={appHref(handle, "/history")}>Open history</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
