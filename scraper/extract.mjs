// Tách bài Threads từ JSON thô (JSON nhúng trong HTML hoặc response GraphQL).
// Không phụ thuộc đường dẫn cố định trong JSON: duyệt đệ quy và nhận diện object "trông giống bài đăng"
// (có code + taken_at + user.username). Nhờ vậy Meta đổi cấu trúc bọc ngoài thì vẫn chạy.

/** @typedef {{
 *   id: string, code: string, username: string, text: string, takenAt: number,
 *   likes: number, replies: number, reposts: number, quotes: number,
 *   mediaType: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL", isReply: boolean, permalink: string
 * }} ScrapedPost */

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function looksLikePost(o) {
  return (
    o && typeof o === "object" &&
    typeof o.code === "string" && o.code.length >= 6 &&
    (typeof o.taken_at === "number" || typeof o.taken_at === "string") &&
    o.user && typeof o.user === "object" && typeof o.user.username === "string"
  );
}

function mediaType(p) {
  if (Array.isArray(p.carousel_media) && p.carousel_media.length) return "CAROUSEL";
  if (Array.isArray(p.video_versions) && p.video_versions.length) return "VIDEO";
  if (p.image_versions2?.candidates?.length) return "IMAGE";
  return "TEXT";
}

/** @returns {ScrapedPost} */
function normalize(p) {
  const info = p.text_post_app_info ?? {};
  const username = p.user.username;
  return {
    id: String(p.pk ?? p.id ?? p.code).split("_")[0],
    code: p.code,
    username,
    text: (p.caption?.text ?? "").trim(),
    takenAt: num(p.taken_at),
    likes: num(p.like_count),
    replies: num(info.direct_reply_count ?? p.reply_count ?? p.comment_count),
    reposts: num(info.repost_count ?? info.reshare_count),
    quotes: num(info.quote_count),
    mediaType: mediaType(p),
    isReply: Boolean(info.reply_to_author || p.reply_to_author),
    permalink: `https://www.threads.com/@${username}/post/${p.code}`,
  };
}

/**
 * Duyệt một giá trị JSON bất kỳ, gom mọi bài tìm thấy vào `out` (Map theo id, giữ bản có số liệu lớn hơn).
 * @param {unknown} root
 * @param {Map<string, ScrapedPost>} out
 */
export function collectPosts(root, out = new Map()) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (looksLikePost(v)) {
      const p = normalize(v);
      const old = out.get(p.id);
      if (!old || p.likes + p.replies > old.likes + old.replies) out.set(p.id, p);
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) {
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return out;
}

/** Parse JSON an toàn: bỏ tiền tố chống XSSI "for (;;);" mà Meta hay thêm. Trả null nếu hỏng. */
export function safeParse(text) {
  if (typeof text !== "string" || !text) return null;
  const t = text.replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;/, "");
  try {
    return JSON.parse(t);
  } catch {
    // Một số response là nhiều dòng JSON nối nhau
    const parts = [];
    for (const line of t.split("\n")) {
      try { parts.push(JSON.parse(line)); } catch { /* bỏ dòng hỏng */ }
    }
    return parts.length ? parts : null;
  }
}
