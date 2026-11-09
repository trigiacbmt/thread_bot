// Phân tích giọng văn từ các bài + reply chủ tài khoản đã đăng. Chỉ trả kết quả, KHÔNG tự lưu:
// người dùng xem lại rồi bấm "Áp dụng" trên trang Cài đặt.
import { adminRoute } from "@/lib/http";
import { analyzeVoice } from "@/lib/ai";
import { getMyPosts, getMyReplies } from "@/lib/threadsClient";
import { queue } from "@/lib/queue";

export const maxDuration = 60;

export const POST = adminRoute(async () => {
  const [posts, replies, mine] = await Promise.all([
    getMyPosts(50).then((r) => r.data).catch(() => []),
    getMyReplies(30).then((r) => r.data).catch(() => []), // cần quyền threads_read_replies
    queue.list(),
  ]);
  // Bỏ bài do bot đăng (đã có trong hàng đợi) để không "học" lại giọng của chính AI
  const botPostIds = new Set(mine.flatMap((q) => [q.postId, q.replyPostId]).filter(Boolean));
  const texts = [...posts, ...replies]
    .filter((p) => p.text && !botPostIds.has(p.id))
    .map((p) => p.text!.trim())
    .filter((t) => t.length >= 15 && !/^https?:\/\/\S+$/.test(t));
  const unique = [...new Set(texts)].slice(0, 60);
  if (unique.length < 5) {
    throw new Error(`Cần ít nhất 5 bài/reply có chữ do chính bạn viết (hiện có ${unique.length}). Đăng thêm vài bài rồi thử lại.`);
  }
  return analyzeVoice(unique);
});
