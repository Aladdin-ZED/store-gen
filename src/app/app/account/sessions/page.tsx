import { redirect } from "next/navigation";

/** PLA-§22.5: the devices live on the Security page. */
export default function AccountSessionsPage(): never {
  redirect("/app/account/security");
}
