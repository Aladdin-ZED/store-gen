import type { Metadata } from "next";
import { PlatformDocPage, platformDocMetadata } from "../platform-doc-page";

/* /terms: the platform's published "tos" document (see ../platform-doc-page.tsx). */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return platformDocMetadata("tos", searchParams);
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PlatformDocPage kind="tos" searchParams={searchParams} />;
}
