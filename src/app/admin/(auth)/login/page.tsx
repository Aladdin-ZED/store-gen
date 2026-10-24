import { redirect } from "next/navigation";
import { assertAdminAccess, safeAdminPath } from "@/lib/auth";
import { loginUrl } from "@/lib/auth/paths";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Today's console sign-in URL (bookmarks, old links): the one sign-in is /login now (§B.1); the gate still applies here. */
export default async function ConsoleLoginRedirect({ searchParams }: { searchParams: SearchParams }) {
  await assertAdminAccess();
  const { next } = await searchParams;
  redirect(loginUrl(safeAdminPath(typeof next === "string" ? next : null)));
}
