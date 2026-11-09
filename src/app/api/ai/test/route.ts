import { adminRoute, body } from "@/lib/http";
import { testModel } from "@/lib/ai";

export const maxDuration = 30;
// Gọi thử model (chưa cần lưu cài đặt) để kiểm tra key và tên model
export const POST = adminRoute(async (req) => {
  const { model } = await body<{ model?: string }>(req);
  if (!model?.trim()) throw new Error("Thiếu tên model");
  return testModel(model.trim());
});
