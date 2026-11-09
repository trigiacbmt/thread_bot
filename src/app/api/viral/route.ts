import { adminRoute } from "@/lib/http";
import { listViral } from "@/lib/viral";

export const GET = adminRoute(async (req) => {
  const q = new URL(req.url).searchParams;
  return listViral({
    status: q.get("status") || undefined,
    onlyTips: q.get("tips") === "1",
    limit: Math.min(Number(q.get("limit") ?? 100), 300),
  });
});
