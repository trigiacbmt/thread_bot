import { adminRoute, body } from "@/lib/http";
import { addManualViral } from "@/lib/viral";

export const maxDuration = 60;
// Thêm bài viral tự tìm: { url?, text?, username? }
export const POST = adminRoute(async (req) => addManualViral(await body<{ url?: string; text?: string; username?: string }>(req)));
