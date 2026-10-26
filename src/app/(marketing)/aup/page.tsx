import type { Metadata } from "next";
import { PlatformDocPage, platformDocMetadata } from "../platform-doc-page";

/* /aup: the platform's published "aup" document (see ../platform-doc-page.tsx). */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return platformDocMetadata("aup", searchParams);
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PlatformDocPage kind="aup" searchParams={searchParams} />;
}
