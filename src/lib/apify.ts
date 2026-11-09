// Nguồn săn viral qua Apify (dịch vụ scrape bên thứ ba) — dùng khi app chưa được Meta duyệt threads_keyword_search.
// Chỉ ĐỌC bài công khai, không dùng tài khoản Threads của bạn. Đăng bài / trả lời vẫn đi qua API chính thức.
import { config } from "./config";
import { kvGet, kvSet } from "./db";
import type { Settings } from "./settings";

const APIFY = (process.env.APIFY_BASE_URL || "https://api.apify.com") + "/v2";
export const DEFAULT_APIFY_ACTOR = "webdata_labs/threads-scraper";

/** Bài đã chuẩn hoá từ kết quả Apify (mỗi actor đặt tên field hơi khác nhau). */
export interface ScrapedPost {
  id: string;
  keyword: string;
  rank: number;
  text: string;
  username: string | null;
  permalink: string | null;
  mediaType: string | null;
  postedAt: string | null;
  likes: number;
  replies: number;
  reposts: number;
}

export interface ApifyUsage {
  /** Tháng theo múi giờ cài đặt, dạng YYYY-MM */
  month: string;
  runs: number;
  /** Số bài (dòng kết quả) đã bị tính phí */
  items: number;
  /** Chi phí ước tính (USD) = items × giá/1.000 */
  estUsd: number;
}

const monthKey = (tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export async function apifyUsage(s: Settings): Promise<ApifyUsage> {
  const month = monthKey(s.timezone);
  const u = await kvGet<ApifyUsage | null>("apify_usage", null);
  return u && u.month === month ? u : { month, runs: 0, items: 0, estUsd: 0 };
}

async function addUsage(s: Settings, items: number) {
  const u = await apifyUsage(s);
  u.runs += 1;
  u.items += items;
  u.estUsd = Math.round(((u.items * s.apifyPricePer1k) / 1000) * 100) / 100;
  await kvSet("apify_usage", u);
  return u;
}

/** Ước tính chi phí 1 lần quét (USD) theo cài đặt hiện tại. */
export const estimateRunUsd = (s: Settings) => (s.viralKeywords.length * s.apifyMaxPosts * s.apifyPricePer1k) / 1000;

/** Input cho actor. Mặc định theo schema của webdata_labs/threads-scraper; actor khác dùng mẫu JSON trong Cài đặt. */
function buildInput(s: Settings, keywords: string[], postedAfter: string): unknown {
  const tpl = s.apifyInputTemplate.trim();
  if (!tpl) return { mode: "search", searchQueries: keywords, maxPosts: s.apifyMaxPosts, postedAfter };
  const filled = tpl
    .replace(/"\{\{keywords\}\}"|\{\{keywords\}\}/g, JSON.stringify(keywords))
    .replace(/"\{\{maxPosts\}\}"|\{\{maxPosts\}\}/g, String(s.apifyMaxPosts))
    .replace(/\{\{postedAfter\}\}/g, postedAfter);
  try {
    return JSON.parse(filled);
  } catch {
    throw new Error("Mẫu input Apify không phải JSON hợp lệ (xem Cài đặt → Săn viral)");
  }
}

// ---- Chuẩn hoá kết quả ----
type Row = Record<string, unknown>;
const str = (...v: unknown[]) => {
  for (const x of v) if (typeof x === "string" && x.trim()) return x.trim();
  return null;
};
const num = (...v: unknown[]) => {
  for (const x of v) {
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return 0;
};
const obj = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});
function toIso(v: unknown): string | null {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string" && v) {
    const d = new Date(/^\d+$/.test(v) ? Number(v) * (v.length <= 10 ? 1000 : 1) : v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function normalizeRow(r: Row, fallbackKeyword: string): Omit<ScrapedPost, "rank"> | null {
  if (r.type && r.type !== "post") return null; // bỏ dòng profile
  const author = obj(r.author ?? r.user ?? r.owner);
  const text = str(r.text, r.caption, r.content, obj(r.caption).text);
  const url = str(r.url, r.postUrl, r.permalink, r.link);
  const code = str(r.code, r.shortcode) ?? url?.match(/\/post\/([^/?#]+)/)?.[1] ?? null;
  // Ưu tiên shortcode (ổn định giữa các actor) làm id
  const rawId = str(code, r.postId, r.id, r.pk);
  if (!text || !rawId) return null;
  if (r.isReply === true || r.is_reply === true) return null;
  return {
    id: `ap-${rawId}`,
    keyword: str(r.searchQuery, r.query, r.keyword) ?? fallbackKeyword,
    text,
    username: str(r.username, author.username, author.handle)?.replace(/^@/, "") ?? null,
    permalink: url,
    mediaType: str(r.mediaType, r.media_type),
    postedAt: toIso(r.date ?? r.timestamp ?? r.createdAt ?? r.created_at ?? r.taken_at ?? r.publishedAt),
    likes: num(r.likeCount, r.like_count, r.likes, obj(r.stats).likes),
    replies: num(r.replyCount, r.reply_count, r.replies, r.commentCount, obj(r.stats).replies),
    // "Chia sẻ" = repost + quote (Threads không công khai số lượt gửi tin nhắn)
    reposts: num(r.repostCount, r.repost_count, r.reposts, obj(r.stats).reposts) + num(r.quoteCount, r.quote_count, r.quotes),
  };
}

/** Gọi actor (chạy đồng bộ, đợi kết quả), tối đa 20 từ khoá mỗi lần chạy. */
export async function apifySearch(s: Settings): Promise<{ posts: ScrapedPost[]; items: number; usage: ApifyUsage }> {
  const token = config.apifyToken;
  if (!token) throw new Error("Chưa có APIFY_TOKEN trong .env.local (apify.com → Settings → API & Integrations)");
  const actor = (s.apifyActor.trim() || DEFAULT_APIFY_ACTOR).replace("/", "~");
  const postedAfter = new Date(Date.now() - s.viralMaxAgeHours * 3600_000).toISOString();
  const posts: ScrapedPost[] = [];
  let items = 0;
  let usage = await apifyUsage(s);

  for (let i = 0; i < s.viralKeywords.length; i += 20) {
    const keywords = s.viralKeywords.slice(i, i + 20);
    const maxItems = keywords.length * s.apifyMaxPosts;
    const qs = new URLSearchParams({
      maxItems: String(maxItems), // chặn trên số bài bị tính phí
      maxTotalChargeUsd: String(Math.max(0.05, Math.ceil(((maxItems * s.apifyPricePer1k) / 1000) * 150) / 100)),
      timeout: "240",
    });
    const res = await fetch(`${APIFY}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?${qs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildInput(s, keywords, postedAfter)),
      signal: AbortSignal.timeout(270_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const hint =
        res.status === 401 ? " — APIFY_TOKEN sai" :
        res.status === 402 ? " — tài khoản Apify hết tiền/credit" :
        res.status === 404 ? ` — không tìm thấy actor "${s.apifyActor}"` :
        res.status === 408 ? " — actor chạy quá lâu, thử giảm số từ khoá" : "";
      throw new Error(`Apify ${res.status}${hint}: ${body.slice(0, 300)}`);
    }
    const rows = (await res.json()) as Row[];
    if (!Array.isArray(rows)) throw new Error("Apify trả về dữ liệu không đúng dạng danh sách");
    items += rows.length;
    usage = await addUsage(s, rows.length);

    // Thứ hạng tính riêng trong từng từ khoá, theo thứ tự actor trả về (≈ thứ tự TOP của Threads)
    const rankBy = new Map<string, number>();
    for (const r of rows) {
      const p = normalizeRow(r, keywords.length === 1 ? keywords[0] : "Apify");
      if (!p) continue;
      const rank = rankBy.get(p.keyword) ?? 0;
      rankBy.set(p.keyword, rank + 1);
      posts.push({ ...p, rank });
    }
  }
  return { posts, items, usage };
}
