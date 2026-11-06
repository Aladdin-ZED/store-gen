"use client";
/**
 * The brand page's client entry (P6 DESIGN; design.md DES-§12.1): `BrandKit` wired to the brand actions and to the
 * store's media endpoint (`/api/app/<h>/media`, core §G.4), which processes the upload before the action binds it.
 */
import { bindLogoAction, saveBrandColorAction, saveBrandFontsAction, saveBrandVoiceAction } from "@/app/app/[store]/brand/actions";
import { requireStoreHandle } from "@/components/admin/shell/store-handle";
import { apiHref } from "@/lib/urls";
import { BrandKit } from "./brand-kit";
import type { BrandKitActions, BrandKitView, PairingCard } from "./types";

async function uploadLogo(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name || "logo.png");
  const res = await fetch(apiHref(requireStoreHandle(), "/media"), { method: "POST", body: form, credentials: "same-origin" });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; asset?: { id?: string }; message?: string } | null;
  if (!res.ok || !json?.ok || typeof json.asset?.id !== "string") throw new Error(json?.message ?? "");
  return json.asset.id;
}

const ACTIONS: BrandKitActions = {
  bindLogo: bindLogoAction,
  saveColor: saveBrandColorAction,
  saveFonts: saveBrandFontsAction,
  saveVoice: saveBrandVoiceAction,
  upload: uploadLogo,
};

export function BrandPage({ view, storeName, canEdit, canUpload, pairings, wordsHref }: { view: BrandKitView; storeName: string; canEdit: boolean; canUpload: boolean; pairings: PairingCard[]; wordsHref: string | null }) {
  return <BrandKit view={view} storeName={storeName} canEdit={canEdit} pairings={pairings} wordsHref={wordsHref} actions={canUpload ? ACTIONS : { ...ACTIONS, upload: null }} />;
}
