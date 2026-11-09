// Mọi cấu hình KHÔNG phải bí mật đều chỉnh trong app (trang Cài đặt), lưu ở bảng kv (key = "settings").
// .env chỉ còn chứa key/kết nối (Threads app, Supabase, Anthropic, Shopee, ADMIN_KEY, CRON_SECRET).
import { kvGet, kvSet } from "./db";
import { isValidCron } from "./cronMatch";

export type ViralSource = "apify" | "scraper" | "meta" | "manual";
export type LinkMode = "reply" | "inline" | "none";
export type ReplyControl = "everyone" | "accounts_you_follow" | "mentioned_only" | "parent_post_author_only" | "followers_only";

export interface Settings {
  // ---- AI ----
  /** Model viết bài và trả lời */
  aiModel: string;
  /** Model phân loại bài viral (nên dùng loại nhanh/rẻ) */
  aiClassifyModel: string;
  persona: string;
  /** Yêu cầu thêm áp dụng cho mọi bài AI viết (VD: luôn kết bằng 1 câu hỏi) */
  writingGuide: string;
  /** Tóm tắt phong cách viết của chủ tài khoản (AI phân tích từ bài đã đăng) */
  voiceSummary: string;
  /** 0–5 bài mẫu của chủ tài khoản, đưa vào prompt để AI bắt chước giọng văn */
  voiceSamples: string[];
  useVoiceSamples: boolean;

  // ---- Chung ----
  timezone: string;

  // ---- Đăng bài ----
  postTopics: string[];
  postCron: string;
  autoPostEnabled: boolean;
  /** true: bài AI viết theo chủ đề vào Hàng đợi dạng nháp */
  requireApproval: boolean;
  /** Topic tag của Threads gắn vào bài (1 tag, để trống nếu không dùng) */
  topicTag: string;
  /** Ai được reply bài của bot */
  replyControl: ReplyControl;

  // ---- Tự trả lời ----
  autoReply: boolean;
  maxRepliesPerHour: number;

  // ---- Săn bài viral ----
  /** Nguồn quét: apify = dịch vụ scrape (không cần App Review), meta = keyword_search chính thức, manual = chỉ thêm tay */
  viralSource: ViralSource;
  viralKeywords: string[];
  viralCron: string;
  viralMaxAgeHours: number;
  /** Số kết quả TOP lấy cho mỗi từ khoá mỗi lần quét (tối đa 100) */
  viralSearchLimit: number;
  autoViralDrafts: boolean;
  viralDailyDrafts: number;
  minViralScore: number;

  // ---- Scraper trên máy bạn (viralSource = "scraper", chạy bằng `npm run scraper`) ----
  /** Username các tài khoản chuyên đăng tips — scraper đọc bài mới của họ */
  viralSourceAccounts: string[];
  /** Scraper tìm thêm theo danh sách từ khoá (tab TOP của trang tìm kiếm Threads) */
  scraperSearchKeywords: boolean;
  /** Chỉ giữ bài viết tiếng Việt (bỏ bài tiếng Anh, Thái, Trung…) */
  viralVietnameseOnly: boolean;
  /** Bao lâu scraper quét 1 lượt (phút, 30–1440) */
  scraperIntervalMinutes: number;
  /** Chỉ giữ bài có ít nhất ngần này lượt thích */
  scraperMinLikes: number;
  /** Số lần cuộn trang profile để tải thêm bài (0–5) */
  scraperScrolls: number;
  /** Actor trên Apify Store, dạng user/ten-actor */
  apifyActor: string;
  /** Số bài lấy mỗi từ khoá mỗi lần quét qua Apify (bị tính phí theo bài) */
  apifyMaxPosts: number;
  /** Bỏ bài có ít lượt thích hơn mức này (chỉ áp dụng khi nguồn trả về lượt thích, VD Apify) */
  viralMinLikes: number;
  /** Số bình luận tối thiểu */
  viralMinReplies: number;
  /** Số lượt chia sẻ (repost + quote) tối thiểu */
  viralMinReposts: number;
  /** Giá actor (USD / 1.000 bài) — chỉ để ước tính chi phí */
  apifyPricePer1k: number;
  /** Ngân sách tháng (USD). Ước tính vượt mức này thì ngừng quét. 0 = không giới hạn */
  apifyMonthlyBudget: number;
  /** Mẫu input JSON cho actor khác (để trống = dùng mặc định). Biến: {{keywords}}, {{maxPosts}}, {{postedAfter}} */
  apifyInputTemplate: string;

  // ---- Link sản phẩm (tuỳ chọn) ----
  affiliateEnabled: boolean;
  linkMode: LinkMode;
  affiliateDisclosure: string;
  /** subId gắn vào link Shopee tự tạo, để xem thống kê theo kênh trong Shopee Affiliate */
  shopeeSubId: string;
}

export const AI_MODELS: Array<{ id: string; label: string }> = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — nhanh, rẻ" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — cân bằng" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 — viết hay nhất" },
];

export const DEFAULT_SETTINGS: Settings = {
  aiModel: "claude-sonnet-5-5",
  aiClassifyModel: "claude-haiku-5-5",
  persona: 'Bạn là một người trẻ Việt Nam thích chia sẻ mẹo vặt cuộc sống, giọng gần gũi, vui vẻ, nói ngắn gọn dễ hiểu, xưng "mình".',
  writingGuide: "",
  voiceSummary: "",
  voiceSamples: [],
  useVoiceSamples: true,
  timezone: "Asia/Ho_Chi_Minh",

  postTopics: ["Mẹo nhà bếp", "Mẹo dọn dẹp", "Mẹo tiết kiệm"],
  postCron: "0 9,20 * * *",
  autoPostEnabled: false,
  requireApproval: true,
  topicTag: "",
  replyControl: "everyone",

  autoReply: true,
  maxRepliesPerHour: 20,

  viralSource: "manual",
  viralKeywords: ["mẹo hay", "mẹo vặt", "tips cuộc sống", "mẹo nhà bếp", "mẹo dọn nhà", "mẹo tiết kiệm", "life hack"],
  viralCron: "15 */2 * * *",
  viralMaxAgeHours: 72,
  viralSearchLimit: 50,
  autoViralDrafts: true,
  viralDailyDrafts: 3,
  minViralScore: 30,

  viralSourceAccounts: [],
  scraperSearchKeywords: true,
  viralVietnameseOnly: true,
  scraperIntervalMinutes: 120,
  scraperMinLikes: 50,
  scraperScrolls: 2,
  apifyActor: "webdata_labs/threads-scraper",
  apifyMaxPosts: 3,
  viralMinLikes: 200,
  viralMinReplies: 20,
  viralMinReposts: 5,
  apifyPricePer1k: 3,
  apifyMonthlyBudget: 5,
  apifyInputTemplate: "",

  affiliateEnabled: true,
  linkMode: "reply",
  affiliateDisclosure: "(link tiếp thị liên kết)",
  shopeeSubId: "threads",
};

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

const REPLY_CONTROLS: ReplyControl[] = ["everyone", "accounts_you_follow", "mentioned_only", "parent_post_author_only", "followers_only"];

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await kvGet<Partial<Settings>>("settings", {})) };
}

/** Kiểm tra + chuẩn hoá giá trị trước khi lưu. Ném lỗi tiếng Việt nếu không hợp lệ. */
function validate(p: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const k of SETTINGS_KEYS) if (k in p && p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k];

  for (const k of ["postCron", "viralCron"] as const) {
    if (out[k] !== undefined && !isValidCron(out[k]!)) throw new Error(`Cron không hợp lệ: ${out[k]}`);
  }
  if (out.timezone !== undefined && !isValidTimezone(out.timezone)) throw new Error(`Múi giờ không hợp lệ: ${out.timezone}`);
  if (out.viralSource && !["apify", "scraper", "meta", "manual"].includes(out.viralSource)) throw new Error("Nguồn quét không hợp lệ");
  if (out.apifyActor !== undefined) {
    out.apifyActor = out.apifyActor.trim().replace(/^https?:\/\/apify\.com\//, "").replace(/~/, "/");
    if (out.apifyActor && !/^[\w.-]+\/[\w.-]+$/.test(out.apifyActor)) throw new Error("Actor Apify phải có dạng user/ten-actor");
  }
  if (out.apifyInputTemplate !== undefined) {
    out.apifyInputTemplate = String(out.apifyInputTemplate).trim().slice(0, 3000);
    if (out.apifyInputTemplate) {
      const probe = out.apifyInputTemplate.replace(/"?\{\{(keywords|maxPosts)\}\}"?/g, "1").replace(/\{\{postedAfter\}\}/g, "x");
      try { JSON.parse(probe); } catch { throw new Error("Mẫu input Apify không phải JSON hợp lệ"); }
    }
  }
  if (out.linkMode && !["reply", "inline", "none"].includes(out.linkMode)) throw new Error("Cách gắn link không hợp lệ");
  if (out.replyControl && !REPLY_CONTROLS.includes(out.replyControl)) throw new Error("Quyền reply không hợp lệ");
  for (const k of ["aiModel", "aiClassifyModel"] as const) {
    if (out[k] !== undefined) {
      out[k] = out[k]!.trim();
      if (!/^[a-z0-9][a-z0-9.\-_@:]{2,80}$/i.test(out[k]!)) throw new Error(`Tên model không hợp lệ: ${out[k]}`);
    }
  }
  if (out.topicTag !== undefined) {
    // Topic tag của Threads: 1–50 ký tự, không chứa . hoặc &
    out.topicTag = out.topicTag.trim().replace(/^#/, "");
    if (out.topicTag && (out.topicTag.length > 50 || /[.&]/.test(out.topicTag))) throw new Error("Topic tag tối đa 50 ký tự, không chứa dấu . hoặc &");
  }
  if (out.shopeeSubId !== undefined) {
    out.shopeeSubId = out.shopeeSubId.trim();
    if (out.shopeeSubId && !/^[a-zA-Z0-9_-]{1,50}$/.test(out.shopeeSubId)) throw new Error("subId chỉ gồm chữ, số, _ và -");
  }
  const clamp = (v: number | undefined, min: number, max: number) => (v === undefined ? undefined : Math.min(max, Math.max(min, Math.round(Number(v) || 0))));
  if (out.viralSearchLimit !== undefined) out.viralSearchLimit = clamp(out.viralSearchLimit, 5, 100);
  for (const k of ["viralMinLikes", "viralMinReplies", "viralMinReposts"] as const) {
    if (out[k] !== undefined) out[k] = clamp(out[k], 0, 1_000_000);
  }
  if (out.apifyMaxPosts !== undefined) out.apifyMaxPosts = clamp(out.apifyMaxPosts, 1, 50);
  for (const k of ["apifyPricePer1k", "apifyMonthlyBudget"] as const) {
    if (out[k] !== undefined) out[k] = Math.min(1000, Math.max(0, Math.round((Number(out[k]) || 0) * 100) / 100));
  }
  if (out.viralMaxAgeHours !== undefined) out.viralMaxAgeHours = clamp(out.viralMaxAgeHours, 1, 168);
  if (out.viralDailyDrafts !== undefined) out.viralDailyDrafts = clamp(out.viralDailyDrafts, 0, 50);
  if (out.maxRepliesPerHour !== undefined) out.maxRepliesPerHour = clamp(out.maxRepliesPerHour, 0, 200);
  if (out.minViralScore !== undefined) out.minViralScore = clamp(out.minViralScore, 0, 1000);
  if (out.scraperIntervalMinutes !== undefined) out.scraperIntervalMinutes = clamp(out.scraperIntervalMinutes, 30, 1440);
  if (out.scraperMinLikes !== undefined) out.scraperMinLikes = clamp(out.scraperMinLikes, 0, 1_000_000);
  if (out.scraperScrolls !== undefined) out.scraperScrolls = clamp(out.scraperScrolls, 0, 5);
  if (out.viralSourceAccounts !== undefined) {
    // Nhận "@ten", "ten" hoặc link https://www.threads.com/@ten
    out.viralSourceAccounts = [...new Set(out.viralSourceAccounts.map((x) => {
      const v = String(x).trim();
      const m = v.match(/threads\.(?:com|net)\/@([^/?#\s]+)/i);
      return (m ? m[1] : v).replace(/^@/, "").toLowerCase();
    }).filter((u) => /^[a-z0-9._]{1,30}$/.test(u)))].slice(0, 100);
  }
  if (out.voiceSamples !== undefined) {
    out.voiceSamples = out.voiceSamples.map((x) => String(x).trim().slice(0, 600)).filter(Boolean).slice(0, 5);
  }
  if (out.voiceSummary !== undefined) out.voiceSummary = String(out.voiceSummary).trim().slice(0, 1500);
  for (const k of ["postTopics", "viralKeywords"] as const) {
    if (out[k] !== undefined) out[k] = [...new Set(out[k]!.map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
  }
  return out;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...validate(patch) };
  await kvSet("settings", next);
  return next;
}
