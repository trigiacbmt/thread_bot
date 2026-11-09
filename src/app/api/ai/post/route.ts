import { adminRoute, body } from "@/lib/http";
import { generatePost } from "@/lib/ai";

export const POST = adminRoute(async (req) => {
  const { topic, extra } = await body<{ topic?: string; extra?: string }>(req);
  return { text: await generatePost(topic || "chủ đề tự do", extra) };
});
