import type { Metadata } from "next";
import { PlatformDocPage, platformDocMetadata } from "../platform-doc-page";

/* /privacy: the platform's published "privacy" document (see ../platform-doc-page.tsx). */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return platformDocMetadata("privacy", searchParams);
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PlatformDocPage kind="privacy" searchParams={searchParams} />;
}
