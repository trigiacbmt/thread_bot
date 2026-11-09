import { adminRoute } from "@/lib/http";
import { insightsHistory } from "@/lib/jobs";

// Lịch sử chỉ số tài khoản theo ngày (điểm cuối cùng của mỗi ngày), dùng vẽ biểu đồ xu hướng
export const GET = adminRoute(async (req) => {
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30), 1), 180);
  return insightsHistory(days);
});
