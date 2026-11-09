import { adminRoute } from "@/lib/http";
import { refreshTokenIfNeeded } from "@/lib/auth";

export const POST = adminRoute(async () => {
  await refreshTokenIfNeeded(true);
  return { ok: true };
});
