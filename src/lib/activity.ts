// Nhật ký hoạt động (bảng activity) hiển thị trên dashboard.
import { db, must } from "./db";

export type ActivityType = "post" | "reply" | "mention" | "skip" | "error" | "auth" | "watch" | "info";

export interface Activity {
  id?: number;
  at: string;
  type: ActivityType;
  message: string;
  data?: Record<string, unknown> | null;
}

export async function log(type: ActivityType, message: string, data?: unknown): Promise<void> {
  (type === "error" ? console.error : console.log)(`[${type}] ${message}`);
  const payload = data === undefined ? null : typeof data === "object" ? data : { value: data };
  const { error } = await db().from("activity").insert({ type, message, data: payload });
  if (error) console.error("Không ghi được activity:", error.message);
}

export async function recentActivity(limit = 200, types?: string[]): Promise<Activity[]> {
  let q = db().from("activity").select("*").order("at", { ascending: false }).limit(Math.min(limit, 500));
  if (types?.length) q = q.in("type", types);
  return must(await q) as Activity[];
}

/** Số reply bot đã tự gửi trong 1 giờ qua (dùng cho giới hạn chống spam). */
export async function autoRepliesLastHour(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db()
    .from("activity")
    .select("id", { count: "exact", head: true })
    .eq("type", "reply")
    .eq("data->>auto", "true")
    .gte("at", since);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return count ?? 0;
}
