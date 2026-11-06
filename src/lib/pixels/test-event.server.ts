import "server-only";
/**
 * "Send test event" (operations.md OPE-§20.7; PIX-08): a synthetic Purchase with the platform's test event code (it
 * shows in Events Manager → Test events and never counts in reports), shared by the pixel library's
 * `sendPixelTestAction` (src/lib/pixels/actions.ts) and the Server-events card's `sendTestEventAction`
 * (src/app/app/[store]/integrations/pixels/actions.ts), so both buttons and the ⌘K command send the same event.
 *
 * Without a pixel named (the ⌘K command), the store's first server pixel holding a token and a saved test code is
 * used; none → the same "add the test code first" message as the button. The pixel's health is written only when the
 * stored token was used (health describes the stored token).
 */
import { headers } from "next/headers";
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { platformBrandName } from "@/lib/admin-data/brand";
import { revalidateStore } from "@/lib/admin-data/shell";
import { ownToken, savedTestCode, sendTestEvent, type TestEventResult } from "@/lib/orders/conversions-core";
import { TEST_CODE_RE, TOKEN_RE, isMask } from "@/lib/pixels/form";
import { recordPixelHealth } from "@/lib/pixels/health.server";
import { PIXEL_ID_RE, SERVER_PLATFORMS, normalizePixelId } from "@/lib/pixels/ids";
import { getStoreSettings, type StoreSettingValue } from "@/lib/settings";
import type { WriteCtx } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";

export const SendTestInput = z.object({
  platform: z.enum(SERVER_PLATFORMS),
  id: z.string().max(80),
  /** typed token, or "" / mask = the stored one */
  token: z.string().max(600).default(""),
  /** typed code, or "" = the stored one */
  testCode: z.string().max(40).default(""),
});
export type SendTestInput = z.input<typeof SendTestInput>;

/** An absolute page URL for Meta's website events: the store's address, else the host serving the admin. */
async function testEventUrl(storePageUrl: string): Promise<string | null> {
  if (/^https?:\/\//.test(storePageUrl)) return storePageUrl;
  const host = (await headers()).get("host") ?? "";
  return /^[a-z0-9.-]+(:[0-9]{1,5})?$/i.test(host) ? `https://${host}${storePageUrl.startsWith("/") ? storePageUrl : "/"}` : null;
}

/** The store's first server pixel with a token and a saved test code (the ⌘K command names none). */
function firstTestable(secrets: StoreSettingValue<"tracking_secrets">): { platform: (typeof SERVER_PLATFORMS)[number]; id: string } | null {
  for (const platform of SERVER_PLATFORMS) {
    const ids = Object.keys((platform === "meta" ? secrets.metaTokens : secrets.tiktokTokens) ?? {}).sort();
    for (const id of ids) if (ownToken(secrets, platform, id) && TEST_CODE_RE.test(savedTestCode(secrets, platform, id))) return { platform, id };
  }
  return null;
}

/** Sends the test event for `input`, or for the store's first testable pixel when `input` is null. */
export async function runPixelTest(ctx: WriteCtx, input: SendTestInput | null): Promise<TestEventResult> {
  const { scope, store } = ctx;
  const { tracking_secrets: secrets, defaults } = await getStoreSettings(scope, ["tracking_secrets", "defaults"]);
  const picked = input ? SendTestInput.parse(input) : (() => {
    const first = firstTestable(secrets);
    return first ? SendTestInput.parse({ ...first }) : fail("Add the test event code from Events Manager → Test events first.");
  })();
  const pixelId = normalizePixelId(picked.platform, picked.id);
  if (!PIXEL_ID_RE[picked.platform].test(pixelId)) fail("Enter a valid pixel ID first.");
  const typedCode = picked.testCode.replace(/\s+/g, "").toUpperCase();
  const code = typedCode || savedTestCode(secrets, picked.platform, pixelId);
  if (!TEST_CODE_RE.test(code)) fail("Add the test event code from Events Manager → Test events first.");
  const typed = picked.token.trim();
  const token = !typed || isMask(typed) ? ownToken(secrets, picked.platform, pixelId) : typed;
  if (!token) fail(picked.platform === "meta" ? "Add the Conversions API token first." : "Add the Events API access token first.");
  if (!TOKEN_RE.test(token)) fail("This doesn't look like a valid token. Paste it again.");
  const res = await sendTestEvent({
    platform: picked.platform,
    pixelId,
    token,
    testCode: code,
    // the store's address, not the platform's (PIX-08)
    siteUrl: await testEventUrl(storeUrl(store)),
    currency: store.currency,
    country: defaults.phoneCountry,
    brand: await platformBrandName(),
  });
  // health describes the STORED token: only when the stored one was used
  if (token === ownToken(secrets, picked.platform, pixelId)) {
    await recordPixelHealth(scope, [{ platform: picked.platform, id: pixelId, state: res.ok ? "ok" : "refused", code: res.code, testMode: true }]);
    revalidateStore(store.handle, "/integrations/pixels");
  }
  return res;
}
