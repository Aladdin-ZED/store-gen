"use client";

import { ArrowUpRightIcon, MonitorIcon, PencilIcon, SmartphoneIcon, TabletIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LandingPreview, type PreviewAssets, type PreviewDevice } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { StoreInfo } from "@/landing/context";
import type { PageDoc } from "@/lib/page/schema";
import { Segmented } from "../common/segmented";

/**
 * Full-size, interactive preview of a page's draft (the real renderer and runtime in a frame),
 * with a device switch — test the page like a visitor without publishing it.
 */
export function PagePreviewDialog({
  open,
  onOpenChange,
  title,
  doc,
  assets,
  store,
  editHref,
  liveUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  doc: PageDoc;
  assets: PreviewAssets;
  store?: StoreInfo;
  editHref?: string;
  liveUrl?: string | null;
}) {
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[min(92dvh,62rem)] w-[min(96vw,84rem)] max-w-none! flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-none"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 pe-14">
          <div className="grid min-w-0 flex-1">
            <DialogTitle className="truncate text-[0.95rem] font-semibold">{title}</DialogTitle>
            <DialogDescription className="truncate text-xs">Draft preview: orders are never sent from here.</DialogDescription>
          </div>
          <Segmented
            label="Device"
            size="sm"
            value={device}
            onChange={setDevice}
            options={[
              { value: "mobile", label: "Mobile", icon: <SmartphoneIcon /> },
              { value: "tablet", label: "Tablet", icon: <TabletIcon /> },
              { value: "desktop", label: "Desktop", icon: <MonitorIcon /> },
            ]}
          />
          <div className="flex items-center gap-1.5">
            {liveUrl && (
              <Button asChild variant="ghost" size="sm" className="rounded-full">
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  Live page <ArrowUpRightIcon />
                </a>
              </Button>
            )}
            {editHref && (
              <Button asChild size="sm" className="rounded-full">
                <Link href={editHref}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="adm-dots relative min-h-0 flex-1 bg-muted/40 [mask-image:none]">
          {open && <LandingPreview doc={doc} assets={assets} store={store} device={device} interactive className="absolute inset-0" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
