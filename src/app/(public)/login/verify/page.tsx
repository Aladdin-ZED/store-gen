import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingMfa, getSignedInUser, landingPathFor, listMemberships, LOGIN_PATH, safeAppPath } from "@/lib/auth";
import { logout } from "@/lib/auth/actions";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { maskEmail } from "@/lib/tenancy/invites";
import { AuthHeading } from "../../_components/auth-heading";
import { VerifyForm } from "./verify-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("auth.verify.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeAppPath(typeof params.next === "string" ? params.next : null);

  const pending = await getPendingMfa();
  if (!pending) {
    const user = await getSignedInUser();
    redirect(user ? (next ?? landingPathFor(await listMemberships(user.id), user.lastStoreId, user.platformRole)) : LOGIN_PATH);
  }
  const t = authTranslator(await viewerLocale(null));

  return (
    <>
      <AuthHeading title={t("auth.verify.title")}>
        {t("auth.verify.lead")}{" "}
        <bdi dir="ltr" className="font-medium text-foreground">
          {maskEmail(pending.email)}
        </bdi>
      </AuthHeading>
      <VerifyForm next={next} />
      <form action={logout} className="mt-8 border-t pt-6 text-center">
        <button
          type="submit"
          className="rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("auth.verify.cancel")}
        </button>
      </form>
    </>
  );
}
