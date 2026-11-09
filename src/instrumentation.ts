// Chạy 1 lần khi server Next.js khởi động.
// Self-host (`next start` trên VPS/Railway/Render): đặt IN_PROCESS_JOBS=true để chạy job ngay trong tiến trình.
// Deploy Vercel/serverless: để IN_PROCESS_JOBS=false và dùng supabase/cron.sql gọi /api/cron/*.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.IN_PROCESS_JOBS ?? "false") !== "true") return;

  const g = globalThis as unknown as { __threadsJobsStarted?: boolean };
  if (g.__threadsJobsStarted) return;
  g.__threadsJobsStarted = true;

  const cron = (await import("node-cron")).default;
  const { JOBS } = await import("./lib/jobs");
  const tz = { timezone: process.env.TZ ?? "Asia/Ho_Chi_Minh" };
  const run = (name: keyof typeof JOBS) => () => {
    JOBS[name]().catch((e: unknown) => console.error(`[job ${name}]`, e));
  };

  cron.schedule("* * * * *", run("tick"), tz);
  cron.schedule("5 * * * *", run("insights"), tz);
  cron.schedule("*/10 * * * *", run("mentions"), tz);
  cron.schedule("17 3 * * *", run("refresh-token"), tz);
  cron.schedule("30 2 * * *", run("cleanup"), tz);
  console.log("[threads-bot] Đã khởi động job nền trong tiến trình");
}
