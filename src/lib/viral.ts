// Săn bài viral về tips đời sống → AI lọc → viết bài tương tự kèm sản phẩm Shopee.
import crypto from "node:crypto";
import { db, must, kvGet, kvSet } from "./db";
import { getSettings, type Settings, type ViralSource } from "./settings";
import { config } from "./config";
import { apifySearch, apifyUsage, estimateRunUsd, type ApifyUsage } from "./apify";
import { GRAPH, keywordSearch } from "./threadsClient";
import { classifyTips, rewriteViral } from "./ai";
import { products, shortlist } from "./products";
import { queue, type QueueItem } from "./queue";
import { tokenStore } from "./store";
import { log } from "./activity";
import { isVietnamese } from "./lang";

export interface ViralPost {
  id: string;
  keyword: string;
  text: string | null;
  username: string | null;
  permalink: string | null;
  media_type: string | null;
  has_replies: boolean;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  posted_at: string | null;
  found_at: string;
  last_seen_at: string;
  seen_count: number;
  best_rank: number;
  score: number;
  ai_checked: boolean;
  is_tip: boolean | null;
  ai_quality: number | null;
  ai_reason: string | null;
  ai_product_keywords: string[] | null;
  status: "new" | "used" | "dismissed";
}

// ---------- Quét ----------
/** Đủ "viral" khi đạt CẢ 3 ngưỡng: lượt thích, bình luận, chia sẻ (repost). */
export function isViralEnough(e: { likes: number; replies: number; reposts: number }, s: Settings) {
  return e.likes >= s.viralMinLikes && e.replies >= s.viralMinReplies && e.reposts >= s.viralMinReposts;
}

export interface ScanResult {
  source: ViralSource;
  keywords: number;
  /** Tổng số bài nguồn trả về (trước khi lọc) */
  total: number;
  /** Bài của chính mình (bị bỏ qua) */
  own: number;
  /** Bài hợp lệ đã ghi nhận */
  scanned: number;
  /** Bài không phải tiếng Việt (bị bỏ qua khi bật "Chỉ bài tiếng Việt") */
  foreign?: number;
  /** Bài ít tương tác (dưới "Lượt thích tối thiểu") bị bỏ qua */
  weak?: number;
  newPosts: number;
  classified: number;
  errors: number;
  /** Dấu hiệu app chưa được duyệt threads_keyword_search (Threads chỉ trả bài của chính mình) */
  limited: boolean;
  /** Lý do không quét (chế độ thủ công, hết ngân sách, thiếu token…) */
  skipped?: string;
  /** Chi phí Apify tháng này (chỉ khi nguồn = apify) */
  usage?: ApifyUsage;
  at: string;
}

interface Hit {
  id: string; keyword: string; rank: number; text: string; username: string | null; permalink: string | null;
  mediaType: string | null; hasReplies: boolean; postedAt: string | null;
  engagement?: { likes: number; replies: number; reposts: number };
}

let warnedNoEngagementCols = false;
async function recordHit(h: Hit): Promise<boolean> {
  const isNew = must(
    await db().rpc("upsert_viral_hit", {
      p_id: h.id, p_keyword: h.keyword, p_text: h.text, p_username: h.username,
      p_permalink: h.permalink, p_media_type: h.mediaType,
      p_has_replies: h.hasReplies, p_posted_at: h.postedAt, p_rank: h.rank,
    }),
  ) as boolean;
  if (h.engagement) {
    const { error } = await db().from("viral_posts").update({
      like_count: h.engagement.likes, reply_count: h.engagement.replies, repost_count: h.engagement.reposts,
    }).eq("id", h.id);
    if (error && !warnedNoEngagementCols) {
      warnedNoEngagementCols = true;
      await log("error", "Chưa lưu được lượt like/reply — hãy chạy supabase/migrations/0002_viral_engagement.sql", { error: error.message });
    }
  }
  return isNew;
}

/** Quét bài viral theo nguồn trong Cài đặt, ghi nhận thứ hạng, rồi cho AI phân loại bài mới. */
export async function scanViral(s?: Settings): Promise<ScanResult> {
  s ??= await getSettings();
  const base: ScanResult = {
    source: s.viralSource, keywords: s.viralKeywords.length, total: 0, own: 0, scanned: 0, newPosts: 0,
    classified: 0, errors: 0, limited: false, at: new Date().toISOString(),
  };
  const finish = async (r: ScanResult) => {
    await kvSet("viral_last_scan", r);
    return r;
  };
  if (s.viralSource === "scraper") {
    // Bài do scraper trên máy bạn ghi thẳng vào DB — ở đây chỉ cho AI phân loại + chấm điểm lại
    const classified = await classifyPending();
    must(await db().rpc("rescore_viral_posts"));
    const run = await lastScraperRun();
    return finish({ ...base, keywords: s.viralSourceAccounts.length, classified, scanned: run?.kept ?? 0, newPosts: run?.newPosts ?? 0, total: run?.found ?? 0 });
  }
  if (s.viralSource === "manual") return finish({ ...base, keywords: 0, skipped: "Đang ở chế độ thủ công — đổi nguồn quét trong Cài đặt → Săn viral" });
  if (!s.viralKeywords.length) return finish({ ...base, skipped: "Chưa có từ khoá nào" });

  const token = await tokenStore.get();
  const me = token?.username;
  const hits: Hit[] = [];
  let total = 0, own = 0, errors = 0;
  let usage: ApifyUsage | undefined;

  if (s.viralSource === "apify") {
    usage = await apifyUsage(s);
    if (!config.apifyToken) return finish({ ...base, usage, skipped: "Chưa có APIFY_TOKEN trong .env.local" });
    if (s.apifyMonthlyBudget > 0 && usage.estUsd + estimateRunUsd(s) > s.apifyMonthlyBudget) {
      const msg = `Dừng quét: chi phí Apify tháng này ≈ $${usage.estUsd} sắp vượt ngân sách $${s.apifyMonthlyBudget}`;
      if ((await lastScan())?.skipped !== msg) await log("error", msg, { usage });
      return finish({ ...base, usage, skipped: msg });
    }
    try {
      const out = await apifySearch(s);
      usage = out.usage;
      total = out.items;
      for (const p of out.posts) {
        if (me && p.username === me) { own++; continue; }
        hits.push({
          id: p.id, keyword: p.keyword, rank: p.rank, text: p.text, username: p.username, permalink: p.permalink,
          mediaType: p.mediaType, hasReplies: p.replies > 0, postedAt: p.postedAt,
          engagement: { likes: p.likes, replies: p.replies, reposts: p.reposts },
        });
      }
    } catch (e) {
      errors = s.viralKeywords.length;
      await log("error", "Quét viral qua Apify thất bại", { error: String(e) });
    }
  } else {
    if (!token) return finish({ ...base, skipped: "Chưa kết nối tài khoản Threads" });
    const since = Math.floor(Date.now() / 1000) - s.viralMaxAgeHours * 3600;
    for (const kw of s.viralKeywords) {
      try {
        const { data } = await keywordSearch(kw, { searchType: "TOP", since, limit: s.viralSearchLimit });
        total += data.length;
        for (const [rank, p] of data.entries()) {
          if (p.username === me) { own++; continue; } // bỏ bài của chính mình
          if (!p.text || p.is_reply) continue;        // bỏ reply và bài không có chữ
          hits.push({
            id: p.id, keyword: kw, rank, text: p.text, username: p.username ?? null, permalink: p.permalink ?? null,
            mediaType: p.media_type ?? null, hasReplies: p.has_replies ?? false, postedAt: p.timestamp ?? null,
          });
        }
      } catch (e) {
        errors++;
        await log("error", `Quét viral "${kw}" thất bại`, { error: String(e) });
      }
    }
  }

  let scanned = 0, newPosts = 0, foreign = 0, weak = 0;
  for (const h of hits) {
    if (s.viralVietnameseOnly && !isVietnamese(h.text)) { foreign++; continue; }
    if (h.engagement && !isViralEnough(h.engagement, s)) { weak++; continue; }
    try {
      if (await recordHit(h)) newPosts++;
      scanned++;
    } catch (e) {
      errors++;
      await log("error", "Lưu bài viral thất bại", { id: h.id, error: String(e) });
    }
  }

  const classified = await classifyPending();
  must(await db().rpc("rescore_viral_posts"));
  // Chưa có quyền tìm kiếm công khai: Threads chỉ trả bài của chính tài khoản (hoặc không trả gì)
  const limited = s.viralSource === "meta" && errors < s.viralKeywords.length && scanned === 0 && (total === 0 || own === total);
  const result: ScanResult = { ...base, total, own, scanned, foreign, weak, newPosts, classified, errors, limited, usage, at: new Date().toISOString() };
  await finish(result);
  const src = s.viralSource === "apify" ? "Apify" : "Threads";
  await log(
    limited ? "error" : "watch",
    limited
      ? `Quét viral: ${total} kết quả, ${own} là bài của bạn, 0 bài công khai — có thể app chưa được duyệt quyền threads_keyword_search`
      : `Quét viral (${src}): ${scanned} bài${foreign || weak ? ` (bỏ ${[foreign && `${foreign} bài không phải tiếng Việt`, weak && `${weak} bài ít tương tác`].filter(Boolean).join(", ")})` : ""}, ${newPosts} bài mới, AI phân loại ${classified}${usage ? ` · tháng này ≈ $${usage.estUsd}` : ""}`,
    result,
  );
  return result;
}

/** Kết quả lượt quét gần nhất của scraper (scraper/index.mjs ghi vào kv). */
export interface ScraperRun {
  at: string; accounts: number; ok: number; failed: number; found: number; kept: number;
  newPosts: number; blocked: boolean; ms: number; errors: string[];
}
export const lastScraperRun = () => kvGet<ScraperRun | null>("scraper_last_run", null);

/** Còn bài chưa được AI phân loại không (tick dùng để xử lý bài scraper vừa ghi vào). */
export async function hasPendingClassify(): Promise<boolean> {
  const { count, error } = await db().from("viral_posts").select("id", { count: "exact", head: true }).eq("ai_checked", false);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function lastScan() {
  return kvGet<ScanResult | null>("viral_last_scan", null);
}

// ---------- Thêm bài thủ công ----------
/** Lấy username + id từ link dạng https://www.threads.com/@user/post/ABC123 */
function parseThreadsUrl(url: string): { username?: string; shortcode?: string } {
  try {
    const u = new URL(url);
    if (!/(^|\.)threads\.(com|net)$/.test(u.hostname)) return {};
    const m = u.pathname.match(/^\/@([^/]+)\/post\/([^/?#]+)/);
    return m ? { username: decodeURIComponent(m[1]), shortcode: m[2] } : {};
  } catch {
    return {};
  }
}

/** Thử lấy nội dung bài qua oEmbed công khai của Threads (không cần token). Trả về null nếu không lấy được. */
async function fetchOembedText(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/v1.0/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const { html } = (await res.json()) as { html?: string };
    if (!html) return null;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
    // Bỏ các dòng chỉ là "View on Threads", "Post by …"
    const cleaned = text.replace(/\s*(Post by|Bài viết của)\s+@[\w.]+\s*(View on Threads|Xem trên Threads)?\s*$/i, "").split("\n").filter((l) => !/^(view on threads|post by|xem trên threads)/i.test(l.trim())).join("\n").trim();
    return cleaned.length >= 15 ? cleaned : null;
  } catch {
    return null;
  }
}

/** Thêm một bài viral do người dùng tự tìm (dán link và/hoặc nội dung) → AI phân loại + chấm điểm ngay. */
export async function addManualViral(input: { url?: string; text?: string; username?: string }): Promise<ViralPost> {
  const url = input.url?.trim() || null;
  const parsed = url ? parseThreadsUrl(url) : {};
  if (url && !parsed.shortcode) throw new Error("Link không đúng dạng bài Threads (https://www.threads.com/@ten/post/…)");
  let text = input.text?.trim() || "";
  if (!text && url) text = (await fetchOembedText(url)) ?? "";
  if (!text) throw new Error("Không tự lấy được nội dung từ link — hãy dán nội dung bài vào ô bên dưới");
  if (text.length < 15) throw new Error("Nội dung quá ngắn");

  const id = "manual-" + (parsed.shortcode ?? crypto.createHash("sha1").update(text).digest("hex").slice(0, 16));
  must(
    await db().rpc("upsert_viral_hit", {
      p_id: id, p_keyword: "Thủ công", p_text: text.slice(0, 3000),
      p_username: input.username?.trim().replace(/^@/, "") || parsed.username || null,
      p_permalink: url, p_media_type: null, p_has_replies: true, p_posted_at: new Date().toISOString(), p_rank: 0,
    }),
  );
  // Người dùng tự chọn bài → coi như đã nổi: nâng số lần xuất hiện để điểm không bị thấp
  must(await db().from("viral_posts").update({ seen_count: 5, status: "new", ai_checked: false }).eq("id", id));
  await classifyPending(15);
  must(await db().rpc("rescore_viral_posts"));
  const post = await getViral(id);
  if (!post) throw new Error("Không lưu được bài");
  await log("watch", `Thêm bài viral thủ công${post.username ? ` của @${post.username}` : ""}`, { viralId: id });
  return post;
}

/** Cho AI phân loại các bài chưa kiểm tra (theo lô 15 bài). */
export async function classifyPending(max = 60): Promise<number> {
  let pending = must(
    await db().from("viral_posts").select("id,text,keyword").eq("ai_checked", false).order("found_at", { ascending: false }).limit(max),
  ) as Array<{ id: string; text: string | null; keyword: string }>;
  // Bài không phải tiếng Việt (scraper ghi vào, hoặc quét trước khi bật bộ lọc) → bỏ qua luôn, khỏi tốn AI
  const st = await getSettings();
  // Bài Apify/scraper cũ chưa đạt ngưỡng like/bình luận/chia sẻ → bỏ qua
  if (st.viralMinLikes > 0 || st.viralMinReplies > 0 || st.viralMinReposts > 0) {
    const { data: rows, error } = await db().from("viral_posts").select("id,like_count,reply_count,repost_count")
      .eq("status", "new").or("id.like.ap-%,id.like.sc-%").limit(500);
    const weak = error ? [] : ((rows ?? []) as Array<{ id: string; like_count: number; reply_count: number; repost_count: number }>)
      .filter((r) => !isViralEnough({ likes: r.like_count, replies: r.reply_count, reposts: r.repost_count }, st)).map((r) => r.id);
    if (weak.length) {
      must(await db().from("viral_posts").update({
        status: "dismissed", ai_reason: `Chưa đủ viral (cần ≥${st.viralMinLikes} like, ≥${st.viralMinReplies} bình luận, ≥${st.viralMinReposts} chia sẻ)`,
      }).in("id", weak));
      pending = pending.filter((p) => !weak.includes(p.id));
    }
  }
  if (st.viralVietnameseOnly) {
    const fresh = must(
      await db().from("viral_posts").select("id,text,keyword").eq("status", "new").neq("keyword", "Thủ công").limit(500),
    ) as Array<{ id: string; text: string | null }>;
    const foreign = fresh.filter((p) => !isVietnamese(p.text)).map((p) => p.id);
    if (foreign.length) {
      must(await db().from("viral_posts").update({
        ai_checked: true, is_tip: false, ai_quality: 1, ai_reason: "Không phải bài tiếng Việt", status: "dismissed",
      }).in("id", foreign));
      pending = pending.filter((p) => !foreign.includes(p.id));
    }
  }
  let done = 0;
  for (let i = 0; i < pending.length; i += 15) {
    const batch = pending.slice(i, i + 15).filter((p) => p.text);
    try {
      const verdicts = await classifyTips(batch.map((p) => ({ id: p.id, text: p.text! })));
      const byId = new Map(verdicts.map((v) => [v.id, v]));
      for (const p of batch) {
        const v = byId.get(p.id);
        must(
          await db().from("viral_posts").update({
            ai_checked: true,
            is_tip: v ? Boolean(v.is_tip) : false,
            ai_quality: v ? Math.max(1, Math.min(10, Math.round(Number(v.quality) || 1))) : null,
            ai_reason: v?.reason?.slice(0, 200) ?? "AI không đánh giá",
            ai_product_keywords: v?.product_keywords?.slice(0, 4) ?? [],
          }).eq("id", p.id),
        );
        done++;
      }
    } catch (e) {
      await log("error", "AI phân loại bài viral thất bại", { error: String(e) });
      break; // thử lại ở lần quét sau
    }
  }
  return done;
}

// ---------- Đọc / cập nhật ----------
export async function listViral(opts: { status?: string; onlyTips?: boolean; limit?: number } = {}): Promise<ViralPost[]> {
  let q = db().from("viral_posts").select("*").order("score", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.onlyTips) q = q.eq("is_tip", true);
  return must(await q) as ViralPost[];
}

export async function getViral(id: string): Promise<ViralPost | null> {
  return must(await db().from("viral_posts").select("*").eq("id", id).maybeSingle()) as ViralPost | null;
}

export async function setViralStatus(id: string, status: ViralPost["status"]) {
  must(await db().from("viral_posts").update({ status }).eq("id", id));
}

// ---------- Viết bài tương tự ----------
/** AI viết bài mới từ bài viral + chọn sản phẩm → tạo nháp trong hàng đợi. */
export async function draftFromViral(
  viralId: string,
  opts: { extra?: string; productId?: string | null; noProduct?: boolean; auto?: boolean } = {},
): Promise<QueueItem> {
  const [post, s] = await Promise.all([getViral(viralId), getSettings()]);
  if (!post?.text) throw new Error("Không tìm thấy bài viral");
  // Không gắn sản phẩm khi: tính năng đang tắt, hoặc người dùng chọn "Không gắn sản phẩm"
  const useProducts = s.affiliateEnabled && !opts.noProduct;
  const all = useProducts ? await products.list(true) : [];
  const candidates = !useProducts ? [] : opts.productId
    ? all.filter((p) => p.id === opts.productId)
    : shortlist(all, [...(post.ai_product_keywords ?? []), post.text.slice(0, 300)]);

  const r = await rewriteViral({ text: post.text, username: post.username }, candidates, { extra: opts.extra, forceProductId: opts.productId ?? null });
  const item = await queue.add({
    text: r.text,
    topic: post.keyword,
    source: "viral",
    status: "draft",
    inspiredBy: post.id,
    productId: r.productId,
    productLine: r.productLine,
    linkMode: r.productId ? s.linkMode : "none",
  });
  await setViralStatus(post.id, "used");
  await log("info", `${opts.auto ? "Tự động" : "AI"} viết nháp từ bài viral của @${post.username ?? "?"}${r.productId ? " (có gắn sản phẩm)" : ""}`, {
    queueId: item.id, viralId: post.id, productId: r.productId, reason: r.reason,
  });
  return item;
}

/** Tự tạo nháp từ các bài viral tốt nhất, tối đa `viralDailyDrafts` bài/ngày. */
export async function autoDraftViral(s?: Settings): Promise<number> {
  s ??= await getSettings();
  if (!s.autoViralDrafts || s.viralDailyDrafts <= 0) return 0;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: s.timezone });
  const counter = await kvGet<{ day: string; n: number }>("viral_drafts_today", { day: today, n: 0 });
  let n = counter.day === today ? counter.n : 0;
  if (n >= s.viralDailyDrafts) return 0;

  const best = (await listViral({ status: "new", onlyTips: true, limit: 20 }))
    .filter((p) => Number(p.score) >= s!.minViralScore)
    .slice(0, s.viralDailyDrafts - n);
  let made = 0;
  for (const p of best) {
    try {
      await draftFromViral(p.id, { auto: true });
      made++; n++;
    } catch (e) {
      await log("error", "Tự viết nháp từ bài viral thất bại", { viralId: p.id, error: String(e) });
    }
  }
  await kvSet("viral_drafts_today", { day: today, n });
  return made;
}
