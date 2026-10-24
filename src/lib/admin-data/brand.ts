import "server-only";
/**
 * The platform's name where a store-facing artifact says who made it (docs/STORE-SAAS.md §D.10 `platform.brand`;
 * PIX-09, EXP-07): the "Send test event" product and user agent, the README and host configs of an export. The
 * store's own name is what shoppers see; this is only the tool's name.
 */
import { DEFAULT_BRAND } from "@/lib/orders/conversions-core";
import { getPlatformSetting } from "@/lib/settings";

export { DEFAULT_BRAND };

/** `platform.brand.name`, or "Store Gen" while the platform settings can't be read (never throws). */
export async function platformBrandName(): Promise<string> {
  try {
    return (await getPlatformSetting("platform")).brand.name || DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}
