#!/usr/bin/env node
// Threads scraper — lấy bài công khai từ danh sách tài khoản nguồn, KHÔNG cần đăng nhập, KHÔNG cần quyền Meta.
// Ghi thẳng vào Supabase (bảng viral_posts) → app tự cho AI phân loại, chấm điểm, viết nháp như bình thường.
// Bật bằng: Cài đặt → Săn viral → Lấy bài viral từ = "Scraper trên máy bạn".
//
// Chạy:  npm run scraper          (chạy liên tục, tự quét theo "Chu kỳ quét" trong Cài đặt)
//        npm run scraper:once     (quét 1 lần rồi thoát — dùng với Task Scheduler / cron)
//        npm run scraper:test -- zuck              (thử 1 tài khoản, in kết quả, không ghi DB)
//        npm run scraper:test -- "mẹo vặt" --search (thử tìm theo từ khoá)
//        npm run scraper:login                     (đăng nhập 1 lần bằng acc PHỤ để tìm theo từ khoá)
//        thêm --debug vào lệnh test để lưu HTML/ảnh/log mạng vào scraper/debug/
//
// Nên chạy trên máy nhà (IP dân cư). Chạy trên VPS/Vercel dễ bị Threads chặn IP.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { collectPosts, safeParse } from "./extract.mjs";
import { isVietnamese } from "./lang.mjs";

// ---------- Env ----------
for (const f of [".env.local", ".env"]) {
  try { process.loadEnvFile(f); } catch { /* không có file thì bỏ qua */ }
}
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const HEADLESS = (process.env.SCRAPER_HEADLESS ?? "true") !== "false";
const PROXY = process.env.SCRAPER_PROXY?.trim() || ""; // VD: http://user:pass@host:port
const BASE_URL = (process.env.SCRAPER_BASE_URL || "https://www.threads.com").replace(/\/$/, ""); // chỉ đổi khi test

// Cookie đăng nhập của acc PHỤ, chỉ dùng cho trang tìm kiếm (tạo bằng `npm run scraper:login`)
const AUTH_FILE = path.resolve(process.env.SCRAPER_AUTH_FILE || "scraper/.auth.json");
const hasAuth = () => fs.existsSync(AUTH_FILE);

const args = process.argv.slice(2);
const LOGIN = args.includes("--login");
const DEBUG = args.includes("--debug") || process.env.SCRAPER_DEBUG === "true";
const ONCE = args.includes("--once");
const TEST = args.includes("--test") ? args[args.indexOf("--test") + 1] : null;

// ---------- Tiện ích ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => min + Math.random() * (max - min);
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const ts = () => new Date().toLocaleTimeString("vi-VN", { hour12: false });
const say = (...m) => console.log(`[${ts()}]`, ...m);

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(1);
  stopping = true;
  say("Đang dừng sau khi xong tài khoản hiện tại… (Ctrl+C lần nữa để thoát ngay)");
});

// ---------- Supabase ----------
let sb = null;
function db() {
  if (sb) return sb;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env.local");
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return sb;
}
const must = ({ data, error }) => {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
};

const DEFAULTS = {
  viralSource: "manual",
  viralSourceAccounts: [],
  viralKeywords: [],
  scraperSearchKeywords: true,
  scraperIntervalMinutes: 120,
  viralVietnameseOnly: true,
  scraperScrolls: 2,
  viralMaxAgeHours: 72,
  viralDateMode: "recent",
  viralDateFrom: "",
  viralDateTo: "",
  timezone: "Asia/Ho_Chi_Minh",
};

// ---------- Khoảng thời gian (giống src/lib/viralWindow.ts — sửa thì sửa cả hai) ----------
function startOfDayInTz(date, tz) {
  const utc = Date.parse(`${date}T00:00:00Z`);
  const asTz = Date.parse(new Date(utc).toLocaleString("en-US", { timeZone: tz }));
  const asUtc = Date.parse(new Date(utc).toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.floor((utc - (asTz - asUtc)) / 1000);
}
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const viDate = (d) => d.split("-").reverse().join("/");
function viralWindow(s) {
  if (s.viralDateMode === "range" && s.viralDateFrom) {
    const to = s.viralDateTo || null;
    const beforeDate = to ? addDays(to, 1) : null;
    return {
      since: startOfDayInTz(s.viralDateFrom, s.timezone),
      until: beforeDate ? startOfDayInTz(beforeDate, s.timezone) - 1 : null,
      fromDate: s.viralDateFrom, beforeDate,
      label: to ? `${viDate(s.viralDateFrom)} – ${viDate(to)}` : `từ ${viDate(s.viralDateFrom)}`,
    };
  }
  return { since: Math.floor(Date.now() / 1000) - s.viralMaxAgeHours * 3600, until: null, fromDate: null, beforeDate: null, label: `${s.viralMaxAgeHours} giờ gần đây` };
}
/** Từ khoá kèm bộ lọc ngày của Threads (after:/before:) khi đang ở chế độ khoảng ngày. */
const rangedQuery = (kw, win) => [kw, win.fromDate && `after:${win.fromDate}`, win.beforeDate && `before:${win.beforeDate}`].filter(Boolean).join(" ");
async function getSettings() {
  const row = must(await db().from("kv").select("value").eq("key", "settings").maybeSingle());
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}
const kvSet = async (key, value) => must(await db().from("kv").upsert({ key, value, updated_at: new Date().toISOString() }));
async function activity(type, message, data) {
  const { error } = await db().from("activity").insert({ type, message, data: data ?? null });
  if (error) console.error("Không ghi được activity:", error.message);
}

/** Ghi 1 bài (giống recordHit() trong src/lib/viral.ts). Trùng id / mã bài / nội dung với bài đã có → chỉ cập nhật bài cũ.
    Cần supabase/migrations/0003_viral_dedupe.sql. Trả về true nếu là bài mới. */
async function recordHit(p, keyword, rank) {
  const r = must(await db().rpc("upsert_viral_post", {
    p_id: `sc-${p.code}`, p_keyword: keyword, p_text: p.text.slice(0, 3000), p_username: p.username,
    p_permalink: p.permalink, p_media_type: p.mediaType, p_has_replies: p.replies > 0,
    p_posted_at: new Date(p.takenAt * 1000).toISOString(), p_rank: rank,
    p_likes: p.likes, p_replies: p.replies, p_reposts: p.reposts + (p.quotes ?? 0),
  }));
  return r.is_new;
}

// ---------- Trình duyệt ----------
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function proxyOption() {
  if (!PROXY) return undefined;
  const u = new URL(PROXY);
  return {
    server: `${u.protocol}//${u.host}`,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

async function openBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Chưa cài Playwright. Chạy:  npm i -D playwright  &&  npx playwright install chromium");
  }
  const browser = await chromium.launch({ headless: HEADLESS, proxy: proxyOption() });
  const context = await newContext(browser);
  return { browser, context };
}

/** Context ẩn danh, hoặc mang cookie acc phụ nếu truyền storageState. */
async function newContext(browser, storageState) {
  const context = await browser.newContext({ userAgent: UA, locale: "vi-VN", viewport: { width: 1280, height: 900 }, storageState });
  // Không tải ảnh/video/font: nhanh hơn và tiết kiệm băng thông (quan trọng nếu dùng proxy tính tiền theo GB)
  await context.route("**/*", (route) => {
    const t = route.request().resourceType();
    return ["image", "media", "font"].includes(t) ? route.abort() : route.continue();
  });
  return context;
}

// ---------- Đăng nhập acc phụ (1 lần) ----------
async function runLogin() {
  const { chromium } = await import("playwright").catch(() => {
    throw new Error("Chưa cài Playwright. Chạy:  npm i -D playwright  &&  npx playwright install chromium");
  });
  console.log(`
  ⚠ Chỉ dùng tài khoản Threads/Instagram PHỤ. Acc này có thể bị Threads khoá vì tự động hoá.
    KHÔNG đăng nhập tài khoản bot dùng để đăng bài.
  `);
  const browser = await chromium.launch({ headless: false, proxy: proxyOption() });
  const context = await browser.newContext({ userAgent: UA, locale: "vi-VN", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Đăng nhập xong trong cửa sổ Chrome (thấy được bảng tin Threads) thì quay lại đây bấm Enter… ");
  rl.close();
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name === "sessionid" || c.name === "ds_user_id")) {
    say("Có vẻ chưa đăng nhập (không thấy cookie phiên). Vẫn lưu lại — chạy scraper:test với --search để kiểm tra.");
  }
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  await browser.close();
  say(`Đã lưu cookie vào ${AUTH_FILE}. Từ giờ scraper dùng acc này CHỈ cho trang tìm kiếm.`);
  say(`Thử: npm run scraper:test -- "mẹo vặt" --search`);
}

const accountUrl = (u) => `${BASE_URL}/@${encodeURIComponent(u)}`;
// serp_type=default = tab "Hàng đầu" (TOP) của trang tìm kiếm Threads
const searchUrl = (kw) => `${BASE_URL}/search?q=${encodeURIComponent(kw)}&serp_type=default`;

/** Mở 1 trang (profile hoặc tìm kiếm), gom bài từ JSON nhúng trong HTML + các response API khi cuộn. */
async function scrapePage(context, url, scrolls) {
  const page = await context.newPage();
  const found = new Map();
  const net = []; // log mạng cho --debug
  const pending = new Set();
  page.on("response", (res) => {
    const type = res.request().resourceType();
    if (!["xhr", "fetch", "document"].includes(type)) return;
    const job = (async () => {
      let text = "";
      try { text = await res.text(); } catch { /* body không đọc được (redirect…) */ }
      const hasPosts = text.includes("taken_at");
      net.push(`${res.status()} ${type.padEnd(8)} ${String(text.length).padStart(8)}B ${hasPosts ? "★taken_at" : "         "} ${res.url().slice(0, 160)}`);
      if (hasPosts) {
        const j = safeParse(text);
        if (j) collectPosts(j, found);
      }
    })();
    pending.add(job);
    job.finally(() => pending.delete(job));
  });
  const readEmbedded = async () => {
    // JSON nhúng trong mọi thẻ <script> có chứa dữ liệu bài (không chỉ type=application/json)
    const scripts = await page.$$eval("script", (els) => els.map((e) => e.textContent || "").filter((t) => t.includes("taken_at")));
    for (const s of scripts) {
      const j = safeParse(s);
      if (j) collectPosts(j, found);
    }
    return scripts.length;
  };
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const status = resp?.status() ?? 0;
    // Trang tìm kiếm tải kết quả bằng JS sau khi mở → đợi tới khi có bài (tối đa ~12 giây)
    const deadline = Date.now() + 12_000;
    await page.waitForTimeout(jitter(2000, 3000));
    const waitForPosts = async (ms) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        await readEmbedded();
        if (found.size) return;
        await page.waitForTimeout(1500);
      }
    };
    await waitForPosts(deadline - Date.now());
    // Tab "Liên quan nhất" báo "Không có kết quả" (hay gặp với từ khoá sức khoẻ/làm đẹp) → thử tab "Mới đây"
    const noResults = async () => /Không có kết quả|No results/i.test(await page.locator("body").innerText().catch(() => ""));
    let tab = "Liên quan nhất";
    if (!found.size && /\/search\?/.test(url) && (await noResults())) {
      const recent = page.getByText(/^(Mới đây|Recent)$/).first();
      if (await recent.isVisible().catch(() => false)) {
        await recent.click().catch(() => {});
        tab = "Mới đây";
        await page.waitForTimeout(jitter(1500, 2500));
        await waitForPosts(10_000);
      }
    }
    const emptyPage = !found.size && (await noResults());
    // Cuộn để tải thêm (infinite scroll). Đặt chuột giữa cột nội dung — nếu chuột nằm ở góc trái
    // (thanh menu) thì cột kết quả không cuộn. Cuộn thêm bằng JS cho chắc.
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    await page.mouse.move(vp.width / 2 - 100, vp.height / 2);
    for (let i = 0; i < scrolls; i++) {
      const before = found.size;
      await page.mouse.wheel(0, jitter(2500, 4000));
      await page.evaluate(() => {
        window.scrollBy(0, 3000);
        for (const el of document.querySelectorAll("div")) {
          if (el.scrollHeight > el.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop += 3000;
        }
      }).catch(() => {});
      // Đợi trang tải trang kế tiếp (tối đa ~6 giây), dừng sớm nếu đã có bài mới
      const until = Date.now() + 6000;
      await page.waitForTimeout(jitter(1200, 2000));
      while (Date.now() < until && found.size === before) await page.waitForTimeout(700);
      await Promise.allSettled([...pending]);
      if (found.size === before && i >= 1) break; // 2 lần cuộn không ra thêm bài → hết
    }
    const embedded = await readEmbedded();
    await Promise.allSettled([...pending]);
    const loginWall = /\/(accounts\/)?login/.test(page.url());
    // Trang không ra bài nào → tự lưu debug (kể cả khi chạy thật) để biết lý do
    if (DEBUG || found.size === 0) await dumpDebug(page, url, { status, loginWall, embedded, posts: found.size, net, tab, emptyPage });
    return { status, loginWall, emptyPage, tab, posts: [...found.values()] };
  } finally {
    await page.close().catch(() => {});
  }
}

/** --debug: lưu HTML, ảnh chụp và log mạng vào scraper/debug/ để xem vì sao không thấy bài. */
async function dumpDebug(page, url, info) {
  const dir = path.resolve("scraper/debug");
  fs.mkdirSync(dir, { recursive: true });
  // Chỉ giữ 30 file gần nhất (10 lần lưu)
  const old = fs.readdirSync(dir).sort().reverse().slice(30);
  for (const f of old) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* bỏ qua */ } }
  const slug = new Date().toISOString().replace(/[:.]/g, "-");
  const html = await page.content().catch(() => "");
  fs.writeFileSync(path.join(dir, `${slug}.html`), html);
  await page.screenshot({ path: path.join(dir, `${slug}.png`), fullPage: false }).catch(() => {});
  const cookies = (await page.context().cookies()).map((c) => c.name);
  const report = [
    `URL mở:        ${url}`,
    `URL cuối:      ${page.url()}`,
    `Tiêu đề:       ${await page.title().catch(() => "?")}`,
    `HTTP:          ${info.status} · loginWall=${info.loginWall}`,
    `Đã đăng nhập:  ${cookies.includes("sessionid") ? "có (cookie sessionid)" : "KHÔNG thấy cookie sessionid"}`,
    `HTML:          ${html.length} ký tự · "taken_at" xuất hiện ${(html.match(/taken_at/g) ?? []).length} lần · script có dữ liệu bài: ${info.embedded}`,
    `Bài tách được: ${info.posts}${info.tab ? ` · tab: ${info.tab}` : ""}${info.emptyPage ? " · Threads báo KHÔNG CÓ KẾT QUẢ" : ""}`,
    ``, `--- Response (xhr/fetch/document) ---`, ...info.net,
  ].join("\n");
  fs.writeFileSync(path.join(dir, `${slug}.txt`), report);
  console.log("\n" + report.split("\n--- Response")[0]);
  console.log(`Response có dữ liệu bài (★): ${info.net.filter((l) => l.includes("★")).length}/${info.net.length}`);
  say(`Đã lưu ${slug}.html / .png / .txt trong scraper/debug/`);
}

// ---------- Bộ lọc theo quy tắc (trước khi tới AI) ----------
/** Trả về lý do loại bài, hoặc null nếu giữ. */
function dropReason(p, s, win) {
  if (p.isReply) return "là reply";
  if (p.text.length < 20) return "quá ngắn";
  if (p.takenAt < win.since) return win.fromDate ? `trước ${viDate(win.fromDate)}` : `cũ hơn ${s.viralMaxAgeHours}h`;
  if (win.until != null && p.takenAt > win.until) return "sau ngày kết thúc";
  if (s.viralVietnameseOnly && !isVietnamese(p.text)) return "không phải tiếng Việt";
  return null;
}
const fmtDrops = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(", ");

// ---------- Một lượt quét ----------
// Mỗi lượt gồm 2 loại việc, trộn ngẫu nhiên: đọc profile tài khoản nguồn + tìm theo từ khoá (tab TOP).
async function runOnce(s) {
  const accounts = [...new Set(s.viralSourceAccounts.map((u) => String(u).trim().replace(/^@/, "")).filter(Boolean))];
  const keywords = s.scraperSearchKeywords ? [...new Set(s.viralKeywords.map((k) => String(k).trim()).filter(Boolean))] : [];
  const win = viralWindow(s);
  const tasks = shuffle([
    ...accounts.map((u) => ({ kind: "account", label: `@${u}`, url: accountUrl(u) })),
    // Khoảng ngày: tìm kèm bộ lọc after:/before: của Threads; nếu Threads không ra kết quả thì tìm lại không kèm bộ lọc
    ...keywords.map((k) => ({ kind: "search", label: k, url: searchUrl(rangedQuery(k, win)), plainUrl: win.fromDate ? searchUrl(k) : null })),
  ]);
  const started = Date.now();
  const result = {
    at: new Date().toISOString(), accounts: accounts.length, keywords: keywords.length, ok: 0, failed: 0,
    keywordsOk: 0, searchNeedsLogin: false, dropped: /** @type {Record<string, number>} */ ({}),
    found: 0, kept: 0, newPosts: 0, duplicates: 0, window: "", blocked: false, ms: 0, errors: /** @type {string[]} */ ([]),
  };
  if (!tasks.length) {
    say("Chưa có tài khoản nguồn hay từ khoá nào. Thêm trong Cài đặt → Săn viral.");
    return result;
  }
  result.window = win.label;
  say(`Khoảng thời gian: ${win.label}`);
  const engagement = (p) => p.likes + p.replies * 3 + p.reposts * 5 + (p.quotes ?? 0) * 4;
  const { browser, context } = await openBrowser();
  // Tìm kiếm dùng cookie acc phụ (nếu có); đọc profile luôn ẩn danh để acc phụ ít bị để ý
  const searchContext = keywords.length && hasAuth() ? await newContext(browser, AUTH_FILE) : context;
  result.searchAuth = searchContext !== context;
  let badStreak = 0;
  try {
    for (const [i, t] of tasks.entries()) {
      if (stopping) break;
      // Threads bắt đăng nhập mới cho tìm kiếm → bỏ các từ khoá còn lại, vẫn đọc profile bình thường
      if (t.kind === "search" && result.searchNeedsLogin) continue;
      try {
        const scrolls = t.kind === "search" ? Math.max(win.fromDate ? 6 : 4, s.scraperScrolls) : s.scraperScrolls;
        let r = await scrapePage(t.kind === "search" ? searchContext : context, t.url, scrolls);
        if (t.plainUrl && !r.loginWall && r.posts.length === 0) {
          say(`Tìm "${t.label}" kèm bộ lọc ngày không ra bài — thử lại không kèm bộ lọc (vẫn lọc ngày sau khi lấy)`);
          await sleep(jitter(4000, 8000));
          r = await scrapePage(searchContext, t.plainUrl, scrolls);
        }
        if (t.kind === "search" && r.loginWall) {
          result.searchNeedsLogin = true;
          const why = result.searchAuth ? "cookie acc phụ đã hết hạn/bị đăng xuất — chạy lại npm run scraper:login" : "Threads yêu cầu đăng nhập để tìm kiếm — chạy npm run scraper:login bằng acc phụ";
          result.errors.push(`Tìm "${t.label}": ${why}`);
          say(`Tìm "${t.label}": bị yêu cầu đăng nhập (${why}). Lượt này chỉ đọc tài khoản nguồn.`);
        } else if (t.kind === "search" && r.emptyPage) {
          result.errors.push(`Tìm "${t.label}": Threads trả "Không có kết quả" (cả tab Liên quan nhất và Mới đây)`);
        } else if (r.loginWall || r.status === 429 || r.status >= 500 || r.posts.length === 0) {
          badStreak++;
          result.failed++;
          result.errors.push(`${t.label}: ${r.loginWall ? "bị yêu cầu đăng nhập" : r.status === 429 ? "429 quá nhiều request" : r.posts.length === 0 ? `không thấy bài (HTTP ${r.status})` : `HTTP ${r.status}`}`);
        } else {
          badStreak = 0;
          if (t.kind === "search") result.keywordsOk++; else result.ok++;
        }
        result.found += r.posts.length;
        const drops = new Map();
        const keep = (r.loginWall ? [] : r.posts)
          .filter((p) => {
            const why = dropReason(p, s, win);
            if (why) {
              drops.set(why, (drops.get(why) ?? 0) + 1);
              result.dropped[why] = (result.dropped[why] ?? 0) + 1;
            }
            return !why;
          })
          .sort((a, b) => engagement(b) - engagement(a));
        for (const [rank, p] of keep.entries()) {
          if (await recordHit(p, t.label, rank)) result.newPosts++;
          else result.duplicates++;
        }
        result.kept += keep.length;
        say(`(${i + 1}/${tasks.length}) ${t.kind === "search" ? `Tìm "${t.label}"${r.tab === "Mới đây" ? " [tab Mới đây]" : ""}` : t.label}: ${r.emptyPage ? "Threads báo không có kết quả · " : ""}${r.posts.length} bài, giữ ${keep.length}${drops.size ? ` (loại: ${fmtDrops(drops)})` : ""}`);
      } catch (e) {
        badStreak++;
        result.failed++;
        result.errors.push(`${t.label}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
        say(`${t.label}: lỗi —`, e instanceof Error ? e.message.split("\n")[0] : e);
      }
      // 3 trang liên tiếp không lấy được → có thể IP đang bị chặn, dừng lượt này cho an toàn
      if (badStreak >= 3) {
        result.blocked = true;
        say("3 trang liên tiếp thất bại — có thể IP đang bị Threads giới hạn. Dừng lượt này.");
        break;
      }
      if (i < tasks.length - 1) await sleep(jitter(6000, 14000)); // giãn cách giữa các trang
    }
    // Lưu lại cookie mới nhất (Threads hay làm mới cookie) để phiên acc phụ sống lâu hơn
    if (result.searchAuth && !result.searchNeedsLogin) await searchContext.storageState({ path: AUTH_FILE }).catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
  must(await db().rpc("rescore_viral_posts"));
  result.ms = Date.now() - started;
  result.errors = result.errors.slice(0, 20);
  await kvSet("scraper_last_run", result);
  const kwPart = keywords.length ? `, ${result.keywordsOk}/${keywords.length} từ khoá${result.searchNeedsLogin ? " (tìm kiếm cần đăng nhập)" : ""}` : "";
  await activity(
    result.blocked ? "error" : "watch",
    result.blocked
      ? `Scraper: có thể bị Threads giới hạn IP (${result.ok}/${result.accounts} tài khoản OK${kwPart}) — lượt sau sẽ thử lại`
      : `Scraper (${win.label}): ${result.ok}/${result.accounts} tài khoản${kwPart}, ${result.newPosts} bài mới, ${result.duplicates} bài trùng đã có`,
    result,
  );
  say(`Xong: ${result.ok}/${result.accounts} tài khoản${kwPart}, giữ ${result.kept} bài (${result.newPosts} mới, ${result.duplicates} trùng đã có), ${Math.round(result.ms / 1000)}s`);
  if (Object.keys(result.dropped).length) say(`Bị loại theo quy tắc: ${fmtDrops(new Map(Object.entries(result.dropped)))}`);
  return result;
}

// ---------- Chế độ thử ----------
// npm run scraper:test -- ten_tai_khoan      → đọc 1 profile
// npm run scraper:test -- "mẹo vặt" --search → thử tìm theo từ khoá
async function runTest(target) {
  const { browser, context } = await openBrowser();
  try {
    const search = args.includes("--search");
    const ctx = search && hasAuth() ? await newContext(browser, AUTH_FILE) : context;
    if (search) say(hasAuth() ? "Tìm kiếm bằng cookie acc phụ" : "Tìm kiếm ẩn danh (chưa có cookie — chạy npm run scraper:login nếu bị yêu cầu đăng nhập)");
    let s = null;
    try { s = await getSettings(); } catch { /* không đọc được Supabase → bỏ qua phần lọc */ }
    const win = s ? viralWindow(s) : null;
    if (win) say(`Khoảng thời gian theo Cài đặt: ${win.label}`);
    const query = search && win?.fromDate ? rangedQuery(target, win) : target;
    let r = await scrapePage(ctx, search ? searchUrl(query) : accountUrl(target.replace(/^@/, "")), search ? 4 : 2);
    if (search && query !== target && !r.loginWall && r.posts.length === 0) {
      say(`"${query}" không ra bài — thử lại không kèm bộ lọc ngày`);
      r = await scrapePage(ctx, searchUrl(target), 4);
    }
    say(`${search ? `Tìm "${query}"${r.tab === "Mới đây" ? " [tab Mới đây]" : ""}` : `@${target}`} · HTTP ${r.status}${r.loginWall ? " · bị yêu cầu đăng nhập" : ""}${r.emptyPage ? " · Threads báo KHÔNG CÓ KẾT QUẢ" : ""} · tìm thấy ${r.posts.length} bài`);
    const ages = r.posts.map((p) => (Date.now() / 1000 - p.takenAt) / 86400);
    if (ages.length) say(`Độ mới: ${ages.filter((d) => d <= 3).length} bài ≤3 ngày · ${ages.filter((d) => d > 3 && d <= 30).length} bài 4–30 ngày · ${ages.filter((d) => d > 30).length} bài >30 ngày`);
    if (s) {
      const drops = new Map();
      let kept = 0;
      for (const p of r.posts) {
        const why = dropReason(p, s, win);
        if (why) drops.set(why, (drops.get(why) ?? 0) + 1); else kept++;
      }
      say(`Theo Cài đặt hiện tại: giữ ${kept}/${r.posts.length}${drops.size ? ` · loại: ${fmtDrops(drops)}` : ""}`);
    }
    for (const p of r.posts.slice(0, 10)) {
      console.log(`- @${p.username} ${new Date(p.takenAt * 1000).toLocaleString("vi-VN")} ♥${p.likes} 💬${p.replies} 🔁${p.reposts}${p.isReply ? " (reply)" : ""}${s ? ` → ${dropReason(p, s, win) ? "LOẠI: " + dropReason(p, s, win) : "GIỮ"}` : ""}`);
      console.log(`  ${p.text.slice(0, 120).replace(/\n/g, " ")}`);
    }
  } finally {
    await browser.close();
  }
}

// ---------- Main ----------
async function main() {
  if (LOGIN) return runLogin();
  if (TEST) return runTest(TEST);
  say(`Threads scraper khởi động (${ONCE ? "1 lần" : "chạy liên tục"}, headless=${HEADLESS}${PROXY ? ", có proxy" : ""})`);
  while (!stopping) {
    let s;
    try {
      s = await getSettings();
    } catch (e) {
      say("Không đọc được Cài đặt từ Supabase:", e instanceof Error ? e.message : e);
      if (ONCE) process.exit(1);
      await sleep(60_000);
      continue;
    }
    if (s.viralSource !== "scraper" && !ONCE) {
      say("Nguồn quét trong Cài đặt chưa phải “Scraper trên máy bạn” — kiểm tra lại sau 5 phút.");
      await sleep(5 * 60_000);
      continue;
    }
    let r = null;
    try {
      r = await runOnce(s);
    } catch (e) {
      say("Lượt quét lỗi:", e instanceof Error ? e.message : e);
      await activity("error", "Scraper lỗi", { error: String(e) }).catch(() => {});
      if (ONCE) process.exit(1);
    }
    if (ONCE) break;
    // Bị chặn → nghỉ gấp đôi chu kỳ
    const minutes = Math.max(30, Number(s.scraperIntervalMinutes) || 120) * (r?.blocked ? 2 : 1);
    const wait = minutes * 60_000 * jitter(0.9, 1.15);
    say(`Lượt sau sau ~${Math.round(wait / 60_000)} phút.`);
    const until = Date.now() + wait;
    while (!stopping && Date.now() < until) await sleep(5000);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
