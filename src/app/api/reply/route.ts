import { adminRoute, body } from "@/lib/http";
import { reply } from "@/lib/threadsClient";
import { log } from "@/lib/activity";

export const POST = adminRoute(async (req) => {
  const { replyToId, text } = await body<{ replyToId?: string; text?: string }>(req);
  if (!replyToId || !text?.trim()) throw new Error("Thiếu replyToId hoặc nội dung");
  const id = await reply(replyToId, text.trim());
  await log("reply", `Trả lời thủ công: ${text.trim()}`, { inReplyTo: replyToId, postId: id, auto: false });
  return { id };
});
