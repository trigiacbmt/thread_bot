import { adminRoute } from "@/lib/http";
import { tokenStore } from "@/lib/store";
import { config } from "@/lib/config";
import { getPublishingLimit, MAX_TEXT } from "@/lib/threadsClient";
import { shopeeEnabled } from "@/lib/shopee";
import { getSettings } from "@/lib/settings";

export const GET = adminRoute(async () => {
  const [t, settings] = await Promise.all([tokenStore.get(), getSettings()]);
  const limit = t ? await getPublishingLimit().then((r) => r.data?.[0] ?? null).catch(() => null) : null;
  return {
    connected: Boolean(t),
    username: t?.username ?? null,
    tokenExpiresAt: t ? new Date(t.expiresAt).toISOString() : null,
    aiEnabled: Boolean(config.anthropicKey),
    aiModel: settings.aiModel,
    maxText: MAX_TEXT,
    shopeeEnabled: shopeeEnabled(),
    affiliateEnabled: settings.affiliateEnabled,
    publishingLimit: limit,
  };
});
