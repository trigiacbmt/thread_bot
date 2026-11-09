import { adminRoute, body } from "@/lib/http";
import { generateReply } from "@/lib/ai";

export const POST = adminRoute(async (req) => {
  const { text, username } = await body<{ text?: string; username?: string }>(req);
  if (!text) throw new Error("Thiếu nội dung cần trả lời");
  return { text: await generateReply({ incomingText: text, incomingUser: username ?? "ai đó" }) };
});
