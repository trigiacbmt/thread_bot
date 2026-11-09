import { adminRoute } from "@/lib/http";
import { recentActivity } from "@/lib/activity";

export const GET = adminRoute(async (req) => {
  const u = new URL(req.url);
  const types = u.searchParams.get("types")?.split(",").filter(Boolean);
  return recentActivity(Number(u.searchParams.get("limit") ?? 200), types);
});
