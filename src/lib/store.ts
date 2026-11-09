// Các kho dữ liệu dùng chung, lưu trên Supabase.
import { db, must } from "./db";

// ---------- Token ----------
export interface TokenData {
  accessToken: string;
  userId: string;
  username?: string;
  expiresAt: number; // ms epoch
  obtainedAt: number; // ms epoch
}

export const tokenStore = {
  async get(): Promise<TokenData | null> {
    const r = must(await db().from("threads_token").select("*").eq("id", 1).maybeSingle());
    if (!r) return null;
    return {
      accessToken: r.access_token,
      userId: r.user_id,
      username: r.username ?? undefined,
      expiresAt: Date.parse(r.expires_at),
      obtainedAt: Date.parse(r.obtained_at),
    };
  },
  async set(t: TokenData): Promise<void> {
    must(
      await db().from("threads_token").upsert({
        id: 1,
        access_token: t.accessToken,
        user_id: t.userId,
        username: t.username ?? null,
        expires_at: new Date(t.expiresAt).toISOString(),
        obtained_at: new Date(t.obtainedAt).toISOString(),
      }),
    );
  },
};

// ---------- ID đã xử lý ----------
export const seenStore = {
  /** Đánh dấu đã thấy. Trả về true nếu là lần đầu (chưa từng xử lý). */
  async claim(id: string): Promise<boolean> {
    const { error } = await db().from("seen_ids").insert({ id });
    if (!error) return true;
    if (error.code === "23505") return false; // trùng khoá chính → đã xử lý
    throw new Error(`Supabase: ${error.message}`);
  },
  async has(id: string): Promise<boolean> {
    const r = must(await db().from("seen_ids").select("id").eq("id", id).maybeSingle());
    return Boolean(r);
  },
};
