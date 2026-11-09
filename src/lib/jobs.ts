// Các job nền. Được gọi từ:
//  - /api/cron/[job]  (Supabase pg_cron, Vercel Cron, hoặc cron bên ngoài)
//  - instrumentation.ts (khi self-host bằng `next start`, IN_PROCESS_JOBS=true)
import { getSettings, type Settings } from "./settings";
import { tokenStore, seenStore } from "./store";
import { db, must, kvGet, kvSet } from "./db";
import { generatePost } from "./ai";
import { queue, processDue } from "./queue";
import { refreshTokenIfNeeded } from "./auth";
import { cronMatches } from "./cronMatch";
import {
  getMyPosts, getPostInsights, getUserInsights, metricValue, getMentions, type ThreadsPost,
} from "./threadsClient";
import { handleIncoming } from "./replyHandler";
import { scanViral, autoDraftViral, classifyPending, hasPendingClassify } from "./viral";
import { config } from "./config";
import { log } from "./activity";
import { after } from "next/server";

const connected = async () => Boolean(await tokenStore.get());

// ---------- AI tự tạo bài ----------
export async function autoGeneratePost(s?: Settings) {
  s ??= await getSettings();
  if (!s.postTopics.length) {
    await log("skip", "Không có chủ đề nào để AI tạo bài (thêm trong Cài đặt)");
    return null;
  }
  const idx = await kvGet<number>("topic_index", 0);
  const topic = s.postTopics[idx % s.postTopics.length];
  await kvSet("topic_index", idx + 1);
  try {
    const text = await generatePost(topic);
    const item = await queue.add({ text, topic, source: "ai", status: s.requireApproval ? "draft" : "scheduled" });
    await log("info", s.requireApproval ? `AI tạo nháp chờ duyệt (${topic})` : `AI tạo bài, sẽ đăng ngay (${topic})`, {
      queueId: item.id,
    });
    if (!s.requireApproval) await processDue();
    return item;
  } catch (e) {
    await log("error", "AI tạo bài thất bại", { error: String(e) });
    throw e;
  }
}

// ---------- Insights ----------
export interface InsightsSnapshot {
  at: string;
  account: Record<string, number>;
  posts: Array<ThreadsPost & { metrics: Record<string, number> }>;
}

export async function latestInsights(): Promise<InsightsSnapshot | null> {
  const r = must(
    await db().from("insights_snapshots").select("*").order("at", { ascending: false }).limit(1).maybeSingle(),
  );
  return (r as InsightsSnapshot | null) ?? null;
}

/** Mỗi ngày lấy snapshot cuối cùng (snapshot chạy mỗi giờ) → chuỗi điểm theo ngày. */
export async function insightsHistory(days = 30): Promise<Array<{ day: string; account: Record<string, number> }>> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = must(
    await db().from("insights_snapshots").select("at,account").gte("at", since).order("at", { ascending: true }).limit(5000),
  ) as Array<{ at: string; account: Record<string, number> }>;
  const { timezone } = await getSettings();
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const day = new Date(r.at).toLocaleDateString("sv-SE", { timeZone: timezone }); // YYYY-MM-DD theo múi giờ trong Cài đặt
    byDay.set(day, r.account);
  }
  return [...byDay].map(([day, account]) => ({ day, account }));
}

export async function collectInsights(): Promise<InsightsSnapshot | null> {
  if (!(await connected())) return null;
  const now = Math.floor(Date.now() / 1000);
  const account: Record<string, number> = {};
  try {
    for (const m of (await getUserInsights(now - 7 * 86400, now)).data) account[m.name] = metricValue(m);
  } catch (e) {
    await log("error", "Lấy insights tài khoản thất bại", { error: String(e) });
  }
  const list = await getMyPosts(15).then((r) => r.data).catch(async (e) => {
    await log("error", "Lấy danh sách bài thất bại", { error: String(e) });
    return [] as ThreadsPost[];
  });
  const posts = await Promise.all(
    list.map(async (p) => {
      const metrics: Record<string, number> = {};
      try {
        for (const m of (await getPostInsights(p.id)).data) metrics[m.name] = metricValue(m);
      } catch { /* bài repost không có insights */ }
      return { ...p, metrics };
    }),
  );
  const row = must(await db().from("insights_snapshots").insert({ account, posts }).select().single());
  return row as InsightsSnapshot;
}

// ---------- Quét mention (dự phòng khi webhook chưa bật) ----------
export async function pollMentions(): Promise<void> {
  if (!(await connected())) return;
  try {
    for (const m of (await getMentions(10)).data) {
      if (!(await seenStore.has(m.id))) {
        await handleIncoming({ id: m.id, text: m.text, username: m.username, kind: "mention" });
      }
    }
  } catch { /* chưa có quyền threads_manage_mentions */ }
}

// ---------- Tick mỗi phút ----------
/** Đăng bài đến giờ, và chạy auto-post / quét từ khóa nếu cron trong Cài đặt khớp phút này. */
export async function tick(now = new Date()) {
  if (!(await connected())) return { skipped: "chưa kết nối tài khoản" };
  const s = await getSettings();
  const minuteKey = now.toISOString().slice(0, 16); // chống chạy 2 lần trong cùng 1 phút
  const result: Record<string, unknown> = {};

  if (s.autoPostEnabled && cronMatches(s.postCron, now, s.timezone)) {
    if ((await kvGet<string>("last_auto_post_minute", "")) !== minuteKey) {
      await kvSet("last_auto_post_minute", minuteKey);
      result.autoPost = await autoGeneratePost(s).then((x) => x?.id ?? null).catch((e) => String(e));
    }
  }
  if (cronMatches(s.viralCron, now, s.timezone)) {
    if ((await kvGet<string>("last_viral_minute", "")) !== minuteKey) {
      await kvSet("last_viral_minute", minuteKey);
      const viralJob = async () => ({ scan: await scanViral(s), drafts: await autoDraftViral(s) });
      if (s.viralSource === "apify") {
        // Apify chạy 1–3 phút > timeout 55s của pg_net → chạy nền sau khi trả response
        const bg = () => viralJob().then(() => undefined).catch((e) => log("error", "Quét viral nền lỗi", { error: String(e) }));
        try { after(bg); } catch { void bg(); } // ngoài request (node-cron) thì chạy luôn
        result.viral = "đang quét nền qua Apify";
      } else {
        const r = await viralJob();
        result.viral = r.scan;
        result.viralDrafts = r.drafts;
      }
    }
  }
  // Scraper chạy ngoài app ghi bài vào DB → mỗi 5 phút cho AI phân loại + chấm điểm (chỉ khi có bài chờ)
  if (s.viralSource === "scraper" && now.getUTCMinutes() % 5 === 0 && config.anthropicKey) {
    if ((await kvGet<string>("last_classify_minute", "")) !== minuteKey && (await hasPendingClassify())) {
      await kvSet("last_classify_minute", minuteKey);
      result.classified = await classifyPending(30);
      must(await db().rpc("rescore_viral_posts"));
    }
  }
  result.published = await processDue();
  return result;
}

export const JOBS = {
  tick: () => tick(),
  "process-queue": () => processDue(),
  "refresh-token": () => refreshTokenIfNeeded(),
  insights: () => collectInsights().then((s) => ({ posts: s?.posts.length ?? 0 })),
  mentions: () => pollMentions(),
  "auto-post": () => autoGeneratePost().then((x) => x?.id ?? null),
  viral: async () => ({ ...(await scanViral()), drafts: await autoDraftViral() }),
  cleanup: async () => must(await db().rpc("cleanup_old_rows")),
} as const;
export type JobName = keyof typeof JOBS;
