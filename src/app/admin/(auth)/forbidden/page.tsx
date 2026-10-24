import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/auth/actions";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { AuthHeading } from "@/app/(public)/_components/auth-heading";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("console.forbidden.meta") };
}

/** Where today's /admin guard (`requireUser({ permission })`) sends a signed-in user whose role lacks the permission. */
export default async function ForbiddenPage() {
  const user = await requireUser();
  const t = authTranslator(await viewerLocale(user));
  return (
    <>
      <AuthHeading title={t("console.forbidden.title")}>
        {t("console.forbidden.lead")}{" "}
        <bdi dir="ltr" className="font-medium text-foreground">
          {user.email}
        </bdi>
      </AuthHeading>
      <div className="grid gap-3">
        <Button asChild size="lg" className="h-10 w-full">
          <Link href="/app">{t("console.forbidden.home")}</Link>
        </Button>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="lg" className="h-10 w-full text-muted-foreground">
            {t("app.bar.sign_out")}
          </Button>
        </form>
      </div>
    </>
  );
}
