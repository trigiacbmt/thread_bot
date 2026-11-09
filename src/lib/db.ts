// Supabase client phía server (service_role). KHÔNG import file này vào client component.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Bot cần key BÍ MẬT (bỏ qua RLS): `sb_secret_…` (mới) hoặc `service_role` (JWT cũ).
 * Dán nhầm key công khai (`sb_publishable_…` / `anon`) sẽ gặp lỗi "violates row-level security policy".
 */
function assertSecretKey(key: string) {
  const hint = "Supabase → Project Settings → API Keys → mục Secret keys (sb_secret_…), hoặc tab Legacy → service_role.";
  if (key.startsWith("sb_publishable_")) {
    throw new Error(`SUPABASE_SECRET_KEY đang là key CÔNG KHAI (sb_publishable_…). Bot cần key bí mật: ${hint}`);
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1], "base64url").toString()).role;
      if (role && role !== "service_role") throw new Error(`SUPABASE_SECRET_KEY đang là key "${role}". Bot cần key bí mật: ${hint}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("SUPABASE_SECRET_KEY")) throw e;
    }
  }
}

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  // SUPABASE_SECRET_KEY (tên mới) — vẫn nhận SUPABASE_SERVICE_ROLE_KEY cho tương thích
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env.local");
  assertSecretKey(key);
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Ném lỗi nếu Supabase trả error, trả về data. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

// ---------- Key/value ----------
export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = must(await db().from("kv").select("value").eq("key", key).maybeSingle());
  return (row?.value as T) ?? fallback;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  must(await db().from("kv").upsert({ key, value, updated_at: new Date().toISOString() }));
}
