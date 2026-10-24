import { redirect } from "next/navigation";
import { assertAdminAccess, safeAdminPath } from "@/lib/auth";
import { verifyUrl } from "@/lib/auth/paths";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Today's console second-factor URL: the step lives at /login/verify now (§B.1). */
export default async function ConsoleVerifyRedirect({ searchParams }: { searchParams: SearchParams }) {
  await assertAdminAccess();
  const { next } = await searchParams;
  redirect(verifyUrl(safeAdminPath(typeof next === "string" ? next : null)));
}
