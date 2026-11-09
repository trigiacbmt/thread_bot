import { adminRoute, body } from "@/lib/http";
import { hideReply } from "@/lib/threadsClient";

export const POST = adminRoute(async (req) => {
  const { replyId, hide = true } = await body<{ replyId?: string; hide?: boolean }>(req);
  if (!replyId) throw new Error("Thiếu replyId");
  return hideReply(replyId, hide);
});
