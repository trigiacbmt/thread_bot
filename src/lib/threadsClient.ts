// Client tối giản cho Threads API (graph.threads.com).
import { tokenStore } from "./store";

// THREADS_GRAPH_URL chỉ dùng khi test với server giả lập
export const GRAPH = process.env.THREADS_GRAPH_URL ?? "https://graph.threads.com";
const API = `${GRAPH}/v1.0`;
export const MAX_TEXT = 500;

export class ThreadsApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Threads API ${status}: ${JSON.stringify(body)}`);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

function toSearch(params: Params): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  return sp;
}

export async function rawRequest<T>(
  method: "GET" | "POST" | "DELETE",
  url: string,
  params: Params = {},
): Promise<T> {
  const sp = toSearch(params);
  const res =
    method === "GET" || method === "DELETE"
      ? await fetch(`${url}?${sp}`, { method })
      : await fetch(url, {
          method,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: sp,
        });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ThreadsApiError(res.status, body);
  return body as T;
}

async function auth() {
  const t = await tokenStore.get();
  if (!t) throw new Error("Chưa kết nối tài khoản Threads.");
  return t;
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}) {
  const t = await auth();
  return rawRequest<T>(method, `${API}/${path}`, { ...params, access_token: t.accessToken });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Độ dài theo cách Threads tính: ký tự thường = 1, emoji = số byte UTF-8
 * (theo tài liệu: "emojis are counted as the number of UTF-8 bytes").
 */
export function threadsLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    n += /\p{Extended_Pictographic}|\u200d|\ufe0f/u.test(ch) ? Buffer.byteLength(ch, "utf8") : 1;
  }
  return n;
}

export function clampText(text: string): string {
  const t = text.trim();
  if (threadsLength(t) <= MAX_TEXT) return t;
  let out = "";
  for (const ch of t) {
    if (threadsLength(out + ch) > MAX_TEXT - 1) break;
    out += ch;
  }
  return out + "…";
}

// ---------- Hồ sơ ----------
export interface Profile {
  id: string;
  username: string;
  name?: string;
}
export const getMe = () => call<Profile>("GET", "me", { fields: "id,username,name" });

// ---------- Đăng bài ----------
export interface PostOptions {
  text: string;
  imageUrl?: string;
  replyToId?: string;
  /** Topic tag của Threads (1–50 ký tự) */
  topicTag?: string;
  /** Link hiển thị dạng thẻ xem trước (chỉ cho bài TEXT) */
  linkAttachment?: string;
  replyControl?:
    | "everyone"
    | "accounts_you_follow"
    | "mentioned_only"
    | "parent_post_author_only"
    | "followers_only";
}

/** Tạo container → chờ xử lý xong → publish. Trả về id bài đã đăng. */
export async function publish(opts: PostOptions): Promise<string> {
  const { userId } = await auth();
  const container = await call<{ id: string }>("POST", `${userId}/threads`, {
    media_type: opts.imageUrl ? "IMAGE" : "TEXT",
    text: clampText(opts.text),
    image_url: opts.imageUrl,
    reply_to_id: opts.replyToId,
    reply_control: opts.replyControl,
    topic_tag: opts.topicTag || undefined,
    link_attachment: opts.imageUrl ? undefined : opts.linkAttachment,
  });

  // Ảnh/video cần thời gian xử lý; text thường xong ngay.
  for (let i = 0; i < 10; i++) {
    const s = await call<{ status?: string; error_message?: string }>("GET", container.id, {
      fields: "status,error_message",
    });
    if (s.status === "FINISHED" || s.status === undefined) break;
    if (s.status === "ERROR" || s.status === "EXPIRED") {
      throw new Error(`Container lỗi: ${s.status} ${s.error_message ?? ""}`);
    }
    await sleep(opts.imageUrl ? 3000 : 1000);
  }

  const published = await call<{ id: string }>("POST", `${userId}/threads_publish`, {
    creation_id: container.id,
  });
  return published.id;
}

export const reply = (replyToId: string, text: string, linkAttachment?: string) =>
  publish({ text, replyToId, linkAttachment });

/** Hạn mức đăng trong 24h (bài và reply). */
export async function getPublishingLimit() {
  const { userId } = await auth();
  return call<{ data: Array<Record<string, unknown>> }>("GET", `${userId}/threads_publishing_limit`, {
    fields: "quota_usage,config,reply_quota_usage,reply_config",
  });
}

// ---------- Đọc ----------
export interface ThreadsPost {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  is_reply?: boolean;
  has_replies?: boolean;
}

const POST_FIELDS = "id,text,username,permalink,timestamp,media_type,is_reply,has_replies";

export const getMyPosts = async (limit = 25) =>
  call<{ data: ThreadsPost[] }>("GET", `${(await auth()).userId}/threads`, { fields: POST_FIELDS, limit });

/** Các reply chính mình đã viết (dùng để học giọng văn khi trò chuyện). */
export const getMyReplies = async (limit = 25) =>
  call<{ data: ThreadsPost[] }>("GET", `${(await auth()).userId}/replies`, { fields: POST_FIELDS, limit });

export const getPost = (id: string) => call<ThreadsPost>("GET", id, { fields: POST_FIELDS });

/** Chuỗi hội thoại của một bài (dùng làm ngữ cảnh khi trả lời). */
export const getConversation = (id: string) =>
  call<{ data: ThreadsPost[] }>("GET", `${id}/conversation`, {
    fields: POST_FIELDS,
    reverse: false,
  });

export const getMentions = async (limit = 25) =>
  call<{ data: ThreadsPost[] }>("GET", `${(await auth()).userId}/mentions`, { fields: POST_FIELDS, limit });

// ---------- Quản lý reply ----------
export const hideReply = (replyId: string, hide = true) =>
  call<{ success: boolean }>("POST", `${replyId}/manage_reply`, { hide });

// ---------- Tìm kiếm (cần threads_keyword_search) ----------
export const keywordSearch = (
  q: string,
  opts: { searchType?: "TOP" | "RECENT"; since?: number; limit?: number; mediaType?: "TEXT" | "IMAGE" | "VIDEO" } = {},
) =>
  call<{ data: ThreadsPost[] }>("GET", "keyword_search", {
    q,
    search_type: opts.searchType ?? "TOP",
    media_type: opts.mediaType,
    since: opts.since,
    limit: opts.limit ?? 25,
    fields: POST_FIELDS,
  });

// ---------- Insights (cần threads_manage_insights) ----------
export interface InsightMetric {
  name: string;
  values?: Array<{ value: number; end_time?: string }>;
  total_value?: { value: number };
}

export const getPostInsights = (mediaId: string) =>
  call<{ data: InsightMetric[] }>("GET", `${mediaId}/insights`, {
    metric: "views,likes,replies,reposts,quotes,shares",
  });

export const getUserInsights = async (since?: number, until?: number) =>
  call<{ data: InsightMetric[] }>("GET", `${(await auth()).userId}/threads_insights`, {
    metric: "views,likes,replies,reposts,quotes,followers_count",
    since,
    until,
  });

export function metricValue(m: InsightMetric): number {
  if (m.total_value) return m.total_value.value;
  return (m.values ?? []).reduce((s, v) => s + (v.value ?? 0), 0);
}

