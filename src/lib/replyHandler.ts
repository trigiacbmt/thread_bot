// Xử lý reply/mention đến: lọc, sinh câu trả lời bằng AI, đăng reply.
import { generateReply } from "./ai";
import { getSettings } from "./settings";
import { seenStore, tokenStore } from "./store";
import { getConversation, reply } from "./threadsClient";
import { log, autoRepliesLastHour } from "./activity";

export interface Incoming {
  id: string;
  text?: string;
  username?: string;
  kind: "reply" | "mention";
  rootPostId?: string;
  rootPostText?: string;
}

export async function handleIncoming(item: Incoming): Promise<void> {
  // Webhook có thể gửi lại cùng một sự kiện → chỉ xử lý lần đầu
  if (!(await seenStore.claim(item.id))) return;

  const [s, token] = await Promise.all([getSettings(), tokenStore.get()]);
  await log(item.kind, `@${item.username ?? "?"}: ${item.text ?? "(không có text)"}`, {
    id: item.id,
    username: item.username,
    text: item.text,
  });

  if (!s.autoReply) return;
  if (!item.text) return log("skip", "Bỏ qua: không có nội dung chữ", { id: item.id });
  if (item.username && item.username === token?.username) return; // không tự trả lời chính mình
  if ((await autoRepliesLastHour()) >= s.maxRepliesPerHour) {
    return log("skip", `Bỏ qua: đã chạm giới hạn ${s.maxRepliesPerHour} reply/giờ`, { id: item.id });
  }

  let thread: Array<{ username?: string; text?: string }> = [];
  if (item.rootPostId) {
    try {
      thread = (await getConversation(item.rootPostId)).data;
    } catch {
      /* không đọc được hội thoại thì trả lời không cần ngữ cảnh */
    }
  }

  try {
    const text = await generateReply({
      incomingText: item.text,
      incomingUser: item.username ?? "ai đó",
      rootPostText: item.rootPostText,
      thread,
    });
    if (!text) return log("skip", `AI chọn không trả lời @${item.username ?? "?"} (spam/không phù hợp)`, { id: item.id });

    const postId = await reply(item.id, text);
    await log("reply", `Đã trả lời @${item.username ?? "?"}: ${text}`, { inReplyTo: item.id, postId, auto: true });
  } catch (e) {
    await log("error", "Trả lời thất bại", { id: item.id, error: String(e) });
  }
}
