import { eq } from "drizzle-orm";
import { ArrowLeft, FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Builder } from "@/components/builder/Builder";
import { Button } from "@/components/ui/button";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { EditorError, loadBootstrap } from "@/lib/editor/pages.server";
import { RowId } from "@/lib/editor/schemas";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireUser({ permission: "pages.write" });
  const { id } = await params;
  if (!RowId.safeParse(id).success) return { title: "Builder" };
  const [row] = await db.select({ name: pages.name }).from(pages).where(eq(pages.id, id)).limit(1);
  return { title: row ? `${row.name} · Builder` : "Builder" };
}

export default async function EditPagePage({ params }: Props) {
  const user = await requireUser({ permission: "pages.write" });
  const { id } = await params;
  if (!RowId.safeParse(id).success) notFound();

  // store #1's builder (the legacy panel): its files are the ones the canvas resolves
  const ctx = await legacyStoreCtx({ permission: "pages.read" });
  let boot;
  try {
    boot = await loadBootstrap(ctx.scope, id, user);
  } catch (err) {
    if (err instanceof EditorError) return <Damaged message={err.message} />;
    throw err;
  }
  if (!boot) notFound();
  return <Builder boot={boot} />;
}

function Damaged({ message }: { message: string }) {
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
            <Link href="/admin/pages">
              <ArrowLeft />
              All pages
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/history">Open history</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
