// Endpoint cho cron bên ngoài: Supabase pg_cron (supabase/cron.sql), Vercel Cron, cron-job.org...
// Gọi: POST /api/cron/<job>  với header  Authorization: Bearer <CRON_SECRET>
import { config } from "@/lib/config";
import { safeEqual, json } from "@/lib/http";
import { JOBS, type JobName } from "@/lib/jobs";

export const maxDuration = 300; // quét Apify có thể mất vài phút

async function handle(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const secret = config.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return json({ error: "Unauthorized" }, 401);
  if (!(job in JOBS)) return json({ error: `Không có job "${job}"`, jobs: Object.keys(JOBS) }, 404);
  try {
    const started = Date.now();
    const result = await JOBS[job as JobName]();
    return json({ ok: true, job, ms: Date.now() - started, result: result ?? null });
  } catch (e) {
    return json({ ok: false, job, error: String(e) }, 500);
  }
}

// Vercel Cron gọi bằng GET, pg_net gọi bằng POST
export { handle as GET, handle as POST };
