import { adminRoute } from "@/lib/http";
import { AI_MODELS, DEFAULT_SETTINGS } from "@/lib/settings";

// Danh sách model gợi ý + giá trị mặc định (để nút "Khôi phục mặc định" trên UI)
export const GET = adminRoute(async () => ({ models: AI_MODELS, defaults: DEFAULT_SETTINGS }));
