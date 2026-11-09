import { adminRoute } from "@/lib/http";
import { scanViral, classifyPending } from "@/lib/viral";

export const maxDuration = 300; // Apify chạy đồng bộ có thể mất 1–3 phút
// Quét ngay (bỏ qua lịch). ?classify=1 chỉ chạy AI phân loại các bài còn tồn.
export const POST = adminRoute(async (req) =>
  new URL(req.url).searchParams.get("classify") === "1" ? { classified: await classifyPending() } : scanViral());
