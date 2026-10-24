import { redirect } from "next/navigation";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Today's /admin/two-factor moved to the account pages (§I.1); the whitelisted `from` values carry over. */
export default async function ConsoleTwoFactorRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { from, notice } = await searchParams;
  const q = new URLSearchParams();
  if (from === "settings" || from === "setup") q.set("from", from);
  if (notice === "recovery-used" || notice === "disabled") q.set("notice", notice);
  const query = q.toString();
  redirect(query ? `${ACCOUNT_TWO_FACTOR_PATH}?${query}` : ACCOUNT_TWO_FACTOR_PATH);
}
